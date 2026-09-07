import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// Os testes sobem servidores em 127.0.0.1; a proteção de rede é desligada só aqui.
process.env.PERMITIR_DESTINO_INTERNO = '1';

const { lerArtigo, limparUrl } = await import('../server/artigo.js');

// Portal de mentira, com as metatags no formato que os sites de notícia usam.
const servidor = createServer((req, res) => {
  if (req.url.startsWith('/nao-html')) {
    res.writeHead(200, { 'Content-Type': 'application/pdf' });
    return res.end('%PDF');
  }
  if (req.url.startsWith('/sem-og')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<html><head><title>Só o título</title></head><body>x</body></html>');
  }
  if (req.url.startsWith('/erro')) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    return res.end('nao existe');
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<html><head>
    <meta property="og:site_name" content="g1">
    <meta property="og:title" content="Justiça proíbe v&#237;deos em instala&ccedil;ões">
    <meta name="og:description" content="Resumo da mat&eacute;ria.">
    <meta content="/foto.png" property="og:image">
    <meta property="article:published_time" content="2026-09-05T14:32:00-03:00">
    <title>ignorado</title></head><body>x</body></html>`);
});

await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}`;
after(() => servidor.close());

describe('limpeza do link', () => {
  test('remove o fragmento de trecho destacado que o navegador acrescenta', () => {
    assert.equal(
      limparUrl('https://g1.globo.com/ce/materia.ghtml#:~:text=um%20trecho'),
      'https://g1.globo.com/ce/materia.ghtml'
    );
  });

  test('remove parâmetros de rastreamento e preserva os demais', () => {
    assert.equal(limparUrl('https://ex.com/a?utm_source=wpp&id=3&fbclid=xyz'), 'https://ex.com/a?id=3');
  });

  test('recusa link inválido', () => {
    assert.throws(() => limparUrl('nao-e-url'), /http/);
    assert.throws(() => limparUrl(''), /Informe/);
    assert.throws(() => limparUrl('javascript:alert(1)'), /http/);
  });
});

describe('leitura da notícia', () => {
  test('extrai título, resumo, foto, fonte e data das metatags', async () => {
    const a = await lerArtigo(`${base}/materia.ghtml#:~:text=x`);
    assert.equal(a.title, 'Justiça proíbe vídeos em instalações', 'entidades HTML devem virar texto');
    assert.equal(a.excerpt, 'Resumo da matéria.');
    assert.equal(a.image_url, `${base}/foto.png`, 'imagem relativa deve virar absoluta');
    assert.equal(a.source, 'g1');
    assert.match(a.published_at, /^2026-09-05/);
    assert.equal(a.url, `${base}/materia.ghtml`, 'o fragmento deve sair');
  });

  test('sem metatags, cai para o <title> e o domínio', async () => {
    const a = await lerArtigo(`${base}/sem-og`);
    assert.equal(a.title, 'Só o título');
    assert.equal(a.source, '127.0.0.1');
    assert.equal(a.image_url, '');
  });

  test('recusa o que não é página de notícia', async () => {
    await assert.rejects(() => lerArtigo(`${base}/nao-html`), /não é uma página de notícia/);
  });

  test('avisa quando a página não existe', async () => {
    await assert.rejects(() => lerArtigo(`${base}/erro`), /respondeu 404/);
  });

  test('não quebra com site fora do ar', async () => {
    await assert.rejects(() => lerArtigo('http://127.0.0.1:1/nada'), /Não consegui abrir/);
  });
});
