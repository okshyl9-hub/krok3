'use strict';

/* =========================================================
   КРОК 3 Тренажер
   Дані: data/bases.json + data/<база>.json (створює конвертер)
   Прогрес: localStorage, ключ STORE_KEY
   ========================================================= */

const STORE_KEY = 'krok3.progress.v1';
const EXPORT_FORMAT = 'krok3-trainer-progress';

const DB = { version: '', bases: [], byId: {} };
let S = loadState();

const $app = document.getElementById('app');
const $sheetRoot = document.getElementById('sheet-root');
const $toast = document.getElementById('toast');
const $importFile = document.getElementById('import-file');

/* ---------- іконки ---------- */
const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 2.5a1 1 0 0 1 1 1V4h11.2a.8.8 0 0 1 .64 1.28L15.5 8.5l2.34 3.22a.8.8 0 0 1-.64 1.28H6v8.5a1 1 0 1 1-2 0V3.5a1 1 0 0 1 1-1z"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>'
};

/* ---------- допоміжне ---------- */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Текст із файлу: екрануємо все, крім <sup>/<sub>, які створив конвертер
function rich(s) {
  return esc(s || '').replace(/&lt;(\/?)(sup|sub)&gt;/g, '<$1$2>').replace(/\n/g, '<br>');
}
function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
const TESTS = ['тест', 'тести', 'тестів'];
const MISTAKES = ['помилка', 'помилки', 'помилок'];

function rnd(n) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove('show'), 2600);
}

/* ---------- збереження ---------- */
function emptyState() { return { attempts: {}, active: {}, mistakes: {} }; }
function normalize(s) {
  const n = emptyState();
  if (s && typeof s === 'object') {
    if (s.attempts && typeof s.attempts === 'object') n.attempts = s.attempts;
    if (s.active && typeof s.active === 'object') n.active = s.active;
    if (s.mistakes && typeof s.mistakes === 'object') n.mistakes = s.mistakes;
  }
  return n;
}
function loadState() {
  try { return normalize(JSON.parse(localStorage.getItem(STORE_KEY))); } catch (e) { return emptyState(); }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { toast('Не вдалося зберегти прогрес на пристрої'); }
}

/* ---------- дані ---------- */
async function loadData() {
  const idx = await (await fetch('data/bases.json')).json();
  DB.version = idx.version;
  const bases = await Promise.all(idx.bases.map((b) => fetch(b.file).then((r) => {
    if (!r.ok) throw new Error(b.file);
    return r.json();
  })));
  for (const b of bases) {
    b.testById = {};
    for (const t of b.tests) b.testById[t.id] = t;
    b.topicById = {};
    for (const tp of b.topics) b.topicById[tp.id] = tp;
    DB.byId[b.id] = b;
  }
  DB.bases = bases;
}

/* ---------- спроби ---------- */
// kind: 'learn' — звичайні тести, 'mist' — робота над помилками, 'retry' — повтор помилок спроби
function slotKey(baseId, kind, topicId) { return baseId + '|' + kind + '|' + (topicId || '*'); }
function isMistakeMode(a) { return a.kind === 'mist' || a.kind === 'retry'; }

function getActive(key) {
  const id = S.active[key];
  const a = id && S.attempts[id];
  if (!a || a.finished || !DB.byId[a.baseId]) return null;
  return a;
}
function validOrder(a) {
  const b = DB.byId[a.baseId];
  return a.order.filter((id) => b.testById[id]);
}
function attemptStats(a) {
  const b = DB.byId[a.baseId];
  let ok = 0, bad = 0;
  const order = validOrder(a);
  for (const id of order) {
    const ans = a.answers[id];
    if (!ans) continue;
    if (ans === b.testById[id].correct) ok++; else bad++;
  }
  return { total: order.length, answered: ok + bad, ok, bad };
}
function mistakeIds(baseId, topicId) {
  const b = DB.byId[baseId];
  return Object.keys(S.mistakes).filter((id) => {
    const t = b.testById[id];
    return t && (!topicId || t.topic === topicId);
  });
}
function scopeTestIds(baseId, kind, topicId) {
  const b = DB.byId[baseId];
  if (kind === 'mist') return mistakeIds(baseId, topicId);
  return b.tests.filter((t) => !topicId || t.topic === topicId).map((t) => t.id);
}
function scopeTitle(baseId, kind, topicId) {
  const b = DB.byId[baseId];
  const name = topicId ? b.topicById[topicId].title : b.title;
  if (kind === 'mist') return 'Робота над помилками: ' + name;
  if (kind === 'retry') return 'Повтор помилок: ' + name;
  return name;
}

