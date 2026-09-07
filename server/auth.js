import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';

const SESSION_COOKIE = 'lavrasfm_sid';
const SESSION_DAYS = 7;

// scrypt assíncrono: a versão síncrona segura o servidor inteiro por dezenas de
// milissegundos a cada verificação de senha.
const scrypt = promisify(crypto.scrypt);

/** Gera o hash scrypt de uma senha, no formato `scrypt$salt$hash`. */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;

  const candidate = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

/**
 * O cookie leva o identificador de sessão em claro; o banco guarda só o hash.
 * Assim, uma cópia vazada do banco não permite assumir sessões abertas.
 */
function hashSessao(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Garante que exista um administrador. A senha vem de ADMIN_PASSWORD ou é
 * sorteada e impressa no console no primeiro start.
 */
export async function ensureAdminUser() {
  const username = process.env.ADMIN_USER || 'admin';
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return { username, created: false };

  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(
    username,
    await hashPassword(password)
  );
  return { username, password, created: true, generated: !process.env.ADMIN_PASSWORD };
}

export async function login(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || ''));

  // Mesmo sem usuário, gastamos o tempo de uma verificação: responder rápido
  // para nome inexistente revelaria quais contas existem.
  if (!user) {
    await verifyPassword(String(password || ''), `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`);
    return null;
  }
  if (!(await verifyPassword(String(password || ''), user.password_hash))) return null;

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    hashSessao(token),
    user.id,
    expiresAt
  );
  return { id: token, expiresAt, user: { id: user.id, username: user.username } };
}

export function logout(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(hashSessao(token));
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || !(await verifyPassword(String(currentPassword || ''), user.password_hash))) {
    return false;
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    await hashPassword(newPassword),
    userId
  );
  // Invalida as outras sessões do usuário por segurança.
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  return true;
}

/**
 * Freio contra força bruta no login: até 8 tentativas a cada 15 minutos, por
 * IP e por usuário. Contar só por IP deixaria um ataque distribuído tentar a
 * mesma conta à vontade.
 */
const attempts = new Map();
const ATTEMPT_WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 8;

export function throttleLogin(req, res, next) {
  const ip = req.ip || 'desconhecido';
  const usuario = String(req.body?.username || '').slice(0, 60).toLowerCase();
  const chaves = [`ip:${ip}`, `usuario:${usuario}`];
  const now = Date.now();

  for (const chave of chaves) {
    const registro = attempts.get(chave);
    if (registro && now - registro.first > ATTEMPT_WINDOW_MS) attempts.delete(chave);
  }

  for (const chave of chaves) {
    const registro = attempts.get(chave);
    if (registro && registro.count >= MAX_ATTEMPTS) {
      const minutos = Math.ceil((ATTEMPT_WINDOW_MS - (now - registro.first)) / 60_000);
      return res
        .status(429)
        .json({ error: `Muitas tentativas de login. Tente de novo em ${minutos} minuto(s).` });
    }
  }

  // Limpeza oportunista para a tabela não crescer indefinidamente.
  if (attempts.size > 1000) {
    for (const [chave, registro] of attempts) {
      if (now - registro.first > ATTEMPT_WINDOW_MS) attempts.delete(chave);
    }
  }

  res.locals.registerFailedLogin = () => {
    for (const chave of chaves) {
      const registro = attempts.get(chave) || { count: 0, first: now };
      registro.count += 1;
      attempts.set(chave, registro);
    }
  };
  res.locals.clearFailedLogins = () => chaves.forEach((chave) => attempts.delete(chave));
  next();
}

function readSession(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;

  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  const row = db
    .prepare(
      `SELECT s.id AS sid, u.id AS user_id, u.username
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > datetime('now')`
    )
    .get(hashSessao(token));
  if (!row) return null;
  return { id: token, user: { id: row.user_id, username: row.username } };
}

/** Popula req.session/req.user quando houver sessão válida. */
export function sessionMiddleware(req, _res, next) {
  const session = readSession(req);
  req.session = session;
  req.user = session?.user || null;
  next();
}

/** Bloqueia rotas de API que exigem login. */
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
  next();
}

/** Redireciona para o login quando a página exige sessão. */
export function requireAuthPage(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

export function setSessionCookie(res, session) {
  res.cookie(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(session.expiresAt),
    path: '/'
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export { SESSION_COOKIE };
