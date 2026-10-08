/**
 * Fotos enviadas pela redação.
 *
 * Três cuidados sustentam este módulo:
 *
 * 1. O formato é decidido pelos primeiros bytes do arquivo, nunca pelo que o
 *    navegador declara nem pela extensão do nome. Um arquivo com HTML dentro,
 *    enviado como "foto.jpg" e devolvido depois como text/html, seria um
 *    script rodando no domínio do site.
 * 2. O nome do arquivo é gerado aqui. O nome que veio do computador de quem
 *    enviou é descartado: é por ele que entram "../" e nomes que confundem o
 *    sistema de arquivos.
 * 3. SVG fica de fora de propósito. É o único formato de imagem que pode
 *    conter script, e aceitar um significaria ter que higienizá-lo.
 *
 * As fotos vão para o disco permanente, junto do banco — e não para public/,
 * que é substituído inteiro a cada deploy.
 */
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { DB_PATH } from './db.js';

export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? resolve(process.env.UPLOAD_DIR)
  : resolve(dirname(DB_PATH), 'uploads');

mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * O painel reduz a foto no próprio navegador antes de enviar, então o normal
 * é chegar algo em torno de 300 KB. O limite aqui é a rede de proteção para
 * quando essa redução não acontecer.
 */
export const TAMANHO_MAXIMO = 6 * 1024 * 1024;

export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const FORMATOS = [
  {
    ext: 'jpg',
    tipo: 'image/jpeg',
    casa: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  },
  {
    ext: 'png',
    tipo: 'image/png',
    casa: (b) => b.length > 8 && b.subarray(0, 8).equals(PNG)
  },
  {
    ext: 'webp',
    tipo: 'image/webp',
    casa: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP'
  }
];

/** Só casa com o que este módulo gera — e, por isso, nunca com "../". */
const NOME_GERADO = /^[a-z0-9]{1,12}-[a-f0-9]{16}\.(jpg|png|webp)$/;

const TIPO_POR_EXTENSAO = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export class ImagemError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImagemError';
    this.status = 400;
  }
}

const emMegabytes = (bytes) => (bytes / 1024 / 1024).toFixed(0);

/** Confere e grava. Devolve o endereço público da foto. */
export function guardarImagem(buffer) {
  if (!buffer || !buffer.length) {
    throw new ImagemError('Nenhuma imagem foi recebida.');
  }
  if (buffer.length > TAMANHO_MAXIMO) {
    throw new ImagemError(
      `A imagem tem ${emMegabytes(buffer.length)} MB e o limite é ${emMegabytes(TAMANHO_MAXIMO)} MB.`
    );
  }

  const formato = FORMATOS.find((f) => f.casa(buffer));
  if (!formato) {
    throw new ImagemError(
      'Esse arquivo não é uma imagem JPEG, PNG ou WebP. Se for um PDF ou um documento, exporte como foto antes de enviar.'
    );
  }

  const nome = `${Date.now().toString(36)}-${randomBytes(8).toString('hex')}.${formato.ext}`;
  writeFileSync(join(UPLOAD_DIR, nome), buffer);
  return { nome, url: `/uploads/${nome}`, tipo: formato.tipo, bytes: buffer.length };
}

/** O arquivo correspondente a um nome, ou null se o nome não for dos nossos. */
export function arquivoDaImagem(nome) {
  if (!NOME_GERADO.test(String(nome ?? ''))) return null;
  const caminho = join(UPLOAD_DIR, nome);
  if (!existsSync(caminho)) return null;
  return { caminho, tipo: TIPO_POR_EXTENSAO[nome.split('.').pop()] };
}

/** O nome do arquivo dentro de um endereço "/uploads/...", se for um. */
export function nomeNoEndereco(url) {
  const match = /^\/uploads\/([^/?#]+)$/.exec(String(url ?? ''));
  return match && NOME_GERADO.test(match[1]) ? match[1] : null;
}

/**
 * Apaga uma foto que não é mais usada. Silencioso de propósito: uma foto que
 * já sumiu do disco não é motivo para a exclusão de uma matéria falhar.
 */
export function apagarImagem(url) {
  const nome = nomeNoEndereco(url);
  if (!nome) return false;
  try {
    unlinkSync(join(UPLOAD_DIR, nome));
    return true;
  } catch {
    return false;
  }
}
