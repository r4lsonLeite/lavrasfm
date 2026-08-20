import { db } from './db.js';
import { parseYoutubeId, youtubeThumbnail, youtubeEmbedUrl } from './youtube.js';

/** Níveis de destaque disponíveis para uma notícia no painel. */
export const HIGHLIGHTS = {
  banner: { label: 'Banner principal', description: 'Ocupa o topo da home, com imagem grande.' },
  destaque: { label: 'Destaque', description: 'Card largo na grade de notícias.' },
  secundaria: { label: 'Secundária', description: 'Card alto ao lado do destaque.' },
  normal: { label: 'Normal', description: 'Card padrão na grade.' }
};

export const VIDEO_KINDS = {
  live: { label: 'Live do YouTube' },
  video: { label: 'Vídeo do YouTube' }
};

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

export { ValidationError };

function requireText(value, field, { max = 500 } = {}) {
  const text = String(value ?? '').trim();
  if (!text) throw new ValidationError(`O campo "${field}" é obrigatório.`);
  if (text.length > max) throw new ValidationError(`O campo "${field}" excede ${max} caracteres.`);
  return text;
}

function optionalText(value, { max = 2000 } = {}) {
  return String(value ?? '').trim().slice(0, max);
}

/** Só aceita http/https — evita `javascript:` e afins vindos do formulário. */
function requireHttpUrl(value, field) {
  const text = requireText(value, field, { max: 1000 });
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new ValidationError(`O campo "${field}" precisa ser um endereço válido (https://...).`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError(`O campo "${field}" precisa começar com http:// ou https://`);
  }
  return url.toString();
}

function optionalHttpUrl(value, field) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return requireHttpUrl(text, field);
}

function toBool(value) {
  return value === true || value === 1 || value === '1' || value === 'on' || value === 'true' ? 1 : 0;
}

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

function normalizeNews(input) {
  const highlight = String(input.highlight || 'normal');
  if (!(highlight in HIGHLIGHTS)) throw new ValidationError('Tipo de destaque inválido.');

  return {
    title: requireText(input.title, 'título', { max: 300 }),
    url: requireHttpUrl(input.url, 'link da notícia'),
    category: (optionalText(input.category, { max: 40 }) || 'GERAL').toUpperCase(),
    excerpt: optionalText(input.excerpt, { max: 600 }),
    image_url: optionalHttpUrl(input.image_url, 'imagem'),
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
  return {
    ...row,
    invert: Boolean(row.invert),
    active: Boolean(row.active),
    highlight_label: HIGHLIGHTS[row.highlight]?.label || row.highlight
  };
}

export function createNews(input) {
  const data = normalizeNews(input);
  const result = db
    .prepare(
      `INSERT INTO news (title, url, category, excerpt, image_url, source, highlight, invert, position, active, published_at)
       VALUES (:title, :url, :category, :excerpt, :image_url, :source, :highlight, :invert, :position, :active, :published_at)`
    )
    .run(data);
  return getNews(result.lastInsertRowid);
}

export function updateNews(id, input) {
  const existing = getNews(id);
  if (!existing) return null;
  const data = normalizeNews({ ...existing, ...input });
  db.prepare(
    `UPDATE news SET title = :title, url = :url, category = :category, excerpt = :excerpt,
            image_url = :image_url, source = :source, highlight = :highlight, invert = :invert,
            position = :position, active = :active, published_at = :published_at,
            updated_at = datetime('now')
      WHERE id = :id`
  ).run({ ...data, id: Number(id) });
  return getNews(id);
}

export function deleteNews(id) {
  return db.prepare('DELETE FROM news WHERE id = ?').run(Number(id)).changes > 0;
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