function createAttempt(baseId, kind, topicId, testIds, title) {
  const b = DB.byId[baseId];
  const id = 'a' + Date.now().toString(36) + rnd(1e6).toString(36);
  const order = shuffle(testIds.slice());
  const opt = {};
  for (const tid of order) opt[tid] = shuffle(b.testById[tid].options.map((o) => o.id));
  const a = {
    id, baseId, kind, topicId: topicId || null,
    title: title || scopeTitle(baseId, kind, topicId),
    order, opt, answers: {},
    created: Date.now(), updated: Date.now(), finished: false
  };
  const key = slotKey(baseId, kind, topicId);
  const old = S.active[key];
  if (old && S.attempts[old] && !S.attempts[old].finished) delete S.attempts[old];
  S.attempts[a.id] = a;
  S.active[key] = a.id;
  save();
  return a;
}

function openAttempt(a) { location.hash = '#/run/' + a.id; }

function startScope(baseId, kind, topicId) {
  const key = slotKey(baseId, kind, topicId);
  const cur = getActive(key);
  const startNew = () => {
    const ids = scopeTestIds(baseId, kind, topicId);
    if (!ids.length) { toast(kind === 'mist' ? 'Помилок немає' : 'Тестів немає'); return; }
    openAttempt(createAttempt(baseId, kind, topicId, ids));
  };
  if (!cur) return startNew();
  const st = attemptStats(cur);
  if (st.answered === 0) return startNew();
  openSheet(
    `<h2>${esc(cur.title)}</h2>
     <p class="page-sub">У вас є незавершена спроба: відповіли на ${st.answered} з ${st.total}.</p>
     <div class="actions">
       <button class="btn btn-primary btn-lg btn-block" data-act="continue">Продовжити · ${st.answered} / ${st.total}</button>
       <button class="btn btn-light btn-lg btn-block" data-act="restart">Почати заново</button>
       <button class="btn btn-block" data-act="close">Скасувати</button>
     </div>`,
    (act) => {
      if (act === 'continue') { closeSheet(); openAttempt(cur); }
      if (act === 'restart') { closeSheet(); startNew(); }
    }
  );
}

function answer(a, tid, oid) {
  if (a.finished || a.answers[tid]) return;
  const t = DB.byId[a.baseId].testById[tid];
  if (!t) return;
  a.answers[tid] = oid;
  a.updated = Date.now();
  if (oid !== t.correct) {
    S.mistakes[tid] = { baseId: a.baseId, topicId: t.topic, at: Date.now() };
  } else if (isMistakeMode(a)) {
    delete S.mistakes[tid];
  }
  save();
}

function finishAttempt(a) {
  a.finished = true;
  a.finishedAt = Date.now();
  for (const k of Object.keys(S.active)) if (S.active[k] === a.id) delete S.active[k];
  // зберігаємо лише останню завершену спробу (для перегляду відповідей)
  for (const id of Object.keys(S.attempts)) {
    if (id !== a.id && S.attempts[id].finished) delete S.attempts[id];
  }
  save();
}

