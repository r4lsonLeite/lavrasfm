import { db } from './db.js';
import { parseYoutubeId, youtubeThumbnail, youtubeEmbedUrl } from './youtube.js';
import { comoSlug, resumir, paraHtml } from './texto.js';
import { apagarImagem, nomeNoEndereco } from './imagens.js';
import {
  ValidationError,
  requireText,
  optionalText,
  requireHttpUrl,
  optionalHttpUrl,
  toBool
} from './campos.js';

// Reexportado porque as rotas já importavam o erro daqui.
export { ValidationError };

/** Níveis de destaque disponíveis para uma notícia no painel. */
export const HIGHLIGHTS = {
  banner: {
    label: 'Manchete',
    description: 'A chamada grande no topo, com foto larga. Use em uma notícia por vez.'
  },
  destaque: {
    label: 'Destaque lateral',
    description: 'Coluna ao lado da manchete. Cabem três; as demais caem na grade.'
  },
  normal: {
    label: 'Grade',
    description: 'Cards menores abaixo da manchete.'
  }
};

export const NEWS_KINDS = {
  materia: {
    label: 'Matéria nossa',
    description: 'Texto e foto escritos aqui. Ganha página própria no site.'
  },
  link: {
    label: 'Link de outro portal',
    description: 'O card leva o visitante para a matéria publicada em outro site.'
  }
};

export const VIDEO_KINDS = {
  live: { label: 'Live do YouTube' },
  video: { label: 'Vídeo do YouTube' }
};

/**
 * Normaliza para o formato UTC que o SQLite grava ("YYYY-MM-DD HH:MM:SS").
 * Valores já nesse formato passam intactos — reinterpretá-los como hora local
 * deslocaria a data a cada edição.
 */
function toDateTime(value) {
  const text = String(value ?? '').trim();
  if (!text) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError('Data de publicação inválida.');
  }
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

/* ---------------------------------- Notícias --------------------------------- */

/**
 * A foto pode ser um endereço de fora (como sempre foi) ou uma que a redação
 * enviou, e essa vive aqui mesmo — "/uploads/...", que não é um endereço
 * absoluto e por isso não passa na checagem de http.
 */
function imagemDaNoticia(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return '';
  if (nomeNoEndereco(texto)) return texto;
  return optionalHttpUrl(texto, 'imagem');
}

/**
 * Endereço da matéria. Mantém o que já existe: trocar o slug de uma matéria
 * publicada quebraria todo link já compartilhado.
 */
function slugUnico(desejado, id) {
  const base = comoSlug(desejado);
  const conflita = db.prepare('SELECT 1 FROM news WHERE slug = ? AND id IS NOT ?');
  let tentativa = base;
  for (let n = 2; conflita.get(tentativa, id ?? null); n++) {
    tentativa = `${base}-${n}`;
  }
  return tentativa;
}

function normalizeNews(input, id) {
  const highlight = String(input.highlight || 'normal');
  if (!(highlight in HIGHLIGHTS)) throw new ValidationError('Tipo de destaque inválido.');

  const kind = String(input.kind || 'link');
  if (!(kind in NEWS_KINDS)) throw new ValidationError('Tipo de notícia inválido.');

  const materia = kind === 'materia';
  const title = requireText(input.title, 'título', { max: 300 });
  const body = materia ? requireText(input.body, 'texto da matéria', { max: 50000 }) : '';

  return {
    title,
    kind,
    body,
    // Na matéria o endereço é interno, então `url` fica vazia. Vazio não é
    // nulo: o NOT NULL da coluna continua satisfeito.
    url: materia ? '' : requireHttpUrl(input.url, 'link da notícia'),
    slug: materia ? slugUnico(input.slug || title, id) : '',
    category: (optionalText(input.category, { max: 40 }) || 'GERAL').toUpperCase(),
    // Sem resumo escrito, a matéria empresta o começo do próprio texto — é o
    // que aparece no card e na prévia de compartilhamento.
    excerpt: optionalText(input.excerpt, { max: 600 }) || (materia ? resumir(body, 200) : ''),
    image_url: imagemDaNoticia(input.image_url),
    source: optionalText(input.source, { max: 120 }),
    highlight,
    invert: toBool(input.invert),
    position: Number.parseInt(input.position, 10) || 0,
    active: input.active === undefined ? 1 : toBool(input.active),
    published_at: toDateTime(input.published_at)
  };
}

