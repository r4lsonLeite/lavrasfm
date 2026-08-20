import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './routes/api.js';
import { ensureAdminUser, sessionMiddleware, requireAuthPage } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', true);

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

app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/admin');
  res.sendFile(join(PUBLIC_DIR, 'login.html'));
});

app.get('/admin', requireAuthPage, (_req, res) => res.sendFile(join(PUBLIC_DIR, 'admin.html')));

app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.use((_req, res) => res.status(404).sendFile(join(PUBLIC_DIR, '404.html')));

const admin = ensureAdminUser();

app.listen(PORT, () => {
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