/* ---------- маршрути ---------- */
function route() {
  closeSheet();
  const h = location.hash.replace(/^#\/?/, '');
  const [page, id] = h.split('/');
  if (page === 'base' && DB.byId[id]) return renderBase(DB.byId[id]);
  if (page === 'run' && S.attempts[id] && DB.byId[S.attempts[id].baseId]) return renderRun(S.attempts[id]);
  if (h) { history.replaceState(null, '', '#/'); }
  renderBases();
}

function topbar(inner) {
  return `<header class="topbar"><div class="topbar-inner">${inner}</div></header>`;
}
function setView(html, onClick) {
  window.scrollTo(0, 0);
  $app.innerHTML = html;
  $app.onclick = onClick;
}

/* ---------- екран «Бази» ---------- */
function renderBases() {
  document.title = 'КРОК 3 Тренажер';
  const total = DB.bases.reduce((s, b) => s + b.tests.length, 0);
  const cards = DB.bases.map((b) => {
    const m = mistakeIds(b.id).length;
    const anyActive = Object.keys(S.active).some((k) => k.startsWith(b.id + '|') && getActive(k));
    const meta = [];
    if (anyActive) meta.push(`<span class="chip chip-progress">Є незавершена спроба</span>`);
    if (m) meta.push(`<span class="chip chip-mistakes">${ICON.flag}${m} ${plural(m, MISTAKES)}</span>`);
    return `<button class="row-card" data-base="${esc(b.id)}">
      <div class="row-main">
        <div class="row-title">${esc(b.title)}</div>
        ${meta.length ? `<div class="row-meta">${meta.join('')}</div>` : ''}
      </div>
      <span class="row-count">${b.tests.length}</span>${ICON.chev}
    </button>`;
  }).join('');

  const offline = navigator.serviceWorker && navigator.serviceWorker.controller ? ' · працює без інтернету ✓' : '';
  setView(
    `<div class="wrap" style="padding-top:calc(12px + var(--safe-t))">
      <h1 class="page-title">Бази</h1>
      <p class="page-sub">КРОК 3 · ${total} ${plural(total, TESTS)}</p>
      <div class="list">${cards}</div>

      <div class="section-label">Резервна копія прогресу</div>
      <div class="card backup">
        <p>Збережіть прогрес у файл, щоб не втратити його під час видалення застосунку або перенести на інший пристрій.</p>
        <div class="btns">
          <button class="btn btn-light" data-act="export">Експорт</button>
          <button class="btn btn-light" data-act="import">Імпорт</button>
        </div>
      </div>
      <div class="version">Версія ${esc(DB.version)}${offline}</div>
    </div>`,
    (e) => {
      const card = e.target.closest('[data-base]');
      if (card) { location.hash = '#/base/' + card.dataset.base; return; }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'export') exportProgress();
      if (act.dataset.act === 'import') { $importFile.value = ''; $importFile.click(); }
    }
  );
}

/* ---------- сторінка бази ---------- */
function renderBase(b) {
  document.title = b.title + ' · КРОК 3';
  const allActive = getActive(slotKey(b.id, 'learn'));
  const allSt = allActive && attemptStats(allActive);
  const baseMist = mistakeIds(b.id).length;
  const mistActive = getActive(slotKey(b.id, 'mist'));
  const retryActive = getActive(slotKey(b.id, 'retry'));

  const pct = (st) => st.total ? Math.round(st.answered / st.total * 100) : 0;

  let hero = `<div class="card hero">
    <div class="hero-line"><span class="hero-title">Усі тести бази</span><span class="row-count">${b.tests.length}</span></div>`;
  if (allSt) {
    hero += `<div class="mini-progress"><i style="width:${pct(allSt)}%"></i></div>
      <button class="btn btn-primary btn-lg btn-block" data-start="learn">Продовжити · ${allSt.answered} / ${allSt.total}</button>`;
  } else {
    hero += `<button class="btn btn-primary btn-lg btn-block" data-start="learn">Пройти всі тести</button>`;
  }
  if (baseMist || mistActive) {
    const ms = mistActive && attemptStats(mistActive);
    hero += `<button class="btn btn-danger-soft btn-lg btn-block" data-start="mist">${ICON.flag.replace('<svg', '<svg width="20" height="20"')}
      Робота над помилками · ${baseMist}${ms ? ` <small>(продовжити ${ms.answered} / ${ms.total})</small>` : ''}</button>`;
  }
  if (retryActive) {
    const rs = attemptStats(retryActive);
    hero += `<button class="btn btn-light btn-block" data-open="${retryActive.id}">Продовжити повтор помилок · ${rs.answered} / ${rs.total}</button>`;
  }
  hero += `</div>`;

  const rows = b.topics.map((tp) => {
    const act = getActive(slotKey(b.id, 'learn', tp.id));
    const st = act && attemptStats(act);
    const m = mistakeIds(b.id, tp.id).length;
    const mAct = getActive(slotKey(b.id, 'mist', tp.id));
    const meta = [];
    if (st) meta.push(`<span class="chip chip-progress">Продовжити ${st.answered} / ${st.total}</span>`);
    if (m || mAct) meta.push(`<button class="chip chip-mistakes" data-mist="${esc(tp.id)}">${ICON.flag}Робота над помилками · ${m}</button>`);
    return `<div class="row-card" role="button" tabindex="0" data-topic="${esc(tp.id)}">
      <div class="row-main">
        <div class="row-title">${esc(tp.title)}</div>
        ${meta.length ? `<div class="row-meta">${meta.join('')}</div>` : ''}
      </div>
      <span class="row-count">${tp.count}</span>${ICON.chev}
    </div>`;
  }).join('');

  setView(
    topbar(`<div class="bar-row">
        <button class="btn btn-back" data-act="back">${ICON.back}Бази</button>
      </div>`) +
    `<div class="wrap">
      <h1 class="page-title">${esc(b.title)}</h1>
      <p class="page-sub">${b.tests.length} ${plural(b.tests.length, TESTS)} · ${b.topics.length} підтем</p>
      ${hero}
      <div class="section-label">Підтеми</div>
      <div class="list">${rows}</div>
    </div>`,
    (e) => {
      const t = e.target;
      if (t.closest('[data-act="back"]')) { location.hash = '#/'; return; }
      const s = t.closest('[data-start]');
      if (s) { startScope(b.id, s.dataset.start); return; }
      const o = t.closest('[data-open]');
      if (o) { openAttempt(S.attempts[o.dataset.open]); return; }
      const m = t.closest('[data-mist]');
      if (m) { startScope(b.id, 'mist', m.dataset.mist); return; }
      const tp = t.closest('[data-topic]');
      if (tp) startScope(b.id, 'learn', tp.dataset.topic);
    }
  );
}

