/**
 * Entrega das páginas HTML, com versão nos endereços de CSS e JavaScript.
 *
 * O HTML é sempre revalidado, mas CSS e JS ficam em cache por uma hora para o
 * site carregar rápido. Isso criou um problema real: depois de um deploy, o
 * visitante recebia o HTML novo junto com o CSS antigo, e a página aparecia
 * quebrada até o cache expirar.
 *
 * A solução é anexar uma versão ao endereço de cada arquivo. Quando o conteúdo
 * muda, o endereço muda, e o navegador busca a versão nova na hora — sem abrir
 * mão do cache longo.
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ARQUIVOS_VERSIONADOS = /(href|src)="(\/(?:css|js)\/[^"?]+\.(?:css|js))"/g;

export function criarEntregaDePaginas(PUBLIC_DIR) {
  const cacheVersoes = new Map();
  const cacheHtml = new Map();

  /** Versão curta derivada do conteúdo do arquivo. */
  function versao(caminhoPublico) {
    if (cacheVersoes.has(caminhoPublico)) return cacheVersoes.get(caminhoPublico);

    const arquivo = join(PUBLIC_DIR, caminhoPublico);
    let marca = 'x';
    if (existsSync(arquivo)) {
      const info = statSync(arquivo);
      marca = createHash('sha1')
        .update(`${info.size}:${info.mtimeMs}`)
        .digest('hex')
        .slice(0, 8);
    }
    cacheVersoes.set(caminhoPublico, marca);
    return marca;
  }

  /** Lê a página e carimba a versão em cada CSS e JS que ela usa. */
  function html(nome) {
    if (cacheHtml.has(nome)) return cacheHtml.get(nome);

    const conteudo = readFileSync(join(PUBLIC_DIR, nome), 'utf8').replace(
      ARQUIVOS_VERSIONADOS,
      (_, atributo, caminho) => `${atributo}="${caminho}?v=${versao(caminho)}"`
    );
    cacheHtml.set(nome, conteudo);
    return conteudo;
  }

  function enviar(res, nome, status = 200) {
    res.status(status);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(html(nome));
  }

  return { html, enviar, versao };
}
