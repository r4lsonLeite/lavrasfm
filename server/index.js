import express from 'express';
import compression from 'compression';
import { existsSync } from 'node:fs';
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
const { destinoInternoPermitido } = await import('./rede.js');
const { criarEntregaDePaginas } = await import('./paginas.js');
const { getMateriaPorSlug, listMaterias } = await import('./content.js');
const { resumir } = await import('./texto.js');
const { arquivoDaImagem } = await import('./imagens.js');
const { agendarBackups } = await import('./backup.js');

const PUBLIC_DIR = join(raiz, 'public');
// Páginas com versão carimbada no CSS e no JS, para um deploy não deixar o
// visitante com HTML novo e folha de estilo antiga.
const paginas = criarEntregaDePaginas(PUBLIC_DIR);
const PORT = Number(process.env.PORT) || 3000;
const EM_PRODUCAO = process.env.NODE_ENV === 'production';

const app = express();
app.disable('x-powered-by');
/**
 * Confiança no proxy reverso. Aceita o número de saltos (1 no Render) ou uma
 * lista de IPs/sub-redes. `true` foi deixado de fora de propósito: confiar em
 * qualquer proxy deixa o cabeçalho de IP ser forjado, e com ele o limite de
 * tentativas de login. Um valor desligado ("0", "false", vazio) não ativa nada.
 */
const proxyConfiavel = String(process.env.TRUST_PROXY || '').trim();
if (proxyConfiavel && !['0', 'false', 'no'].includes(proxyConfiavel.toLowerCase())) {
  app.set('trust proxy', /^\d+$/.test(proxyConfiavel) ? Number(proxyConfiavel) : proxyConfiavel);
}

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
  "img-src 'self' data: https: http:",
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
  // Isola a janela do site de páginas que a tenham aberto, e impede que outros
  // sites incorporem os recursos daqui como se fossem deles.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
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

/**
 * Defesa contra CSRF. O cookie SameSite=Lax já impede o caso clássico, mas
 * uma aplicação administrativa merece uma segunda barreira: toda requisição
 * que altera dados precisa vir da própria origem do site.
 */
const METODOS_QUE_ALTERAM = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
app.use('/api', (req, res, next) => {
  if (!METODOS_QUE_ALTERAM.has(req.method)) return next();

  const origem = req.get('origin') || req.get('referer');
  // Sem cabeçalho de origem não há navegador envolvido (curl, aplicativo), e
  // sem navegador não existe o ataque que estamos evitando aqui.
  if (!origem) return next();

  let host;
  try {
    host = new URL(origem).host;
  } catch {
    return res.status(403).json({ error: 'Origem da requisição inválida.' });
  }

  if (host !== req.get('host')) {
    return res.status(403).json({ error: 'Requisição vinda de outro site foi recusada.' });
  }
  next();
});

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

  const html = paginas.preencher(paginas.html('index.html'), {
    SITE_URL: escaparHtml(enderecoPublico(req)),
    STATION_NAME: escaparHtml(settings.station_name),
    DESCRIPTION: escaparHtml(descricao)
  });

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
/**
 * A matéria é montada no servidor, e não no navegador, por causa das
 * metatags: WhatsApp, Facebook e buscadores leem o HTML como ele chega e não
 * executam JavaScript. Preenchidas no cliente, a prévia do link viria vazia.
 */
