/**
 * O texto da matéria, do que o jornalista digita para o que a página mostra.
 *
 * A formatação é deliberadamente pequena: parágrafo, subtítulo, lista,
 * negrito, itálico e link. Nada de HTML digitado à mão.
 *
 * A ordem das operações é o que torna isso seguro: **primeiro escapamos tudo**,
 * só depois aplicamos as marcações. Como escapar converte `<` em `&lt;`, um
 * texto que chegue com uma tag dentro vira texto visível, não elemento. Os
 * sinais da marcação (`*`, `[`, `#`) atravessam o escape intactos, então as
 * transformações seguintes continuam funcionando.
 */

const escapar = (valor) =>
  String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);

export { escapar };

/**
 * Só http e https viram link. `javascript:` chega aqui intacto (não tem
 * caractere que o escape altere), e é justamente por isso que a checagem
 * precisa existir.
 */
function linkSeguro(destino) {
  try {
    const url = new URL(destino);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return destino;
  } catch {
    return null;
  }
}

/** Negrito, itálico e link, dentro de uma linha já escapada. */
function inline(texto) {
  return texto
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (tudo, rotulo, destino) => {
      const seguro = linkSeguro(destino);
      if (!seguro) return rotulo;
      return `<a href="${seguro}" target="_blank" rel="noopener noreferrer nofollow">${rotulo}</a>`;
    })
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}

/**
 * Converte o texto digitado em HTML. Blocos são separados por linha em
 * branco, como se escreve naturalmente.
 */
export function paraHtml(texto) {
  const blocos = escapar(texto)
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((bloco) => bloco.trim())
    .filter(Boolean);

  return blocos
    .map((bloco) => {
      const linhas = bloco.split('\n');

      // Lista: todas as linhas do bloco começam com "- ".
      if (linhas.every((linha) => /^-\s+/.test(linha))) {
        const itens = linhas.map((l) => `<li>${inline(l.replace(/^-\s+/, ''))}</li>`).join('');
        return `<ul>${itens}</ul>`;
      }

      if (/^##\s+/.test(bloco)) {
        return `<h2>${inline(bloco.replace(/^##\s+/, '').replace(/\n/g, ' '))}</h2>`;
      }

      // Quebra de linha simples dentro do parágrafo vira <br>.
      return `<p>${linhas.map(inline).join('<br>')}</p>`;
    })
    .join('\n');
}

/** Texto corrido, sem marcação — serve de resumo e de descrição para busca. */
export function semFormatacao(texto) {
  return String(texto ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/^##\s+/gm, '')
    .replace(/^-\s+/gm, '')
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Primeiras palavras do texto, cortadas numa fronteira de palavra. */
export function resumir(texto, limite = 200) {
  const limpo = semFormatacao(texto);
  if (limpo.length <= limite) return limpo;
  const corte = limpo.slice(0, limite);
  const espaco = corte.lastIndexOf(' ');
  return `${(espaco > limite * 0.6 ? corte.slice(0, espaco) : corte).trimEnd()}…`;
}

/** Endereço da matéria a partir do título: "Festa da Padroeira" → "festa-da-padroeira". */
export function comoSlug(titulo) {
  const base = String(titulo ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return base || 'materia';
}
