/**
 * Programação da rádio: os programas, seus horários e quem os apresenta.
 *
 * Duas decisões valem explicação.
 *
 * O "no ar agora" é calculado no servidor, no fuso da rádio, e não no
 * navegador de quem visita. Se fosse no navegador, um ouvinte em outro fuso —
 * ou com o relógio do computador errado — veria um programa diferente do que
 * está realmente no ar.
 *
 * Os dias da semana são guardados como dígitos de 0 (domingo) a 6 (sábado),
 * iguais aos de `Date.getDay()`. Assim a conta do programa que atravessa a
 * meia-noite é só olhar também o dia anterior.
 */
import { db } from './db.js';
import {
  ValidationError,
  requireText,
  optionalText,
  optionalHttpUrl,
  toBool
} from './campos.js';

/** A rádio fica em Lavras da Mangabeira, no Ceará. */
export const FUSO_DA_RADIO = 'America/Fortaleza';

export const DIAS = [
  { valor: '0', curto: 'Dom', nome: 'Domingo' },
  { valor: '1', curto: 'Seg', nome: 'Segunda' },
  { valor: '2', curto: 'Ter', nome: 'Terça' },
  { valor: '3', curto: 'Qua', nome: 'Quarta' },
  { valor: '4', curto: 'Qui', nome: 'Quinta' },
  { valor: '5', curto: 'Sex', nome: 'Sexta' },
  { valor: '6', curto: 'Sáb', nome: 'Sábado' }
];

const HORA = /^(\d{1,2}):([0-5]\d)$/;

/* ------------------------------- hora da rádio ------------------------------ */

// hourCycle h23 evita o "24:00" que algumas versões do ICU devolvem à meia-noite.
const relogioDaRadio = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO_DA_RADIO,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

const SEMANA_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** O dia da semana e os minutos desde a meia-noite, na hora da rádio. */
export function agoraNaRadio(quando = new Date()) {
  const partes = {};
  for (const parte of relogioDaRadio.formatToParts(quando)) partes[parte.type] = parte.value;
  return {
    dia: SEMANA_EN.indexOf(partes.weekday),
    minutos: Number(partes.hour) * 60 + Number(partes.minute)
  };
}

const emMinutos = (hora) => {
  const [h, m] = String(hora).split(':');
  return Number(h) * 60 + Number(m);
};

/**
 * O programa que está no ar. Recebe a lista já pronta para não consultar o
 * banco de novo a cada chamada.
 */
export function programaNoAr(programas, quando = new Date()) {
  const { dia, minutos } = agoraNaRadio(quando);
  const ontem = (dia + 6) % 7;

  return (
    programas.find((programa) => {
      const inicio = emMinutos(programa.start_time);
      const fim = emMinutos(programa.end_time);
      if (fim > inicio) {
        return programa.days.includes(String(dia)) && minutos >= inicio && minutos < fim;
      }
      // Atravessa a meia-noite: conta no dia em que começou.
      return (
        (programa.days.includes(String(dia)) && minutos >= inicio) ||
        (programa.days.includes(String(ontem)) && minutos < fim)
      );
    }) || null
  );
}

/**
 * O próximo programa a entrar no ar. Procura a ocorrência mais próxima olhando
 * até uma semana à frente, para a virada de domingo para segunda não deixar a
 * resposta vazia.
 */
export function proximoNoAr(programas, quando = new Date()) {
  const { dia, minutos } = agoraNaRadio(quando);
  let melhor = null;

  for (const programa of programas) {
    for (const d of programa.days) {
      let espera = ((Number(d) - dia + 7) % 7) * 1440 + emMinutos(programa.start_time) - minutos;
      // Já passou (ou está começando agora): vale a ocorrência da semana que vem.
      if (espera <= 0) espera += 7 * 1440;
      if (!melhor || espera < melhor.espera) melhor = { programa, espera };
    }
  }
  if (!melhor) return null;

  // Quantas viradas de meia-noite até lá — é o que diz "hoje", "amanhã" ou o dia.
  const adiante = Math.floor((minutos + melhor.espera) / 1440);
  const quandoTexto =
    adiante === 0 ? 'hoje' : adiante === 1 ? 'amanhã' : DIAS[(dia + adiante) % 7].curto;

  return {
    ...melhor.programa,
    next_in_minutes: melhor.espera,
    next_label: `${quandoTexto} às ${melhor.programa.start_time}`
  };
}

