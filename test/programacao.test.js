import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Cada execução usa um banco descartável, para os testes não dependerem de ordem.
const pasta = mkdtempSync(join(tmpdir(), 'lavrasfm-prog-'));
process.env.DB_PATH = join(pasta, 'teste.db');

const {
  createProgram,
  updateProgram,
  listPrograms,
  deleteProgram,
  programaNoAr,
  proximoNoAr,
  agoraNaRadio,
  rotuloDias
} = await import('../server/programacao.js');

after(() => rmSync(pasta, { recursive: true, force: true }));

/** Um instante no fuso da rádio (UTC-3, sem horário de verão). */
const naRadio = (iso) => new Date(`${iso}-03:00`);

describe('cadastro de programa', () => {
  test('exige nome', () => {
    assert.throws(
      () => createProgram({ name: '  ', days: '1', start_time: '06:00', end_time: '09:00' }),
      /obrigatório/
    );
  });

  test('exige pelo menos um dia', () => {
    assert.throws(
      () => createProgram({ name: 'Manhã', days: '', start_time: '06:00', end_time: '09:00' }),
      /pelo menos um dia/
    );
  });

  test('recusa hora fora do formato e fora do dia', () => {
    const base = { name: 'Manhã', days: '1' };
    assert.throws(() => createProgram({ ...base, start_time: '6h', end_time: '09:00' }), /HH:MM/);
    assert.throws(() => createProgram({ ...base, start_time: '25:00', end_time: '09:00' }), /00:00 e 23:59/);
  });

  test('recusa início igual ao fim', () => {
    assert.throws(
      () => createProgram({ name: 'Manhã', days: '1', start_time: '06:00', end_time: '06:00' }),
      /diferente do início/
    );
  });

  test('recusa foto que não é endereço http', () => {
    assert.throws(
      () =>
        createProgram({
          name: 'Manhã',
          days: '1',
          start_time: '06:00',
          end_time: '09:00',
          presenter_photo: 'javascript:alert(1)'
        }),
      /http/
    );
  });

  test('normaliza a hora, ordena os dias e tira repetidos', () => {
    const programa = createProgram({
      name: 'Tarde Total',
      days: ['3', '1', '1', '5'],
      start_time: '6:05',
      end_time: '9:00'
    });
    assert.equal(programa.start_time, '06:05');
    assert.equal(programa.days, '135');
    assert.deepEqual(programa.days_list, ['1', '3', '5']);
    assert.equal(programa.schedule_label, '06:05 às 09:00');
    assert.equal(programa.crosses_midnight, false);
    deleteProgram(programa.id);
  });

  test('editar só um campo preserva os demais', () => {
    const criado = createProgram({
      name: 'Som da Terra',
      presenter: 'João Locutor',
      days: '12345',
      start_time: '12:00',
      end_time: '14:00'
    });
    const editado = updateProgram(criado.id, { name: 'Som da Terra II' });
    assert.equal(editado.name, 'Som da Terra II');
    assert.equal(editado.presenter, 'João Locutor');
    assert.equal(editado.days, '12345');
    assert.equal(editado.start_time, '12:00');
    deleteProgram(criado.id);
  });

  test('a lista sai em ordem de horário e esconde os inativos', () => {
    const tarde = createProgram({ name: 'Tarde', days: '1', start_time: '14:00', end_time: '16:00' });
    const manha = createProgram({ name: 'Manhã', days: '1', start_time: '06:00', end_time: '09:00' });
    const oculto = createProgram({
      name: 'Oculto', days: '1', start_time: '10:00', end_time: '11:00', active: false
    });

    assert.deepEqual(listPrograms().map((p) => p.name), ['Manhã', 'Tarde']);
    assert.equal(listPrograms({ includeInactive: true }).length, 3);

    for (const p of [tarde, manha, oculto]) deleteProgram(p.id);
  });
});

describe('rótulo dos dias', () => {
  test('resume as combinações comuns', () => {
    assert.equal(rotuloDias('0123456'), 'Todos os dias');
    assert.equal(rotuloDias('12345'), 'Seg a Sex');
    assert.equal(rotuloDias('06'), 'Dom e Sáb');
    assert.equal(rotuloDias('135'), 'Seg, Qua, Sex');
    assert.equal(rotuloDias('3'), 'Qua');
    assert.equal(rotuloDias(''), '');
  });
});

