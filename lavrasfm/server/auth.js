import crypto from 'node:crypto';
import { db } from './db.js';

const SESSION_COOKIE = 'lavrasfm_sid';
const SESSION_DAYS = 7;

/** Gera o hash scrypt de uma senha, no formato `scrypt$salt$hash`. */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

/**
 * Garante que exista um administrador. A senha vem de ADMIN_PASSWORD ou é
 * sorteada e impressa no console no primeiro start.
 */
export function ensureAdminUser() {
  const username = process.env.ADMIN_USER || 'admin';
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return { username, created: false };

  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(
    username,
    hashPassword(password)
  );
  return { username, password, created: true, generated: !process.env.ADMIN_PASSWORD };
}

/**
 * Freio simples contra força bruta no login: até 8 tentativas por IP a cada
 * 15 minutos. Em memória — suficiente para um site de uma emissora.
 */
const attempts = new Map();
const ATTEMPT_WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 8;

export function throttleLogin(req, res, next) {
  const key = req.ip || 'desconhecido';
  const now = Date.now();
  const record = attempts.get(key);

  if (record && now - record.first > ATTEMPT_WINDOW_MS) attempts.delete(key);

  const current = attempts.get(key);
  if (current && current.count >= MAX_ATTEMPTS) {
    const minutes = Math.ceil((ATTEMPT_WINDOW_MS - (now - current.first)) / 60_000);
    return res
      .status(429)
      .json({ error: `Muitas tentativas de login. Tente de novo em ${minutes} minuto(s).` });
  }

  // Limpeza oportunista para a tabela não crescer indefinidamente.
  if (attempts.size > 1000) {
    for (const [ip, entry] of attempts) {
      if (now - entry.first > ATTEMPT_WINDOW_MS) attempts.delete(ip);
    }
  }

  res.locals.registerFailedLogin = () => {
    const entry = attempts.get(key) || { count: 0, first: now };
    entry.count += 1;
    attempts.set(key, entry);
  };
  res.locals.clearFailedLogins = () => attempts.delete(key);
  next();
}

export function login(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || ''));
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) return null;

  const id = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    id,
    user.id,
    expiresAt
  );
  return { id, expiresAt, user: { id: user.id, username: user.username } };
}

export function logout(sessionId) {
  if (sessionId) db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function changePassword(userId, currentPassword, newPassword) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || !verifyPassword(String(currentPassword || ''), user.password_hash)) return false;
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId);
  // Invalida as outras sessões do usuário por segurança.
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  return true;
}

function readSession(req) {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (!sessionId) return null;

  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  const row = db
    .prepare(
      `SELECT s.id AS sid, u.id AS user_id, u.username
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > datetime('now')`
    )
    .get(sessionId);
  if (!row) return null;
  return { id: row.sid, user: { id: row.user_id, username: row.username } };
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
