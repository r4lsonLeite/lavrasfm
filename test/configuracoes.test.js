import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pasta = mkdtempSync(join(tmpdir(), 'lavrasfm-cfg-'));
process.env.DB_PATH = join(pasta, 'teste.db');

const { normalizarWhatsapp, saveSettings, getSettings } = await import('../server/db.js');

after(() => rmSync(pasta, { recursive: true, force: true }));

describe('número de WhatsApp', () => {
  test('acrescenta o código do país a um número brasileiro escrito como se escreve', () => {
    assert.equal(normalizarWhatsapp('(88) 9 9257-3819'), '5588992573819');
    assert.equal(normalizarWhatsapp('88 99257-3819'), '5588992573819');
    assert.equal(normalizarWhatsapp('88992573819'), '5588992573819');
    // Fixo, dez dígitos.
    assert.equal(normalizarWhatsapp('(88) 3533-1234'), '558835331234');
  });

  test('não duplica o código de quem já o escreveu', () => {
    assert.equal(normalizarWhatsapp('+55 88 99257-3819'), '5588992573819');
    assert.equal(normalizarWhatsapp('5588992573819'), '5588992573819');
  });

  test('vazio continua vazio — é assim que o link some do rodapé', () => {
    assert.equal(normalizarWhatsapp(''), '');
    assert.equal(normalizarWhatsapp('   '), '');
    assert.equal(normalizarWhatsapp(null), '');
  });

  test('o número é normalizado ao salvar, não só ao mostrar', () => {
    saveSettings({ whatsapp: '(88) 9 9257-3819' });
    assert.equal(getSettings().whatsapp, '5588992573819');
  });

  test('salvar só mexe nas chaves conhecidas', () => {
    saveSettings({ instagram: 'https://www.instagram.com/lavrasfm/', inventada: 'x' });
    const cfg = getSettings();
    assert.equal(cfg.instagram, 'https://www.instagram.com/lavrasfm/');
    assert.equal(cfg.inventada, undefined);
  });
});