app.get('/materia/:slug', (req, res, next) => {
  const materia = getMateriaPorSlug(req.params.slug);
  if (!materia) return next();

  const settings = getSettings();
  const base = enderecoPublico(req);
  const resumo = materia.excerpt || `${materia.title} — ${settings.station_name}.`;
  const escrito = Boolean(materia.excerpt) && materia.excerpt !== resumir(materia.body, 200);
  const capa = materia.image_url
    ? (materia.image_url.startsWith('/') ? base + materia.image_url : materia.image_url)
    : `${base}/og-image.png`;

  const html = paginas.preencher(paginas.html('materia.html'), {
    SITE_URL: escaparHtml(base),
    CANONICAL: escaparHtml(`${base}/materia/${materia.slug}`),
    STATION_NAME: escaparHtml(settings.station_name),
    TITLE: escaparHtml(materia.title),
    DESCRIPTION: escaparHtml(resumo),
    // O resumo gerado do próprio texto não vira linha de apoio: seria o
    // primeiro parágrafo repetido logo acima dele. Ele continua valendo para
    // o card na capa e para a prévia de compartilhamento, onde não há repetição.
    EXCERPT_BLOCK: escrito
      ? `<p class="font-body-md text-[17px] md:text-[19px] text-tinta-media leading-relaxed mt-4">${escaparHtml(materia.excerpt)}</p>`
      : '',
    CATEGORY: escaparHtml(materia.category),
    OG_IMAGE: escaparHtml(capa),
    PUBLISHED_ISO: escaparHtml(String(materia.published_at).replace(' ', 'T') + 'Z'),
    PUBLISHED_LABEL: escaparHtml(dataPorExtenso(materia.published_at)),
    SOURCE_BLOCK: materia.source
      ? `<span class="inline-flex items-center gap-1.5">Por ${escaparHtml(materia.source)}</span>`
      : '',
    COVER_BLOCK: materia.image_url
      ? `<figure class="mt-6">
           <img src="${escaparHtml(materia.image_url)}" alt="${escaparHtml(materia.title)}"
                class="w-full max-h-[560px] object-cover rounded-xl bg-placa">
         </figure>`
      : '',
    // Já é HTML seguro: veio de paraHtml(), que escapa antes de formatar.
    BODY_HTML: materia.body_html
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(html);
});

/** "16 de setembro de 2026" — a data como se lê, não como o banco guarda. */
function dataPorExtenso(valor) {
  const data = new Date(String(valor).replace(' ', 'T') + 'Z');
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleDateString('pt-BR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Fortaleza'
  });
}

/**
 * As fotos enviadas pela redação ficam no disco permanente, fora de public/,
 * que é substituído a cada deploy. O tipo vem do nome gerado pelo servidor,
 * nunca do que o navegador declarou no envio.
 */
app.get('/uploads/:nome', (req, res, next) => {
  const arquivo = arquivoDaImagem(req.params.nome);
  if (!arquivo) return next();
  res.setHeader('Content-Type', arquivo.tipo);
  // O nome carrega um trecho aleatório: conteúdo novo é sempre endereço novo.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(arquivo.caminho);
});

app.get('/sitemap.xml', (req, res) => {
  const base = enderecoPublico(req);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <url><loc>${escaparHtml(base)}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>\n` +
      listMaterias()
        .map(
          (m) =>
            `  <url><loc>${escaparHtml(`${base}/materia/${m.slug}`)}</loc>` +
            `<lastmod>${escaparHtml(String(m.updated_at).slice(0, 10))}</lastmod>` +
            `<changefreq>weekly</changefreq><priority>0.8</priority></url>\n`
        )
        .join('') +
      `</urlset>\n`
  );
});

app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/admin');
  paginas.enviar(res, 'login.html');
});

app.get('/admin', requireAuthPage, (_req, res) => paginas.enviar(res, 'admin.html'));

/**
 * O painel e o login têm rotas próprias, com verificação de sessão. Servir os
 * mesmos arquivos pelo caminho estático deixaria a fronteira de autenticação
 * inconsistente — /admin exige login, /admin.html não exigiria.
 */
const PAGINAS_INTERNAS = new Set(['/admin.html', '/login.html', '/500.html', '/404.html']);
app.use((req, res, next) => {
  if (PAGINAS_INTERNAS.has(req.path)) {
    return res.redirect(302, req.path === '/admin.html' ? '/admin' : '/');
  }
  next();
});

app.use(
  express.static(PUBLIC_DIR, {
    extensions: ['html'],
    // O HTML é revalidado sempre. CSS e JS carregam versão no endereço e
    // ficam em cache para sempre; as demais imagens, por uma hora.
    setHeaders(res, caminho) {
      if (caminho.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
        return;
      }
      // CSS e JS são pedidos pelo HTML com ?v=<versão do conteúdo>, então o
      // endereço muda sozinho a cada mudança: aqui o cache pode ser longo.
      const versionado = /[\\/](?:css|js)[\\/]/.test(caminho);
      res.setHeader(
        'Cache-Control',
        versionado ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'
      );
    }
  })
);

app.use((_req, res) => paginas.enviar(res, '404.html', 404));

// Último recurso: erro não tratado vira uma página legível, não uma tela branca.
app.use((err, req, res, _next) => {
  registrarErro(`http ${req.method} ${req.originalUrl}`, err);
  if (res.headersSent) return res.end();
  paginas.enviar(res, '500.html', 500);
});

if (destinoInternoPermitido() && EM_PRODUCAO) {
  console.warn(
    '\n  ATENÇÃO: PERMITIR_DESTINO_INTERNO está ligado em produção.\n' +
      '  Isso desativa a proteção contra o servidor ser usado para acessar\n' +
      '  a rede interna. Remova essa variável do ambiente.\n'
  );
}

const admin = await ensureAdminUser();
const pararBackups = agendarBackups();

// Falhas não capturadas ficam registradas em vez de sumirem no console.
process.on('unhandledRejection', (motivo) => registrarErro('promessa não tratada', motivo));

// Depois de uma exceção não capturada o estado da aplicação não é confiável.
// Registramos, encerramos com ordem e deixamos a hospedagem subir de novo.
process.on('uncaughtException', (erro) => {
  registrarErro('exceção não capturada', erro);
  desligar('exceção não capturada');
});

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
