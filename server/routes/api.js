import { Router } from 'express';
import { statSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveStreamUrl, probeStream, StreamError } from '../stream.js';
import { lerArtigo, ArtigoError } from '../artigo.js';
import { buscarComDestinoSeguro, exigirDestinoPublico, RedeBloqueadaError } from '../rede.js';
import { getSettings, saveSettings, DEFAULT_SETTINGS, DB_PATH } from '../db.js';
import {
  HIGHLIGHTS,
  VIDEO_KINDS,
  ValidationError,
  listNews,
  getNews,
  createNews,
  updateNews,
  deleteNews,
  listVideos,
  getVideo,
  createVideo,
  updateVideo,
  deleteVideo
} from '../content.js';
import {
  requireAuth,
  throttleLogin,
  login,
  logout,
  changePassword,
  setSessionCookie,
  clearSessionCookie
} from '../auth.js';

export const api = Router();

/* --------------------------------- Público ---------------------------------- */

// Tudo o que a home precisa em uma única chamada.
/** URL que o navegador deve tocar: a do relay, se ligado, ou a original. */
function playableStreamUrl(settings) {
  if (!settings.stream_url) return '';
  return settings.stream_relay === '1' ? '/api/stream' : settings.stream_url;
}

api.get('/site', (_req, res) => {
  const news = listNews();
  const videos = listVideos();
  const settings = getSettings();
  res.json({
    settings: { ...settings, stream_url: playableStreamUrl(settings) },
    banner: news.find((item) => item.highlight === 'banner') || null,
    news: news.filter((item) => item.highlight !== 'banner'),
    featuredVideo: videos.find((video) => video.featured) || videos[0] || null,
    videos
  });
});

/**
 * Sinal de vida para a hospedagem saber se deve reiniciar o serviço.
 *
 * Informa também se o banco está num disco permanente. Num serviço em nuvem,
 * o disco do container é apagado a cada deploy: se o banco estiver nele, todo
 * o conteúdo cadastrado some sem aviso. Saber disso pela própria página evita
 * ter que caçar a informação no painel da hospedagem.
 */
api.get('/health', (_req, res) => {
  res.json({
    ok: true,
    uptime_s: Math.round(process.uptime()),
    ouvintes: contarOuvintes(),
    armazenamento: descreverArmazenamento()
  });
});

/**
 * Um disco montado aparece como dispositivo diferente do diretório que o
 * contém. É assim que dá para distinguir um volume de verdade de uma pasta
 * comum dentro do container.
 */
function descreverArmazenamento() {
  const pasta = dirname(DB_PATH);
  try {
    const aqui = statSync(pasta);
    const acima = statSync(dirname(pasta));
    return aqui.dev !== acima.dev
      ? { permanente: true, aviso: null }
      : {
          permanente: false,
          aviso:
            'O banco está no disco temporário do container: tudo que for cadastrado será apagado no próximo deploy.'
        };
  } catch {
    return { permanente: false, aviso: 'Não consegui verificar onde o banco está guardado.' };
  }
}

api.get('/news', (_req, res) => res.json({ news: listNews() }));
api.get('/videos', (_req, res) => res.json({ videos: listVideos() }));
/**
 * Ouvintes conectados à retransmissão. Guardamos os controladores para poder
 * encerrar todos de uma vez quando o servidor for desligado.
 */
const ouvintes = new Set();

/** Teto de ouvintes simultâneos: cada um consome uma conexão de saída. */
const MAX_OUVINTES = Number(process.env.MAX_RELAY_LISTENERS) || 50;

/** Encerra as retransmissões em curso (usado no desligamento gracioso). */
export function encerrarRetransmissoes() {
  for (const controller of ouvintes) controller.abort();
  ouvintes.clear();
}

export const contarOuvintes = () => ouvintes.size;

/**
 * Retransmite o áudio da rádio pelo próprio servidor. Serve para streams em
 * http (bloqueados dentro de um site https) e para servidores sem CORS.
 * Só funciona quando a opção está ligada no painel.
 */