export function listNews({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  return db
    .prepare(`SELECT * FROM news ${where} ORDER BY position ASC, published_at DESC, id DESC`)
    .all()
    .map(decorateNews);
}

export function getNews(id) {
  const row = db.prepare('SELECT * FROM news WHERE id = ?').get(Number(id));
  return row ? decorateNews(row) : null;
}

function decorateNews(row) {
  const materia = row.kind === 'materia';
  return {
    ...row,
    invert: Boolean(row.invert),
    active: Boolean(row.active),
    is_materia: materia,
    // Para onde o card leva: a página daqui, ou o portal de fora.
    link: materia ? `/materia/${row.slug}` : row.url,
    highlight_label: HIGHLIGHTS[row.highlight]?.label || row.highlight,
    kind_label: NEWS_KINDS[row.kind]?.label || row.kind
  };
}

/** A matéria com o texto já convertido em HTML, para a página pública. */
export function getMateriaPorSlug(slug) {
  const row = db
    .prepare("SELECT * FROM news WHERE slug = ? AND kind = 'materia' AND active = 1")
    .get(String(slug ?? ''));
  return row ? { ...decorateNews(row), body_html: paraHtml(row.body) } : null;
}

export function listMaterias({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'AND active = 1';
  return db
    .prepare(`SELECT * FROM news WHERE kind = 'materia' ${where} ORDER BY published_at DESC, id DESC`)
    .all()
    .map(decorateNews);
}

export function createNews(input) {
  const data = normalizeNews(input);
  const result = db
    .prepare(
      `INSERT INTO news (title, kind, body, url, slug, category, excerpt, image_url, source, highlight, invert, position, active, published_at)
       VALUES (:title, :kind, :body, :url, :slug, :category, :excerpt, :image_url, :source, :highlight, :invert, :position, :active, :published_at)`
    )
    .run(data);
  return getNews(result.lastInsertRowid);
}

/**
 * Apaga do disco uma foto enviada que deixou de ser usada. A conferência
 * evita o caso em que duas notícias apontam para o mesmo arquivo.
 */
function descartarFotoOrfa(url) {
  if (!nomeNoEndereco(url)) return;
  const emUso = db.prepare('SELECT 1 FROM news WHERE image_url = ?').get(url);
  if (!emUso) apagarImagem(url);
}

export function updateNews(id, input) {
  const existing = getNews(id);
  if (!existing) return null;
  const data = normalizeNews({ ...existing, ...input }, Number(id));
  db.prepare(
    `UPDATE news SET title = :title, kind = :kind, body = :body, url = :url, slug = :slug,
            category = :category, excerpt = :excerpt,
            image_url = :image_url, source = :source, highlight = :highlight, invert = :invert,
            position = :position, active = :active, published_at = :published_at,
            updated_at = datetime('now')
      WHERE id = :id`
  ).run({ ...data, id: Number(id) });

  if (existing.image_url && existing.image_url !== data.image_url) {
    descartarFotoOrfa(existing.image_url);
  }
  return getNews(id);
}

export function deleteNews(id) {
  const existing = getNews(id);
  const apagou = db.prepare('DELETE FROM news WHERE id = ?').run(Number(id)).changes > 0;
  if (apagou && existing?.image_url) descartarFotoOrfa(existing.image_url);
  return apagou;
}

/* ----------------------------------- Vídeos ---------------------------------- */

function normalizeVideo(input) {
  const kind = String(input.kind || 'video');
  if (!(kind in VIDEO_KINDS)) throw new ValidationError('Tipo de vídeo inválido.');

  const youtubeId = parseYoutubeId(input.youtube_url);
  if (!youtubeId) {
    throw new ValidationError(
      'Não reconheci esse link do YouTube. Use algo como https://www.youtube.com/watch?v=ID ou https://www.youtube.com/live/ID'
    );
  }

  return {
    title: requireText(input.title, 'título', { max: 300 }),
    description: optionalText(input.description, { max: 600 }),
    youtube_url: String(input.youtube_url).trim(),
    youtube_id: youtubeId,
    kind,
    featured: toBool(input.featured),
    autoplay: toBool(input.autoplay),
    position: Number.parseInt(input.position, 10) || 0,
    active: input.active === undefined ? 1 : toBool(input.active)
  };
}

function decorateVideo(row) {
  return {
    ...row,
    featured: Boolean(row.featured),
    autoplay: Boolean(row.autoplay),
    active: Boolean(row.active),
    is_live: row.kind === 'live',
    thumbnail: youtubeThumbnail(row.youtube_id),
    embed_url: youtubeEmbedUrl(row.youtube_id, { autoplay: Boolean(row.autoplay) }),
    watch_url: `https://www.youtube.com/watch?v=${row.youtube_id}`
  };
}

export function listVideos({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  return db
    .prepare(
      `SELECT * FROM videos ${where} ORDER BY featured DESC, position ASC, created_at DESC, id DESC`
    )
    .all()
    .map(decorateVideo);
}

export function getVideo(id) {
  const row = db.prepare('SELECT * FROM videos WHERE id = ?').get(Number(id));
  return row ? decorateVideo(row) : null;
}

/** Só um vídeo pode ficar em destaque; os demais são rebaixados. */
function demoteOtherFeatured(keepId) {
  db.prepare('UPDATE videos SET featured = 0 WHERE id != ?').run(Number(keepId));
}

export function createVideo(input) {
  const data = normalizeVideo(input);
  const result = db
    .prepare(
      `INSERT INTO videos (title, description, youtube_url, youtube_id, kind, featured, autoplay, position, active)
       VALUES (:title, :description, :youtube_url, :youtube_id, :kind, :featured, :autoplay, :position, :active)`
    )
    .run(data);
  if (data.featured) demoteOtherFeatured(result.lastInsertRowid);
  return getVideo(result.lastInsertRowid);
}

export function updateVideo(id, input) {
  const existing = getVideo(id);
  if (!existing) return null;
  const data = normalizeVideo({ ...existing, ...input });
  db.prepare(
    `UPDATE videos SET title = :title, description = :description, youtube_url = :youtube_url,
            youtube_id = :youtube_id, kind = :kind, featured = :featured, autoplay = :autoplay,
            position = :position, active = :active, updated_at = datetime('now')
      WHERE id = :id`
  ).run({ ...data, id: Number(id) });
  if (data.featured) demoteOtherFeatured(id);
  return getVideo(id);
}

export function deleteVideo(id) {
  return db.prepare('DELETE FROM videos WHERE id = ?').run(Number(id)).changes > 0;
}
