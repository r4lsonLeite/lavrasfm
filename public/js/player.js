/**
 * Player da rádio ao vivo.
 *
 * Controla um único elemento <audio> e mantém em sincronia todos os botões
 * marcados com data-play-toggle, os controles de volume e os equalizadores
 * espalhados pela página.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'lavrasfm:player';
  const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000];

  const audio = new Audio();
  audio.preload = 'none';
  // Sem crossOrigin: exigir CORS faria a maioria dos servidores de rádio
  // (Icecast/Shoutcast) recusar a conexão. O <audio> não precisa disso.

  let streamUrl = '';
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let wantsToPlay = false;

  const stored = readStored();
  audio.volume = stored.volume;
  audio.muted = stored.muted;

  function readStored() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const volume = Number(raw.volume);
      return {
        volume: Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 0.8,
        muted: raw.muted === true
      };
    } catch {
      return { volume: 0.8, muted: false };
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: audio.volume, muted: audio.muted }));
    } catch {
      /* modo privativo: seguimos sem persistir */
    }
  }

  const els = {
    toggles: () => document.querySelectorAll('[data-play-toggle]'),
    icons: () => document.querySelectorAll('[data-play-icon]'),
    labels: () => document.querySelectorAll('[data-play-label]'),
    status: () => document.querySelectorAll('[data-player-status]'),
    equalizers: () => document.querySelectorAll('[data-equalizer]'),
    volumes: () => document.querySelectorAll('[data-volume]'),
    volumeIcons: () => document.querySelectorAll('[data-volume-icon]')
  };

  function setStatus(text) {
    els.status().forEach((el) => {
      el.textContent = text;
    });
  }

  function render() {
    const playing = !audio.paused && !audio.ended;
    els.icons().forEach((el) => {
      el.textContent = playing ? 'pause' : 'play_arrow';
    });
    els.labels().forEach((el) => {
      el.textContent = playing ? 'Pausar' : 'Ouvir ao vivo';
    });
    els.toggles().forEach((el) => {
      el.setAttribute('aria-pressed', String(playing));
    });
    els.equalizers().forEach((el) => {
      el.classList.toggle('is-playing', playing);
    });
    els.volumeIcons().forEach((el) => {
      el.textContent = audio.muted || audio.volume === 0 ? 'volume_off' : audio.volume < 0.5 ? 'volume_down' : 'volume_up';
    });
    els.volumes().forEach((el) => {
      const value = String(Math.round(audio.volume * 100));
      if (el.value !== value) el.value = value;
    });
  }

  async function play() {
    if (!streamUrl) {
      setStatus('SEM TRANSMISSÃO');
      window.dispatchEvent(
        new CustomEvent('player:error', {
          detail: { message: 'Nenhuma URL de transmissão configurada no painel administrativo.' }
        })
      );
      return;
    }
    wantsToPlay = true;
    clearTimeout(reconnectTimer);
    setStatus('CONECTANDO…');
    // Reatribuir o src abre uma conexão nova, pegando o ponto atual da
    // transmissão. Nada de parâmetro extra na URL: Shoutcast recusa.
    audio.src = streamUrl;
    try {
      await audio.play();
      reconnectAttempt = 0;
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        wantsToPlay = false;
        setStatus('TOQUE PARA OUVIR');
      } else {
        scheduleReconnect();
      }
      render();
    }
  }

  function pause() {
    wantsToPlay = false;
    clearTimeout(reconnectTimer);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    setStatus('AO VIVO');
    render();
  }

  function toggle() {
    if (audio.paused) play();
    else pause();
  }

  function scheduleReconnect() {
    if (!wantsToPlay) return;
    const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    reconnectAttempt += 1;
    setStatus('RECONECTANDO…');
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (wantsToPlay) play();
    }, delay);
  }

  audio.addEventListener('playing', () => {
    reconnectAttempt = 0;
    setStatus('AO VIVO');
    render();
  });
  audio.addEventListener('pause', render);
  audio.addEventListener('waiting', () => setStatus('CARREGANDO…'));
  audio.addEventListener('stalled', scheduleReconnect);
  audio.addEventListener('ended', scheduleReconnect);
  audio.addEventListener('error', () => {
    if (wantsToPlay) scheduleReconnect();
  });
  audio.addEventListener('volumechange', () => {
    persist();
    render();
  });

  function bind(root) {
    root.querySelectorAll('[data-play-toggle]').forEach((el) => {
      if (el.dataset.playBound) return;
      el.dataset.playBound = '1';
      el.addEventListener('click', toggle);
    });
    root.querySelectorAll('[data-volume]').forEach((el) => {
      if (el.dataset.volumeBound) return;
      el.dataset.volumeBound = '1';
      el.addEventListener('input', () => {
        audio.volume = Number(el.value) / 100;
        if (audio.volume > 0) audio.muted = false;
      });
    });
    root.querySelectorAll('[data-mute-toggle]').forEach((el) => {
      if (el.dataset.muteBound) return;
      el.dataset.muteBound = '1';
      el.addEventListener('click', () => {
        audio.muted = !audio.muted;
      });
    });
  }

  // Teclado: espaço/K alternam o player quando o foco não está em um campo.
  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (event.code === 'Space' || event.key.toLowerCase() === 'k') {
      event.preventDefault();
      toggle();
    }
  });

  window.LavrasPlayer = {
    audio,
    play,
    pause,
    toggle,
    bind,
    setStreamUrl(url) {
      const next = String(url || '').trim();
      if (next === streamUrl) return;
      streamUrl = next;
      if (wantsToPlay) play();
      else render();
    },
    hasStream: () => Boolean(streamUrl),
    isPlaying: () => !audio.paused
  };

  document.addEventListener('DOMContentLoaded', () => {
    bind(document);
    render();
  });
})();
