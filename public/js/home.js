/* Monta a home a partir do conteúdo cadastrado no painel administrativo. */
(function () {
  'use strict';

  const grid = document.querySelector('[data-news-grid]');
  const bannerSlot = document.querySelector('[data-banner-slot]');
  const videoSlot = document.querySelector('[data-video-slot]');

  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);

  /** "Há 2 horas", "Ontem", "12/03/2025" — o que fizer mais sentido. */
  function timeAgo(value) {
    const date = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
    if (Number.isNaN(date.getTime())) return '';
    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return 'Agora mesmo';
    if (minutes < 60) return `Há ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Há ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Ontem';
    if (days < 7) return `Há ${days} dias`;
    return date.toLocaleDateString('pt-BR');
  }

  function meta(item) {
    const parts = [timeAgo(item.published_at), item.source].filter(Boolean);
    return parts.join(' · ');
  }

  function bannerHtml(item) {
    const image = item.image_url
      ? `<img class="w-full h-full object-cover grayscale opacity-90 group-hover:grayscale-0 transition-all duration-700" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy">`
      : '<div class="w-full h-full bg-surface-container-high"></div>';

    return `
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"
         class="relative block bg-surface-container-low border border-outline-variant overflow-hidden group rounded-DEFAULT">
        <div class="grid md:grid-cols-2 min-h-[400px]">
          <div class="p-8 md:p-16 flex flex-col justify-center order-2 md:order-1">
            <span class="font-label-sm text-label-sm text-primary mb-4 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-primary block"></span> ${escapeHtml(item.category || 'EM DESTAQUE')}
            </span>
            <h1 class="font-display-lg text-display-lg-mobile md:text-display-lg text-primary mb-6">${escapeHtml(item.title)}</h1>
            ${item.excerpt ? `<p class="font-body-lg text-body-lg text-on-surface-variant mb-8">${escapeHtml(item.excerpt)}</p>` : ''}
            <span class="bg-primary text-on-primary font-label-sm text-label-sm px-8 py-4 w-max border border-primary group-hover:bg-transparent group-hover:text-primary transition-colors rounded">
              Saiba mais
            </span>
            ${meta(item) ? `<span class="mt-6 font-label-sm text-label-sm text-on-surface-variant">${escapeHtml(meta(item))}</span>` : ''}
          </div>
          <div class="order-1 md:order-2 h-64 md:h-auto">${image}</div>
        </div>
      </a>`;
  }

  function newsCardHtml(item) {
    const inverted = item.invert;
    const span = item.highlight === 'destaque' ? 'md:col-span-8' : 'md:col-span-4';
    const minHeight = item.highlight === 'normal' ? 'min-h-[200px]' : 'min-h-[300px]';
    const padding = item.highlight === 'destaque' ? 'p-8' : 'p-6';

    const surface = inverted
      ? 'bg-primary text-on-primary border-primary'
      : 'bg-surface border-outline-variant hover:border-primary';
    const label = inverted ? 'text-on-secondary-container' : 'text-on-surface-variant';
    const title = inverted ? 'text-on-primary' : 'text-primary';
    const titleSize =
      item.highlight === 'destaque'
        ? 'font-display-lg-mobile text-display-lg-mobile'
        : 'font-headline-md text-headline-md';

    const thumb =
      item.image_url && item.highlight !== 'normal'
        ? `<img src="${escapeHtml(item.image_url)}" alt="" loading="lazy"
             class="w-full h-40 object-cover mb-4 rounded-DEFAULT ${inverted ? 'opacity-90' : ''}">`
        : '';

    return `
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"
         class="${span} ${minHeight} ${padding} ${surface} border flex flex-col justify-between group transition-colors rounded-DEFAULT">
        <div>
          ${thumb}
          <span class="font-label-sm text-label-sm ${label} mb-2 block">${escapeHtml(item.category)}</span>
          <h3 class="${titleSize} ${title} mb-3 group-hover:underline">${escapeHtml(item.title)}</h3>
          ${item.excerpt && item.highlight !== 'normal' ? `<p class="font-body-md text-body-md ${label} line-clamp-3">${escapeHtml(item.excerpt)}</p>` : ''}
        </div>
        <div class="mt-6 font-label-sm text-label-sm ${label} flex items-center justify-between gap-4">
          <span>${escapeHtml(meta(item))}</span>
          <span class="material-symbols-outlined ${inverted ? 'text-on-primary' : 'text-on-surface-variant group-hover:text-primary'}">arrow_forward</span>
        </div>
      </a>`;
  }

  function featuredVideoHtml(video) {
    const liveBadge = video.is_live
      ? `<div class="absolute top-4 left-4 bg-primary text-on-primary font-label-sm text-label-sm px-3 py-1 rounded flex items-center gap-2 z-10">
           <span class="w-2 h-2 rounded-full bg-error block animate-pulse"></span> AO VIVO
         </div>`
      : '';

    // O iframe só é criado no clique — evita carregar o YouTube em toda visita.
    const player = video.autoplay
      ? `<iframe class="w-full h-full absolute inset-0" src="${escapeHtml(video.embed_url)}"
                 title="${escapeHtml(video.title)}" frameborder="0" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
      : `<button type="button" data-video-embed="${escapeHtml(video.embed_url)}" data-video-title="${escapeHtml(video.title)}"
                 class="absolute inset-0 w-full h-full group" aria-label="Assistir: ${escapeHtml(video.title)}">
           <img class="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                src="${escapeHtml(video.thumbnail)}" alt="" loading="lazy"
                onerror="this.src='https://i.ytimg.com/vi/${escapeHtml(video.youtube_id)}/hqdefault.jpg'">
           <span class="absolute inset-0 flex items-center justify-center">
             <span class="w-16 h-16 bg-primary text-on-primary rounded-full flex items-center justify-center transform group-hover:scale-110 transition-transform">
               <span class="material-symbols-outlined text-[32px]">play_arrow</span>
             </span>
           </span>
         </button>`;

    return `
      <div class="bg-surface-container-low border border-outline-variant rounded-DEFAULT overflow-hidden">
        <div class="relative w-full aspect-video bg-surface-dim" data-video-stage>
          ${liveBadge}
          ${player}
        </div>
        <div class="p-6">
          <span class="font-label-sm text-label-sm text-on-surface-variant mb-2 block">${video.is_live ? 'TRANSMISSÃO AO VIVO' : 'VÍDEO EM DESTAQUE'}</span>
          <h3 class="font-headline-md text-headline-md text-primary mb-2">${escapeHtml(video.title)}</h3>
          ${video.description ? `<p class="font-body-md text-body-md text-on-surface-variant">${escapeHtml(video.description)}</p>` : ''}
        </div>
      </div>`;
  }

  function videoListItemHtml(video) {
    return `
      <a href="${escapeHtml(video.watch_url)}" target="_blank" rel="noopener noreferrer"
         class="flex gap-4 items-center p-3 bg-surface border border-outline-variant hover:border-primary transition-colors rounded-DEFAULT group">
        <div class="w-32 shrink-0 aspect-video bg-surface-dim overflow-hidden rounded-DEFAULT relative">
          <img src="https://i.ytimg.com/vi/${escapeHtml(video.youtube_id)}/mqdefault.jpg" alt="" loading="lazy"
               class="w-full h-full object-cover">
          ${video.is_live ? '<span class="absolute bottom-1 left-1 bg-error text-on-error font-label-sm text-[10px] px-1.5 py-0.5 rounded">AO VIVO</span>' : ''}
        </div>
        <div class="min-w-0">
          <h4 class="font-body-md text-body-md font-bold text-primary group-hover:underline line-clamp-2">${escapeHtml(video.title)}</h4>
          ${video.description ? `<p class="font-label-sm text-label-sm text-on-surface-variant line-clamp-2 mt-1">${escapeHtml(video.description)}</p>` : ''}
        </div>
      </a>`;
  }

  function emptyState(message) {
    return `<div class="border border-dashed border-outline-variant rounded-DEFAULT p-10 text-center">
        <p class="font-body-md text-body-md text-on-surface-variant">${escapeHtml(message)}</p>
      </div>`;
  }

  function renderSettings(settings) {
    document.title = `${settings.station_name} — Rádio ao vivo`;
    document.querySelectorAll('[data-station-name]').forEach((el) => {
      el.textContent = settings.station_name;
    });
    document.querySelectorAll('[data-now-playing]').forEach((el) => {
      el.textContent = settings.now_playing || settings.tagline;
    });
    const footer = document.querySelector('[data-footer-text]');
    if (footer) footer.textContent = settings.footer_text;

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
          ([label, href]) =>
            `<a class="font-label-sm text-label-sm text-on-secondary-container hover:underline opacity-80 transition-opacity" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
        )
        .join('');
    }

    window.LavrasPlayer?.setStreamUrl(settings.stream_url);
  }

  // Troca a capa pelo iframe do YouTube quando o visitante clica em play.
  function wireVideoEmbeds(root) {
    root.querySelectorAll('[data-video-embed]').forEach((button) => {
      button.addEventListener('click', () => {
        const stage = button.closest('[data-video-stage]');
        if (!stage) return;
        const src = new URL(button.dataset.videoEmbed);
        src.searchParams.set('autoplay', '1');
        stage.innerHTML = `<iframe class="w-full h-full absolute inset-0" src="${escapeHtml(src.toString())}"
          title="${escapeHtml(button.dataset.videoTitle || '')}" frameborder="0"
          allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        window.LavrasPlayer?.pause();
      });
    });
  }

  async function load() {
    let data;
    try {
      const response = await fetch('/api/site');
      if (!response.ok) throw new Error('Falha ao carregar o conteúdo.');
      data = await response.json();
    } catch {
      grid.innerHTML = `<div class="md:col-span-12">${emptyState('Não foi possível carregar o conteúdo. Tente atualizar a página.')}</div>`;
      return;
    }

    renderSettings(data.settings);

    bannerSlot.innerHTML = data.banner ? bannerHtml(data.banner) : '';

    grid.innerHTML = data.news.length
      ? data.news.map(newsCardHtml).join('')
      : `<div class="md:col-span-12">${emptyState('Nenhuma notícia publicada ainda. Adicione a primeira pelo painel administrativo.')}</div>`;

    const others = data.videos.filter((video) => video.id !== data.featuredVideo?.id).slice(0, 4);
    videoSlot.innerHTML = data.featuredVideo
      ? `<div class="grid md:grid-cols-2 gap-gutter">
           ${featuredVideoHtml(data.featuredVideo)}
           <div class="flex flex-col gap-3">
             ${others.length ? others.map(videoListItemHtml).join('') : emptyState('Cadastre outros vídeos no painel para vê-los aqui.')}
           </div>
         </div>`
      : emptyState('Nenhum vídeo ou live cadastrado ainda.');

    wireVideoEmbeds(videoSlot);
  }

  document.addEventListener('DOMContentLoaded', load);

  // Mantém "no ar agora" atualizado sem recarregar a página.
  setInterval(async () => {
    try {
      const response = await fetch('/api/now-playing');
      if (!response.ok) return;
      const info = await response.json();
      document.querySelectorAll('[data-now-playing]').forEach((el) => {
        if (info.now_playing) el.textContent = info.now_playing;
      });
      window.LavrasPlayer?.setStreamUrl(info.stream_url);
    } catch {
      /* silencioso: é só uma atualização de fundo */
    }
  }, 60000);
})();
