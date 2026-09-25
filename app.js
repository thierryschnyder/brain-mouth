/* Brain Mouth: a family word game. Plain JavaScript, no build step. */
(() => {
  'use strict';

  const MANIFEST_URL = 'languages/languages.json';
  const LANG_DIR = 'languages/';
  const STORAGE_KEY = 'brainmouth.settings.v1';
  const TIME_MIN = 10;
  const TIME_MAX = 120;
  const TIME_STEP = 10;
  const HOLD_MS = 700;          // press-and-hold duration for the home button
  const TIMEUP_PAUSE_MS = 2200; // how long the "time is up" screen stays
  const READY_LOCK_MS = 800;    // ignore taps on the ready button right after it appears

  const $ = (id) => document.getElementById(id);
  const el = {
    screens: { home: $('screen-home'), pass: $('screen-pass'), play: $('screen-play') },
    langList: $('lang-list'),
    timeMinus: $('time-minus'),
    timePlus: $('time-plus'),
    timeValue: $('time-value'),
    skipToggle: $('skip-toggle'),
    startBtn: $('start-btn'),
    readyBtn: $('ready-btn'),
    word: $('word'),
    speakBtn: $('speak-btn'),
    skipBtn: $('skip-btn'),
    timer: document.querySelector('.timer'),
    timerNum: $('timer-num'),
    ringFg: $('ring-fg'),
    homeBtn: $('home-btn'),
    flash: $('flash'),
  };
  const RING_LEN = 2 * Math.PI * 52;

  /* ---------------- settings ---------------- */

  const settings = { lang: null, seconds: 30, skip: true };

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (typeof saved.lang === 'string') settings.lang = saved.lang;
      if (Number.isFinite(saved.seconds)) settings.seconds = clampTime(saved.seconds);
      if (typeof saved.skip === 'boolean') settings.skip = saved.skip;
    } catch (_) { /* storage unavailable: use defaults */ }
  }
  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (_) { /* ignore */ }
  }
  function clampTime(s) {
    return Math.min(TIME_MAX, Math.max(TIME_MIN, Math.round(s / TIME_STEP) * TIME_STEP));
  }

  /* ---------------- languages ---------------- */

  const languages = new Map(); // code -> { code, name, locale, words }

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(url + ' ' + res.status);
    return res.json();
  }

  async function loadLanguages() {
    let files = [];
    try {
      const manifest = await fetchJSON(MANIFEST_URL);
      files = Array.isArray(manifest) ? manifest : (manifest.languages || []);
    } catch (err) {
      console.error('Could not read', MANIFEST_URL, err);
    }
    const results = await Promise.all(files.map(async (entry) => {
      const file = typeof entry === 'string' ? entry : entry.file;
      try {
        const data = await fetchJSON(LANG_DIR + file);
        const words = (data.words || [])
          .map((w) => String(w).trim())
          .filter(Boolean);
        const unique = [...new Set(words)];
        if (!unique.length) throw new Error('no words');
        return {
          code: file.replace(/\.json$/i, ''),
          name: data.name || file,
          locale: data.locale || '',
          words: unique,
        };
      } catch (err) {
        // A broken file (e.g. a typo while editing) should not break the whole app.
        console.error('Skipping language file', file, err);
        return null;
      }
    }));
    results.filter(Boolean).forEach((l) => languages.set(l.code, l));
  }

  function pickDefaultLang() {
    if (settings.lang && languages.has(settings.lang)) return settings.lang;
    const prefs = navigator.languages || [navigator.language || ''];
    for (const p of prefs) {
      const base = p.toLowerCase().split('-')[0];
      for (const l of languages.values()) {
        if (l.locale.toLowerCase().split('-')[0] === base || l.code === base) return l.code;
      }
    }
    return languages.keys().next().value || null;
  }

  function renderLangList() {
    el.langList.innerHTML = '';
    for (const l of languages.values()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lang-btn';
      b.setAttribute('role', 'radio');
      b.setAttribute('lang', l.locale || l.code);
      b.textContent = l.name;
      b.dataset.code = l.code;
      b.addEventListener('click', () => { setLang(l.code); unlockAudio(); });
      el.langList.appendChild(b);
    }
    updateLangList();
  }
  function updateLangList() {
    el.langList.querySelectorAll('.lang-btn').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.code === settings.lang));
    });
    el.startBtn.disabled = !languages.has(settings.lang);
  }
  function setLang(code) {
    settings.lang = code;
    saveSettings();
    updateLangList();
  }

  /* ---------------- word deck (shuffle, no repeats) ---------------- */

  const decks = new Map(); // lang code -> { order: [], pos, last }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function nextWord() {
    const lang = languages.get(settings.lang);
    let deck = decks.get(lang.code);
    if (!deck || deck.pos >= deck.order.length || deck.size !== lang.words.length) {
      const last = deck ? deck.last : null;
      const order = shuffle(lang.words.slice());
      // Avoid showing the same word twice in a row across a reshuffle.
      if (order.length > 1 && order[0] === last) [order[0], order[1]] = [order[1], order[0]];
      deck = { order, pos: 0, last, size: lang.words.length };
      decks.set(lang.code, deck);
    }
    const w = deck.order[deck.pos++];
    deck.last = w;
    return w;
  }

  /* ---------------- sound (Web Audio) ---------------- */

  let audioCtx = null;

  function unlockAudio() {
    // Must run inside a user gesture (iOS). Allows sound even with the ringer switch on silent
    // on iOS 17+ via the Audio Session API.
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (_) { /* ignore */ }
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state !== 'running') audioCtx.resume();
      // Play a silent buffer: the classic trick to fully unlock audio on older iOS.
      const buf = audioCtx.createBuffer(1, 1, 22050);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.start(0);
    } catch (_) { /* ignore */ }
  }

  function tone(freq, start, dur, type = 'sine', gain = 0.35) {
    const t0 = audioCtx.currentTime + start;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function playTimeUp() {
    if (!audioCtx) return;
    if (audioCtx.state !== 'running') audioCtx.resume();
    // A cheerful rising chime, played twice.
    const notes = [659.25, 830.61, 987.77, 1318.5];
    [0, 0.55].forEach((offset) => {
      notes.forEach((f, i) => tone(f, offset + i * 0.09, 0.45, 'triangle', 0.4));
    });
  }
  function playStart() {
    if (!audioCtx) return;
    tone(523.25, 0, 0.14, 'sine', 0.18);
    tone(783.99, 0.08, 0.18, 'sine', 0.18);
  }
  function playSkip() {
    if (!audioCtx) return;
    tone(440, 0, 0.1, 'sine', 0.14);
    tone(660, 0.06, 0.12, 'sine', 0.14);
  }

  function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) { /* ignore */ }
  }

  /* ---------------- speech (Web Speech API) ---------------- */

  const synth = window.speechSynthesis;
  let voices = [];
  function refreshVoices() { voices = synth ? synth.getVoices() : []; }
  if (synth) {
    refreshVoices();
    if ('onvoiceschanged' in synth) synth.addEventListener('voiceschanged', refreshVoices);
  } else {
    el.speakBtn.hidden = true;
  }

  function findVoice(locale) {
    if (!locale) return null;
    const lc = locale.toLowerCase().replace('_', '-');
    const base = lc.split('-')[0];
    const norm = (v) => v.lang.toLowerCase().replace('_', '-');
    const exact = voices.filter((v) => norm(v) === lc);
    const sameBase = voices.filter((v) => norm(v).split('-')[0] === base);
    const pool = exact.length ? exact : sameBase;
    return pool.find((v) => v.localService && v.default) || pool.find((v) => v.localService) || pool[0] || null;
  }

  function speak(text) {
    if (!synth || !text) return;
    const lang = languages.get(settings.lang);
    if (!voices.length) refreshVoices();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (lang && lang.locale) u.lang = lang.locale;
    const v = findVoice(lang && lang.locale);
    if (v) u.voice = v;
    u.rate = 0.85;
    u.pitch = 1.05;
    el.speakBtn.classList.add('speaking');
    u.onend = u.onerror = () => el.speakBtn.classList.remove('speaking');
    synth.speak(u);
  }

  /* ---------------- screen wake lock ---------------- */

  let wakeLock = null;
  let wantWake = false;
  async function requestWake() {
    wantWake = true;
    try {
      if ('wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (_) { /* not allowed / not supported */ }
  }
  function releaseWake() {
    wantWake = false;
    try { if (wakeLock) wakeLock.release(); } catch (_) { /* ignore */ }
    wakeLock = null;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wantWake) requestWake();
  });

  /* ---------------- screens ---------------- */

  let current = 'home';
  function show(name) {
    current = name;
    for (const [k, s] of Object.entries(el.screens)) s.classList.toggle('is-active', k === name);
    el.homeBtn.hidden = name === 'home';
    // Only the visible screen should be reachable by screen readers / keyboard.
    for (const [k, s] of Object.entries(el.screens)) {
      if (k === name) s.removeAttribute('inert'); else s.setAttribute('inert', '');
    }
  }

  /* ---------------- timer ---------------- */

  let rafId = 0;
  let endAt = 0;
  let duration = 0;
  let lastShown = -1;
  let timeupTimer = 0;

  function startTimer() {
    stopTimer();
    duration = settings.seconds * 1000;
    endAt = performance.now() + duration;
    lastShown = -1;
    el.timer.classList.remove('low', 'last');
    el.ringFg.style.transition = 'none';
    el.ringFg.style.strokeDashoffset = '0';
    tick();
  }
  function stopTimer() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  function tick() {
    const left = Math.max(0, endAt - performance.now());
    const frac = left / duration;
    el.ringFg.style.strokeDashoffset = String(RING_LEN * (1 - frac));
    const secs = Math.ceil(left / 1000);
    if (secs !== lastShown) {
      lastShown = secs;
      el.timerNum.textContent = String(secs);
      el.timer.setAttribute('aria-label', String(secs));
      const lastSecs = Math.min(5, Math.floor(settings.seconds / 4));
      el.timer.classList.toggle('low', frac <= 1 / 3 && secs > lastSecs);
      el.timer.classList.toggle('last', secs <= lastSecs);
    }
    if (left <= 0) { timeUp(); return; }
    rafId = requestAnimationFrame(tick);
  }
  // rAF pauses when the tab is hidden; this keeps the hard stop honest on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && rafId) { cancelAnimationFrame(rafId); tick(); }
  });

  function timeUp() {
    stopTimer();
    if (synth) synth.cancel();
    el.ringFg.style.transition = '';
    el.screens.play.classList.add('timeup');
    el.flash.classList.remove('go'); void el.flash.offsetWidth; el.flash.classList.add('go');
    playTimeUp();
    vibrate([220, 90, 220, 90, 320]);
    clearTimeout(timeupTimer);
    timeupTimer = setTimeout(() => {
      if (current === 'play') goPass();
    }, TIMEUP_PAUSE_MS);
  }

  /* ---------------- game flow ---------------- */

  let readyLockTimer = 0;
  function goPass() {
    clearTimeout(timeupTimer);
    stopTimer();
    el.screens.play.classList.remove('timeup');
    show('pass');
    el.readyBtn.disabled = true;
    clearTimeout(readyLockTimer);
    readyLockTimer = setTimeout(() => { el.readyBtn.disabled = false; }, READY_LOCK_MS);
  }

  function setWord(w) {
    el.word.textContent = w;
    fitWord();
  }

  function fitWord() {
    const box = el.word.parentElement;
    const maxW = box.clientWidth || window.innerWidth - 32;
    const maxH = Math.max(120, window.innerHeight * 0.32);
    let size = Math.min(110, Math.max(40, maxW / 5));
    el.word.style.fontSize = size + 'px';
    // Shrink until the word fits on as few lines as possible without breaking inside a word.
    el.word.style.overflowWrap = 'normal';
    let guard = 40;
    while (guard-- > 0 && size > 26 && (el.word.scrollWidth > maxW + 1 || el.word.scrollHeight > maxH)) {
      size *= 0.92;
      el.word.style.fontSize = size + 'px';
    }
    el.word.style.overflowWrap = '';
  }

  function beginTurn() {
    el.screens.play.classList.remove('timeup');
    const lang = languages.get(settings.lang);
    el.word.setAttribute('lang', (lang && lang.locale) || settings.lang);
    el.skipBtn.hidden = !settings.skip;
    setWord(nextWord());
    show('play');
    startTimer();
  }

  function startGame() {
    if (!languages.has(settings.lang)) return;
    unlockAudio();
    requestWake();
    goPass();
  }

  function goHome() {
    clearTimeout(timeupTimer);
    stopTimer();
    if (synth) synth.cancel();
    el.screens.play.classList.remove('timeup');
    releaseWake();
    show('home');
  }

  /* ---------------- home button: press and hold ---------------- */

  let holdTimer = 0;
  function holdStart(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    el.homeBtn.style.setProperty('--hold', HOLD_MS + 'ms');
    el.homeBtn.classList.add('holding');
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      el.homeBtn.classList.remove('holding');
      vibrate(30);
      goHome();
    }, HOLD_MS);
  }
  function holdEnd() {
    if (!el.homeBtn.classList.contains('holding')) return;
    clearTimeout(holdTimer);
    el.homeBtn.classList.remove('holding');
    // A short tap: wiggle to hint that it needs a longer press.
    el.homeBtn.classList.remove('nudge'); void el.homeBtn.offsetWidth; el.homeBtn.classList.add('nudge');
  }
  el.homeBtn.addEventListener('pointerdown', holdStart);
  el.homeBtn.addEventListener('pointerup', holdEnd);
  el.homeBtn.addEventListener('pointerleave', holdEnd);
  el.homeBtn.addEventListener('pointercancel', holdEnd);
  el.homeBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  // Keyboard / screen reader activation (no pointer involved): go home directly.
  el.homeBtn.addEventListener('click', (e) => { if (e.detail === 0) goHome(); });

  /* ---------------- wire up start screen ---------------- */

  function renderTime(bump) {
    el.timeValue.textContent = String(settings.seconds);
    el.timeMinus.disabled = settings.seconds <= TIME_MIN;
    el.timePlus.disabled = settings.seconds >= TIME_MAX;
    if (bump) { el.timeValue.classList.remove('bump'); void el.timeValue.offsetWidth; el.timeValue.classList.add('bump'); }
  }
  function changeTime(delta) {
    settings.seconds = clampTime(settings.seconds + delta);
    saveSettings();
    renderTime(true);
  }
  function renderSkip() {
    el.skipToggle.setAttribute('aria-checked', String(settings.skip));
  }

  el.timeMinus.addEventListener('click', () => changeTime(-TIME_STEP));
  el.timePlus.addEventListener('click', () => changeTime(TIME_STEP));
  el.skipToggle.addEventListener('click', () => {
    settings.skip = !settings.skip;
    saveSettings();
    renderSkip();
  });
  el.startBtn.addEventListener('click', startGame);

  el.readyBtn.addEventListener('click', () => {
    if (el.readyBtn.disabled) return;
    unlockAudio();
    requestWake();
    playStart();
    beginTurn();
  });
  el.speakBtn.addEventListener('click', () => { unlockAudio(); speak(el.word.textContent); });
  el.skipBtn.addEventListener('click', () => {
    if (!settings.skip || el.screens.play.classList.contains('timeup')) return;
    if (synth) synth.cancel();
    playSkip();
    el.word.classList.add('swap');
    setTimeout(() => {
      setWord(nextWord());
      el.word.classList.remove('swap');
    }, 180);
    startTimer();
  });
  // Tapping the "time is up" screen moves on straight away.
  el.screens.play.addEventListener('click', (e) => {
    if (el.screens.play.classList.contains('timeup') && !e.target.closest('button')) goPass();
  });

  window.addEventListener('resize', () => { if (current === 'play') fitWord(); });

  /* ---------------- boot ---------------- */

  async function init() {
    loadSettings();
    renderTime(false);
    renderSkip();
    show('home');
    await loadLanguages();
    settings.lang = pickDefaultLang();
    renderLangList();
    saveSettings();
  }

  init();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW failed', err));
    });
  }

  // Exposed for automated tests only.
  window.__brainMouth = { settings, languages, decks, nextWord };
})();