/* ---------- екран проходження (буклет) ---------- */
function renderRun(a) {
  const b = DB.byId[a.baseId];
  const order = validOrder(a);
  document.title = a.title + ' · КРОК 3';
  const letters = 'ABCDEFGH';

  const cardHtml = (tid, i) => {
    const t = b.testById[tid];
    const ans = a.answers[tid];
    const optIds = (a.opt[tid] || []).filter((id) => t.options.some((o) => o.id === id));
    // якщо варіанти в базі змінилися — доповнюємо
    for (const o of t.options) if (!optIds.includes(o.id)) optIds.push(o.id);
    const opts = optIds.map((oid, k) => {
      const o = t.options.find((x) => x.id === oid);
      let cls = 'opt', mark = '';
      if (ans) {
        if (oid === t.correct) { cls += ' correct'; mark = ICON.check; }
        else if (oid === ans) { cls += ' wrong'; mark = ICON.flag; }
      }
      return `<button class="${cls}" data-opt="${esc(oid)}" ${ans || a.finished ? 'disabled' : ''}>
        <span class="opt-letter">${letters[k]}</span>
        <span class="opt-text">${rich(o.text)}</span>
        <span class="opt-mark">${mark}</span>
      </button>`;
    }).join('');
    const more = t.warning
      ? `<button class="q-more has-warn" data-more="${esc(tid)}" aria-label="Пояснення і джерела"><span class="warn-ico">⚠</span>${ICON.dots}</button>`
      : `<button class="q-more" data-more="${esc(tid)}" aria-label="Джерела">${ICON.dots}</button>`;
    return `<article class="card q-card${ans ? ' answered' : ''}" id="q-${esc(tid)}" data-tid="${esc(tid)}">
      <div class="q-head"><span class="q-num">${i + 1} / ${order.length}</span>${more}</div>
      <p class="q-text">${rich(t.question)}</p>
      <div class="opts">${opts}</div>
    </article>`;
  };

  const segs = order.map((tid) => {
    const ans = a.answers[tid];
    const c = !ans ? '' : (ans === b.testById[tid].correct ? 'ok' : 'bad');
    return `<i class="${c}"></i>`;
  }).join('');

  const finishBtn = a.finished
    ? `<button class="btn btn-finish" data-act="result">Результат</button>`
    : `<button class="btn btn-finish" data-act="finish">Завершити</button>`;

  setView(
    topbar(`<div class="bar-row">
        <button class="btn btn-back" data-act="back">${ICON.back}Назад</button>
        <div class="bar-title">${esc(a.title)}</div>
        ${finishBtn}
      </div>
      <div class="run-stats">
        <span class="answered" data-s="answered"></span>
        <span class="ok">${ICON.check}<b data-s="ok"></b></span>
        <span class="bad">${ICON.flag}<b data-s="bad"></b></span>
        <span class="pct" data-s="pct"></span>
      </div>
      <div class="segbar${order.length > 60 ? ' dense' : ''}">${segs}</div>`) +
    `<div class="wrap">
      <div class="q-list">${order.map(cardHtml).join('')}</div>
      <div class="finish-bottom">${a.finished
        ? `<button class="btn btn-primary btn-lg btn-block" data-act="result">Показати результат</button>`
        : `<button class="btn btn-primary btn-lg btn-block" data-act="finish">Завершити</button>`}</div>
    </div>`,
    (e) => {
      const t = e.target;
      if (t.closest('[data-act="back"]')) { location.hash = '#/base/' + a.baseId; return; }
      if (t.closest('[data-act="finish"]')) { askFinish(a); return; }
      if (t.closest('[data-act="result"]')) { showResult(a); return; }
      const more = t.closest('[data-more]');
      if (more) { showInfo(b.testById[more.dataset.more]); return; }
      const opt = t.closest('[data-opt]');
      if (opt && !opt.disabled) {
        const card = opt.closest('[data-tid]');
        const tid = card.dataset.tid;
        answer(a, tid, opt.dataset.opt);
        const idx = order.indexOf(tid);
        card.outerHTML = cardHtml(tid, idx);
        const seg = $app.querySelectorAll('.segbar > i')[idx];
        if (seg) seg.className = a.answers[tid] === b.testById[tid].correct ? 'ok' : 'bad';
        updateRunStats(a);
      }
    }
  );
  updateRunStats(a);
  setHeaderVar();

  // продовження: показуємо перше питання без відповіді
  const firstOpen = order.find((tid) => !a.answers[tid]);
  if (!a.finished && firstOpen && Object.keys(a.answers).length) {
    requestAnimationFrame(() => {
      const el = document.getElementById('q-' + firstOpen);
      if (el) el.scrollIntoView({ block: 'start' });
    });
  }
}

