/*
 * O que a home e a página da matéria fazem igual: preencher cabeçalho,
 * rodapé e barra do player com as configurações da rádio, e montar os botões
 * de compartilhamento.
 *
 * Vive em arquivo próprio para não haver duas cópias que se desencontram
 * quando uma rede social nova for adicionada no painel.
 */
(function () {
  'use strict';

  const escapeHtml = (valor) =>
    String(valor ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);

  const ico = (nome, tamanho = 15) => window.LavrasIcones?.icone(nome, tamanho) ?? '';

  /**
   * @param {object} settings  configurações vindas de /api/site
   * @param {object} [opcoes]
   * @param {boolean} [opcoes.titulo]  false na matéria, cujo título já veio
   *                                   pronto do servidor e vale mais para
   *                                   buscador e compartilhamento.
   */
  function aplicarConfiguracoes(settings, opcoes = {}) {
    if (opcoes.titulo !== false) {
      document.title = `${settings.station_name} — Rádio ao vivo`;
    }
    document.querySelectorAll('[data-station-name]').forEach((el) => {
      el.textContent = settings.station_name;
    });
    document.querySelectorAll('[data-tagline]').forEach((el) => {
      el.textContent = settings.tagline;
    });
    document.querySelectorAll('[data-tagline-curta]').forEach((el) => {
      el.textContent = settings.tagline;
    });
    const rodape = document.querySelector('[data-footer-text]');
    if (rodape) rodape.textContent = settings.footer_text;

    const social = document.querySelector('[data-social-links]');
    if (social) {
      const links = [
        ['Instagram', settings.instagram],
        ['Facebook', settings.facebook],
        ['YouTube', settings.youtube_channel],
        ['WhatsApp', settings.whatsapp && `https://wa.me/${String(settings.whatsapp).replace(/\D/g, '')}`],
        ['E-mail', settings.contact_email && `mailto:${settings.contact_email}`]
      ].filter(([, href]) => href);

      social.innerHTML = links
        .map(
          ([rotulo, href]) =>
            `<a class="font-label-sm text-label-sm uppercase text-branco/90 hover:text-branco border-b-2 border-transparent hover:border-laranja-400 transition-colors pb-0.5"
                href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${rotulo}</a>`
        )
        .join('');
    }

    window.LavrasPlayer?.setStreamUrl(settings.stream_url);
  }

  /** Botões de compartilhar de um endereço. */
  function botoesCompartilhar(url, titulo) {
    const e = encodeURIComponent;
    return [
      `<a class="rede rede-whatsapp" title="Compartilhar no WhatsApp" target="_blank" rel="noopener noreferrer"
          href="https://api.whatsapp.com/send?text=${e(`${titulo} ${url}`)}">${ico('whatsapp', 16)}</a>`,
      `<a class="rede rede-facebook" title="Compartilhar no Facebook" target="_blank" rel="noopener noreferrer"
          href="https://www.facebook.com/sharer/sharer.php?u=${e(url)}">${ico('facebook', 16)}</a>`,
      `<a class="rede rede-x" title="Compartilhar no X" target="_blank" rel="noopener noreferrer"
          href="https://twitter.com/intent/tweet?url=${e(url)}&text=${e(titulo)}">${ico('x', 16)}</a>`,
      `<button class="rede rede-link" title="Copiar o link" data-copiar="${escapeHtml(url)}">${ico('link', 16)}</button>`
    ].join('');
  }

  /** Liga os botões de copiar link dentro de uma região da página. */
  function ligarCopiar(raiz) {
    raiz.querySelectorAll('[data-copiar]').forEach((botao) => {
      botao.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(botao.dataset.copiar);
          botao.classList.add('rede-copiado');
          botao.innerHTML = ico('confere', 16);
          setTimeout(() => {
            botao.classList.remove('rede-copiado');
            botao.innerHTML = ico('link', 16);
          }, 1800);
        } catch {
          // Sem permissão para a área de transferência: o endereço continua
          // visível na barra do navegador, então não há o que consertar aqui.
        }
      });
    });
  }

  window.LavrasSite = { escapeHtml, ico, aplicarConfiguracoes, botoesCompartilhar, ligarCopiar };
})();
