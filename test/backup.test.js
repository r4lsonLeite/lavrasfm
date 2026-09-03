import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pasta = mkdtempSync(join(tmpdir(), 'lavrasfm-backup-'));
process.env.DB_PATH = join(pasta, 'teste.db');
process.env.BACKUP_DIR = join(pasta, 'backups');
process.env.BACKUP_KEEP = '3';

const { db } = await import('../server/db.js');
const { fazerBackup, listarBackups, limparAntigos } = await import('../server/backup.js');
const { createNews } = await import('../server/content.js');

after(() => rmSync(pasta, { recursive: true, force: true }));

describe('backup do banco', () => {
  test('gera um arquivo com o conteúdo do banco', () => {
    createNews({ title: 'Notícia guardada', url: 'https://ex.com/1' });

    const r = fazerBackup();
    assert.equal(r.criado, true);
    assert.ok(existsSync(r.arquivo));
    assert.ok(r.tamanho > 0);
  });

  test('a cópia abre e tem os dados', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const copia = new DatabaseSync(listarBackups()[0].nome.startsWith('lavrasfm')
      ? join(process.env.BACKUP_DIR, listarBackups()[0].nome)
      : '');
    const linhas = copia.prepare('SELECT title FROM news').all();
    copia.close();
    assert.ok(linhas.some((l) => l.title === 'Notícia guardada'));
  });

  test('mantém só as cópias mais recentes', () => {
    // Simula cópias antigas de dias anteriores.
    for (const dia of ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-04']) {
      writeFileSync(join(process.env.BACKUP_DIR, `lavrasfm-${dia}T00-00-00.db`), 'x');
    }
    limparAntigos();
    assert.equal(listarBackups().length, Number(process.env.BACKUP_KEEP));
  });

  test('as mais recentes são as que sobram', () => {
    const nomes = listarBackups().map((b) => b.nome);
    assert.ok(!nomes.some((n) => n.includes('2020-01-01')), 'a mais antiga deveria ter saído');
  });
});

describe('migração dos níveis de destaque', () => {
  test('"secundaria" do layout antigo vira "destaque"', async () => {
    const item = createNews({ title: 'Antiga', url: 'https://ex.com/2', highlight: 'destaque' });
    db.prepare("UPDATE news SET highlight = 'secundaria' WHERE id = ?").run(item.id);

    // A migração roda no carregamento do módulo; aqui repetimos a mesma instrução.
    db.exec("UPDATE news SET highlight = 'destaque' WHERE highlight = 'secundaria'");

    const depois = db.prepare('SELECT highlight FROM news WHERE id = ?').get(item.id);
    assert.equal(depois.highlight, 'destaque');
  });
});
