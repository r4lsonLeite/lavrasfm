/**
 * Cópias de segurança do banco.
 *
 * Usa `VACUUM INTO`, que gera um arquivo íntegro mesmo com o site em uso —
 * copiar o .db na unha durante uma escrita pode produzir um arquivo corrompido.
 */
import { mkdirSync, readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { db, DB_PATH } from './db.js';

const PASTA = process.env.BACKUP_DIR || join(dirname(DB_PATH), 'backups');
const MANTER = Number(process.env.BACKUP_KEEP) || 7;
const INTERVALO_HORAS = Number(process.env.BACKUP_INTERVAL_HOURS) || 24;

export function fazerBackup() {
  mkdirSync(PASTA, { recursive: true });

  const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destino = join(PASTA, `lavrasfm-${carimbo}.db`);

  if (existsSync(destino)) return { arquivo: destino, criado: false };

  // O caminho vai como literal SQL: escapamos aspas simples por segurança.
  db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  limparAntigos();

  return { arquivo: destino, criado: true, tamanho: statSync(destino).size };
}

/** Mantém apenas as N cópias mais recentes. */
export function limparAntigos() {
  if (!existsSync(PASTA)) return [];

  const arquivos = readdirSync(PASTA)
    .filter((nome) => nome.startsWith('lavrasfm-') && nome.endsWith('.db'))
    .map((nome) => ({ nome, caminho: join(PASTA, nome) }))
    .sort((a, b) => b.nome.localeCompare(a.nome));

  const removidos = arquivos.slice(MANTER);
  for (const { caminho } of removidos) unlinkSync(caminho);
  return removidos.map((r) => r.nome);
}

export function listarBackups() {
  if (!existsSync(PASTA)) return [];
  return readdirSync(PASTA)
    .filter((nome) => nome.startsWith('lavrasfm-') && nome.endsWith('.db'))
    .sort()
    .reverse()
    .map((nome) => {
      const info = statSync(join(PASTA, nome));
      return { nome, tamanho: info.size, criado_em: info.mtime.toISOString() };
    });
}

/** Agenda as cópias periódicas. Devolve uma função para cancelar. */
export function agendarBackups() {
  try {
    const r = fazerBackup();
    if (r.criado) console.log(`  Backup inicial: ${r.arquivo}`);
  } catch (erro) {
    console.error('[backup] falhou no início:', erro.message);
  }

  const timer = setInterval(() => {
    try {
      fazerBackup();
    } catch (erro) {
      console.error('[backup] falhou:', erro.message);
    }
  }, INTERVALO_HORAS * 3600_000);

  timer.unref();
  return () => clearInterval(timer);
}
