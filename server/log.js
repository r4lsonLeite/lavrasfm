/**
 * Registro de erros em arquivo, para dar para investigar um problema depois
 * que ele aconteceu. Mantém o console intacto e nunca derruba o servidor por
 * falha de escrita.
 */
import { appendFileSync, mkdirSync, statSync, renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DB_PATH } from './db.js';

const PASTA = process.env.LOG_DIR || join(dirname(DB_PATH), 'logs');
const ARQUIVO = join(PASTA, 'erros.log');
const TAMANHO_MAX = 5 * 1024 * 1024;

function girarSeGrande() {
  try {
    if (existsSync(ARQUIVO) && statSync(ARQUIVO).size > TAMANHO_MAX) {
      renameSync(ARQUIVO, `${ARQUIVO}.1`);
    }
  } catch {
    /* rotação é melhor-esforço */
  }
}

export function registrarErro(contexto, erro) {
  const linha = [
    new Date().toISOString(),
    contexto,
    erro?.stack || erro?.message || String(erro)
  ].join(' | ');

  console.error(`[${contexto}]`, erro);

  try {
    mkdirSync(PASTA, { recursive: true });
    girarSeGrande();
    appendFileSync(ARQUIVO, linha + '\n');
  } catch {
    // Não conseguir gravar o log não pode ser motivo para o site cair.
  }
}

export const CAMINHO_LOG = ARQUIVO;
