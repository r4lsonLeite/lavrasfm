import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Cada execução usa um banco descartável, para os testes não dependerem de ordem.
const pasta = mkdtempSync(join(tmpdir(), 'lavrasfm-'));
process.env.DB_PATH = join(pasta, 'teste.db');

const { createNews, updateNews, listNews, deleteNews, createVideo, listVideos, HIGHLIGHTS } =
  await import('../server/content.js');

after(() => rmSync(pasta, { recursive: true, force: true }));

describe('notícias', () => {
  test('exige um link válido', () => {
    assert.throws(() => createNews({ title: 'A', url: 'javascript:alert(1)' }), /http/);
    assert.throws(() => createNews({ title: 'A', url: 'nem-url' }), /endereço válido|http/);
  });

  test('exige título', () => {
    assert.throws(() => createNews({ title: '   ', url: 'https://ex.com/a' }), /obrigatório/);
  });

  test('recusa nível de destaque inventado', () => {
    assert.throws(
      () => createNews({ title: 'A', url: 'https://ex.com/a', highlight: 'gigante' }),
      /destaque inválido/
    );
  });

  test('categoria vira maiúscula e vazia vira GERAL', () => {
    const a = createNews({ title: 'A', url: 'https://ex.com/1', category: 'música' });
    const b = createNews({ title: 'B', url: 'https://ex.com/2' });
    assert.equal(a.category, 'MÚSICA');
    assert.equal(b.category, 'GERAL');
  });

  test('editar só um campo não desloca a data de publicação', () => {
    const criada = createNews({
      title: 'C',
      url: 'https://ex.com/3',
      published_at: '2026-03-10T14:30'
    });
    const antes = criada.published_at;
    updateNews(criada.id, { active: false });
    const depois = updateNews(criada.id, { active: true });
    assert.equal(depois.published_at, antes, 'a data mudou ao editar outro campo');
  });

  test('despublicada some da listagem pública mas continua no painel', () => {
    const item = createNews({ title: 'Oculta', url: 'https://ex.com/4', active: false });
    assert.ok(!listNews().some((n) => n.id === item.id));
    assert.ok(listNews({ includeInactive: true }).some((n) => n.id === item.id));
  });

  test('excluir remove de vez', () => {
    const item = createNews({ title: 'Some', url: 'https://ex.com/5' });
    assert.equal(deleteNews(item.id), true);
    assert.equal(deleteNews(item.id), false);
  });

  test('os níveis de destaque são os três do layout novo', () => {
    assert.deepEqual(Object.keys(HIGHLIGHTS), ['banner', 'destaque', 'normal']);
  });
});

describe('vídeos', () => {
  test('recusa link que não é do YouTube', () => {
    assert.throws(
      () => createVideo({ title: 'V', youtube_url: 'https://vimeo.com/123' }),
      /YouTube/
    );
  });

  test('aceita as formas de link do YouTube', () => {
    const casos = [
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://youtu.be/dQw4w9WgXcQ?t=5', 'dQw4w9WgXcQ'],
      ['https://www.youtube.com/live/jNQXAC9IVRw', 'jNQXAC9IVRw']
    ];
    for (const [url, id] of casos) {
      const v = createVideo({ title: 'V', youtube_url: url });
      assert.equal(v.youtube_id, id, `falhou para ${url}`);
    }
  });

  test('só um vídeo fica em destaque por vez', () => {
    createVideo({ title: 'Primeiro', youtube_url: 'https://youtu.be/aaaaaaaaaaa', featured: true });
    createVideo({ title: 'Segundo', youtube_url: 'https://youtu.be/bbbbbbbbbbb', featured: true });
    const destacados = listVideos({ includeInactive: true }).filter((v) => v.featured);
    assert.equal(destacados.length, 1);
    assert.equal(destacados[0].title, 'Segundo');
  });

  test('live ganha o selo e o endereço de incorporação', () => {
    const v = createVideo({
      title: 'Ao vivo',
      youtube_url: 'https://www.youtube.com/live/ccccccccccc',
      kind: 'live'
    });
    assert.equal(v.is_live, true);
    assert.match(v.embed_url, /youtube-nocookie\.com\/embed\/ccccccccccc/);
  });
});
