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
  test('o hash não guarda a senha em texto', () => {
    const hash = hashPassword('minha-senha');
    assert.ok(!hash.includes('minha-senha'));
    assert.match(hash, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  });

  test('cada hash usa um sal diferente', () => {
    assert.notEqual(hashPassword('igual'), hashPassword('igual'));
  });

  test('confere a senha certa e recusa a errada', () => {
    const hash = hashPassword('correta');
    assert.equal(verifyPassword('correta', hash), true);
    assert.equal(verifyPassword('errada', hash), false);
  });

  test('não quebra com hash corrompido', () => {
    assert.equal(verifyPassword('x', 'lixo'), false);
    assert.equal(verifyPassword('x', ''), false);
  });
});

describe('sessão', () => {
  test('cria o administrador a partir do ambiente', () => {
    const r = ensureAdminUser();
    assert.equal(r.username, 'admin');
    assert.equal(r.created, true);
    assert.equal(ensureAdminUser().created, false, 'não deve recriar');
  });

  test('login aceita a senha certa e recusa a errada', () => {
    assert.equal(login('admin', 'errada'), null);
    assert.equal(login('ninguem', 'senha-de-teste-123'), null);
    const sessao = login('admin', 'senha-de-teste-123');
    assert.ok(sessao?.id?.length === 64);
    assert.equal(sessao.user.username, 'admin');
  });

  test('cada login gera um identificador novo', () => {
    const a = login('admin', 'senha-de-teste-123');
    const b = login('admin', 'senha-de-teste-123');
    assert.notEqual(a.id, b.id);
    logout(a.id);
    logout(b.id);
  });

  test('trocar a senha encerra as outras sessões', () => {
    const sessao = login('admin', 'senha-de-teste-123');
    assert.ok(sessao);
    assert.equal(changePassword(sessao.user.id, 'errada', 'nova-senha-123'), false);
    assert.equal(changePassword(sessao.user.id, 'senha-de-teste-123', 'nova-senha-123'), true);
    assert.equal(login('admin', 'senha-de-teste-123'), null, 'a senha antiga ainda funciona');
    assert.ok(login('admin', 'nova-senha-123'));
  });
});

describe('freio contra força bruta', () => {
  /** Simula as idas e vindas do Express para exercitar o middleware. */
  function tentar(ip) {
    const req = { ip };
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

  test('o bloqueio é por IP, não global', () => {
    assert.equal(tentar('203.0.113.99').passou, true);
  });

  test('login bem-sucedido zera o contador', () => {
    const ip = '203.0.113.20';
    for (let i = 0; i < 5; i++) tentar(ip).res.locals.registerFailedLogin();
    tentar(ip).res.locals.clearFailedLogins();
    for (let i = 0; i < 8; i++) {
      const t = tentar(ip);
      assert.equal(t.passou, true, 'o contador não zerou');
      t.res.locals.registerFailedLogin();
    }
  });
});
