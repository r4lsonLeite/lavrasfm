import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Cada execução usa um banco descartável, para os testes não dependerem de ordem.
const pasta = mkdtempSync(join(tmpdir(), 'lavrasfm-'));
process.env.DB_PATH = join(pasta, 'teste.db');

const {
  createNews,
  updateNews,
  listNews,
  deleteNews,
  createVideo,
  listVideos,
  HIGHLIGHTS,
  getMateriaPorSlug,
  listMaterias
} = await import('../server/content.js');

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

describe('matéria escrita pela redação', () => {
  test('exige o texto e dispensa o link de fora', () => {
    assert.throws(
      () => createNews({ kind: 'materia', title: 'Sem texto', body: '  ' }),
      /texto da matéria/
    );
    // Sem url, e mesmo assim válida.
    const m = createNews({ kind: 'materia', title: 'Com texto', body: 'Parágrafo.' });
    assert.equal(m.url, '');
    assert.equal(m.is_materia, true);
    assert.equal(m.link, `/materia/${m.slug}`);
    deleteNews(m.id);
  });

  test('o link de outro portal continua exigindo endereço', () => {
    assert.throws(() => createNews({ kind: 'link', title: 'A' }), /link da notícia/);
  });

  test('recusa tipo inventado', () => {
    assert.throws(
      () => createNews({ kind: 'podcast', title: 'A', body: 'x' }),
      /Tipo de notícia inválido/
    );
  });

  test('duas matérias com o mesmo título ganham endereços diferentes', () => {
    const a = createNews({ kind: 'materia', title: 'Chuva na cidade', body: 'um' });
    const b = createNews({ kind: 'materia', title: 'Chuva na cidade', body: 'dois' });
    assert.equal(a.slug, 'chuva-na-cidade');
    assert.equal(b.slug, 'chuva-na-cidade-2');
    deleteNews(a.id);
    deleteNews(b.id);
  });

  test('editar o título não muda o endereço já publicado', () => {
    const m = createNews({ kind: 'materia', title: 'Título velho', body: 'texto' });
    const editada = updateNews(m.id, { title: 'Título novo' });
    assert.equal(editada.title, 'Título novo');
    assert.equal(editada.slug, m.slug, 'mudar o slug quebraria todo link compartilhado');
    deleteNews(m.id);
  });

  test('sem resumo escrito, empresta o começo do texto', () => {
    const m = createNews({
      kind: 'materia',
      title: 'Açude',
      body: 'As chuvas elevaram o nível do açude.\n\n## Depois\n\nMais texto.'
    });
    assert.equal(m.excerpt, 'As chuvas elevaram o nível do açude. Depois Mais texto.');
    deleteNews(m.id);
  });

  test('o resumo escrito à mão tem prioridade', () => {
    const m = createNews({
      kind: 'materia', title: 'B', body: 'Texto longo.', excerpt: 'Resumo do editor.'
    });
    assert.equal(m.excerpt, 'Resumo do editor.');
    deleteNews(m.id);
  });

  test('a busca por endereço só devolve matéria publicada', () => {
    const m = createNews({ kind: 'materia', title: 'Visível', body: 'texto' });
    assert.equal(getMateriaPorSlug(m.slug)?.title, 'Visível');
    assert.match(getMateriaPorSlug(m.slug).body_html, /<p>texto<\/p>/);

    updateNews(m.id, { active: false });
    assert.equal(getMateriaPorSlug(m.slug), null, 'rascunho não deve abrir no site');

    assert.equal(getMateriaPorSlug('nao-existe'), null);
    deleteNews(m.id);
  });

  test('a lista de matérias ignora os links de outros portais', () => {
    const materia = createNews({ kind: 'materia', title: 'Nossa', body: 'texto' });
    const link = createNews({ kind: 'link', title: 'De fora', url: 'https://ex.com/a' });
    const slugs = listMaterias().map((m) => m.title);
    assert.ok(slugs.includes('Nossa'));
    assert.ok(!slugs.includes('De fora'));
    deleteNews(materia.id);
    deleteNews(link.id);
  });

  test('a foto enviada é apagada do disco junto com a matéria', async () => {
    const { guardarImagem, arquivoDaImagem } = await import('../server/imagens.js');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const foto = guardarImagem(png);
    const m = createNews({ kind: 'materia', title: 'Com capa', body: 'texto', image_url: foto.url });

    assert.ok(arquivoDaImagem(foto.nome), 'a foto deveria estar no disco');
    deleteNews(m.id);
    assert.equal(arquivoDaImagem(foto.nome), null, 'a foto deveria ter sido apagada junto');
  });

  test('a foto não é apagada enquanto outra notícia ainda a usa', async () => {
    const { guardarImagem, arquivoDaImagem } = await import('../server/imagens.js');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const foto = guardarImagem(png);
    const a = createNews({ kind: 'materia', title: 'Uma', body: 'x', image_url: foto.url });
    const b = createNews({ kind: 'materia', title: 'Outra', body: 'y', image_url: foto.url });

    deleteNews(a.id);
    assert.ok(arquivoDaImagem(foto.nome), 'a outra matéria ainda mostra essa foto');
    deleteNews(b.id);
    assert.equal(arquivoDaImagem(foto.nome), null);
  });

  test('aceita foto enviada aqui e recusa endereço que não é http', () => {
    const m = createNews({
      kind: 'materia', title: 'Com foto', body: 'texto',
      image_url: '/uploads/mv05bq52-96ffda2e3e341793.jpg'
    });
    assert.equal(m.image_url, '/uploads/mv05bq52-96ffda2e3e341793.jpg');
    deleteNews(m.id);

    assert.throws(
      () => createNews({ kind: 'materia', title: 'X', body: 'y', image_url: 'javascript:alert(1)' }),
      /http/
    );
    assert.throws(
      () => createNews({ kind: 'materia', title: 'X', body: 'y', image_url: '/etc/passwd' }),
      /http/
    );
  });
});