/**
 * Encaminha o áudio de `origem` para o cliente. Usado tanto pela retransmissão
 * pública quanto pela prévia do painel, que precisa da mesma origem do site
 * para o navegador conseguir medir o nível do som.
 */
async function encaminharAudio(origem, formatoPadrao, req, res) {
  const upstream = new AbortController();
  ouvintes.add(upstream);
  const soltar = () => {
    ouvintes.delete(upstream);
    upstream.abort();
  };
  req.on('close', soltar);
  res.on('close', soltar);

  try {
    const { resposta: response } = await buscarComDestinoSeguro(origem, {
      headers: { 'User-Agent': 'LavrasFM/1.0' },
      signal: upstream.signal
    });
    if (!response.ok || !response.body) {
      return res.status(502).json({ error: 'A transmissão não respondeu.' });
    }

    // Muitos servidores de rádio anunciam o áudio como arquivo genérico
    // (application/octet-stream) ou não informam tipo nenhum. Trocamos pelo
    // formato configurado, que é o que o <audio> espera.
    const tipoOrigem = (response.headers.get('content-type') || '').toLowerCase();
    const tipoServivel =
      tipoOrigem.startsWith('audio/') || tipoOrigem.includes('mpegurl') || tipoOrigem.includes('ogg');
    res.setHeader('Content-Type', tipoServivel ? tipoOrigem : formatoPadrao);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');

    for await (const chunk of response.body) {
      if (!res.write(chunk)) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
    res.end();
  } catch (error) {
    // Abortar quando o ouvinte fecha a aba é o caminho normal, não um erro.
    if (error?.name !== 'AbortError' && !res.headersSent) {
      res.status(502).json({ error: 'Falha ao retransmitir a rádio.' });
    } else {
      res.end();
    }
  } finally {
    ouvintes.delete(upstream);
  }
}

api.get('/stream', async (req, res) => {
  const settings = getSettings();
  if (settings.stream_relay !== '1' || !settings.stream_url) {
    return res.status(404).json({ error: 'Retransmissão desativada.' });
  }

  if (ouvintes.size >= MAX_OUVINTES) {
    res.setHeader('Retry-After', '30');
    return res.status(503).json({
      error: 'A retransmissão atingiu o limite de ouvintes simultâneos. Tente de novo em instantes.'
    });
  }

  await encaminharAudio(settings.stream_url, settings.stream_format, req, res);
});

api.get('/now-playing', (_req, res) => {
  const settings = getSettings();
  res.json({
    station_name: settings.station_name,
    now_playing: settings.now_playing,
    stream_url: playableStreamUrl(settings),
    stream_format: settings.stream_format
  });
});

/* ------------------------------ Autenticação -------------------------------- */

api.post('/auth/login', throttleLogin, async (req, res) => {
  const session = await login(req.body?.username, req.body?.password);
  if (!session) {
    res.locals.registerFailedLogin?.();
    return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  }
  res.locals.clearFailedLogins?.();
  setSessionCookie(res, session);
  res.json({ user: session.user });
});

api.post('/auth/logout', (req, res) => {
  logout(req.session?.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

api.get('/auth/me', (req, res) => res.json({ user: req.user }));

api.post('/auth/password', requireAuth, async (req, res) => {
  const next = String(req.body?.new_password || '');
  if (next.length < 8) {
    return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 8 caracteres.' });
  }
  if (!(await changePassword(req.user.id, req.body?.current_password, next))) {
    return res.status(400).json({ error: 'Senha atual incorreta.' });
  }
  clearSessionCookie(res);
  res.json({ ok: true, message: 'Senha alterada. Faça login novamente.' });
});

/* ----------------------------------- Admin ----------------------------------- */

const admin = Router();
admin.use(requireAuth);

// Resposta de área autenticada não deve ficar em cache de navegador ou proxy.
admin.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, private');
  next();
});

admin.get('/options', (_req, res) =>
  res.json({ highlights: HIGHLIGHTS, videoKinds: VIDEO_KINDS, settingKeys: Object.keys(DEFAULT_SETTINGS) })
);

/** Lê título, resumo, foto e fonte direto da página da notícia. */
admin.post('/news/preview', async (req, res, next) => {
  try {
    res.json({ artigo: await lerArtigo(req.body?.url) });
  } catch (error) {
    next(error);
  }
});

admin.get('/news', (_req, res) => res.json({ news: listNews({ includeInactive: true }) }));
admin.post('/news', (req, res) => res.status(201).json({ item: createNews(req.body) }));

admin.get('/news/:id', (req, res) => {
  const item = getNews(req.params.id);
  return item ? res.json({ item }) : res.status(404).json({ error: 'Notícia não encontrada.' });
});

admin.put('/news/:id', (req, res) => {
  const item = updateNews(req.params.id, req.body);
  return item ? res.json({ item }) : res.status(404).json({ error: 'Notícia não encontrada.' });
});

admin.delete('/news/:id', (req, res) => {
  return deleteNews(req.params.id)
    ? res.json({ ok: true })
    : res.status(404).json({ error: 'Notícia não encontrada.' });
});

admin.get('/videos', (_req, res) => res.json({ videos: listVideos({ includeInactive: true }) }));
admin.post('/videos', (req, res) => res.status(201).json({ item: createVideo(req.body) }));

admin.get('/videos/:id', (req, res) => {
  const item = getVideo(req.params.id);
  return item ? res.json({ item }) : res.status(404).json({ error: 'Vídeo não encontrado.' });
});

admin.put('/videos/:id', (req, res) => {
  const item = updateVideo(req.params.id, req.body);
  return item ? res.json({ item }) : res.status(404).json({ error: 'Vídeo não encontrado.' });
});

admin.delete('/videos/:id', (req, res) => {
  return deleteVideo(req.params.id)
    ? res.json({ ok: true })
    : res.status(404).json({ error: 'Vídeo não encontrado.' });
});

/** Resolve o que foi colado (playlist, página de diretório, URL direta). */
admin.post('/stream/resolve', async (req, res, next) => {
  try {
    const resolved = await resolveStreamUrl(req.body?.url);
    const probe = await probeStream(resolved.url);
    res.json({ ...resolved, probe });
  } catch (error) {
    next(error);
  }
});

/**
 * Prévia da transmissão servida pela mesma origem do site.
 *
 * O navegador só permite analisar o som de um áudio quando ele vem da mesma
 * origem da página. Passando por aqui, o painel consegue medir o nível do
 * áudio e dizer se a transmissão está tocando ou está no ar em silêncio.
 */
admin.get('/stream/preview', async (req, res, next) => {
  try {
    const { url } = await resolveStreamUrl(req.query.url);
    await encaminharAudio(url, getSettings().stream_format, req, res);
  } catch (error) {
    next(error);
  }
});

admin.get('/settings', (_req, res) => res.json({ settings: getSettings() }));
admin.put('/settings', async (req, res, next) => {
  try {
    // Impede que um endereço interno seja gravado como transmissão, mesmo que
    // alguém pule a etapa de verificação.
    const informado = String(req.body?.stream_url || '').trim();
    if (informado) await exigirDestinoPublico(informado);

    res.json({ settings: saveSettings(req.body || {}) });
  } catch (error) {
    next(error);
  }
});

api.use('/admin', admin);

// Erros de validação viram 400 com mensagem legível; o resto vira 500.
api.use((err, _req, res, _next) => {
  if (err instanceof RedeBloqueadaError || err?.name === 'RedeBloqueadaError') {
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof ArtigoError || err?.name === 'ArtigoError') {
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof StreamError || err?.name === 'StreamError') {
    return res.status(400).json({ error: err.message, hint: err.hint || '' });
  }
  if (err instanceof ValidationError || err?.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  console.error('[api]', err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});