describe('no ar agora', () => {
  test('a hora da rádio não depende do fuso de quem visita', () => {
    // 2026-10-08 é uma quinta-feira. 23:30 UTC é 20:30 em Fortaleza.
    const agora = agoraNaRadio(new Date('2026-10-08T23:30:00Z'));
    assert.equal(agora.dia, 4, 'quinta-feira');
    assert.equal(agora.minutos, 20 * 60 + 30);
  });

  test('a meia-noite da rádio marca zero minuto, não 24 horas', () => {
    assert.equal(agoraNaRadio(naRadio('2026-10-08T00:00:00')).minutos, 0);
  });

  test('acha o programa do dia e do horário certos', () => {
    const manha = createProgram({
      name: 'Bom Dia Lavras', days: '12345', start_time: '06:00', end_time: '09:00'
    });

    // Quinta às 07:00 na rádio.
    assert.equal(programaNoAr(listPrograms(), naRadio('2026-10-08T07:00:00'))?.name, 'Bom Dia Lavras');
    // Fora do horário.
    assert.equal(programaNoAr(listPrograms(), naRadio('2026-10-08T10:00:00')), null);
    // Domingo não está na lista de dias.
    assert.equal(programaNoAr(listPrograms(), naRadio('2026-10-11T07:00:00')), null);

    deleteProgram(manha.id);
  });

  test('o fim do horário já não conta como no ar', () => {
    const p = createProgram({ name: 'Meio-dia', days: '4', start_time: '12:00', end_time: '13:00' });
    assert.equal(programaNoAr(listPrograms(), naRadio('2026-10-08T12:59:00'))?.name, 'Meio-dia');
    assert.equal(programaNoAr(listPrograms(), naRadio('2026-10-08T13:00:00')), null);
    deleteProgram(p.id);
  });

  test('programa que atravessa a meia-noite conta na madrugada seguinte', () => {
    // Madrugada de quinta (4) para sexta (5).
    const p = createProgram({ name: 'Madrugada', days: '4', start_time: '23:00', end_time: '02:00' });
    const lista = listPrograms();

    assert.equal(programaNoAr(lista, naRadio('2026-10-08T23:30:00'))?.name, 'Madrugada');
    assert.equal(programaNoAr(lista, naRadio('2026-10-09T01:30:00'))?.name, 'Madrugada');
    // 02:00 de sexta já acabou, e a madrugada de quinta não é do programa.
    assert.equal(programaNoAr(lista, naRadio('2026-10-09T02:00:00')), null);
    assert.equal(programaNoAr(lista, naRadio('2026-10-08T01:30:00')), null);

    deleteProgram(p.id);
  });
});

describe('próximo programa', () => {
  test('acha o que começa mais cedo depois de agora', () => {
    const manha = createProgram({ name: 'Manhã', days: '4', start_time: '06:00', end_time: '09:00' });
    const tarde = createProgram({ name: 'Tarde', days: '4', start_time: '14:00', end_time: '16:00' });
    const lista = listPrograms();

    // Quinta às 05:00: o próximo é o da manhã.
    assert.equal(proximoNoAr(lista, naRadio('2026-10-08T05:00:00'))?.name, 'Manhã');
    // Quinta às 10:00, com a manhã já encerrada: o próximo é o da tarde.
    assert.equal(proximoNoAr(lista, naRadio('2026-10-08T10:00:00'))?.name, 'Tarde');

    for (const p of [manha, tarde]) deleteProgram(p.id);
  });

  test('vira a semana quando não há mais nada pela frente', () => {
    const segunda = createProgram({ name: 'Segundou', days: '1', start_time: '08:00', end_time: '10:00' });
    // Sábado: o próximo só acontece na segunda.
    assert.equal(proximoNoAr(listPrograms(), naRadio('2026-10-10T20:00:00'))?.name, 'Segundou');
    deleteProgram(segunda.id);
  });

  test('o programa no ar não é o seu próprio próximo', () => {
    const agora = createProgram({ name: 'Agora', days: '4', start_time: '18:00', end_time: '21:00' });
    const depois = createProgram({ name: 'Depois', days: '4', start_time: '21:00', end_time: '23:00' });
    const lista = listPrograms();

    const quando = naRadio('2026-10-08T19:00:00');
    assert.equal(programaNoAr(lista, quando)?.name, 'Agora');
    assert.equal(proximoNoAr(lista, quando)?.name, 'Depois');

    for (const p of [agora, depois]) deleteProgram(p.id);
  });

  test('diz se é hoje, amanhã ou outro dia da semana', () => {
    const hoje = createProgram({ name: 'Hoje', days: '4', start_time: '21:00', end_time: '22:00' });
    const amanha = createProgram({ name: 'Amanhã', days: '5', start_time: '06:00', end_time: '09:00' });
    const domingo = createProgram({ name: 'Domingo', days: '0', start_time: '10:00', end_time: '12:00' });

    // Quinta às 19:00.
    const quinta19 = naRadio('2026-10-08T19:00:00');
    assert.equal(proximoNoAr(listPrograms(), quinta19).next_label, 'hoje às 21:00');

    deleteProgram(hoje.id);
    assert.equal(proximoNoAr(listPrograms(), quinta19).next_label, 'amanhã às 06:00');

    deleteProgram(amanha.id);
    assert.equal(proximoNoAr(listPrograms(), quinta19).next_label, 'Dom às 10:00');

    deleteProgram(domingo.id);
  });

  test('sem programas cadastrados devolve nulo', () => {
    assert.equal(proximoNoAr([], naRadio('2026-10-08T19:00:00')), null);
  });
});
