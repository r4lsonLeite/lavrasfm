/**
 * Redefine a senha do painel administrativo.
 *
 *   npm run senha                    -> sorteia uma senha e mostra na tela
 *   npm run senha -- minha-senha-123 -> define a senha informada
 *   npm run senha -- --usuario joao  -> escolhe qual usuário alterar
 *
 * Serve para quando ninguém lembra a senha: como ela é guardada como hash
 * scrypt, não há como recuperá-la — só substituir.
 */
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const arquivoEnv = process.env.ENV_FILE || join(raiz, '.env');
if (existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);

const { db } = await import('./db.js');
const { hashPassword } = await import('./auth.js');

const args = process.argv.slice(2);
let usuario = process.env.ADMIN_USER || 'admin';
let novaSenha = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--usuario' || args[i] === '-u') usuario = args[++i];
  else if (!args[i].startsWith('-')) novaSenha = args[i];
}

const existentes = db.prepare('SELECT id, username FROM users ORDER BY id').all();

if (existentes.length === 0) {
  console.error('\n  Nenhum usuário cadastrado ainda. Inicie o site uma vez com `npm start`.\n');
  process.exit(1);
}

const alvo = existentes.find((u) => u.username === usuario);

if (!alvo) {
  console.error(`\n  Não existe usuário "${usuario}". Cadastrados: ${existentes.map((u) => u.username).join(', ')}\n`);
  process.exit(1);
}

if (novaSenha && novaSenha.length < 8) {
  console.error('\n  A senha precisa ter pelo menos 8 caracteres.\n');
  process.exit(1);
}

const sorteada = !novaSenha;
if (sorteada) novaSenha = crypto.randomBytes(9).toString('base64url');

db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(novaSenha), alvo.id);
// Qualquer sessão aberta com a senha antiga deixa de valer.
const { changes } = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(alvo.id);
db.close();

console.log(`\n  Senha redefinida para o usuário "${alvo.username}".`);
console.log(`\n      ${novaSenha}\n`);
if (sorteada) console.log('  Anote agora — ela não é mostrada de novo.');
if (changes > 0) console.log(`  ${changes} sessão(ões) aberta(s) foram encerradas.`);
console.log('  Entre em /admin com essa senha e troque na aba Conta se quiser.\n');
