/* Painel administrativo do LavrasFM. */
(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);

  let options = { highlights: {}, videoKinds: {} };

  /* ------------------------------- utilitários ------------------------------ */

  async function api(path, { method = 'GET', body } = {}) {
    const response = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });

    if (response.status === 401) {
      window.location.href = '/login';
      throw new Error('Sessão expirada.');
    }

    // Resposta que não é JSON quase sempre significa rota inexistente — ou seja,
    // servidor rodando código antigo depois de uma atualização de arquivos.
    let data;
    try {
      data = response.status === 204 ? {} : JSON.parse((await response.text()) || '{}');
    } catch {
      const error = new Error(
        `O servidor respondeu ${response.status} sem dados. Se você acabou de atualizar ` +
          'os arquivos do projeto, pare o servidor e inicie de novo (Ctrl+C e depois npm start).'
      );
      error.hint = '';
      throw error;
    }

    if (!response.ok) {
      const error = new Error(data.error || 'Não foi possível concluir a operação.');
      error.hint = data.hint || '';
      throw error;
    }
    return data;
  }

  let toastTimer;
  function toast(message, kind = 'success') {
    const el = $('#toast');
    el.textContent = message;
    el.className =
      'fixed top-24 right-4 z-[100] max-w-sm font-body-md text-body-md px-5 py-4 rounded-DEFAULT shadow-lg ' +
      (kind === 'error' ? 'bg-error-container text-on-error-container' : 'bg-primary text-on-primary');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  function formValues(form) {
    const values = {};
    for (const element of form.elements) {
      if (!element.name) continue;
      if (element.type === 'checkbox') {
        // Campos com value definido guardam texto ('1'/'0'); os demais, booleano.
        values[element.name] = element.value && element.value !== 'on'
          ? (element.checked ? element.value : '0')
          : element.checked;
      }
      else if (element.type === 'radio') {
        if (element.checked) values[element.name] = element.value;
      } else values[element.name] = element.value;
    }
    return values;
  }

  function fillForm(form, values) {
    for (const element of form.elements) {
      if (!element.name || !(element.name in values)) continue;
      const value = values[element.name];
      // '0' e '' vêm das configurações como texto e são "desmarcado".
      if (element.type === 'checkbox') element.checked = value !== '0' && Boolean(value);
      else if (element.type === 'radio') element.checked = element.value === String(value);
      else element.value = value ?? '';
    }
  }

  /** SQLite grava "YYYY-MM-DD HH:MM:SS" em UTC; o input espera hora local. */
  function toLocalInput(value) {
    if (!value) return '';
    const date = new Date(String(value).replace(' ', 'T') + 'Z');
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(String(value).replace(' ', 'T') + 'Z');
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  /* ---------------------------------- abas ---------------------------------- */

  function activateTab(name) {
    $$('#tabs .tab').forEach((button) => {
      const active = button.dataset.tab === name;
      button.classList.toggle('border-primary', active);
      button.classList.toggle('text-primary', active);
      button.classList.toggle('font-bold', active);
      button.classList.toggle('border-transparent', !active);
      button.classList.toggle('text-on-surface-variant', !active);
    });
    $$('[data-panel]').forEach((panel) => {
      const active = panel.dataset.panel === name;
      panel.classList.toggle('hidden', !active);
      panel.classList.toggle('flex', active);
    });
    if (window.location.hash.slice(1) !== name) history.replaceState(null, '', `#${name}`);
  }

  $('#tabs').addEventListener('click', (event) => {
    const button = event.target.closest('.tab');
    if (button) activateTab(button.dataset.tab);
  });

  /* -------------------------------- notícias -------------------------------- */

  const newsForm = $('#news-form');

  function renderHighlightOptions() {
    $('#highlight-options').innerHTML = Object.entries(options.highlights)
      .map(
        ([value, info], index) => `
        <label class="flex items-start gap-2 cursor-pointer">
          <input type="radio" name="highlight" value="${escapeHtml(value)}" ${index === Object.keys(options.highlights).length - 1 ? 'checked' : ''}
                 class="mt-1 border-outline-variant text-primary focus:ring-primary">
          <span>
            <span class="font-body-md text-body-md block">${escapeHtml(info.label)}</span>
            <span class="font-label-sm text-label-sm text-on-surface-variant">${escapeHtml(info.description)}</span>
          </span>
        </label>`
      )
      .join('');
  }

  function newsRow(item) {
    const badge = item.active
      ? '<span class="font-label-sm text-label-sm px-2 py-1 rounded bg-surface-container text-on-surface">PUBLICADA</span>'
      : '<span class="font-label-sm text-label-sm px-2 py-1 rounded bg-error-container text-on-error-container">RASCUNHO</span>';

    return `
      <article class="bg-surface border border-outline-variant rounded-DEFAULT p-4 flex gap-4 items-start" data-news-id="${item.id}">
        ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="" class="w-24 h-16 object-cover rounded-DEFAULT shrink-0 hidden sm:block">` : ''}
        <div class="flex-grow min-w-0">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <span class="font-label-sm text-label-sm text-on-surface-variant">${escapeHtml(item.category)}</span>
            <span class="font-label-sm text-label-sm px-2 py-1 rounded bg-primary text-on-primary">${escapeHtml(item.highlight_label)}</span>
            ${item.invert ? '<span class="font-label-sm text-label-sm px-2 py-1 rounded border border-outline-variant">FUNDO PRETO</span>' : ''}
            ${badge}
          </div>
          <h3 class="font-body-lg text-body-lg font-bold text-primary line-clamp-2">${escapeHtml(item.title)}</h3>
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"
             class="font-label-sm text-label-sm text-on-surface-variant hover:text-primary hover:underline break-all">${escapeHtml(item.url)}</a>
          <p class="font-label-sm text-label-sm text-on-surface-variant mt-1">
            ${escapeHtml(formatDate(item.published_at))} · ordem ${item.position}
          </p>
        </div>
        <div class="flex flex-col gap-1 shrink-0">
          <button data-action="edit-news" data-id="${item.id}" title="Editar"
                  class="material-symbols-outlined text-on-surface-variant hover:text-primary p-1">edit</button>
          <button data-action="toggle-news" data-id="${item.id}" title="${item.active ? 'Despublicar' : 'Publicar'}"
                  class="material-symbols-outlined text-on-surface-variant hover:text-primary p-1">${item.active ? 'visibility' : 'visibility_off'}</button>
          <button data-action="delete-news" data-id="${item.id}" title="Excluir"
                  class="material-symbols-outlined text-on-surface-variant hover:text-error p-1">delete</button>
        </div>
      </article>`;
  }

  let newsCache = [];

  async function loadNews() {
    const { news } = await api('/admin/news');
    newsCache = news;
    $('#news-count').textContent = `${news.length} ${news.length === 1 ? 'item' : 'itens'}`;
    $('#news-list').innerHTML = news.length
      ? news.map(newsRow).join('')
      : '<p class="font-body-md text-body-md text-on-surface-variant border border-dashed border-outline-variant rounded-DEFAULT p-8 text-center">Nenhuma notícia cadastrada ainda.</p>';
  }

  function resetNewsForm() {
    newsForm.reset();
    newsForm.elements.id.value = '';
    newsForm.elements.active.checked = true;
    $('#news-form-title').textContent = 'Nova notícia';
    $('#news-reset').classList.add('hidden');
  }

  newsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = newsForm.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const values = formValues(newsForm);
      const id = values.id;
      delete values.id;
      if (id) await api(`/admin/news/${id}`, { method: 'PUT', body: values });
      else await api('/admin/news', { method: 'POST', body: values });
      resetNewsForm();
      await loadNews();
      toast(id ? 'Notícia atualizada.' : 'Notícia publicada.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('#news-reset').addEventListener('click', resetNewsForm);

  $('#news-list').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = Number(button.dataset.id);
    const item = newsCache.find((entry) => entry.id === id);

    try {
      if (button.dataset.action === 'edit-news' && item) {
        fillForm(newsForm, { ...item, published_at: toLocalInput(item.published_at) });
        newsForm.elements.id.value = item.id;
        $('#news-form-title').textContent = 'Editando notícia';
        $('#news-reset').classList.remove('hidden');
        newsForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (button.dataset.action === 'toggle-news' && item) {
        await api(`/admin/news/${id}`, { method: 'PUT', body: { active: !item.active } });
        await loadNews();
        toast(item.active ? 'Notícia despublicada.' : 'Notícia publicada.');
      } else if (button.dataset.action === 'delete-news') {
        if (!confirm('Excluir esta notícia? A ação não pode ser desfeita.')) return;
        await api(`/admin/news/${id}`, { method: 'DELETE' });
        if (Number(newsForm.elements.id.value) === id) resetNewsForm();
        await loadNews();
        toast('Notícia excluída.');
      }
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  /* --------------------------------- vídeos --------------------------------- */

  const videoForm = $('#video-form');
  let videoCache = [];

  // Mesma lógica do servidor, só para mostrar a prévia enquanto digita.
  function parseYoutubeId(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;
    if (/^[\w-]{11}$/.test(raw)) return raw;
    let url;
    try {
      url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    } catch {
      return null;
    }
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) return null;
    const v = url.searchParams.get('v');
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const match = url.pathname.match(/\/(?:live|embed|shorts|v)\/([\w-]{11})/);
    return match ? match[1] : null;
  }

  videoForm.elements.youtube_url.addEventListener('input', (event) => {
    const id = parseYoutubeId(event.target.value);
    const preview = $('#video-preview');
    if (id) {
      $('#video-thumb').src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
      preview.classList.remove('hidden');
    } else {
      preview.classList.add('hidden');
    }
  });

  function videoRow(item) {
    return `
      <article class="bg-surface border border-outline-variant rounded-DEFAULT p-4 flex gap-4 items-start">
        <div class="w-28 shrink-0 aspect-video bg-surface-dim rounded-DEFAULT overflow-hidden hidden sm:block">
          <img src="https://i.ytimg.com/vi/${escapeHtml(item.youtube_id)}/mqdefault.jpg" alt="" class="w-full h-full object-cover">
        </div>
        <div class="flex-grow min-w-0">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <span class="font-label-sm text-label-sm px-2 py-1 rounded ${item.is_live ? 'bg-error text-on-error' : 'bg-surface-container text-on-surface'}">
              ${item.is_live ? 'AO VIVO' : 'VÍDEO'}
            </span>
            ${item.featured ? '<span class="font-label-sm text-label-sm px-2 py-1 rounded bg-primary text-on-primary">EM DESTAQUE</span>' : ''}
            ${item.autoplay ? '<span class="font-label-sm text-label-sm px-2 py-1 rounded border border-outline-variant">AUTOPLAY</span>' : ''}
            ${item.active ? '' : '<span class="font-label-sm text-label-sm px-2 py-1 rounded bg-error-container text-on-error-container">OCULTO</span>'}
          </div>
          <h3 class="font-body-lg text-body-lg font-bold text-primary line-clamp-2">${escapeHtml(item.title)}</h3>
          <a href="${escapeHtml(item.watch_url)}" target="_blank" rel="noopener noreferrer"
             class="font-label-sm text-label-sm text-on-surface-variant hover:text-primary hover:underline break-all">${escapeHtml(item.watch_url)}</a>
        </div>
        <div class="flex flex-col gap-1 shrink-0">
          <button data-action="edit-video" data-id="${item.id}" title="Editar"
                  class="material-symbols-outlined text-on-surface-variant hover:text-primary p-1">edit</button>
          <button data-action="feature-video" data-id="${item.id}" title="Destacar na home"
                  class="material-symbols-outlined p-1 ${item.featured ? 'text-primary' : 'text-on-surface-variant hover:text-primary'}">${item.featured ? 'star' : 'star_outline'}</button>
          <button data-action="delete-video" data-id="${item.id}" title="Excluir"
                  class="material-symbols-outlined text-on-surface-variant hover:text-error p-1">delete</button>
        </div>
      </article>`;
  }

  async function loadVideos() {
    const { videos } = await api('/admin/videos');
    videoCache = videos;
    $('#video-count').textContent = `${videos.length} ${videos.length === 1 ? 'item' : 'itens'}`;
    $('#video-list').innerHTML = videos.length
      ? videos.map(videoRow).join('')
      : '<p class="font-body-md text-body-md text-on-surface-variant border border-dashed border-outline-variant rounded-DEFAULT p-8 text-center">Nenhum vídeo cadastrado ainda.</p>';
  }

  function resetVideoForm() {
    videoForm.reset();
    videoForm.elements.id.value = '';
    videoForm.elements.active.checked = true;
    $('#video-preview').classList.add('hidden');
    $('#video-form-title').textContent = 'Novo vídeo / live';
    $('#video-reset').classList.add('hidden');
  }

  videoForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = videoForm.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const values = formValues(videoForm);
      const id = values.id;
      delete values.id;
      if (id) await api(`/admin/videos/${id}`, { method: 'PUT', body: values });
      else await api('/admin/videos', { method: 'POST', body: values });
      resetVideoForm();
      await loadVideos();
      toast(id ? 'Vídeo atualizado.' : 'Vídeo cadastrado.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('#video-reset').addEventListener('click', resetVideoForm);

  $('#video-list').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = Number(button.dataset.id);
    const item = videoCache.find((entry) => entry.id === id);

    try {
      if (button.dataset.action === 'edit-video' && item) {
        fillForm(videoForm, item);
        videoForm.elements.id.value = item.id;
        videoForm.elements.youtube_url.dispatchEvent(new Event('input'));
        $('#video-form-title').textContent = 'Editando vídeo';
        $('#video-reset').classList.remove('hidden');
        videoForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (button.dataset.action === 'feature-video' && item) {
        await api(`/admin/videos/${id}`, { method: 'PUT', body: { featured: !item.featured } });
        await loadVideos();
        toast(item.featured ? 'Destaque removido.' : 'Vídeo em destaque na home.');
      } else if (button.dataset.action === 'delete-video') {
        if (!confirm('Excluir este vídeo?')) return;
        await api(`/admin/videos/${id}`, { method: 'DELETE' });
        if (Number(videoForm.elements.id.value) === id) resetVideoForm();
        await loadVideos();
        toast('Vídeo excluído.');
      }
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  /* ------------------------------ configurações ----------------------------- */

  const settingsForm = $('#settings-form');

  async function loadSettings() {
    const { settings } = await api('/admin/settings');
    fillForm(settingsForm, settings);
  }

  settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = settingsForm.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      await api('/admin/settings', { method: 'PUT', body: formValues(settingsForm) });
      toast('Configurações salvas.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  /**
   * Pergunta ao servidor o que é a URL colada: página de diretório, playlist
   * (que ele abre para extrair a URL real) ou o áudio direto.
   */
  $('#resolve-stream').addEventListener('click', async () => {
    const box = $('#resolve-result');
    const campo = settingsForm.elements.stream_url;
    const botao = $('#resolve-stream');

    const mostrar = (texto, kind) => {
      box.innerHTML = texto;
      box.className =
        'font-body-md text-body-md px-4 py-3 rounded-DEFAULT ' +
        (kind === 'error'
          ? 'bg-error-container text-on-error-container'
          : kind === 'warn'
            ? 'border border-outline-variant text-on-surface-variant'
            : 'bg-surface-container text-on-surface');
    };

    botao.disabled = true;
    mostrar('Verificando…', 'warn');

    try {
      const data = await api('/admin/stream/resolve', {
        method: 'POST',
        body: { url: campo.value }
      });

      if (data.resolvedFrom) campo.value = data.url;

      const linhas = [];
      if (data.resolvedFrom) {
        linhas.push(`Extraí o endereço de dentro da playlist: <strong>${escapeHtml(data.url)}</strong>`);
      }
      linhas.push(escapeHtml(data.probe.message));
      if (data.probe.insecure) {
        linhas.push(
          'Atenção: essa transmissão é <strong>http</strong>. Em um site https o navegador bloqueia — ' +
            'marque "Retransmitir pelo servidor" para contornar.'
        );
      }
      if (data.probe.ok) linhas.push('Não esqueça de salvar as configurações.');

      mostrar(linhas.join('<br>'), data.probe.ok ? 'success' : 'error');
    } catch (error) {
      const hint = error.hint ? `<br><span class="font-label-sm text-label-sm">${escapeHtml(error.hint)}</span>` : '';
      mostrar(escapeHtml(error.message) + hint, 'error');
    } finally {
      botao.disabled = false;
    }
  });

  /**
   * Testa o streaming no navegador e confirma que o áudio está mesmo saindo.
   *
   * `play()` resolver não significa que há som: o navegador aceita o comando
   * antes de saber se consegue decodificar o fluxo. Por isso, esperamos o
   * relógio do áudio avançar e conferimos volume e mudo, que são a causa mais
   * comum de "diz que está tocando, mas não sai nada".
   */
  let testAudio;
  let testTimer;

  $('#test-stream').addEventListener('click', () => {
    const status = $('#stream-status');
    const url = settingsForm.elements.stream_url.value.trim();

    const dizer = (texto) => {
      status.textContent = texto;
    };

    if (testAudio && !testAudio.paused) {
      clearTimeout(testTimer);
      testAudio.pause();
      dizer('Teste interrompido.');
      return;
    }
    if (!url) {
      dizer('Informe a URL do streaming primeiro.');
      return;
    }

    dizer('Conectando…');
    testAudio = new Audio(url);
    testAudio.volume = 1;
    testAudio.muted = false;

    testAudio.addEventListener('error', () => {
      // Uma queda passageira de conexão dispara este evento mesmo com o áudio
      // tocando normalmente; só é falha de verdade se nada estiver saindo.
      if (!testAudio.paused && testAudio.currentTime > 0) return;

      clearTimeout(testTimer);
      const codigo = testAudio.error?.code;
      dizer(
        codigo === 4
          ? 'O navegador não consegue tocar esse formato de áudio. Confira com quem hospeda a transmissão qual o formato (MP3, AAC, OGG).'
          : 'Não consegui tocar essa URL. Verifique o endereço, o https e o CORS do servidor.'
      );
    });

    testAudio.play().then(
      () => {
        dizer('Conectado. Conferindo se o áudio está saindo…');

        // Se o relógio não anda, chegou dado mas nada está sendo decodificado.
        testTimer = setTimeout(() => {
          if (testAudio.paused) return;

          if (testAudio.currentTime > 0) {
            const silencioso = testAudio.muted || testAudio.volume === 0;
            dizer(
              silencioso
                ? 'O áudio está tocando, mas sem som: o navegador está com esta aba no mudo. Clique com o botão direito na aba e escolha "Reativar som do site".'
                : 'Tocando — o áudio está saindo. Se você não ouve nada, verifique o volume do computador e se a aba do navegador está muda. Clique de novo para parar.'
            );
          } else {
            dizer(
              'O navegador conectou, mas nenhum áudio foi decodificado em 3 segundos. ' +
                'Isso costuma ser formato incompatível ou transmissão fora do ar no momento.'
            );
          }
        }, 3000);
      },
      (error) => {
        dizer(
          error?.name === 'NotAllowedError'
            ? 'O navegador bloqueou a reprodução automática. Clique novamente.'
            : 'Não consegui tocar essa URL. Verifique o endereço, o https e o CORS do servidor.'
        );
      }
    );
  });

  /* ---------------------------------- conta --------------------------------- */

  $('#password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const data = await api('/auth/password', { method: 'POST', body: formValues(form) });
      toast(data.message || 'Senha alterada.');
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
    }
  });

  $('#logout').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/';
  });

  /* ---------------------------------- boot ---------------------------------- */

  (async function init() {
    try {
      const [{ user }, opts] = await Promise.all([api('/auth/me'), api('/admin/options')]);
      if (!user) {
        window.location.href = '/login';
        return;
      }
      $('#current-user').textContent = user.username;
      options = opts;
      renderHighlightOptions();

      await Promise.all([loadNews(), loadVideos(), loadSettings()]);

      const initial = window.location.hash.slice(1);
      activateTab(['noticias', 'videos', 'config', 'conta'].includes(initial) ? initial : 'noticias');
    } catch (error) {
      toast(error.message, 'error');
    }
  })();
})();
