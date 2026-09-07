/**
 * Validação de destino para as buscas que o servidor faz por conta do painel.
 *
 * O painel deixa o administrador informar endereços (transmissão, playlist,
 * link de notícia) que o servidor vai buscar. Sem controle, isso permitiria
 * apontar o servidor para a rede interna da hospedagem — inclusive para o
 * serviço de metadados da nuvem, que em algumas infraestruturas entrega
 * credenciais. É o clássico SSRF.
 *
 * Aqui resolvemos o nome para IP antes de conectar e recusamos tudo que não
 * seja internet pública. A checagem é refeita a cada redirecionamento, porque
 * validar só o texto da URL não protege contra um destino que redireciona para
 * um endereço interno depois.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class RedeBloqueadaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RedeBloqueadaError';
    this.status = 400;
  }
}

const MAX_REDIRECIONAMENTOS = 3;

/** Converte "192.168.0.1" no número correspondente, para comparar faixas. */
function ipv4Para32Bits(ip) {
  return ip.split('.').reduce((acumulado, parte) => acumulado * 256 + Number(parte), 0);
}

const FAIXAS_IPV4_BLOQUEADAS = [
  ['0.0.0.0', 8, 'rede inválida'],
  ['10.0.0.0', 8, 'rede privada'],
  ['100.64.0.0', 10, 'rede da operadora'],
  ['127.0.0.0', 8, 'o próprio servidor'],
  ['169.254.0.0', 16, 'metadados da nuvem'],
  ['172.16.0.0', 12, 'rede privada'],
  ['192.0.0.0', 24, 'rede reservada'],
  ['192.0.2.0', 24, 'rede de documentação'],
  ['192.168.0.0', 16, 'rede privada'],
  ['198.18.0.0', 15, 'rede de teste'],
  ['198.51.100.0', 24, 'rede de documentação'],
  ['203.0.113.0', 24, 'rede de documentação'],
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'rede reservada']
].map(([base, bits, motivo]) => ({
  base: ipv4Para32Bits(base),
  mascara: bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0,
  motivo
}));

/** Diz por que um IP é proibido, ou null se ele for de internet pública. */
export function motivoBloqueio(ip) {
  const versao = isIP(ip);

  if (versao === 4) {
    const valor = ipv4Para32Bits(ip);
    for (const faixa of FAIXAS_IPV4_BLOQUEADAS) {
      if ((valor & faixa.mascara) >>> 0 === faixa.base) return faixa.motivo;
    }
    return null;
  }

  if (versao === 6) {
    const normalizado = ip.toLowerCase().replace(/^\[|\]$/g, '');

    // ::ffff:1.2.3.4 é um IPv4 disfarçado; vale a mesma regra.
    const mapeado = normalizado.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeado) return motivoBloqueio(mapeado[1]);

    if (normalizado === '::1') return 'o próprio servidor';
    if (normalizado === '::') return 'rede inválida';
    if (/^f[cd]/.test(normalizado)) return 'rede privada';
    if (/^fe[89ab]/.test(normalizado)) return 'rede local';
    if (/^ff/.test(normalizado)) return 'multicast';
    return null;
  }

  return 'endereço não reconhecido';
}

/**
 * Escape usado apenas pelos testes, que sobem servidores em 127.0.0.1. Fora
 * disso não deve ser ligado: é justamente a proteção contra SSRF que ele
 * desativa. O servidor avisa no console se encontrar isso ligado em produção.
 */
export const destinoInternoPermitido = () => process.env.PERMITIR_DESTINO_INTERNO === '1';

/** Resolve o nome e recusa quando o IP não for de internet pública. */
export async function exigirDestinoPublico(url) {
  const alvo = typeof url === 'string' ? new URL(url) : url;
  if (destinoInternoPermitido()) return alvo.toString();

  const host = alvo.hostname.replace(/^\[|\]$/g, '');

  let enderecos;
  if (isIP(host)) {
    enderecos = [{ address: host }];
  } else {
    try {
      enderecos = await lookup(host, { all: true });
    } catch {
      throw new RedeBloqueadaError(`Não consegui encontrar o endereço "${host}".`);
    }
  }

  // Um nome pode devolver vários IPs; basta um proibido para recusar tudo.
  for (const { address } of enderecos) {
    const motivo = motivoBloqueio(address);
    if (motivo) {
      throw new RedeBloqueadaError(
        `O endereço "${host}" aponta para ${motivo}, e não para um servidor na internet. ` +
          'Informe o endereço público da transmissão ou da notícia.'
      );
    }
  }

  return alvo.toString();
}

/**
 * Faz a requisição seguindo redirecionamentos por conta própria, validando o
 * destino a cada salto. O fetch nativo seguiria os redirects sem consultar a
 * gente, o que anularia a validação inicial.
 */
export async function buscarComDestinoSeguro(url, opcoes = {}) {
  let atual = await exigirDestinoPublico(url);

  for (let salto = 0; salto <= MAX_REDIRECIONAMENTOS; salto++) {
    const resposta = await fetch(atual, { ...opcoes, redirect: 'manual' });

    const ehRedirecionamento = resposta.status >= 300 && resposta.status < 400;
    if (!ehRedirecionamento) return { resposta, url: atual };

    const destino = resposta.headers.get('location');
    resposta.body?.cancel?.().catch(() => {});
    if (!destino) return { resposta, url: atual };

    if (salto === MAX_REDIRECIONAMENTOS) {
      throw new RedeBloqueadaError('O endereço redirecionou vezes demais.');
    }
    atual = await exigirDestinoPublico(new URL(destino, atual));
  }

  throw new RedeBloqueadaError('O endereço redirecionou vezes demais.');
}
