/**
 * Descoberta e verificação da URL de transmissão.
 *
 * Sites de diretório (radios.com.br, tudoradio…) entregam uma *página* ou um
 * arquivo de playlist, não o áudio em si. Aqui a gente distingue os casos,
 * extrai a URL real de playlists .m3u/.pls/.asx e confere se o endereço
 * responde com áudio.
 */

import { buscarComDestinoSeguro, exigirDestinoPublico, RedeBloqueadaError } from './rede.js';

const PLAYLIST_EXTENSIONS = /\.(m3u|pls|asx|xspf)(\?|$)/i;

// Páginas de diretórios de rádio: são HTML, nunca tocam em um <audio>.
const DIRECTORY_HOSTS = [
  'radios.com.br',
  'radiosnet.com',
  'tudoradio.com',
  'cxradio.com.br',
  'onlineradiobox.com',
  'streema.com',
  'acheradios.com.br',
  'emisoraenvivo.com'
];

export class StreamError extends Error {
  constructor(message, { hint = '' } = {}) {
    super(message);
    this.name = 'StreamError';
    this.status = 400;
    this.hint = hint;
  }
}

function parseUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new StreamError('Informe a URL da transmissão.');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new StreamError('URL inválida. Ela precisa começar com http:// ou https://');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new StreamError('A URL precisa começar com http:// ou https://');
  }
  return url;
}

export function isDirectoryPage(url) {
  const host = url.hostname.replace(/^www\./, '');
  return DIRECTORY_HOSTS.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

export function isPlaylist(url) {
  return PLAYLIST_EXTENSIONS.test(url.pathname + url.search);
}

/** Extrai a primeira URL http(s) de um .m3u, .pls, .asx ou .xspf. */
export function extractFromPlaylist(text) {
  const lines = String(text).split(/\r?\n/);

  // .pls  ->  File1=http://...
  for (const line of lines) {
    const match = line.match(/^\s*File\d*\s*=\s*(\S+)/i);
    if (match && /^https?:\/\//i.test(match[1])) return match[1];
  }

  // .m3u  ->  linhas soltas, ignorando comentários #EXTINF etc.
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
  }

  // .asx / .xspf  ->  <ref href="..."> ou <location>...</location>
  const xml =
    String(text).match(/href\s*=\s*"(https?:\/\/[^"]+)"/i) ||
    String(text).match(/<location>\s*(https?:\/\/[^<\s]+)\s*<\/location>/i);
  return xml ? xml[1] : null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Passa pela validação de rede: o servidor não pode ser usado para
    // alcançar a rede interna da hospedagem.
    const { resposta } = await buscarComDestinoSeguro(url, {
      ...options,
      signal: controller.signal
    });
    return resposta;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Recebe o que o usuário colou e devolve a URL que o <audio> consegue tocar.
 * Resolve playlists; recusa páginas de diretório com uma explicação.
 */
export async function resolveStreamUrl(input) {
  const url = parseUrl(input);

  // Recusa endereços internos antes de qualquer conexão, para o painel dar uma
  // resposta clara em vez de deixar salvar algo que nunca vai tocar.
  await exigirDestinoPublico(url);

  if (isDirectoryPage(url)) {
    throw new StreamError(
      'Esse link é a página do diretório de rádios, não o áudio em si — por isso o player não toca.',
      {
        hint:
          'Na página da rádio, procure a opção de ouvir em outro player (M3U, PLS ou ASX), ' +
          'copie esse link e cole aqui: eu extraio o endereço real da transmissão.'
      }
    );
  }

  if (!isPlaylist(url)) return { url: url.toString(), resolvedFrom: null };

  let response;
  try {
    response = await fetchWithTimeout(url, { headers: { 'User-Agent': 'LavrasFM/1.0' } });
  } catch (erro) {
    if (erro instanceof RedeBloqueadaError || erro?.name === 'RedeBloqueadaError') throw erro;
    throw new StreamError('Não consegui baixar essa playlist. Verifique o endereço.');
  }
  if (!response.ok) {
    throw new StreamError(`A playlist respondeu ${response.status}. Verifique o endereço.`);
  }

  const bruto = await response.text();
  if (bruto.length > 64 * 1024) {
    throw new StreamError('Esse arquivo é grande demais para ser uma playlist de rádio.');
  }
  const extracted = extractFromPlaylist(bruto);
  if (!extracted) {
    throw new StreamError('Baixei a playlist, mas não achei nenhuma URL de áudio dentro dela.');
  }
  return { url: extracted, resolvedFrom: url.toString() };
}

/** Conecta na URL e confirma que o que vem de volta é áudio. */
export async function probeStream(streamUrl) {
  let response;
  try {
    response = await fetchWithTimeout(streamUrl, {
      headers: { 'User-Agent': 'LavrasFM/1.0', 'Icy-MetaData': '1' }
    });
  } catch (error) {
    if (error?.name === 'RedeBloqueadaError') return { ok: false, message: error.message };
    return {
      ok: false,
      message:
        error?.name === 'AbortError'
          ? 'O servidor não respondeu em 8 segundos.'
          : 'Não consegui conectar nesse endereço.'
    };
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const stationName = response.headers.get('icy-name') || '';
  response.body?.cancel?.();

  if (!response.ok) {
    return { ok: false, message: `O servidor respondeu ${response.status}.`, contentType };
  }
  if (contentType.includes('text/html')) {
    return {
      ok: false,
      message: 'Esse endereço devolve uma página HTML, não áudio.',
      contentType
    };
  }

  const looksLikeAudio =
    contentType.startsWith('audio/') ||
    contentType.includes('mpegurl') ||
    contentType.includes('ogg') ||
    contentType.includes('octet-stream');

  // audio/* o navegador toca direto. octet-stream e afins ele costuma tratar
  // como arquivo para baixar — a transmissão existe, mas não toca na página.
  const tipoTocavel =
    contentType.startsWith('audio/') || contentType.includes('mpegurl') || contentType.includes('ogg');

  return {
    ok: looksLikeAudio,
    message: looksLikeAudio
      ? `Transmissão respondendo${stationName ? ` — ${stationName}` : ''}.`
      : `Resposta inesperada (${contentType || 'sem content-type'}).`,
    contentType: contentType || null,
    stationName,
    // http dentro de um site https é bloqueado pelo navegador: aí o relay salva.
    insecure: streamUrl.startsWith('http://'),
    tipoConfundeNavegador: looksLikeAudio && !tipoTocavel
  };
}
