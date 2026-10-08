import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pasta = mkdtempSync(join(tmpdir(), 'lavrasfm-img-'));
process.env.DB_PATH = join(pasta, 'teste.db');
process.env.UPLOAD_DIR = join(pasta, 'uploads');

const { guardarImagem, arquivoDaImagem, nomeNoEndereco, apagarImagem, TAMANHO_MAXIMO } =
  await import('../server/imagens.js');

after(() => rmSync(pasta, { recursive: true, force: true }));

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.alloc(4),
  Buffer.from('WEBP', 'latin1'),
  Buffer.alloc(32)
]);

describe('recebimento de foto', () => {
  test('aceita JPEG, PNG e WebP e guarda com nome próprio', () => {
    for (const [buffer, ext] of [[PNG_1x1, 'png'], [JPEG, 'jpg'], [WEBP, 'webp']]) {
      const imagem = guardarImagem(buffer);
      assert.match(imagem.nome, new RegExp(`\\.${ext}$`));
      assert.equal(imagem.url, `/uploads/${imagem.nome}`);
      assert.ok(arquivoDaImagem(imagem.nome), 'deveria achar o arquivo gravado');
    }
  });

  test('o nome do arquivo não vem de quem envia', () => {
    // Dois envios do mesmo conteúdo produzem nomes diferentes.
    const a = guardarImagem(PNG_1x1);
    const b = guardarImagem(PNG_1x1);
    assert.notEqual(a.nome, b.nome);
  });

  test('recusa arquivo que não é imagem, mesmo com cara de foto', () => {
    assert.throws(() => guardarImagem(Buffer.from('<script>alert(1)</script>')), /não é uma imagem/);
    assert.throws(() => guardarImagem(Buffer.from('%PDF-1.4')), /não é uma imagem/);
    // GIF é imagem de verdade, mas está fora da lista aceita.
    assert.throws(() => guardarImagem(Buffer.from('GIF89a')), /não é uma imagem/);
  });

  test('recusa vazio e recusa grande demais', () => {
    assert.throws(() => guardarImagem(Buffer.alloc(0)), /Nenhuma imagem/);
    const gigante = Buffer.concat([PNG_1x1, Buffer.alloc(TAMANHO_MAXIMO)]);
    assert.throws(() => guardarImagem(gigante), /limite/);
  });

  test('SVG é recusado — é o único formato de imagem que roda script', () => {
    assert.throws(
      () => guardarImagem(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')),
      /não é uma imagem/
    );
  });
});

describe('leitura de foto pelo nome', () => {
  test('nome fora do padrão não resolve em arquivo', () => {
    for (const nome of [
      '../../etc/passwd',
      '..%2f..%2fetc%2fpasswd',
      'teste.png',
      'abc-xyz.png',
      'mv05bq52-96ffda2e3e341793.exe',
      ''
    ]) {
      assert.equal(arquivoDaImagem(nome), null, `deveria recusar: ${nome}`);
    }
  });

  test('não serve arquivo plantado na pasta com nome fora do padrão', () => {
    writeFileSync(join(process.env.UPLOAD_DIR, 'plantado.html'), '<script>alert(1)</script>');
    assert.equal(arquivoDaImagem('plantado.html'), null);
  });

  test('reconhece o endereço de uma foto nossa e ignora os de fora', () => {
    const imagem = guardarImagem(PNG_1x1);
    assert.equal(nomeNoEndereco(imagem.url), imagem.nome);
    assert.equal(nomeNoEndereco('https://outro.site/foto.jpg'), null);
    assert.equal(nomeNoEndereco('/uploads/../segredo'), null);
  });

  test('apagar remove o arquivo e não reclama do que já sumiu', () => {
    const imagem = guardarImagem(PNG_1x1);
    const { caminho } = arquivoDaImagem(imagem.nome);
    assert.ok(existsSync(caminho));
    assert.equal(apagarImagem(imagem.url), true);
    assert.equal(existsSync(caminho), false);
    assert.equal(apagarImagem(imagem.url), false);
    assert.equal(apagarImagem('https://outro.site/foto.jpg'), false);
  });
});
