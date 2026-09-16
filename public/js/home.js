/* Monta a home a partir do conteúdo cadastrado no painel administrativo. */
(function () {
  'use strict';

  const manchete = document.querySelector('[data-manchete]');
  const ultimas = document.querySelector('[data-ultimas]');
  const grade = document.querySelector('[data-grade-noticias]');
  const videoSlot = document.querySelector('[data-video-slot]');

  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);

  /** "Há 2 horas", "Ontem", "12/03/2026" — o que fizer mais sentido. */
  function tempoRelativo(valor) {
    const data = new Date(String(valor).replace(' ', 'T') + (String(valor).includes('Z') ? '' : 'Z'));
    if (Number.isNaN(data.getTime())) return '';
    const minutos = Math.floor((Date.now() - data.getTime()) / 60000);
    if (minutos < 1) return 'Agora mesmo';
    if (minutos < 60) return `Há ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `Há ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
    const dias = Math.floor(horas / 24);
    if (dias === 1) return 'Ontem';
    if (dias < 7) return `Há ${dias} dias`;
    return data.toLocaleDateString('pt-BR');
  }

  function dataPorExtenso(valor) {
    const data = new Date(String(valor).replace(' ', 'T') + (String(valor).includes('Z') ? '' : 'Z'));
    if (Number.isNaN(data.getTime())) return '';
    return data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  const tarja = (categoria) =>
    `<span class="bg-gradiente-laranja text-branco font-label-sm text-label-sm uppercase px-3 py-1.5 rounded-full">${escapeHtml(categoria)}</span>`;

  const ico = (nome, tamanho = 15) => window.LavrasIcones?.icone(nome, tamanho) ?? '';

  const relogio = (item) => `
    <span class="inline-flex items-center gap-1.5 text-tinta-suave">
      ${ico('relogio')}${escapeHtml(tempoRelativo(item.published_at))}
    </span>`;

  const fonte = (item) =>
    item.source
      ? `<span class="inline-flex items-center gap-1.5 text-tinta-suave">
           ${ico('globo')}${escapeHtml(item.source)}
         </span>`
      : '';

  /* --------------------------------- manchete -------------------------------- */

  function mancheteHtml(item) {
    const foto = item.image_url
      ? `<div class="relative aspect-[16/9] overflow-hidden rounded-xl bg-azul-100">
           <img src="${escapeHtml(item.image_url)}" alt="" loading="eager"
                class="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500">
           <div class="absolute top-4 left-4">${tarja(item.category)}</div>
         </div>`
      : `<div class="mb-1">${tarja(item.category)}</div>`;

    return `
      <article class="bg-branco rounded-2xl shadow-carta overflow-hidden">
        <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="group block p-4 md:p-5">
          ${foto}
          <h1 class="font-display text-display-lg-mobile md:text-display-lg text-tinta mt-5 group-hover:text-azul-700 transition-colors">
            ${escapeHtml(item.title)}
          </h1>
          ${item.excerpt ? `<p class="font-body-lg text-body-lg text-tinta-suave mt-3">${escapeHtml(item.excerpt)}</p>` : ''}
        </a>

        <div class="px-4 md:px-5 pb-5 flex flex-wrap items-center justify-between gap-4 border-t border-borda pt-4 mt-1">
          <div class="flex flex-wrap items-center gap-4 font-body-md text-[14px]">
            <span class="inline-flex items-center gap-1.5 text-tinta-suave">
              ${ico('calendario')}${escapeHtml(dataPorExtenso(item.published_at))}
            </span>
            ${relogio(item)}
          </div>
          ${compartilharHtml(item)}
        </div>
      </article>`;
  }

  /** Botões de compartilhar: WhatsApp, Facebook, X e copiar o link. */
  function compartilharHtml(item) {
    const url = encodeURIComponent(item.url);
    const titulo = encodeURIComponent(item.title);
    const redes = [
      ['WhatsApp', `https://wa.me/?text=${titulo}%20${url}`, 'whatsapp'],
      ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${url}`, 'facebook'],
      ['X', `https://twitter.com/intent/tweet?url=${url}&text=${titulo}`, 'x']
    ];

    return `
      <div class="flex items-center gap-2">
        <span class="font-body-md text-[13px] text-tinta-suave inline-flex items-center gap-1.5 mr-1">
          ${ico('compartilhar')}Compartilhar
        </span>
        ${redes
          .map(
            ([nome, href, marca]) => `
          <a href="${href}" target="_blank" rel="noopener noreferrer" title="Compartilhar no ${nome}"
             class="rede rede-${marca}">${ico(marca, 16)}</a>`
          )
          .join('')}
        <button type="button" data-copiar="${escapeHtml(item.url)}" title="Copiar o link"
                class="rede rede-link">${ico('link', 16)}</button>
      </div>`;
  }

  /* ------------------------------ últimas notícias ---------------------------- */

  function ultimasHtml(itens) {
    const linhas = itens
      .map(
        (item) => `
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"
         class="group flex gap-4 items-start py-4 border-b border-borda last:border-0">
        <div class="min-w-0 flex-grow">
          <span class="font-label-sm text-label-sm text-laranja-600 uppercase block mb-1">${escapeHtml(item.category)}</span>
          <h3 class="font-display text-[16px] leading-[22px] font-bold text-tinta group-hover:text-azul-700 transition-colors">
            ${escapeHtml(item.title)}
          </h3>
          <p class="flex flex-wrap items-center gap-3 font-body-md text-[12px] mt-2">
            ${relogio(item)}${fonte(item)}
          </p>
        </div>
        ${
          item.image_url
            ? `<div class="w-[84px] h-[64px] shrink-0 rounded-lg overflow-hidden bg-azul-100">
                 <img src="${escapeHtml(item.image_url)}" alt="" loading="lazy" class="w-full h-full object-cover">
               </div>`
            : ''
        }
      </a>`
      )
      .join('');

    return `
      <div class="bg-branco rounded-2xl shadow-carta p-5 h-full">
        <div class="flex items-center justify-between gap-3 pb-3">
          <h2 class="font-display text-[17px] font-extrabold text-tinta uppercase tracking-tight">Últimas notícias</h2>
          <a href="#todas" class="font-label-sm text-label-sm text-laranja-600 uppercase inline-flex items-center gap-1 hover:gap-2 transition-all">
            Ver todas ${ico('seta', 16)}
          </a>
        </div>
        <div class="h-1 bg-gradiente-laranja rounded-full w-20 mb-1"></div>
        ${linhas || '<p class="font-body-md text-[14px] text-tinta-suave py-6">Nada por aqui ainda.</p>'}
      </div>`;
  }

  /* -------------------------------- grade final ------------------------------- */

  function cardHtml(item) {
    const foto = item.image_url
      ? `<div class="aspect-[16/9] overflow-hidden rounded-lg bg-azul-100 mb-3">
           <img src="${escapeHtml(item.image_url)}" alt="" loading="lazy"
                class="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500">
         </div>`
      : '<div class="h-1.5 w-14 bg-gradiente-laranja rounded-full mb-3"></div>';

    return `
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"
         class="group bg-branco rounded-xl shadow-carta p-4 flex flex-col">
        ${foto}
        <span class="font-label-sm text-label-sm text-laranja-600 uppercase mb-1">${escapeHtml(item.category)}</span>
        <h3 class="font-display text-[16px] leading-[22px] font-bold text-tinta group-hover:text-azul-700 transition-colors line-clamp-3">
          ${escapeHtml(item.title)}
        </h3>
        <p class="flex flex-wrap items-center gap-3 font-body-md text-[12px] mt-3 pt-3 border-t border-borda">
          ${relogio(item)}${fonte(item)}
        </p>
      </a>`;
  }

  function gradeHtml(itens) {
    if (!itens.length) return '';
    return `
      <div id="todas">
        <div class="flex items-center gap-4 mb-5">
          <h2 class="font-display text-[22px] font-extrabold text-tinta uppercase tracking-tight">Mais notícias</h2>
          <span class="h-1 flex-grow bg-gradiente-laranja rounded-full max-w-[120px]"></span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          ${itens.map(cardHtml).join('')}
        </div>
      </div>`;
  }

  /* ---------------------------------- vídeos ---------------------------------- */

  function videoDestaqueHtml(video) {
    const selo = video.is_live
      ? `<div class="absolute top-4 left-4 bg-ao-vivo text-branco font-label-sm text-label-sm uppercase px-3 py-1.5 rounded-full flex items-center gap-2 z-10">
           <span class="w-2 h-2 rounded-full bg-branco block animate-pulse"></span> Ao vivo
         </div>`
      : '';

    const player = video.autoplay
      ? `<iframe class="w-full h-full absolute inset-0" src="${escapeHtml(video.embed_url)}"
                 title="${escapeHtml(video.title)}" frameborder="0"
                 allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
      : `<button type="button" data-video-embed="${escapeHtml(video.embed_url)}" data-video-title="${escapeHtml(video.title)}"
                 class="absolute inset-0 w-full h-full group" aria-label="Assistir: ${escapeHtml(video.title)}">
           <img class="w-full h-full object-cover" src="${escapeHtml(video.thumbnail)}" alt="" loading="lazy"
                data-fallback="https://i.ytimg.com/vi/${escapeHtml(video.youtube_id)}/hqdefault.jpg">
           <span class="absolute inset-0 flex items-center justify-center">
             <span class="w-16 h-16 bg-gradiente-laranja rounded-full flex items-center justify-center shadow-carta group-hover:scale-110 transition-transform">
               ${ico('tocar', 32)}
             </span>
           </span>
         </button>`;

    return `
      <div class="bg-branco rounded-2xl shadow-carta overflow-hidden">
        <div class="relative w-full aspect-video bg-azul-100" data-video-stage>${selo}${player}</div>
        <div class="p-5">
          <span class="font-label-sm text-label-sm text-laranja-600 uppercase block mb-1">
            ${video.is_live ? 'Transmissão ao vivo' : 'Vídeo em destaque'}
          </span>
          <h3 class="font-display text-[19px] font-bold text-tinta">${escapeHtml(video.title)}</h3>
          ${video.description ? `<p class="font-body-md text-[14px] text-tinta-suave mt-2">${escapeHtml(video.description)}</p>` : ''}
        </div>
      </div>`;
  }

  function videoItemHtml(video) {
    return `
      <a href="${escapeHtml(video.watch_url)}" target="_blank" rel="noopener noreferrer"
         class="group flex gap-4 items-center bg-branco rounded-xl shadow-carta p-3">
        <div class="w-28 shrink-0 aspect-video bg-azul-100 overflow-hidden rounded-lg relative">
          <img src="https://i.ytimg.com/vi/${escapeHtml(video.youtube_id)}/mqdefault.jpg" alt="" loading="lazy"
               class="w-full h-full object-cover">
          ${video.is_live ? '<span class="absolute bottom-1 left-1 bg-ao-vivo text-branco font-label-sm text-[10px] px-1.5 py-0.5 rounded-full uppercase">Ao vivo</span>' : ''}
        </div>
        <div class="min-w-0">
          <h4 class="font-display text-[15px] leading-[20px] font-bold text-tinta group-hover:text-azul-700 transition-colors line-clamp-2">
            ${escapeHtml(video.title)}
          </h4>
          ${video.description ? `<p class="font-body-md text-[12px] text-tinta-suave line-clamp-2 mt-1">${escapeHtml(video.description)}</p>` : ''}
        </div>
      </a>`;
  }

  const vazio = (mensagem) => `
    <div class="bg-branco border border-dashed border-borda-forte rounded-2xl p-10 text-center">
      <p class="font-body-md text-body-md text-tinta-suave">${escapeHtml(mensagem)}</p>
    </div>`;

  /* -------------------------------- configurações ----------------------------- */

  function aplicarConfiguracoes(settings) {
    document.title = `${settings.station_name} — Rádio ao vivo`;
    document.querySelectorAll('[data-station-name]').forEach((el) => {
      el.textContent = settings.station_name;
    });
    document.querySelectorAll('[data-now-playing]').forEach((el) => {
      el.textContent = settings.now_playing || settings.tagline;
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

  /* --------------------------------- interações ------------------------------- */

  function ligarVideos(raiz) {
    raiz.querySelectorAll('[data-video-embed]').forEach((botao) => {
      botao.addEventListener('click', () => {
        const palco = botao.closest('[data-video-stage]');
        if (!palco) return;
        const src = new URL(botao.dataset.videoEmbed);
        src.searchParams.set('autoplay', '1');
        palco.innerHTML = `<iframe class="w-full h-full absolute inset-0" src="${escapeHtml(src.toString())}"
          title="${escapeHtml(botao.dataset.videoTitle || '')}" frameborder="0"
          allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        window.LavrasPlayer?.pause();
      });
    });
  }

  /** Nem todo vídeo tem capa em resolução máxima; caímos para a menor. */
  function ligarCapas(raiz) {
    raiz.querySelectorAll('img[data-fallback]').forEach((img) => {
      img.addEventListener(
        'error',
        () => {
          const alternativa = img.dataset.fallback;
          if (alternativa && img.src !== alternativa) img.src = alternativa;
        },
        { once: true }
      );
    });
  }

  function ligarCopiar(raiz) {
    raiz.querySelectorAll('[data-copiar]').forEach((botao) => {
      botao.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(botao.dataset.copiar);
          botao.classList.add('rede-copiado');
          botao.title = 'Link copiado';
          setTimeout(() => {
            botao.classList.remove('rede-copiado');
            botao.title = 'Copiar o link';
          }, 1800);
        } catch {
          // Sem permissão para a área de transferência: o link continua visível
          // na própria notícia, então não há o que consertar aqui.
        }
      });
    });
  }

  /* ----------------------------------- carga ---------------------------------- */

  async function carregar() {
    let dados;
    try {
      const resposta = await fetch('/api/site');
      if (!resposta.ok) throw new Error('Falha ao carregar o conteúdo.');
      dados = await resposta.json();
    } catch {
      manchete.innerHTML = vazio('Não foi possível carregar o conteúdo. Tente atualizar a página.');
      return;
    }

    aplicarConfiguracoes(dados.settings);

    const noticias = dados.banner ? [dados.banner, ...dados.news] : [...dados.news];

    if (!noticias.length) {
      manchete.innerHTML = vazio('Nenhuma notícia publicada ainda. Adicione a primeira pelo painel administrativo.');
      ultimas.innerHTML = '';
      grade.innerHTML = '';
    } else {
      const [principal, ...resto] = noticias;
      manchete.innerHTML = mancheteHtml(principal);
      ultimas.innerHTML = ultimasHtml(resto.slice(0, 4));
      grade.innerHTML = gradeHtml(resto.slice(4));
      ligarCopiar(manchete);
    }

    const outros = dados.videos.filter((v) => v.id !== dados.featuredVideo?.id).slice(0, 4);
    videoSlot.innerHTML = dados.featuredVideo
      ? `<div class="grid lg:grid-cols-2 gap-5">
           ${videoDestaqueHtml(dados.featuredVideo)}
           <div class="flex flex-col gap-3">
             ${outros.length ? outros.map(videoItemHtml).join('') : vazio('Cadastre outros vídeos no painel para vê-los aqui.')}
           </div>
         </div>`
      : vazio('Nenhum vídeo ou live cadastrado ainda.');

    ligarVideos(videoSlot);
    ligarCapas(videoSlot);
  }

  document.addEventListener('DOMContentLoaded', carregar);

  // Mantém "no ar agora" atualizado sem recarregar a página.
  setInterval(async () => {
    try {
      const resposta = await fetch('/api/now-playing');
      if (!resposta.ok) return;
      const info = await resposta.json();
      document.querySelectorAll('[data-now-playing]').forEach((el) => {
        if (info.now_playing) el.textContent = info.now_playing;
      });
      window.LavrasPlayer?.setStreamUrl(info.stream_url);
    } catch {
      /* silencioso: é só uma atualização de fundo */
    }
  }, 60000);
})();