/* -------------------------------- validação -------------------------------- */

function requireHora(value, field) {
  const texto = requireText(value, field, { max: 5 });
  const match = HORA.exec(texto);
  if (!match) throw new ValidationError(`O campo "${field}" precisa estar no formato HH:MM.`);
  const horas = Number(match[1]);
  if (horas > 23) throw new ValidationError(`O campo "${field}" precisa estar entre 00:00 e 23:59.`);
  return `${String(horas).padStart(2, '0')}:${match[2]}`;
}

/** Aceita lista ou texto e devolve os dígitos únicos, em ordem. */
function requireDias(value) {
  const bruto = Array.isArray(value) ? value.join('') : String(value ?? '');
  const dias = [...new Set(bruto.match(/[0-6]/g) || [])].sort();
  if (!dias.length) throw new ValidationError('Escolha pelo menos um dia da semana.');
  return dias.join('');
}

function normalizeProgram(input) {
  const start_time = requireHora(input.start_time, 'início');
  const end_time = requireHora(input.end_time, 'fim');
  if (start_time === end_time) {
    throw new ValidationError('O fim do programa precisa ser diferente do início.');
  }

  return {
    name: requireText(input.name, 'nome do programa', { max: 160 }),
    presenter: optionalText(input.presenter, { max: 120 }),
    presenter_photo: optionalHttpUrl(input.presenter_photo, 'foto do locutor'),
    description: optionalText(input.description, { max: 600 }),
    days: requireDias(input.days),
    start_time,
    end_time,
    position: Number.parseInt(input.position, 10) || 0,
    active: input.active === undefined ? 1 : toBool(input.active)
  };
}

/* ------------------------------- apresentação ------------------------------- */

const curto = (digito) => DIAS[Number(digito)].curto;

/** "Todos os dias", "Seg a Sex", "Dom e Sáb", "Seg, Qua, Sex". */
export function rotuloDias(digitos) {
  const dias = [...String(digitos ?? '')].sort();
  if (!dias.length) return '';
  if (dias.length === 7) return 'Todos os dias';

  const seguidos = dias.every((dia, i) => i === 0 || Number(dia) === Number(dias[i - 1]) + 1);
  if (seguidos && dias.length > 2) return `${curto(dias[0])} a ${curto(dias.at(-1))}`;
  if (dias.length === 2) return `${curto(dias[0])} e ${curto(dias[1])}`;
  return dias.map(curto).join(', ');
}

function decorate(row) {
  return {
    ...row,
    active: Boolean(row.active),
    days_list: [...row.days],
    days_label: rotuloDias(row.days),
    schedule_label: `${row.start_time} às ${row.end_time}`,
    crosses_midnight: emMinutos(row.end_time) <= emMinutos(row.start_time)
  };
}

/* ----------------------------------- CRUD ---------------------------------- */

export function listPrograms({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  return db
    .prepare(`SELECT * FROM programs ${where} ORDER BY start_time ASC, position ASC, id ASC`)
    .all()
    .map(decorate);
}

export function getProgram(id) {
  const row = db.prepare('SELECT * FROM programs WHERE id = ?').get(Number(id));
  return row ? decorate(row) : null;
}

export function createProgram(input) {
  const data = normalizeProgram(input);
  const result = db
    .prepare(
      `INSERT INTO programs (name, presenter, presenter_photo, description, days, start_time, end_time, position, active)
       VALUES (:name, :presenter, :presenter_photo, :description, :days, :start_time, :end_time, :position, :active)`
    )
    .run(data);
  return getProgram(result.lastInsertRowid);
}

export function updateProgram(id, input) {
  const existing = getProgram(id);
  if (!existing) return null;
  const data = normalizeProgram({ ...existing, ...input });
  db.prepare(
    `UPDATE programs SET name = :name, presenter = :presenter, presenter_photo = :presenter_photo,
            description = :description, days = :days, start_time = :start_time, end_time = :end_time,
            position = :position, active = :active, updated_at = datetime('now')
      WHERE id = :id`
  ).run({ ...data, id: Number(id) });
  return getProgram(id);
}

export function deleteProgram(id) {
  return db.prepare('DELETE FROM programs WHERE id = ?').run(Number(id)).changes > 0;
}
