(() => {
  'use strict';
  const SOURCES = {
    intro: './assets/cinematics/intro.mp4',
    battle: './assets/cinematics/battle-start.mp4',
    defeat: './assets/cinematics/defeat.mp4',
    victory: './assets/cinematics/victory.mp4'
  };
  let overlay, video, skipButton, title, subtitle, active = false, timer = 0;
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function build() {
    if (overlay) return;
    overlay = document.createElement('section');
    overlay.id = 'cinematicOverlay';
    overlay.className = 'cinematic-overlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-label', 'Кинематографическая заставка');
    overlay.innerHTML = '<video class="cinematic-video" playsinline webkit-playsinline preload="none" muted></video><div class="cinematic-vignette"></div><div class="cinematic-copy"><span class="cinematic-kicker">FREEzzzGAMES / MTBA</span><strong class="cinematic-title"></strong><span class="cinematic-subtitle"></span></div><button type="button" class="cinematic-skip">ПРОПУСТИТЬ　›</button>';
    document.body.appendChild(overlay);
    video = overlay.querySelector('video');
    title = overlay.querySelector('.cinematic-title');
    subtitle = overlay.querySelector('.cinematic-subtitle');
    skipButton = overlay.querySelector('button');
    skipButton.addEventListener('click', () => finish(true));
    video.addEventListener('ended', () => finish(false));
    video.addEventListener('error', () => finish(true));
    video.addEventListener('abort', () => finish(true));
  }
  function finish(skipped) {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    video.pause();
    video.removeAttribute('src');
    video.load();
    overlay.hidden = true;
    overlay.classList.remove('is-playing');
    const done = overlay._done;
    overlay._done = null;
    if (done) done({ skipped });
  }
  function play(kind, options = {}) {
    build();
    if (active) finish(true);
    const src = SOURCES[kind];
    if (!src || reducedMotion() || options.enabled === false) {
      if (options.onMissing) options.onMissing();
      return false;
    }
    active = true;
    overlay.hidden = false;
    overlay.classList.add('is-playing');
    title.textContent = ({intro:'ТЕХНИЧЕСКАЯ ПОДГОТОВКА',battle:'БОЕВОЕ РАЗВЁРТЫВАНИЕ',defeat:'ТАНК УНИЧТОЖЕН',victory:'ПОБЕДА'})[kind] || 'MINITANKS BATTLE ARENA';
    subtitle.textContent = ({intro:'Проверка систем · подготовка экипажа',battle:'Сектор подтверждён · начинаем бой',defeat:'Машина выведена из строя',victory:'Задача выполнена'})[kind] || 'BATTLE ARENA';
    skipButton.hidden = false;
    overlay._done = options.onEnd || null;
    video.src = src;
    video.currentTime = 0;
    video.play().catch(() => finish(true));
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
  window.MTBACinematics = {
    version: '1.0.0',
    play,
    playSequence,
    playIntro(done) { playSequence(['intro', 'battle'], done); },
    playOutcome(kind, done) { if (kind !== 'victory' && kind !== 'defeat') return false; return play(kind, { onEnd: done }); },
    get active() { return active; }
  };
})();