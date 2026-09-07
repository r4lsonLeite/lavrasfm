import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pasta = mkdtempSync(join(tmpdir(), 'lavrasfm-auth-'));
process.env.DB_PATH = join(pasta, 'teste.db');
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'senha-de-teste-123';

const { hashPassword, verifyPassword, ensureAdminUser, login, logout, changePassword, throttleLogin } =
  await import('../server/auth.js');

after(() => rmSync(pasta, { recursive: true, force: true }));

describe('senhas', () => {
  test('o hash não guarda a senha em texto', async () => {
    const hash = await hashPassword('minha-senha');
    assert.ok(!hash.includes('minha-senha'));
    assert.match(hash, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  });

  test('cada hash usa um sal diferente', async () => {
    assert.notEqual(await hashPassword('igual'), await hashPassword('igual'));
  });

  test('confere a senha certa e recusa a errada', async () => {
    const hash = await hashPassword('correta');
    assert.equal(await verifyPassword('correta', hash), true);
    assert.equal(await verifyPassword('errada', hash), false);
  });

  test('não quebra com hash corrompido', async () => {
    assert.equal(await verifyPassword('x', 'lixo'), false);
    assert.equal(await verifyPassword('x', ''), false);
  });
});

describe('sessão', () => {
  test('cria o administrador a partir do ambiente', async () => {
    const r = await ensureAdminUser();
    assert.equal(r.username, 'admin');
    assert.equal(r.created, true);
    assert.equal((await ensureAdminUser()).created, false, 'não deve recriar');
  });

  test('login aceita a senha certa e recusa a errada', async () => {
    assert.equal(await login('admin', 'errada'), null);
    assert.equal(await login('ninguem', 'senha-de-teste-123'), null);
    const sessao = await login('admin', 'senha-de-teste-123');
    assert.ok(sessao?.id?.length === 64);
    assert.equal(sessao.user.username, 'admin');
  });

  test('cada login gera um identificador novo', async () => {
    const a = await login('admin', 'senha-de-teste-123');
    const b = await login('admin', 'senha-de-teste-123');
    assert.notEqual(a.id, b.id);
    logout(a.id);
    logout(b.id);
  });

  test('trocar a senha encerra as outras sessões', async () => {
    const sessao = await login('admin', 'senha-de-teste-123');
    assert.ok(sessao);
    assert.equal(await changePassword(sessao.user.id, 'errada', 'nova-senha-123'), false);
    assert.equal(await changePassword(sessao.user.id, 'senha-de-teste-123', 'nova-senha-123'), true);
    assert.equal(await login('admin', 'senha-de-teste-123'), null, 'a senha antiga ainda funciona');
    assert.ok(await login('admin', 'nova-senha-123'));
  });

  test('o banco guarda só o hash do identificador de sessão', async () => {
    const { db } = await import('../server/db.js');
    const sessao = await login('admin', 'nova-senha-123');
    const guardados = db.prepare('SELECT id FROM sessions').all().map((l) => l.id);
    assert.ok(!guardados.includes(sessao.id), 'o token em claro não pode estar no banco');
    assert.ok(
      guardados.some((id) => /^[0-9a-f]{64}$/.test(id)),
      'deve haver um SHA-256 guardado'
    );
  });
});

describe('freio contra força bruta', () => {
  /** Simula as idas e vindas do Express para exercitar o middleware. */
  function tentar(ip, username = 'admin') {
    const req = { ip, body: { username } };
    let status = 200;
    const res = {
      locals: {},
      status(c) { status = c; return this; },
      json() { return this; }
    };
    let passou = false;
    throttleLogin(req, res, () => { passou = true; });
    return { passou, status, res };
  }

  test('bloqueia depois de 8 tentativas falhas do mesmo IP', () => {
    const ip = '203.0.113.7';
    for (let i = 0; i < 8; i++) {
      const t = tentar(ip);
      assert.equal(t.passou, true, `tentativa ${i + 1} deveria passar`);
      t.res.locals.registerFailedLogin();
    }
    const bloqueado = tentar(ip);
    assert.equal(bloqueado.passou, false);
    assert.equal(bloqueado.status, 429);
  });

  test('o bloqueio vale também para outro IP tentando o mesmo usuário', () => {
    // O usuário 'admin' já acumulou 8 falhas no teste anterior.
    assert.equal(tentar('198.51.100.1', 'admin').passou, false, 'ataque distribuído deveria parar');
    assert.equal(tentar('198.51.100.1', 'outro-usuario').passou, true, 'outra conta não é afetada');
  });

  test('login bem-sucedido zera o contador', () => {
    const ip = '203.0.113.20';
    const quem = 'conta-limpa';
    for (let i = 0; i < 5; i++) tentar(ip, quem).res.locals.registerFailedLogin();
    tentar(ip, quem).res.locals.clearFailedLogins();
    for (let i = 0; i < 8; i++) {
      const t = tentar(ip, quem);
      assert.equal(t.passou, true, 'o contador não zerou');
      t.res.locals.registerFailedLogin();
    }
  });
});