function updateRunStats(a) {
  const st = attemptStats(a);
  const set = (k, v) => { const el = $app.querySelector(`[data-s="${k}"]`); if (el) el.textContent = v; };
  set('answered', `${st.answered} / ${st.total}`);
  set('ok', st.ok);
  set('bad', st.bad);
  set('pct', st.answered ? Math.round(st.ok / st.answered * 100) + '%' : '0%');
}

function setHeaderVar() {
  const bar = $app.querySelector('.topbar');
  if (bar) document.documentElement.style.setProperty('--hdr', bar.offsetHeight + 'px');
}

function askFinish(a) {
  const st = attemptStats(a);
  const left = st.total - st.answered;
  if (left === 0) { finishAttempt(a); renderRun(a); showResult(a); return; }
  openSheet(
    `<h2>Завершити спробу?</h2>
     <p class="page-sub">Без відповіді залишилось ${left} ${plural(left, TESTS)} з ${st.total}. Вони не рахуються як помилки.</p>
     <div class="actions">
       <button class="btn btn-primary btn-lg btn-block" data-act="yes">Завершити</button>
       <button class="btn btn-block" data-act="close">Продовжити тест</button>
     </div>`,
    (act) => {
      if (act === 'yes') { closeSheet(); finishAttempt(a); renderRun(a); showResult(a); }
    }
  );
}

