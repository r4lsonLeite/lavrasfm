import { Router } from 'express';
import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../db.js';
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
api.get('/site', (_req, res) => {
  const news = listNews();
  const videos = listVideos();
  res.json({
    settings: getSettings(),
    banner: news.find((item) => item.highlight === 'banner') || null,
    news: news.filter((item) => item.highlight !== 'banner'),
    featuredVideo: videos.find((video) => video.featured) || videos[0] || null,
    videos
  });
});

api.get('/news', (_req, res) => res.json({ news: listNews() }));
api.get('/videos', (_req, res) => res.json({ videos: listVideos() }));
api.get('/now-playing', (_req, res) => {
  const settings = getSettings();
  res.json({
    station_name: settings.station_name,
    now_playing: settings.now_playing,
    stream_url: settings.stream_url,
    stream_format: settings.stream_format
  });
});

/* ------------------------------ Autenticação -------------------------------- */

api.post('/auth/login', throttleLogin, (req, res) => {
  const session = login(req.body?.username, req.body?.password);
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

api.post('/auth/password', requireAuth, (req, res) => {
  const next = String(req.body?.new_password || '');
  if (next.length < 8) {
    return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 8 caracteres.' });
  }
  if (!changePassword(req.user.id, req.body?.current_password, next)) {
    return res.status(400).json({ error: 'Senha atual incorreta.' });
  }
  clearSessionCookie(res);
  res.json({ ok: true, message: 'Senha alterada. Faça login novamente.' });
});

/* ----------------------------------- Admin ----------------------------------- */

const admin = Router();
admin.use(requireAuth);

admin.get('/options', (_req, res) =>
  res.json({ highlights: HIGHLIGHTS, videoKinds: VIDEO_KINDS, settingKeys: Object.keys(DEFAULT_SETTINGS) })
);

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

admin.get('/settings', (_req, res) => res.json({ settings: getSettings() }));
admin.put('/settings', (req, res) => res.json({ settings: saveSettings(req.body || {}) }));

api.use('/admin', admin);

// Erros de validação viram 400 com mensagem legível; o resto vira 500.
api.use((err, _req, res, _next) => {
  if (err instanceof ValidationError || err?.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  console.error('[api]', err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});
