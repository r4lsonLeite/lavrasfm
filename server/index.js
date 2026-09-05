import express from 'express';
import compression from 'compression';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Carrega o .env antes de qualquer módulo que leia process.env.
const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const arquivoEnv = process.env.ENV_FILE || join(raiz, '.env');
if (existsSync(arquivoEnv)) {
  process.loadEnvFile(arquivoEnv);
}

const { api, encerrarRetransmissoes } = await import('./routes/api.js');
const { ensureAdminUser, sessionMiddleware, requireAuthPage } = await import('./auth.js');
const { db, getSettings } = await import('./db.js');
const { registrarErro } = await import('./log.js');
const { agendarBackups } = await import('./backup.js');

const PUBLIC_DIR = join(raiz, 'public');
const PORT = Number(process.env.PORT) || 3000;
const EM_PRODUCAO = process.env.NODE_ENV === 'production';

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', true);

/**
 * Cabeçalhos de segurança. A política de conteúdo é estrita: nenhum script ou
 * estilo inline. As exceções são as que o site realmente precisa — fontes do
 * Google, capas de notícia de qualquer site https, o áudio da rádio e os
 * vídeos incorporados do YouTube.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  // http entra aqui porque muita rádio ainda transmite sem https. O navegador
  // continua bloqueando isso dentro de um site https — a diferença é que o
  // painel consegue explicar o motivo em vez de a página falhar em silêncio.
  "media-src 'self' https: http:",
  'frame-src https://www.youtube-nocookie.com https://www.youtube.com',
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'"
].join('; ');

app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (EM_PRODUCAO) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// O áudio da retransmissão não deve passar pelo compressor: já vem comprimido
// e o buffer do gzip atrasaria a transmissão ao vivo.
app.use(
  compression({
    filter: (req, res) =>
      !req.path.startsWith('/api/stream') && compression.filter(req, res)
  })
);

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// Parser de cookies mínimo — evita uma dependência só para ler o cookie de sessão.
app.use((req, _res, next) => {
  req.cookies = Object.create(null);
  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    try {
      req.cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      req.cookies[name] = part.slice(index + 1).trim();
    }
  }
  next();
});

app.use(sessionMiddleware);
app.use('/api', api);

/**
 * A home é servida com o nome da rádio, a descrição e o endereço público
 * preenchidos. Isso faz o link render uma prévia decente no WhatsApp e no
 * Facebook, que exigem endereços absolutos — e como o domínio ainda pode
 * mudar, ele vem de SITE_URL em vez de ficar fixo no HTML.
 */
function enderecoPublico(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function renderizarHome(req, res) {
  const settings = getSettings();
  const descricao =
    settings.tagline || `${settings.station_name}: rádio ao vivo, notícias e vídeos.`;

  const html = readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8')
    .replaceAll('{{SITE_URL}}', escaparHtml(enderecoPublico(req)))
    .replaceAll('{{STATION_NAME}}', escaparHtml(settings.station_name))
    .replaceAll('{{DESCRIPTION}}', escaparHtml(descricao));

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(html);
}

const escaparHtml = (valor) =>
  String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);

app.get('/', renderizarHome);
app.get('/index.html', (_req, res) => res.redirect(301, '/'));

// Mapa do site: só a home é pública e indexável.
app.get('/sitemap.xml', (req, res) => {
  const base = enderecoPublico(req);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <url><loc>${escaparHtml(base)}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>\n` +
      `</urlset>\n`
  );
});

app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/admin');
  res.sendFile(join(PUBLIC_DIR, 'login.html'));
});

app.get('/admin', requireAuthPage, (_req, res) => res.sendFile(join(PUBLIC_DIR, 'admin.html')));

app.use(
  express.static(PUBLIC_DIR, {
    extensions: ['html'],
    // O HTML é revalidado sempre; CSS, JS e imagens podem ficar em cache por
    // uma hora, já que uma mudança neles vem acompanhada de um deploy.
    setHeaders(res, caminho) {
      res.setHeader(
        'Cache-Control',
        caminho.endsWith('.html') ? 'no-cache' : 'public, max-age=3600'
      );
    }
  })
);

app.use((_req, res) => res.status(404).sendFile(join(PUBLIC_DIR, '404.html')));

// Último recurso: erro não tratado vira uma página legível, não uma tela branca.
app.use((err, req, res, _next) => {
  registrarErro(`http ${req.method} ${req.originalUrl}`, err);
  if (res.headersSent) return res.end();
  res.status(500).sendFile(join(PUBLIC_DIR, '500.html'));
});

const admin = ensureAdminUser();
const pararBackups = agendarBackups();

// Falhas não capturadas ficam registradas em vez de sumirem no console.
process.on('unhandledRejection', (motivo) => registrarErro('promessa não tratada', motivo));
process.on('uncaughtException', (erro) => registrarErro('exceção não capturada', erro));

const server = app.listen(PORT, () => {
  console.log(`\n  LavrasFM no ar em http://localhost:${PORT}`);
  console.log(`  Painel administrativo: http://localhost:${PORT}/admin\n`);
  if (admin.created) {
    console.log(`  Administrador criado — usuário: ${admin.username}`);
    if (admin.generated) {
      console.log(`  Senha gerada (anote agora): ${admin.password}`);
      console.log('  Defina ADMIN_PASSWORD no .env para escolher a sua.\n');
    }
  }
});

/**
 * Desligamento gracioso: para de aceitar conexões novas, encerra as
 * retransmissões em curso e fecha o banco. Sem isso, um reinício corta o áudio
 * de quem está ouvindo e pode deixar o banco em estado inconsistente.
 */
let desligando = false;
function desligar(sinal) {
  if (desligando) return;
  desligando = true;
  console.log(`\n  ${sinal} recebido — encerrando…`);

  pararBackups();
  encerrarRetransmissoes();
  server.close(() => {
    try {
      db.close();
    } catch {
      /* já fechado */
    }
    console.log('  Encerrado com segurança.');
    process.exit(0);
  });

  // Se alguma conexão travar, não ficamos presos para sempre.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => desligar('SIGTERM'));
process.on('SIGINT', () => desligar('SIGINT'));
