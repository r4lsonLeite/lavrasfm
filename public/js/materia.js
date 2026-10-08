/* A página da matéria. O texto já vem pronto do servidor; aqui só entram as
   partes que dependem das configurações da rádio e da interação. */
(function () {
  'use strict';

  const { aplicarConfiguracoes, botoesCompartilhar, ligarCopiar } = window.LavrasSite;

  function montarCompartilhamento() {
    const titulo = document.querySelector('h1')?.textContent?.trim() || document.title;
    const url = document.querySelector('link[rel=canonical]')?.href || window.location.href;
    document.querySelectorAll('[data-compartilhar]').forEach((caixa) => {
      caixa.innerHTML = botoesCompartilhar(url, titulo);
      ligarCopiar(caixa);
    });
  }

  /** O que a barra do player mostra: o programa no ar, se houver. */
  function mostrarNoAr(noAr, settings) {
    const texto = noAr?.name || settings.now_playing || settings.tagline || '';
    document.querySelectorAll('[data-now-playing]').forEach((el) => {
      el.textContent = texto;
    });
  }

  async function carregar() {
    montarCompartilhamento();
    try {
      const resposta = await fetch('/api/site');
      if (!resposta.ok) return;
      const dados = await resposta.json();
      // titulo: false — o título desta página é o da matéria, não o da rádio.
      aplicarConfiguracoes(dados.settings, { titulo: false });
      mostrarNoAr(dados.onAir, dados.settings);
    } catch {
      /* silencioso: a matéria já está na tela, só o player fica sem dados */
    }
  }

  document.addEventListener('DOMContentLoaded', carregar);
})();
