(() => {
  'use strict';
  const SOURCES = {
    battle: './assets/cinematics/battle-start.mp4',
    defeat: './assets/cinematics/defeat.mp4',
    victory: './assets/cinematics/victory.mp4'
  };
  let overlay, video, skipButton, title, subtitle, active = false, timer = 0, fallbackTimer = 0;
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const copy = {
    intro: ['СИСТЕМЫ АКТИВИРОВАНЫ', 'БРОНЕМАШИНА · ГОТОВНОСТЬ 100%'],
    battle: ['БОЕВОЕ РАЗВЁРТЫВАНИЕ', 'СЕКТОР ПОДТВЕРЖДЁН · НАЧИНАЕМ БОЙ'],
    defeat: ['ТАНК УНИЧТОЖЕН', 'МАШИНА ВЫВЕДЕНА ИЗ СТРОЯ'],
    victory: ['ПОБЕДА', 'ЗАДАЧА ВЫПОЛНЕНА']
  };
  function build() {
    if (overlay) return;
    overlay = document.createElement('section');
    overlay.id = 'cinematicOverlay';
    overlay.className = 'cinematic-overlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-label', 'Кинематографическая заставка');
    overlay.innerHTML = '<video class="cinematic-video" playsinline webkit-playsinline preload="none" muted></video><div class="cinematic-scene" aria-hidden="true"><div class="cinematic-stars"></div><div class="cinematic-scan"></div><div class="cinematic-grid"></div><div class="cinematic-reticle"></div><div class="cinematic-tank"><img src="./assets/tanks/bastion.svg?v=1" alt=""></div><div class="cinematic-muzzle-flash"></div><div class="cinematic-brand">MTBA <span>TACTICAL SYSTEMS</span></div><div class="cinematic-status"><i></i> POWER ON <b>ARMOR 100%</b><b>GUN READY</b></div></div><div class="cinematic-vignette"></div><div class="cinematic-copy"><span class="cinematic-kicker">FREEzzzGAMES / MTBA</span><strong class="cinematic-title"></strong><span class="cinematic-subtitle"></span></div><button type="button" class="cinematic-skip">ПРОПУСТИТЬ　›</button>';
    document.body.appendChild(overlay);
    video = overlay.querySelector('video');
    title = overlay.querySelector('.cinematic-title');
    subtitle = overlay.querySelector('.cinematic-subtitle');
    skipButton = overlay.querySelector('button');
    skipButton.addEventListener('click', () => finish(true));
    video.addEventListener('ended', () => finish(false));
    video.addEventListener('error', () => showFallback());
    video.addEventListener('abort', () => showFallback());
  }
  function showFallback() {
    if (!active) return;
    video.pause();
    video.hidden = true;
    overlay.classList.add('cinematic-fallback');
    clearTimeout(timer);
    fallbackTimer = window.setTimeout(() => finish(true), 1500);
  }
  function finish(skipped) {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    clearTimeout(fallbackTimer);
    video.pause();
    video.removeAttribute('src');
    video.load();
    overlay.hidden = true;
    overlay.classList.remove('is-playing', 'cinematic-fallback', 'cinematic-intro');
    video.hidden = false;
    const done = overlay._done;
    overlay._done = null;
    if (done) done({ skipped });
  }
  function play(kind, options = {}) {
    build();
    if (active) finish(true);
    if (!['intro','battle','defeat','victory'].includes(kind) || reducedMotion() || options.enabled === false) {
      if (options.onMissing) options.onMissing();
      return false;
    }
    active = true;
    overlay.hidden = false;
    overlay.classList.add('is-playing');
    overlay.classList.toggle('cinematic-intro', kind === 'intro');
    const labels = copy[kind] || copy.battle;
    title.textContent = labels[0];
    subtitle.textContent = labels[1];
    skipButton.hidden = false;
    overlay._done = options.onEnd || null;
    if (kind === 'intro') {
      video.pause();
      video.removeAttribute('src');
      video.hidden = true;
      overlay.classList.remove('cinematic-fallback');
      timer = window.setTimeout(() => finish(false), 6200);
      return true;
    }
    video.hidden = false;
    video.src = SOURCES[kind];
    video.currentTime = 0;
    video.play().catch(() => showFallback());
    timer = window.setTimeout(() => finish(true), 12000);
    return true;
  }
  function playSequence(kinds, done) {
    const next = index => {
      if (index >= kinds.length) { if (done) done(); return; }
      const started = play(kinds[index], { onEnd: () => next(index + 1) });
      if (!started) next(index + 1);
    };
    next(0);
  }
  let replayingStart = false;
  document.addEventListener('click', event => {
    const button = event.target.closest && event.target.closest('#startBtn');
    if (!button || replayingStart) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.__mtbaOutcomeShown = false;
    playSequence(['battle'], () => {
      replayingStart = true;
      button.click();
      replayingStart = false;
    });
  }, true);
  window.addEventListener('load', () => {
    window.setTimeout(() => {
      const menu = document.getElementById('overlay');
      if (menu && !menu.classList.contains('hidden')) play('intro');
    }, 450);
  }, { once: true });
  window.MTBACinematics = {
    version: '1.1.0',
    play,
    playSequence,
    playIntro(done) { return play('intro', { onEnd: done }); },
    playOutcome(kind, done) { if (kind !== 'victory' && kind !== 'defeat') return false; return play(kind, { onEnd: done }); },
    get active() { return active; }
  };
})();