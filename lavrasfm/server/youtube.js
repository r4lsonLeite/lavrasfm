/**
 * Extrai o ID de um vídeo/live do YouTube a partir das formas de URL mais comuns:
 * watch?v=, youtu.be/, /live/, /embed/ e /shorts/. Aceita também o ID puro.
 */
export function parseYoutubeId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  if (/^[\w-]{11}$/.test(raw)) return raw;

  let url;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');
  const isYoutube =
    host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com');
  if (!isYoutube) return null;

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }

  const v = url.searchParams.get('v');
  if (v && /^[\w-]{11}$/.test(v)) return v;

  const match = url.pathname.match(/\/(?:live|embed|shorts|v)\/([\w-]{11})/);
  return match ? match[1] : null;
}

export function youtubeThumbnail(id) {
  return `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
}

export function youtubeEmbedUrl(id, { autoplay = false } = {}) {
  const params = new URLSearchParams({ rel: '0', modestbranding: '1' });
  if (autoplay) {
    params.set('autoplay', '1');
    params.set('mute', '1');
  }
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}
