import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { paraHtml, semFormatacao, resumir, comoSlug } = await import('../server/texto.js');

describe('texto da matéria', () => {
  test('parágrafos saem separados por linha em branco', () => {
    assert.equal(paraHtml('Um.\n\nDois.'), '<p>Um.</p>\n<p>Dois.</p>');
  });

  test('quebra simples vira <br>, não parágrafo novo', () => {
    assert.equal(paraHtml('Rua A, 100\nCentro'), '<p>Rua A, 100<br>Centro</p>');
  });

  test('subtítulo, lista, negrito e itálico', () => {
    assert.equal(paraHtml('## Serviço'), '<h2>Serviço</h2>');
    assert.equal(paraHtml('- um\n- dois'), '<ul><li>um</li><li>dois</li></ul>');
    assert.equal(paraHtml('a **b** c'), '<p>a <strong>b</strong> c</p>');
    assert.equal(paraHtml('a *b* c'), '<p>a <em>b</em> c</p>');
  });

  test('link http vira âncora que não entrega o visitante ao destino', () => {
    const html = paraHtml('[prefeitura](https://exemplo.gov.br/a)');
    assert.match(html, /<a href="https:\/\/exemplo\.gov\.br\/a"/);
    assert.match(html, /rel="noopener noreferrer nofollow"/);
  });

  test('link com esquema perigoso perde o link e vira texto', () => {
    for (const perigo of ['javascript:alert(1)', 'data:text/html;base64,x', 'vbscript:x']) {
      const html = paraHtml(`[clique](${perigo})`);
      assert.doesNotMatch(html, /<a /, `deixou virar link: ${perigo}`);
      assert.match(html, /clique/);
    }
  });

  test('HTML digitado no texto aparece como texto, não como elemento', () => {
    const html = paraHtml('<script>alert(1)</script>');
    assert.doesNotMatch(html, /<script/);
    assert.match(html, /&lt;script&gt;/);
  });

  test('o rótulo do link não escapa do atributo', () => {
    // O título carrega aspas e um ">" — se escapassem mal, fechariam a tag.
    const html = paraHtml('[a" onerror="x](https://ex.com)');
    assert.doesNotMatch(html, /onerror="x"/);
    assert.match(html, /&quot;/);
  });

  test('resumo tira a marcação e corta em fronteira de palavra', () => {
    assert.equal(semFormatacao('## Oi\n\n- **um**\n- [dois](https://a.b)'), 'Oi um dois');
    const curto = resumir('a'.repeat(50), 200);
    assert.equal(curto, 'a'.repeat(50));
    const cortado = resumir('palavra '.repeat(60), 50);
    assert.ok(cortado.length <= 51, cortado);
    assert.ok(cortado.endsWith('…'));
  });
});

describe('endereço da matéria', () => {
  test('tira acento, pontuação e caixa alta', () => {
    assert.equal(comoSlug('Festa da Padroeira começa!'), 'festa-da-padroeira-comeca');
    assert.equal(comoSlug('  Açude   cheio  '), 'acude-cheio');
    assert.equal(comoSlug('Chuva — 40cm'), 'chuva-40cm');
  });

  test('título sem letra nenhuma ainda produz um endereço', () => {
    assert.equal(comoSlug('!!!'), 'materia');
    assert.equal(comoSlug(''), 'materia');
  });

  test('não termina em hífen mesmo quando o corte cai no meio', () => {
    const slug = comoSlug('a'.repeat(78) + ' bbbb');
    assert.doesNotMatch(slug, /-$/);
  });
});