function showResult(a) {
  const b = DB.byId[a.baseId];
  const st = attemptStats(a);
  const pct = st.answered ? Math.round(st.ok / st.answered * 100) : 0;
  const wrongIds = validOrder(a).filter((id) => a.answers[id] && a.answers[id] !== b.testById[id].correct);
  const left = st.total - st.answered;
  openSheet(
    `<h2>Результат</h2>
     <div class="result-pct" style="color:${pct >= 70 ? 'var(--green)' : pct >= 50 ? 'var(--warn)' : 'var(--red)'}">${pct}%</div>
     <div class="result-sub">${esc(a.title)}</div>
     <div class="result-grid">
       <div class="result-cell ok"><b>${st.ok}</b>правильно</div>
       <div class="result-cell bad"><b>${st.bad}</b>неправильно</div>
       ${left ? `<div class="result-cell"><b>${left}</b>без відповіді</div>` : ''}
     </div>
     <div class="actions">
       ${wrongIds.length ? `<button class="btn btn-danger-soft btn-lg btn-block" data-act="retry">${ICON.flag.replace('<svg', '<svg width="20" height="20"')}Пройти помилки цієї спроби · ${wrongIds.length}</button>` : ''}
       <button class="btn btn-light btn-lg btn-block" data-act="review">Переглянути відповіді</button>
       <button class="btn btn-block" data-act="base">До бази</button>
     </div>`,
    (act) => {
      if (act === 'retry') {
        closeSheet();
        const title = 'Повтор помилок: ' + a.title.replace(/^(Повтор помилок|Робота над помилками): /, '');
        openAttempt(createAttempt(a.baseId, 'retry', null, wrongIds, title));
      }
      if (act === 'review') { closeSheet(); window.scrollTo(0, 0); }
      if (act === 'base') { closeSheet(); location.hash = '#/base/' + a.baseId; }
    }
  );
}

function showInfo(t) {
  const src = (t.sources || []).map((s) => `<li>${esc(s)}</li>`).join('') || '<li>Не вказано</li>';
  openSheet(
    `<h2>Інформація про тест</h2>
     ${t.warning ? `<h3>Пояснення</h3><div class="warn-box">${rich(t.warning)}</div>` : ''}
     <h3>Буклети</h3>
     <ul class="src-list">${src}</ul>
     <div class="actions"><button class="btn btn-block" data-act="close">Закрити</button></div>`
  );
}

/* ---------- нижнє вікно ---------- */
function openSheet(html, onAction) {
  $sheetRoot.innerHTML = `<div class="overlay"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;
  const overlay = $sheetRoot.firstElementChild;
  overlay.onclick = (e) => {
    if (e.target === overlay) { closeSheet(); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'close') { closeSheet(); return; }
    if (onAction) onAction(btn.dataset.act);
  };
}
function closeSheet() {
  $sheetRoot.innerHTML = '';
}

/* ---------- експорт / імпорт ---------- */
async function exportProgress() {
  const d = new Date();
  const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const name = `krok3-progres-${stamp}.json`;
  const payload = { format: EXPORT_FORMAT, formatVersion: 1, exportedAt: d.toISOString(), dataVersion: DB.version, state: S };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Прогрес КРОК 3' });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Файл прогресу збережено');
}

$importFile.addEventListener('change', async () => {
  const f = $importFile.files && $importFile.files[0];
  if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); } catch (e) { toast('Це не файл прогресу'); return; }
  if (!data || data.format !== EXPORT_FORMAT || !data.state) { toast('Це не файл прогресу КРОК 3'); return; }
  const st = normalize(data.state);
  const nm = Object.keys(st.mistakes).length;
  const na = Object.values(st.attempts).filter((a) => a && !a.finished).length;
  openSheet(
    `<h2>Імпорт прогресу</h2>
     <p class="page-sub">У файлі: помилок — ${nm}, незавершених спроб — ${na}. Прогрес на цьому пристрої буде замінено даними з файлу.</p>
     <div class="actions">
       <button class="btn btn-primary btn-lg btn-block" data-act="yes">Замінити прогрес</button>
       <button class="btn btn-block" data-act="close">Скасувати</button>
     </div>`,
    (act) => {
      if (act !== 'yes') return;
      S = st;
      save();
      closeSheet();
      route();
      toast('Прогрес імпортовано');
    }
  );
});

/* ---------- запуск ---------- */
window.addEventListener('hashchange', route);
window.addEventListener('resize', setHeaderVar);
window.addEventListener('scroll', () => {
  const bar = $app.querySelector('.topbar');
  if (bar) bar.classList.toggle('scrolled', window.scrollY > 4);
}, { passive: true });

if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    reloading = true;
    try { sessionStorage.setItem('krok3.updated', '1'); } catch (e) { /* ignore */ }
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
  });
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

loadData().then(() => {
  route();
  try {
    if (sessionStorage.getItem('krok3.updated')) {
      sessionStorage.removeItem('krok3.updated');
      toast('Застосунок оновлено');
    }
  } catch (e) { /* ignore */ }
}).catch(() => {
  $app.innerHTML = '<div class="error-box">Не вдалося завантажити тести.<br>Відкрийте застосунок один раз з інтернетом.</div>';
});
