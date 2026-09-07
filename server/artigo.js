/**
 * Leitura dos dados de uma notícia a partir do link.
 *
 * Portais de notícia publicam título, resumo e foto em metatags Open Graph —
 * as mesmas que o WhatsApp usa para montar a prévia de um link. Aproveitamos
 * isso para preencher o formulário sozinho, em vez de obrigar o responsável a
 * copiar cada campo à mão.
 */

import { buscarComDestinoSeguro, RedeBloqueadaError } from './rede.js';

const TAMANHO_MAX = 512 * 1024; // basta o <head>; não baixamos a página inteira

export class ArtigoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ArtigoError';
    this.status = 400;
  }
}

/** Remove o fragmento que o navegador acrescenta ao copiar um trecho destacado. */
export function limparUrl(entrada) {
  const texto = String(entrada || '').trim();
  if (!texto) throw new ArtigoError('Informe o link da notícia.');

  let url;
  try {
    url = new URL(texto);
  } catch {
    throw new ArtigoError('Link inválido. Ele precisa começar com http:// ou https://');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ArtigoError('O link precisa começar com http:// ou https://');
  }

  url.hash = '';
  // Parâmetros de rastreamento não identificam a matéria e só poluem o link.
  for (const chave of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|igshid)/i.test(chave)) url.searchParams.delete(chave);
  }
  return url.toString();
}

function acharMeta(html, propriedades) {
  for (const prop of propriedades) {
    // A ordem dos atributos varia entre portais, então tentamos os dois sentidos.
    const padroes = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i')
    ];
    for (const padrao of padroes) {
      const achado = html.match(padrao);
      if (achado?.[1]) return decodificar(achado[1].trim());
    }
  }
  return '';
}

/**
 * Nomes de entidades HTML que aparecem em títulos de portais brasileiros.
 * Sem isto, "instala&ccedil;ões" chegaria assim mesmo ao painel.
 */
const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', auml: 'ä',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
  oacute: 'ó', ograve: 'ò', ocirc: 'ô', otilde: 'õ', ouml: 'ö',
  uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
  ccedil: 'ç', ntilde: 'ñ',
  Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Euml: 'Ë',
  Iacute: 'Í', Igrave: 'Ì', Icirc: 'Î', Iuml: 'Ï',
  Oacute: 'Ó', Ograve: 'Ò', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö',
  Uacute: 'Ú', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü',
  Ccedil: 'Ç', Ntilde: 'Ñ',
  ordf: 'ª', ordm: 'º', deg: '°', hellip: '…', ndash: '–', mdash: '—',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  laquo: '«', raquo: '»', middot: '·', bull: '•', euro: '€', pound: '£'
};

/** Converte as entidades HTML em texto legível. */
function decodificar(texto) {
  return String(texto)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (inteiro, nome) =>
      Object.hasOwn(ENTIDADES, nome) ? ENTIDADES[nome] : inteiro
    );
}

/** Baixa só o começo da página: o que interessa está no <head>. */
async function baixarInicio(url, sinal) {
  // Validação de rede a cada salto: o link da notícia não pode servir para
  // alcançar a rede interna da hospedagem.
  const { resposta } = await buscarComDestinoSeguro(url, {
    signal: sinal,
    headers: {
      // Alguns portais devolvem página vazia para clientes sem User-Agent.
      'User-Agent': 'Mozilla/5.0 (compatible; LavrasFM/1.0; +https://lavrasfm.com.br)',
      Accept: 'text/html,application/xhtml+xml'
    }
  });

  if (!resposta.ok) {
    throw new ArtigoError(`O site da notícia respondeu ${resposta.status}.`);
  }

  const tipo = (resposta.headers.get('content-type') || '').toLowerCase();
  if (!tipo.includes('html')) {
    throw new ArtigoError('Esse link não é uma página de notícia.');
  }

  let html = '';
  for await (const pedaco of resposta.body) {
    html += Buffer.from(pedaco).toString('utf8');
    if (html.length >= TAMANHO_MAX || /<\/head>/i.test(html)) break;
  }
  await resposta.body.cancel?.().catch(() => {});
  return html;
}

/**
 * Devolve título, resumo, imagem e fonte de uma notícia. Campos que o portal
 * não publicar voltam vazios — o responsável preenche o que faltar.
 */
export async function lerArtigo(entrada) {
  const url = limparUrl(entrada);

  const controlador = new AbortController();
  const prazo = setTimeout(() => controlador.abort(), 10_000);

  let html;
  try {
    html = await baixarInicio(url, controlador.signal);
  } catch (erro) {
    if (erro instanceof ArtigoError) throw erro;
    if (erro instanceof RedeBloqueadaError || erro?.name === 'RedeBloqueadaError') {
      throw new ArtigoError(erro.message);
    }
    throw new ArtigoError(
      erro?.name === 'AbortError'
        ? 'O site da notícia demorou demais para responder.'
        : 'Não consegui abrir esse link.'
    );
  } finally {
    clearTimeout(prazo);
  }

  const titulo =
    acharMeta(html, ['og:title', 'twitter:title']) ||
    decodificar((html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim());

  const imagemBruta = acharMeta(html, ['og:image', 'og:image:url', 'twitter:image']);
  let imagem = '';
  if (imagemBruta) {
    try {
      const absoluta = new URL(imagemBruta, url);
      if (absoluta.protocol === 'http:' || absoluta.protocol === 'https:') {
        imagem = absoluta.toString();
      }
    } catch {
      /* imagem inválida: segue sem ela */
    }
  }

  return {
    url,
    title: titulo.slice(0, 300),
    excerpt: acharMeta(html, ['og:description', 'twitter:description', 'description']).slice(0, 600),
    image_url: imagem,
    source: acharMeta(html, ['og:site_name']).slice(0, 120) || new URL(url).hostname.replace(/^www\./, ''),
    published_at: acharMeta(html, ['article:published_time', 'article:modified_time'])
  };
}
