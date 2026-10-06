// WeightTrack — main app: screens, forms and actions.
import {
  STORAGE_KEY, APP_VERSION, MIN_KG, MAX_KG,
  loadState, saveState, normalise, askForPersistentStorage, sampleState, storageWorks,
  emptyState, snapshot, stampChanges,
  uid, esc, round1, round2, sanitizeNumber, parseNumber,
  todayISO, nowTime, fromISO, addDays, daysBetween, monthOf, addMonths, weekStart,
  sortedEntries, dailySeries, movingAverage, valueOnOrBefore, bmiOf, bmiBand, healthyRange,
} from './store.js';
import { lineChart, changeChart, chartTable } from './charts.js';
import { createSync, newKeyURL, parseRepo, siteOwner, DEFAULT_REPO } from './sync.js';

let state = loadState();
// What was last saved — used to work out exactly what changed (for GitHub sync).
let lastSnapshot = snapshot(state);

const ui = {
  range: '3m',
  tableView: { weight: false, weekly: false, monthly: false },
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ICON = {
  plus: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  chevron: '<svg class="ic chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  alert: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.01"/></svg>',
  info: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/></svg>',
  calendar: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  check: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  clock: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  trash: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/></svg>',
  down: '<svg class="ic arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  up: '<svg class="ic arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  cloud: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.4 9.1 4.5 4.5 0 0 0 7 18z"/></svg>',
  cloudOff: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10.5a4 4 0 0 0 1.6-.33M20.9 14.5a4 4 0 0 0-2.8-4.46A6 6 0 0 0 9 5.6M6.4 9.1A4.5 4.5 0 0 0 7 18"/><path d="m3 3 18 18"/></svg>',
  sync: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/></svg>',
};

// ---------- Number & date formatting ----------

const nfKg = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 77.4 kg (keeps a second decimal if you typed one). */
const kg = (v) => `${nfKg.format(v)} kg`;
/** 0.45 kg — for small amounts like per day / per week. */
const kgSmall = (v) => `${(Math.abs(v) < 1 ? nf2 : nf1).format(v)} kg`;
/** +0.4 kg / −1.2 kg / 0.0 kg */
function signedKg(v) {
  const r = Math.round(v * 10) / 10;
  if (r === 0) return '0.0 kg';
  return `${r > 0 ? '+' : '−'}${nf1.format(Math.abs(r))} kg`;
}
const axisKg = (v) => nf1.format(v).replace(/\.0$/, '');
const axisSigned = (v) => (v > 0 ? `+${axisKg(v)}` : v < 0 ? `−${axisKg(-v)}` : '0');

const fmtDate = (iso, opts) => fromISO(iso).toLocaleDateString(undefined, opts);
const shortDate = (iso) => fmtDate(iso, { day: 'numeric', month: 'short' });
const longDate = (iso) => fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });
function dayTitle(iso) {
  const t = todayISO();
  if (iso === t) return 'Today';
  if (iso === addDays(t, -1)) return 'Yesterday';
  return fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });
}
const monthName = (ym, style = 'short') => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1)
  .toLocaleDateString(undefined, style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short' });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- Data helpers ----------

const series = () => dailySeries(state.entries);
const latestEntry = () => sortedEntries(state.entries)[0] || null;

/** Everything the target card needs. */
function targetProgress() {
  const T = state.settings.target;
  if (!T) return null;
  const t = todayISO();
  const last = latestEntry();
  const current = last ? last.kg : T.startKg;
  const dir = T.kg < T.startKg ? -1 : T.kg > T.startKg ? 1 : 0; // -1 = lose weight, 1 = gain
  const totalChange = T.kg - T.startKg;
  const doneChange = current - T.startKg;
  const pct = totalChange === 0 ? 1 : clamp(doneChange / totalChange, 0, 1);
  const reached = dir < 0 ? current <= T.kg : dir > 0 ? current >= T.kg : true;
  const toGo = reached ? 0 : Math.abs(T.kg - current);
  const daysLeft = daysBetween(t, T.date);
  // Per week = weight still to go ÷ weeks left (today counts) — updates every time you weigh in.
  const daysToGo = Math.max(0, daysLeft + 1);
  const weeksLeft = daysToGo / 7;
  const perWeek = daysToGo >= 7 ? toGo / weeksLeft : toGo;
  const totalDays = Math.max(1, daysBetween(T.startDate, T.date));
  const elapsed = clamp(daysBetween(T.startDate, t), 0, totalDays);
  const expected = T.startKg + totalChange * (elapsed / totalDays);
  const behindBy = dir < 0 ? current - expected : expected - current;
  const verb = dir > 0 ? 'gain' : 'lose';
  let status;
  if (reached) status = { level: 'good', icon: ICON.check, text: 'Target reached — well done!' };
  else if (daysLeft < 0) status = { level: 'overdue', icon: ICON.alert, text: `Target date passed ${-daysLeft} day${daysLeft === -1 ? '' : 's'} ago` };
  else if (!last) status = { level: 'behind', icon: ICON.info, text: 'Add a weigh-in to see how you’re doing' };
  else if (behindBy <= 0.05) status = { level: 'good', icon: ICON.check, text: 'On track' };
  else status = { level: 'behind', icon: ICON.clock, text: `Behind plan by ${kgSmall(behindBy)}` };
  // A gentle nudge if the plan needs more than about 1 kg a week.
  const fast = !reached && daysLeft >= 0 && perWeek > 1;
  let when;
  if (reached) when = longDate(T.date);
  else if (daysLeft > 1) when = `${daysLeft} days left`;
  else if (daysLeft === 1) when = '1 day left';
  else if (daysLeft === 0) when = 'Due today';
  else when = 'Date passed';
  return {
    T, current, dir, verb, totalChange, doneChange, pct, reached, toGo, daysLeft, daysToGo, weeksLeft, perWeek, status, fast, when, hasData: Boolean(last),
  };
}

/** "13 weeks", "12.4 weeks", "1 week". */
function weeksText(w) {
  const r = Math.round(w * 10) / 10;
  const n = Number.isInteger(r) ? String(r) : r.toFixed(1);
  return `${n} week${r === 1 ? '' : 's'}`;
}

/**
 * This week's target (Monday to Sunday).
 * Following your target, it's worked out on Monday: weight still to go then ÷ weeks left then — so it stays the
 * same all week. Your starting weight for the week is your last weigh-in before Monday.
 */
function weekPlan() {
  const wt = state.settings.weeklyTarget;
  if (wt.mode === 'off') return null;
  const t = todayISO();
  const wk = weekStart(t);
  const we = addDays(wk, 6);
  const dayIndex = daysBetween(wk, t);
  const daysLeft = 7 - dayIndex;
  const s = series();
  const before = valueOnOrBefore(s, addDays(wk, -1));
  const firstThisWeek = s.find((p) => p.date >= wk && p.date <= we);
  const startKg = before ? before.kg : firstThisWeek ? firstThisWeek.kg : null;
  if (startKg == null) return { empty: true, reason: 'no-weighins', mode: wt.mode };
  const T = state.settings.target;
  let change;
  let basis = null;
  if (wt.mode === 'fixed') {
    change = wt.direction === 'gain' ? wt.kg : -wt.kg;
  } else {
    if (!T) return { empty: true, reason: 'no-target', mode: wt.mode };
    const remStart = T.kg - startKg;
    const dirT = Math.sign(T.kg - T.startKg) || Math.sign(remStart) || -1;
    const done = dirT < 0 ? startKg <= T.kg : startKg >= T.kg;
    const daysFromMonday = daysBetween(wk, T.date) + 1;
    change = done ? 0 : daysFromMonday <= 7 ? remStart : (remStart * 7) / daysFromMonday;
    basis = { remStart: Math.abs(remStart), weeks: Math.max(0, daysFromMonday) / 7, done, dir: dirT };
  }
  change = round2(change);
  const dir = change < 0 ? -1 : change > 0 ? 1 : (basis ? basis.dir : -1);
  const goalKg = round2(startKg + change);
  const thisWeek = sortedEntries(state.entries).find((e) => e.date >= wk && e.date <= we);
  const current = thisWeek ? thisWeek.kg : null;
  const progress = current == null ? 0 : dir < 0 ? startKg - current : current - startKg; // in the right direction
  const pct = change === 0 ? 1 : clamp(progress / Math.abs(change), 0, 1);
  const reached = change === 0 || (current != null && (dir < 0 ? current <= goalKg : current >= goalKg));
  const toGo = reached ? 0 : Math.abs(goalKg - (current ?? startKg));
  const perDay = toGo / daysLeft;
  const expected = startKg + (change * dayIndex) / 7;
  const behind = current == null ? 0 : dir < 0 ? current - expected : expected - current;
  const verb = dir > 0 ? 'gain' : 'lose';
  let status;
  if (basis && basis.done) status = { level: 'good', icon: ICON.check, text: 'Your target is already reached' };
  else if (reached) status = { level: 'good', icon: ICON.check, text: 'Week target reached — well done!' };
  else if (current == null) status = { level: 'behind', icon: ICON.info, text: 'No weigh-in yet this week — step on the scale' };
  else if (behind <= 0.05) status = { level: 'good', icon: ICON.check, text: 'On track this week' };
  else status = { level: 'behind', icon: ICON.clock, text: `Behind this week by ${kgSmall(behind)}` };
  return {
    mode: wt.mode, wk, we, dayIndex, daysLeft, startKg, change, goalKg, current, progress, pct, reached, toGo, perDay, status, basis, verb, dir,
  };
}

// ---------- Save + re-render ----------

function commit(message) {
  stampChanges(lastSnapshot, state);
  const ok = saveState(state);
  lastSnapshot = snapshot(state);
  render();
  if (!ok) toast("Couldn't save — this browser is blocking storage");
  else if (message) toast(message);
  askForPersistentStorage();
  sync.soon();
}

/** Data merged from GitHub (or another tab) replaces what's on screen. */
let renderWhenSheetCloses = false;
function applyState(next) {
  const before = state.settings;
  state = next;
  saveState(state);
  lastSnapshot = snapshot(state);
  if (before.theme !== state.settings.theme) applyTheme();
  if (sheet.open) renderWhenSheetCloses = true;
  else render();
}

// ---------- GitHub sync ----------

const SYNC_PROBLEMS = ['auth', 'access', 'missing', 'public', 'newer', 'other'];
let shownSyncKind = null;

const sync = createSync({
  getState: () => state,
  applyState,
  onStatus: (st) => {
    const shownBefore = shownSyncKind;
    updateSyncBits();
    const problem = (k) => SYNC_PROBLEMS.includes(k) || k === 'off';
    const tab = currentTab();
    const typing = document.activeElement && document.activeElement.matches && document.activeElement.matches('input, select, textarea');
    if (problem(st.kind) !== problem(shownBefore) && (tab === 'today' || tab === 'settings') && !sheet.open && !typing) render();
  },
});

function timeAgo(ms) {
  const sec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function syncStatusHTML() {
  const st = sync.status;
  if (!sync.isOn()) return `${ICON.cloudOff}<span>Not backed up to GitHub yet</span>`;
  if (st.kind === 'syncing') return `${ICON.sync}<span>Saving to GitHub…</span>`;
  if (st.kind === 'ok') return `${ICON.check}<span>Saved to GitHub${st.lastSyncAt ? ` · ${esc(timeAgo(st.lastSyncAt))}` : ''}</span>`;
  if (st.kind === 'offline') return `${ICON.cloudOff}<span>Offline — saved on this device, will upload later</span>`;
  return `${ICON.alert}<span>Sync stopped — tap to fix</span>`;
}

function syncStatusClass() {
  const k = sync.status.kind;
  if (!sync.isOn()) return 'off';
  if (k === 'ok') return 'ok';
  if (k === 'syncing') return 'busy';
  if (k === 'offline') return 'offline';
  return 'problem';
}

function updateSyncBits() {
  shownSyncKind = sync.isOn() ? sync.status.kind : 'off';
  $$('[data-sync-status]').forEach((el) => {
    el.innerHTML = syncStatusHTML();
    el.className = `sync-line ${syncStatusClass()}`;
  });
  const detail = $('#syncDetail');
  if (detail) detail.textContent = syncDetailText();
}

function syncDetailText() {
  const st = sync.status;
  if (st.kind === 'syncing') return 'Saving…';
  if (st.kind === 'ok') return st.lastSyncAt ? `Saved ${timeAgo(st.lastSyncAt)}` : 'On';
  if (st.kind === 'offline') return 'Waiting for internet';
  return 'Stopped';
}

const syncLater = { until: 0 };
try { syncLater.until = Number(localStorage.getItem('weighttrack.syncLater')) || 0; } catch { /* ignore */ }

let toastTimer;
function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

function applyTheme() {
  const theme = state.settings.theme;
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  else document.documentElement.removeAttribute('data-theme');
}

// ---------- Navigation (with a Back button) ----------

const TABS = ['today', 'history', 'progress', 'settings'];
const TAB_NAMES = { today: 'Today', history: 'History', progress: 'Progress', settings: 'Settings' };
const currentTab = () => {
  const h = location.hash.replace('#', '');
  return TABS.includes(h) ? h : 'today';
};

function navigate(tab) {
  if (!TABS.includes(tab) || tab === currentTab()) return;
  const depth = (history.state && history.state.depth) || 0;
  history.pushState({ depth: depth + 1, from: currentTab() }, '', `#${tab}`);
  render();
  window.scrollTo(0, 0);
}

function goBack() {
  if (history.state && history.state.depth > 0) history.back();
  else navigate('today');
}

function backButton() {
  if (currentTab() === 'today') return '';
  const st = history.state;
  const label = st && st.depth > 0 ? TAB_NAMES[st.from] || 'Back' : 'Today';
  return `<button type="button" class="back-btn" data-action="back">${ICON.back}<span>${esc(label)}</span></button>`;
}

function render() {
  const tab = currentTab();
  $$('.tabbar a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const view = $('#view');
  if (tab === 'today') renderToday(view);
  else if (tab === 'history') renderHistory(view);
  else if (tab === 'progress') renderProgress(view);
  else renderSettings(view);
  $('#backSlot').innerHTML = backButton();
  updateSyncBits();
  animateBars();
  if (sheet.open && sheetStack.length) showTopSheet();
}

function setHeader(title, eyebrow = '', actionHTML = '') {
  $('#title').textContent = title;
  const eb = $('#eyebrow');
  eb.textContent = eyebrow;
  eb.hidden = !eyebrow;
  $('#headerAction').innerHTML = actionHTML;
  document.title = title === 'Today' ? 'WeightTrack' : `${title} · WeightTrack`;
}

const addButton = () => '<button class="icon-btn primary" data-action="add-entry" aria-label="Add weigh-in">' + ICON.plus + '</button>';

// ---------- Shared bits of markup ----------

function textTile(label, value, color = '', big = false) {
  return `<div class="tile${big ? ' big' : ''}">
    <div class="tile-label">${color ? `<span class="dot" style="background:${color}"></span>` : ''}${esc(label)}</div>
    <div class="tile-value">${esc(value)}</div>
  </div>`;
}

function deltaTile(label, value) {
  if (value == null) return textTile(label, '—');
  const r = Math.round(value * 10) / 10;
  const cls = r < 0 ? 'down' : r > 0 ? 'up' : '';
  const arrow = r < 0 ? ICON.down : r > 0 ? ICON.up : '';
  return `<div class="tile">
    <div class="tile-label">${esc(label)}</div>
    <div class="tile-value"><span class="delta ${cls}">${arrow}${esc(signedKg(value))}</span></div>
  </div>`;
}

function cardHead(title, actionLabel = '', action = '', arg = '') {
  return `<div class="card-head"><h2>${esc(title)}</h2>${
    actionLabel ? `<button class="link-btn" data-action="${action}" data-arg="${esc(arg)}">${esc(actionLabel)}</button>` : ''
  }</div>`;
}

function seg(name, options, current, label) {
  return `<div class="seg" role="group" aria-label="${esc(label)}">${options
    .map(([value, text]) => `<button type="button" data-action="seg" data-name="${name}" data-value="${value}" aria-pressed="${value === current}">${esc(text)}</button>`)
    .join('')}</div>`;
}

function formSeg(name, options, current, label) {
  return `<div class="seg" role="group" aria-label="${esc(label)}" data-seg="${name}">${options
    .map(([value, text]) => `<button type="button" data-value="${value}" aria-pressed="${value === current}">${esc(text)}</button>`)
    .join('')}</div>`;
}

function storageNotice() {
  if (storageWorks) return '';
  return `<div class="notice" role="alert"><strong>This browser isn't saving your data.</strong> Private browsing or blocked website data can cause this. Open WeightTrack in a normal Safari or Chrome window.</div>`;
}

// Progress bars grow from where they were to the new value (the "loading" feel).
const lastBarWidth = new Map();
function animateBars() {
  const bars = $$('[data-fill]');
  if (!bars.length) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const el of bars) {
      el.style.width = el.dataset.fill;
      lastBarWidth.set(el.dataset.key, el.dataset.fill);
    }
  }));
}

function progressBar(pct, key, label) {
  const width = `${(pct * 100).toFixed(1)}%`;
  const from = lastBarWidth.get(key) || '0%';
  return `<div class="goal-progress">
      <div class="goal-bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct * 100)}">
        <span data-fill="${width}" data-key="${esc(key)}" style="width:${from}"></span>
      </div>
      <span class="goal-pct">${Math.floor(pct * 100)}%</span>
    </div>`;
}

// ---------- Today ----------

function targetCard() {
  const p = targetProgress();
  if (!p) {
    return `<section class="card goal-card" aria-label="Target weight">
      <div class="goal-empty">
        <span class="emoji-badge saved" aria-hidden="true">🎯</span>
        <span><strong>Set a target weight</strong><small>Choose the weight you're aiming for and a date, then watch the bar fill up as you go.</small></span>
      </div>
      <button class="btn btn-saved" data-action="edit-target">${ICON.plus}Set a target</button>
    </section>`;
  }
  const { T } = p;
  const done = Math.max(0, p.dir < 0 ? -p.doneChange : p.doneChange);
  const total = Math.abs(p.totalChange);
  const past = p.dir < 0 ? 'Lost' : 'Gained';
  const math = p.reached || p.daysLeft < 0 ? ''
    : p.daysToGo >= 7
      ? `${kgSmall(p.toGo)} still to ${p.verb} ÷ ${weeksText(p.weeksLeft)} left — updates every time you weigh in`
      : `${kgSmall(p.toGo)} still to ${p.verb} in the last ${p.daysToGo} day${p.daysToGo === 1 ? '' : 's'}`;
  return `<section class="card goal-card" aria-label="Target weight">
    <div class="card-head"><h2>🎯 Target ${esc(kg(T.kg))}</h2><button class="link-btn" data-action="edit-target">Edit</button></div>
    <div class="goal-amounts"><span class="goal-saved">${esc(kg(p.current))}</span><span class="muted">${p.hasData ? 'now' : 'at the start'}</span></div>
    <p class="muted small" style="margin-top:2px">${esc(past)} ${esc(kg(round2(done)))} of ${esc(kg(round2(total)))} since ${esc(shortDate(T.startDate))} (started at ${esc(kg(T.startKg))})</p>
    ${progressBar(p.pct, 'target', 'Progress to your target weight')}
    <div class="goal-facts">
      ${p.reached ? textTile('Target', kg(T.kg)) : textTile(`Still to ${p.verb}`, kgSmall(p.toGo))}
      ${textTile(`By ${shortDate(T.date)}`, p.when)}
      ${p.reached || p.daysLeft < 0 ? '' : textTile('Per week', kgSmall(p.perWeek))}
    </div>
    ${math ? `<p class="goal-math">${esc(math)}</p>` : ''}
    ${p.fast ? `<p class="goal-status warning">${ICON.info}That's more than 1 kg a week — a later date may be easier to keep up.</p>` : ''}
    <p class="goal-status ${p.status.level}">${p.status.icon}${esc(p.status.text)}</p>
  </section>`;
}

/** 2nd panel: this week's target, laid out like the target card. */
function weeklyCard() {
  const w = weekPlan();
  if (!w) return '';
  if (w.empty) {
    const text = w.reason === 'no-weighins'
      ? 'Add your first weigh-in and your weekly target is worked out for you.'
      : 'Set a target weight above and your weekly target is worked out for you — or choose your own amount.';
    return `<section class="card goal-card" aria-label="Weekly target">
      <div class="goal-empty">
        <span class="emoji-badge" aria-hidden="true">📅</span>
        <span><strong>This week's target</strong><small>${esc(text)}</small></span>
      </div>
      <button class="btn btn-secondary" data-action="edit-week">${ICON.calendar}Weekly target settings</button>
    </section>`;
  }
  const range = `${fmtDate(w.wk, { weekday: 'short', day: 'numeric', month: 'short' })} – ${fmtDate(w.we, { weekday: 'short', day: 'numeric', month: 'short' })}`;
  const daysText = w.daysLeft === 1 ? 'Today only' : `${w.daysLeft} days`;
  const past = w.dir < 0 ? 'lost' : 'gained';
  const wrongWay = w.current != null && w.progress < -0.04;
  let source;
  if (w.mode === 'fixed') source = `Your own weekly target: ${w.verb} ${kgSmall(Math.abs(w.change))} a week`;
  else if (w.basis.done) source = 'Follows your target weight';
  else if (w.basis.weeks > 1) source = `From your target: ${kgSmall(w.basis.remStart)} to go on Monday ÷ ${weeksText(w.basis.weeks)} left`;
  else source = `From your target: the last ${kgSmall(w.basis.remStart)} is due this week`;
  return `<section class="card goal-card week-card" aria-label="This week's target">
    <div class="card-head"><h2>📅 This week's target</h2><button class="link-btn" data-action="edit-week">Edit</button></div>
    <p class="auto-chip week-chip">${ICON.calendar}${esc(range)}</p>
    <div class="goal-amounts"><span class="goal-saved">${esc(kgSmall(Math.max(0, w.progress)))}</span><span class="muted">${esc(past)} of ${esc(kgSmall(Math.abs(w.change)))}</span></div>
    <p class="muted small" style="margin-top:2px">Started the week at ${esc(kg(round1(w.startKg)))} · aim for ${esc(kg(round1(w.goalKg)))} by Sunday${wrongWay ? ` · up ${esc(kgSmall(-w.progress))} so far` : ''}</p>
    ${progressBar(w.pct, `week-${w.wk}`, "This week's progress")}
    <div class="goal-facts">
      ${w.reached ? textTile('Aim', kg(round1(w.goalKg))) : textTile(`Still to ${w.verb}`, kgSmall(w.toGo))}
      ${w.reached ? '' : textTile('Per day', kgSmall(w.perDay))}
      ${textTile('Days left', daysText)}
    </div>
    <p class="goal-math">${esc(source)}</p>
    <p class="goal-status ${w.status.level}">${w.status.icon}${esc(w.status.text)}</p>
  </section>`;
}

function latestCard() {
  const last = latestEntry();
  if (!last) {
    return `<section class="card" aria-label="Latest weigh-in">
      <div class="goal-empty">
        <span class="emoji-badge saved" aria-hidden="true">⚖️</span>
        <span><strong>No weigh-ins yet</strong><small>Tap + at the top to add your weight. Weighing at the same time each day (say, in the morning) gives the clearest trend.</small></span>
      </div>
    </section>`;
  }
  const s = series();
  const t = todayISO();
  const prev = sortedEntries(state.entries)[1];
  const at = (days) => {
    const p = valueOnOrBefore(s, addDays(t, -days));
    return p ? last.kg - p.kg : null;
  };
  const wk = weekStart(t);
  const daysWeighed = new Set(state.entries.filter((e) => e.date >= wk && e.date <= t).map((e) => e.date)).size;
  return `<section class="card" aria-label="Latest weigh-in">
    ${cardHead('Latest weigh-in', 'History', 'goto', 'history')}
    <div class="hero-row">
      <span class="hero-kg">${esc(nfKg.format(last.kg))}<small>kg</small></span>
      <span class="muted small">${esc(dayTitle(last.date))}${last.time ? ` · ${esc(last.time)}` : ''}</span>
    </div>
    <div class="deltas">
      ${deltaTile('Since last', prev ? last.kg - prev.kg : null)}
      ${deltaTile('7 days', at(7))}
      ${deltaTile('30 days', at(30))}
    </div>
    <div id="miniChart" class="mini-chart"></div>
    <p class="note-muted">Weighed in on ${daysWeighed} of ${daysBetween(wk, t) + 1} days this week.</p>
  </section>`;
}

function bmiCard() {
  const h = state.settings.heightCm;
  if (!h) {
    return `<section class="card" aria-label="BMI">
      <div class="goal-empty">
        <span class="emoji-badge" aria-hidden="true">📏</span>
        <span><strong>See your BMI</strong><small>Add your height once and WeightTrack shows your BMI and the healthy weight range for your height.</small></span>
      </div>
      <button class="btn btn-secondary" data-action="edit-height">Add my height</button>
    </section>`;
  }
  const last = latestEntry();
  const range = healthyRange(h);
  const bmi = last ? bmiOf(last.kg, h) : null;
  const band = bmiBand(bmi);
  const T = state.settings.target;
  const lo = 15;
  const hi = 40;
  const pos = (v) => `${((clamp(v, lo, hi) - lo) / (hi - lo)) * 100}%`;
  return `<section class="card" aria-label="BMI">
    ${cardHead('BMI', 'Height', 'edit-height')}
    ${bmi == null ? '<p class="muted">Add a weigh-in to see your BMI.</p>' : `
    <div><span class="bmi-value">${esc(nf1.format(bmi))}</span><span class="bmi-band ${band.key === 'healthy' ? 'good' : ''}">${esc(band.label)}</span></div>
    <div class="bmi-scale" role="img" aria-label="BMI ${esc(nf1.format(bmi))} on a scale from 15 to 40. The healthy range is 18.5 to 24.9.">
      <span class="healthy" style="left:${pos(18.5)};width:calc(${pos(24.9)} - ${pos(18.5)})"></span>
      <span class="marker" style="left:${pos(bmi)}"></span>
    </div>
    <div class="bmi-ticks" aria-hidden="true"><span style="left:${pos(18.5)}">18.5</span><span style="left:${pos(25)}">25</span><span style="left:${pos(30)}">30</span></div>`}
    <p class="small" style="margin-top:10px">Healthy weight for your height (${esc(nf1.format(h).replace(/\.0$/, ''))} cm): <b>${esc(kg(range.low))} – ${esc(kg(range.high))}</b></p>
    ${T ? `<p class="small muted" style="margin-top:4px">At your target of ${esc(kg(T.kg))}, your BMI would be ${esc(nf1.format(bmiOf(T.kg, h)))}.</p>` : ''}
    <p class="note-muted">BMI is a rough guide for adults — it doesn't account for muscle, age or body shape.</p>
  </section>`;
}

function renderToday(view) {
  const t = todayISO();
  setHeader('Today', fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long' }), addButton());
  const isEmpty = !state.entries.length && !state.settings.target;
  let syncCard = '';
  if (!sync.isOn() && (isEmpty || Date.now() > syncLater.until)) {
    syncCard = `<section class="card sync-card">
      <div class="goal-empty">
        <span class="emoji-badge" aria-hidden="true">☁️</span>
        <span>${isEmpty
    ? '<strong>Lost your weigh-ins?</strong><small>If you turned on GitHub sync before, connect this device to bring everything back.</small>'
    : '<strong>Keep your weigh-ins safe</strong><small>Save a copy to your private GitHub, so nothing is lost when the browser forgets it — and it matches on your iPhone and Mac.</small>'}</span>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" data-action="goto" data-arg="settings">Turn on sync</button>
        ${isEmpty ? '' : '<button class="btn btn-secondary" data-action="sync-later">Later</button>'}
      </div>
    </section>`;
  } else if (sync.isOn() && SYNC_PROBLEMS.includes(sync.status.kind)) {
    syncCard = `<button class="alert-banner" data-action="goto" data-arg="settings">
      <span class="lead">${ICON.alert}</span>
      <span class="grow"><strong>GitHub sync stopped</strong><small>${esc(sync.status.message)}</small></span>
      ${ICON.chevron}
    </button>`;
  }

  view.innerHTML = `
    ${storageNotice()}
    ${syncCard}
    ${targetCard()}
    ${weeklyCard()}
    ${latestCard()}
    ${bmiCard()}
    ${sync.isOn() ? '<button class="sync-line" data-sync-status data-action="goto" data-arg="settings"></button>' : ''}`;

  // Last 30 days, small.
  const host = $('#miniChart');
  if (host) {
    const pts = series().filter((p) => p.date >= addDays(t, -29));
    if (pts.length >= 2) {
      lineChart(host, {
        start: addDays(t, -29),
        end: t,
        series: [{ key: 'kg', label: 'Weight', color: 'var(--saved)', points: pts.map((p) => ({ date: p.date, value: p.kg })), dots: pts.length <= 31 }],
        format: kg,
        formatAxis: axisKg,
        tickLabel: shortDate,
        titleOf: (d) => fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' }),
        plotHeight: 100,
        ariaLabel: 'Your weight over the last 30 days.',
      });
    } else {
      host.innerHTML = '<p class="empty-chart" style="padding:12px 4px">Your last 30 days show here after a couple of weigh-ins.</p>';
    }
  }
}

// ---------- History ----------

function renderHistory(view) {
  setHeader('History', '', addButton());
  const list = sortedEntries(state.entries);
  if (!list.length) {
    view.innerHTML = '<div class="empty"><span class="big-emoji">⚖️</span><strong>No weigh-ins yet</strong>Every weigh-in you add shows up here.</div>';
    return;
  }
  const chrono = [...list].reverse();
  const prevOf = new Map(chrono.map((e, i) => [e.id, i ? chrono[i - 1] : null]));
  const groups = [];
  for (const e of list) {
    const ym = monthOf(e.date);
    const last = groups[groups.length - 1];
    if (last && last.ym === ym) last.items.push(e);
    else groups.push({ ym, items: [e] });
  }
  view.innerHTML = groups.map((g) => {
    const avg = g.items.reduce((s, e) => s + e.kg, 0) / g.items.length;
    return `<section class="list-group">
      <div class="group-head"><h2>${esc(monthName(g.ym, 'long'))}</h2><span>average ${esc(kg(round1(avg)))}</span></div>
      <div class="card rows plain-rows">${g.items.map((e) => {
    const prev = prevOf.get(e.id);
    const d = prev ? round1(e.kg - prev.kg) : null;
    const cls = d == null || d === 0 ? '' : d < 0 ? 'down' : 'up';
    const arrow = d == null || d === 0 ? '' : d < 0 ? ICON.down : ICON.up;
    const sub = [e.time, e.note].filter(Boolean).join(' · ');
    return `<button class="row" data-action="edit-entry" data-id="${esc(e.id)}">
          <span class="row-main"><span class="row-title">${esc(dayTitle(e.date))}</span>${sub ? `<span class="row-sub">${esc(sub)}</span>` : ''}</span>
          <span class="row-end"><span class="row-amount entry-kg">${esc(kg(e.kg))}</span>${d == null ? '' : `<span class="row-delta ${cls}">${arrow}${esc(signedKg(d))}</span>`}</span>
        </button>`;
  }).join('')}</div>
    </section>`;
  }).join('');
}

// ---------- Progress (graphs) ----------

const RANGES = [['1m', '1M', 30], ['3m', '3M', 91], ['6m', '6M', 182], ['1y', '1Y', 365], ['all', 'All', null]];

function renderProgress(view) {
  setHeader('Progress');
  const s = series();
  if (s.length < 2) {
    view.innerHTML = '<div class="empty"><span class="big-emoji">📈</span><strong>Not enough weigh-ins yet</strong>Your graphs appear after two or more weigh-ins on different days.</div>';
    return;
  }
  const t = todayISO();
  const r = RANGES.find((x) => x[0] === ui.range) || RANGES[1];
  const start = r[2] ? addDays(t, -(r[2] - 1)) : s[0].date;
  const inRange = s.filter((p) => p.date >= start);
  const avgAll = movingAverage(s);
  const avg = avgAll.filter((p) => p.date >= start);
  const T = state.settings.target;

  let stats = '<p class="muted">No weigh-ins in this period.</p>';
  if (inRange.length) {
    const first = inRange[0];
    const lastP = inRange[inRange.length - 1];
    const change = lastP.kg - first.kg;
    const spanDays = Math.max(1, daysBetween(first.date, lastP.date));
    const low = inRange.reduce((m, p) => (p.kg < m.kg ? p : m));
    const high = inRange.reduce((m, p) => (p.kg > m.kg ? p : m));
    stats = `<div class="stat-grid">
      ${textTile('Start', kg(first.kg))}
      ${textTile('Now', kg(lastP.kg))}
      ${deltaTile('Change', change)}
      ${textTile('Lowest', kg(low.kg))}
      ${textTile('Highest', kg(high.kg))}
      ${deltaTile('Per week', spanDays >= 7 ? (change / spanDays) * 7 : null)}
    </div>`;
  }

  // Weekly change: this week's average minus last week's, for the last 12 weeks.
  const thisWeek = weekStart(t);
  const weekAvg = (ws) => {
    const pts = s.filter((p) => p.date >= ws && p.date <= addDays(ws, 6));
    return pts.length ? pts.reduce((a, p) => a + p.kg, 0) / pts.length : null;
  };
  const weekly = [];
  for (let i = 11; i >= 0; i -= 1) {
    const ws = addDays(thisWeek, -7 * i);
    const a = weekAvg(ws);
    const b = weekAvg(addDays(ws, -7));
    weekly.push({ tick: shortDate(ws), title: `Week of ${shortDate(ws)} – ${shortDate(addDays(ws, 6))}`, value: a != null && b != null ? round2(a - b) : null });
  }

  // Monthly averages for the last 12 months (months with weigh-ins).
  const monthly = [];
  for (let i = 11; i >= 0; i -= 1) {
    const m = addMonths(monthOf(t), -i);
    const pts = s.filter((p) => monthOf(p.date) === m);
    if (pts.length) monthly.push({ date: `${m}-15`, ym: m, value: round2(pts.reduce((a, p) => a + p.kg, 0) / pts.length) });
  }

  const toggle = (key) => `<button class="link-btn" data-action="toggle-table" data-arg="${key}">${ui.tableView[key] ? 'Show chart' : 'Show table'}</button>`;
  const legendItem = (color, label, kind) => `<span class="legend-item">${kind === 'dash'
    ? '<svg width="16" height="4" aria-hidden="true"><line x1="0" x2="16" y1="2" y2="2" stroke="var(--text-2)" stroke-width="1.5" stroke-dasharray="4 3"/></svg>'
    : kind === 'dot'
      ? `<span class="legend-line" style="background:${color}"></span><span class="legend-dot" style="background:${color}"></span>`
      : `<span class="legend-line" style="background:${color}"></span>`}${esc(label)}</span>`;

  view.innerHTML = `
    <div class="filter-row">${seg('range', RANGES.map(([v, l]) => [v, l]), ui.range, 'Time range')}</div>
    <section class="card">${stats}</section>
    <section class="card">
      <div class="card-head"><h2>Weight</h2>${toggle('weight')}</div>
      <div class="legend">${legendItem('var(--saved)', 'Weigh-ins', 'dot')}${legendItem('var(--avg)', '7-day average', 'line')}${T ? legendItem('', `Target ${kg(T.kg)}`, 'dash') : ''}</div>
      <div id="weightChart"></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Change each week</h2>${weekly.some((w) => w.value != null) ? toggle('weekly') : ''}</div>
      <p class="chart-sub">Average weight each week compared with the week before</p>
      <div class="legend">${legendItem('var(--down)', 'Down', 'line')}${legendItem('var(--up)', 'Up', 'line')}</div>
      <div id="weeklyChart"></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Monthly average</h2>${monthly.length >= 1 ? toggle('monthly') : ''}</div>
      <div id="monthlyChart"></div>
    </section>`;

  // Weight chart (or its table).
  const wHost = $('#weightChart');
  if (!inRange.length) {
    wHost.innerHTML = '<p class="empty-chart">No weigh-ins in this period.</p>';
  } else if (ui.tableView.weight) {
    const avgMap = new Map(avgAll.map((p) => [p.date, p.kg]));
    chartTable(wHost, { columns: ['Day', 'Weight', '7-day average'], rows: [...inRange].reverse().map((p) => [longDate(p.date), kg(p.kg), kg(avgMap.get(p.date))]) });
  } else {
    lineChart(wHost, {
      start: r[2] ? start : s[0].date,
      end: t,
      series: [
        { key: 'kg', label: 'Weigh-in', color: 'var(--saved)', points: inRange.map((p) => ({ date: p.date, value: p.kg })), dots: inRange.length <= 45, width: inRange.length > 45 ? 1.5 : 2 },
        { key: 'avg', label: '7-day average', color: 'var(--avg)', points: avg.map((p) => ({ date: p.date, value: p.kg })), width: 2.5 },
      ],
      refLine: T ? { value: T.kg, label: `Target ${kg(T.kg)}` } : null,
      format: kg,
      formatAxis: axisKg,
      tickLabel: (d) => (r[2] && r[2] <= 91 ? shortDate(d) : fmtDate(d, { month: 'short', year: '2-digit' })),
      titleOf: (d) => fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      ariaLabel: 'Your weight over time, with the 7-day average and your target.',
    });
  }

  const wkHost = $('#weeklyChart');
  if (!weekly.some((w) => w.value != null)) {
    wkHost.innerHTML = '<p class="empty-chart">Shows once you have weigh-ins in two weeks next to each other.</p>';
  } else if (ui.tableView.weekly) {
    chartTable(wkHost, { columns: ['Week', 'Change'], rows: [...weekly].reverse().map((w) => [w.title, w.value == null ? '—' : signedKg(w.value)]) });
  } else {
    changeChart(wkHost, {
      points: weekly,
      up: { color: 'var(--up)', label: 'Up' },
      down: { color: 'var(--down)', label: 'Down' },
      format: signedKg,
      formatAxis: axisSigned,
      labelEvery: 3,
      ariaLabel: 'Weight change each week for the last 12 weeks.',
    });
  }

  const mHost = $('#monthlyChart');
  if (ui.tableView.monthly) {
    chartTable(mHost, { columns: ['Month', 'Average'], rows: [...monthly].reverse().map((m) => [monthName(m.ym, 'long'), kg(m.value)]) });
  } else if (monthly.length < 2) {
    mHost.innerHTML = '<p class="empty-chart">Shows once you have weigh-ins in two different months.</p>';
  } else {
    lineChart(mHost, {
      start: `${monthly[0].ym}-01`,
      end: `${monthly[monthly.length - 1].ym}-28`,
      series: [{ key: 'm', label: 'Average', color: 'var(--saved)', points: monthly.map((m) => ({ date: m.date, value: m.value })), dots: true }],
      refLine: T ? { value: T.kg, label: `Target ${kg(T.kg)}` } : null,
      format: kg,
      formatAxis: axisKg,
      tickLabel: (d) => monthName(d.slice(0, 7)),
      titleOf: (d) => monthName(d.slice(0, 7), 'long'),
      plotHeight: 150,
      ariaLabel: 'Your average weight each month.',
    });
  }
}

// ---------- Settings ----------

function syncSection() {
  const owner = siteOwner();
  const cfg = sync.config;
  const st = sync.status;
  const repoText = cfg ? `${cfg.owner}/${cfg.repo}` : owner ? `${owner}/${DEFAULT_REPO}` : DEFAULT_REPO;
  const needsKey = !cfg || ['auth', 'access', 'missing', 'public'].includes(st.kind);
  const keyForm = `
      <form id="syncForm" class="sync-form" novalidate>
        <div class="card form-list">
          <label class="field${cfg ? ' visually-hidden' : ''}"><span>Repository</span><input type="text" name="repo" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(repoText)}" ${cfg ? 'tabindex="-1" aria-hidden="true"' : ''}></label>
          <label class="field"><span>Access key</span><input type="password" name="token" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Paste it here"></label>
        </div>
        <p class="field-error" id="syncError" hidden></p>
        <button class="btn btn-primary" type="submit" id="syncConnect">${ICON.cloud}${cfg ? 'Save new key' : 'Connect'}</button>
      </form>`;
  if (!cfg) {
    return `<section id="sync">
      <h2 class="group-title">GitHub sync</h2>
      <div class="card sync-intro">
        <p>Save your weigh-ins to a private file in your own GitHub account. They're never lost — even if this browser forgets everything or you delete the Home Screen icon — and they stay the same on your iPhone and Mac.</p>
        <ol class="steps">
          <li><a class="text-link" href="${esc(newKeyURL(owner))}" target="_blank" rel="noopener">Make an access key on GitHub</a>. Under <b>Repository access</b>, pick <b>Only select repositories</b> → <b>${esc(DEFAULT_REPO)}</b>. Then tap <b>Generate token</b> and copy the key.</li>
          <li>Paste the key below and tap <b>Connect</b>.</li>
        </ol>
        <p class="muted small" style="margin-top:8px">Already have a MoneyTrack key? You can use it here too: on GitHub, edit that key and add <b>${esc(DEFAULT_REPO)}</b> to its repositories.</p>
      </div>
      ${keyForm}
      <p class="footnote">The key only opens the private repositories you pick and stays on this device. Keep a copy in your Passwords app or Notes — you'll paste it once on each device or browser you use.</p>
    </section>`;
  }
  const problem = SYNC_PROBLEMS.includes(st.kind);
  return `<section id="sync">
    <h2 class="group-title">GitHub sync</h2>
    <div class="card form-list">
      <div class="field"><span>Status</span><span class="kv-value ${problem ? 'bad' : ''}" id="syncDetail">${esc(syncDetailText())}</span></div>
      <div class="field"><span>Repository</span><a class="kv-value text-link" href="https://github.com/${esc(cfg.owner)}/${esc(cfg.repo)}/commits" target="_blank" rel="noopener">${esc(`${cfg.owner}/${cfg.repo}`)}</a></div>
      <button class="list-btn" data-action="sync-now">Sync now</button>
      <button class="list-btn danger" data-action="sync-off">Turn off sync on this device</button>
    </div>
    ${problem ? `<p class="sync-problem" role="alert">${ICON.alert}<span>${esc(st.message)}</span></p>` : ''}
    ${problem && needsKey ? `<p class="footnote" style="margin-bottom:8px"><a class="text-link" href="${esc(newKeyURL(cfg.owner))}" target="_blank" rel="noopener">Make a new access key</a> (pick <b>Only select repositories</b> → <b>${esc(cfg.repo)}</b>), then paste it here.</p>${keyForm}` : ''}
    <p class="footnote">Every change is saved to GitHub a few seconds after you make it. GitHub also keeps every earlier version, so you can always go back.</p>
  </section>`;
}

function renderSettings(view) {
  setHeader('Settings');
  const s = state.settings;
  const T = s.target;
  const wt = s.weeklyTarget;
  const isEmpty = !state.entries.length && !T;
  const wtText = wt.mode === 'off' ? 'Off' : wt.mode === 'fixed' ? `${wt.direction === 'gain' ? 'Gain' : 'Lose'} ${kgSmall(wt.kg)} a week` : 'Follows your target';
  view.innerHTML = `
    ${storageNotice()}
    ${syncSection()}
    <section>
      <h2 class="group-title">You</h2>
      <div class="card form-list">
        <button class="list-btn goal-list-btn" data-action="edit-height"><span>Height</span><span class="kv-value">${s.heightCm ? `${esc(nf1.format(s.heightCm).replace(/\.0$/, ''))} cm` : 'Not set'}</span></button>
        <button class="list-btn goal-list-btn" data-action="edit-target"><span>Target weight</span><span class="kv-value">${T ? `${esc(kg(T.kg))} by ${esc(shortDate(T.date))}` : 'Not set'}</span></button>
        <button class="list-btn goal-list-btn" data-action="edit-week"><span>Weekly target</span><span class="kv-value">${esc(wtText)}</span></button>
        <label class="field"><span>Appearance</span>
          <select data-setting="theme">
            <option value="system" ${s.theme === 'system' ? 'selected' : ''}>Automatic</option>
            <option value="light" ${s.theme === 'light' ? 'selected' : ''}>Light</option>
            <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark</option>
          </select>
        </label>
      </div>
    </section>

    <section>
      <h2 class="group-title">Your data</h2>
      <div class="card form-list">
        <button class="list-btn" data-action="export-backup">Save a backup file</button>
        <label class="list-btn" for="importFile">Restore from a backup file</label>
        <input type="file" id="importFile" class="visually-hidden" accept="application/json,.json">
        <button class="list-btn" data-action="export-csv">Export to a spreadsheet (CSV)</button>
        ${isEmpty && !sync.isOn() ? '<button class="list-btn" data-action="load-sample">Try it with sample data</button>' : ''}
        <button class="list-btn danger" data-action="erase">Erase all data</button>
      </div>
      <p class="footnote">${sync.isOn()
    ? 'Your weigh-ins are saved in this browser and in your private GitHub repository. A backup file is an extra copy you can keep anywhere.'
    : 'Right now your weigh-ins are saved only in this browser. Turn on GitHub sync above so they can never be lost, or save a backup file now and then.'}</p>
    </section>

    <section>
      <h2 class="group-title">Use it like an app</h2>
      <div class="card">
        <ol class="steps">
          <li>Open this page in <b>Safari</b> on your iPhone.</li>
          <li>Tap the <b>Share</b> button (square with an arrow).</li>
          <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        </ol>
      </div>
    </section>
    <p class="footnote center">WeightTrack ${APP_VERSION}</p>`;
}

// ---------- Sheets (pop-up forms) ----------

const sheet = $('#sheet');
let sheetStack = [];

function openSheet(builder) {
  sheetStack.push(builder);
  showTopSheet(true);
}

function showTopSheet(isNew = false) {
  const builder = sheetStack[sheetStack.length - 1];
  if (!builder) return;
  const scroller = $('.sheet-body', sheet);
  const keepScroll = !isNew && scroller ? scroller.scrollTop : 0;
  sheet.innerHTML = '';
  builder(sheet);
  if (!sheet.open) {
    sheet.showModal();
    document.documentElement.classList.add('sheet-open');
  }
  const body = $('.sheet-body', sheet);
  if (body) body.scrollTop = keepScroll;
  if (isNew) {
    const auto = $('[autofocus]', sheet);
    if (auto) auto.focus();
  }
}

function closeSheet() {
  sheetStack.pop();
  if (sheetStack.length) showTopSheet();
  else if (sheet.open) sheet.close();
}

function closeAllSheets() {
  sheetStack = [];
  if (sheet.open) sheet.close();
}

sheet.addEventListener('close', () => {
  sheetStack = [];
  sheet.innerHTML = '';
  document.documentElement.classList.remove('sheet-open');
  if (renderWhenSheetCloses) {
    renderWhenSheetCloses = false;
    render();
  }
});
sheet.addEventListener('cancel', (e) => {
  e.preventDefault();
  closeSheet();
});
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) closeSheet();
});

function sheetHead(title, { save = '', cancel = 'Cancel' } = {}) {
  return `<header class="sheet-head">
    <button type="button" class="link-btn" data-action="sheet-close">${esc(cancel)}</button>
    <h2 id="sheetTitle">${esc(title)}</h2>
    ${save ? `<button type="submit" form="${save}" class="link-btn strong">Save</button>` : '<span></span>'}
  </header>`;
}

/** Big number field with a unit, e.g. "77.4 kg". */
function numberField(value, unit, { autofocus = false, placeholder = '0', label = 'Weight', id = 'num' } = {}) {
  return `<div class="amount-field">
      <input id="${id}" inputmode="decimal" enterkeyhint="done" placeholder="${esc(placeholder)}" aria-label="${esc(label)}" autocomplete="off" value="${esc(value)}" ${autofocus ? 'autofocus' : ''}>
      <span class="amount-cur" aria-hidden="true">${esc(unit)}</span>
    </div>
    <p class="field-error" id="${id}Error" hidden></p>`;
}

function bindNumber(root, id = 'num', maxLen = 6) {
  const input = $(`#${id}`, root);
  input.addEventListener('input', () => {
    const clean = sanitizeNumber(input.value, maxLen);
    if (clean !== input.value) input.value = clean;
    const err = $(`#${id}Error`, root);
    if (err) err.hidden = true;
  });
}

function showError(root, id, message) {
  const el = $(`#${id}`, root);
  el.textContent = message;
  el.hidden = false;
}

function bindFormSeg(root, name, onChange) {
  const group = $(`[data-seg="${name}"]`, root);
  if (!group) return;
  $$('button', group).forEach((b) => b.addEventListener('click', () => {
    $$('button', group).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onChange(b.dataset.value);
  }));
}

const validWeight = (v) => v != null && v >= MIN_KG && v <= MAX_KG;

// Weigh-in
function entrySheet(id = null) {
  const existing = id ? state.entries.find((e) => e.id === id) : null;
  const last = latestEntry();
  const f = {
    kg: existing ? String(existing.kg) : '',
    date: existing ? existing.date : todayISO(),
    time: existing ? existing.time : nowTime(),
    note: existing ? existing.note : '',
  };
  openSheet((root) => {
    root.innerHTML = `
      ${sheetHead(existing ? 'Edit weigh-in' : 'New weigh-in', { save: 'entryForm' })}
      <form id="entryForm" class="sheet-body" novalidate autocomplete="off">
        ${numberField(f.kg, 'kg', { autofocus: !existing, placeholder: last ? nfKg.format(last.kg) : '0' })}
        <div class="card form-list">
          <label class="field"><span>Date</span><input type="date" name="date" value="${esc(f.date)}" max="${esc(todayISO())}"></label>
          <label class="field"><span>Time</span><input type="time" name="time" value="${esc(f.time)}"></label>
          <label class="field"><span>Note</span><input type="text" name="note" maxlength="80" value="${esc(f.note)}" placeholder="Optional, e.g. after gym"></label>
        </div>
        ${last && !existing ? `<p class="footnote">Last weigh-in: ${esc(kg(last.kg))} · ${esc(dayTitle(last.date))}</p>` : ''}
        ${existing ? `<button type="button" class="btn btn-danger-outline" data-action="delete-entry" data-id="${esc(existing.id)}">${ICON.trash}Delete weigh-in</button>` : ''}
      </form>`;
    const form = $('#entryForm', root);
    bindNumber(root);
    form.addEventListener('input', () => {
      f.kg = $('#num', root).value;
      f.date = form.date.value || f.date;
      f.time = form.time.value;
      f.note = form.note.value;
    });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const value = parseNumber($('#num', root).value);
      if (!validWeight(value)) {
        showError(root, 'numError', `Enter your weight in kg (between ${MIN_KG} and ${MAX_KG}).`);
        $('#num', root).focus();
        return;
      }
      const before = targetProgress();
      const record = {
        date: form.date.value || todayISO(),
        time: form.time.value || '',
        kg: value,
        note: form.note.value.trim().slice(0, 80),
      };
      const current = existing && state.entries.find((e) => e.id === existing.id);
      if (current) Object.assign(current, record);
      else if (existing) state.entries.push({ ...existing, ...record });
      else state.entries.push({ id: uid(), createdAt: Date.now(), ...record });
      const after = targetProgress();
      closeSheet();
      if (before && after && !before.reached && after.reached) commit('Target reached — well done! 🎉');
      else commit(existing ? 'Weigh-in updated' : `${kg(value)} saved`);
    });
  });
}

// Target weight
function targetSheet() {
  const T = state.settings.target;
  const last = latestEntry();
  const f = {
    kg: T ? String(T.kg) : '',
    date: T ? T.date : addDays(todayISO(), 84),
    startKg: T ? String(T.startKg) : last ? String(last.kg) : '',
    startDate: T ? T.startDate : todayISO(),
  };
  openSheet((root) => {
    root.innerHTML = `
      ${sheetHead(T ? 'Edit target' : 'New target', { save: 'targetForm' })}
      <form id="targetForm" class="sheet-body" novalidate autocomplete="off">
        <h3 class="group-title" style="margin-bottom:-8px">Target weight</h3>
        ${numberField(f.kg, 'kg', { autofocus: !T, label: 'Target weight' })}
        <div class="card form-list">
          <label class="field"><span>Reach it by</span><input type="date" name="date" value="${esc(f.date)}"></label>
          <label class="field"><span>Starting weight</span><input type="text" name="startKg" inputmode="decimal" maxlength="6" value="${esc(f.startKg)}" placeholder="kg"></label>
          <label class="field"><span>Start date</span><input type="date" name="startDate" value="${esc(f.startDate)}"></label>
        </div>
        <p class="footnote" id="targetPreview"></p>
        <p class="field-error" id="targetError" hidden></p>
        ${T ? `<button type="button" class="btn btn-danger-outline" data-action="delete-target">${ICON.trash}Remove target</button>` : ''}
      </form>`;
    const form = $('#targetForm', root);
    bindNumber(root);
    form.startKg.addEventListener('input', () => {
      const clean = sanitizeNumber(form.startKg.value);
      if (clean !== form.startKg.value) form.startKg.value = clean;
    });
    const preview = () => {
      const target = parseNumber($('#num', root).value);
      const start = parseNumber(form.startKg.value);
      const current = last ? last.kg : start;
      const due = form.date.value;
      const el = $('#targetPreview', root);
      if (!validWeight(target) || !validWeight(current) || !due) {
        el.textContent = 'Your target, the date you want to reach it and your starting weight.';
        return;
      }
      const days = daysBetween(todayISO(), due) + 1;
      const toGo = Math.abs(target - current);
      const verb = target < current ? 'lose' : 'gain';
      if (days < 1) {
        el.textContent = 'Pick a date in the future.';
        return;
      }
      const perWeek = days >= 7 ? toGo / (days / 7) : toGo;
      el.textContent = `That's ${kgSmall(toGo)} to ${verb} — about ${kgSmall(perWeek)} a week.${verb === 'lose' && perWeek > 1 ? ' More than 1 kg a week is hard to keep up; a later date may be kinder.' : ''}`;
    };
    preview();
    form.addEventListener('input', () => {
      f.kg = $('#num', root).value;
      f.date = form.date.value || f.date;
      f.startKg = form.startKg.value;
      f.startDate = form.startDate.value || f.startDate;
      $('#targetError', root).hidden = true;
      preview();
    });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const target = parseNumber($('#num', root).value);
      const startKg = parseNumber(form.startKg.value) || (last && last.kg);
      if (!validWeight(target)) {
        showError(root, 'numError', `Enter the weight you're aiming for in kg (between ${MIN_KG} and ${MAX_KG}).`);
        $('#num', root).focus();
        return;
      }
      if (!validWeight(startKg)) {
        showError(root, 'targetError', 'Enter your starting weight in kg.');
        return;
      }
      const date = form.date.value;
      const startDate = form.startDate.value || todayISO();
      if (!date || date <= startDate) {
        showError(root, 'targetError', 'The “reach it by” date needs to be after the start date.');
        return;
      }
      if (target === startKg) {
        showError(root, 'targetError', 'Your target is the same as your starting weight.');
        return;
      }
      state.settings.target = { ...(T || {}), kg: target, date, startKg, startDate, createdAt: (T && T.createdAt) || Date.now() };
      lastBarWidth.delete('target');
      closeSheet();
      commit(T ? 'Target updated' : 'Target set — you’ve got this!');
    });
  });
}

// Weekly target
function weekSheet() {
  const wt = state.settings.weeklyTarget;
  const f = { mode: wt.mode, kg: String(wt.kg || 0.5), direction: wt.direction || 'lose' };
  openSheet((root) => {
    const plan = (() => {
      const saved = state.settings.weeklyTarget;
      state.settings.weeklyTarget = { ...saved, mode: 'target' };
      try { return weekPlan(); } finally { state.settings.weeklyTarget = saved; }
    })();
    const T = state.settings.target;
    let goalText;
    if (!T) goalText = "You haven't set a target weight yet. Set one and your weekly target is worked out for you.";
    else if (!plan || plan.empty) goalText = 'Add a weigh-in and your weekly target is worked out for you.';
    else if (plan.basis && plan.basis.done) goalText = 'Your target is already reached.';
    else goalText = `This week: ${plan.verb} ${kgSmall(Math.abs(plan.change))} (from ${kg(plan.startKg)} to ${kg(plan.goalKg)}).`;
    root.innerHTML = `
      ${sheetHead('Weekly target', { save: 'weekForm' })}
      <form id="weekForm" class="sheet-body" novalidate autocomplete="off">
        ${formSeg('mode', [['target', 'Follow my target'], ['fixed', 'My own amount'], ['off', 'Off']], f.mode, 'Weekly target')}
        <div class="mode-target" ${f.mode === 'target' ? '' : 'hidden'}>
          <div class="card"><p>${esc(goalText)}</p>
            <p class="muted small" style="margin-top:6px">It's the weight still to go on Monday, shared over the weeks left until your target date. It's worked out again every Monday, from your last weigh-in before that Monday.</p>
            ${T ? '' : `<button type="button" class="btn btn-secondary" style="margin-top:12px" data-action="edit-target">${ICON.plus}Set a target</button>`}
          </div>
        </div>
        <div class="mode-fixed" ${f.mode === 'fixed' ? '' : 'hidden'}>
          ${formSeg('direction', [['lose', 'Lose'], ['gain', 'Gain']], f.direction, 'Lose or gain')}
          <h3 class="group-title" style="margin:16px 4px -8px">Each week</h3>
          ${numberField(f.kg, 'kg', { label: 'Kilograms each week', id: 'wk' })}
          <p class="footnote">About 0.5 kg a week is a steady pace most people can keep up.</p>
        </div>
        <div class="mode-off" ${f.mode === 'off' ? '' : 'hidden'}>
          <p class="footnote">The weekly panel is hidden from Today. Turn it back on here any time.</p>
        </div>
      </form>`;
    const form = $('#weekForm', root);
    bindNumber(root, 'wk', 4);
    form.addEventListener('input', () => { f.kg = $('#wk', root).value; });
    bindFormSeg(root, 'mode', (v) => {
      f.mode = v;
      $('.mode-target', root).hidden = v !== 'target';
      $('.mode-fixed', root).hidden = v !== 'fixed';
      $('.mode-off', root).hidden = v !== 'off';
    });
    bindFormSeg(root, 'direction', (v) => { f.direction = v; });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      let amount = wt.kg || 0.5;
      if (f.mode === 'fixed') {
        amount = parseNumber($('#wk', root).value);
        if (!amount || amount > 5) {
          showError(root, 'wkError', 'Enter how many kg a week (up to 5).');
          $('#wk', root).focus();
          return;
        }
      }
      state.settings.weeklyTarget = { mode: f.mode, kg: amount, direction: f.direction };
      closeSheet();
      commit(f.mode === 'off' ? 'Weekly panel hidden' : 'Weekly target saved');
    });
  });
}

// Height
function heightSheet() {
  const h = state.settings.heightCm;
  openSheet((root) => {
    root.innerHTML = `
      ${sheetHead('Height', { save: 'heightForm' })}
      <form id="heightForm" class="sheet-body" novalidate autocomplete="off">
        ${numberField(h ? String(h) : '', 'cm', { autofocus: true, label: 'Height in centimetres', id: 'cm', placeholder: '175' })}
        <p class="footnote">Used only to work out your BMI and the healthy weight range for your height.</p>
        ${h ? `<button type="button" class="btn btn-danger-outline" data-action="delete-height">${ICON.trash}Remove height</button>` : ''}
      </form>`;
    const form = $('#heightForm', root);
    bindNumber(root, 'cm', 5);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = parseNumber($('#cm', root).value);
      if (!v || v < 100 || v > 250) {
        showError(root, 'cmError', 'Enter your height in centimetres (between 100 and 250).');
        return;
      }
      state.settings.heightCm = Math.round(v * 10) / 10;
      delete state.settings.heightSample;
      closeSheet();
      commit('Height saved');
    });
  });
}

// ---------- Files: backup, CSV ----------

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

async function shareOrDownload(filename, content, type) {
  const blob = new Blob([content], { type });
  if (isIOS() && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function exportBackup() {
  const data = JSON.stringify({ app: 'WeightTrack', exportedAt: new Date().toISOString(), ...state }, null, 2);
  shareOrDownload(`weighttrack-backup-${todayISO()}.json`, data, 'application/json');
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCSV() {
  const h = state.settings.heightCm;
  const rows = [['Date', 'Time', 'Weight (kg)', 'BMI', 'Note']];
  for (const e of [...sortedEntries(state.entries)].reverse()) rows.push([e.date, e.time, e.kg.toFixed(2), h ? bmiOf(e.kg, h) : '', e.note]);
  const T = state.settings.target;
  if (T) {
    rows.push([]);
    rows.push(['Target (kg)', 'Reach it by', 'Starting weight (kg)', 'Start date']);
    rows.push([T.kg.toFixed(2), T.date, T.startKg.toFixed(2), T.startDate]);
  }
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  shareOrDownload(`weighttrack-${todayISO()}.csv`, `﻿${csv}`, 'text/csv');
}

async function importBackup(file) {
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || !Array.isArray(parsed.entries)) throw new Error('not a backup');
    const data = normalise(parsed);
    const where = sync.isOn() ? 'on this device and in GitHub sync' : 'on this device';
    if (!confirm(`Replace everything ${where} with this backup?\n\n${data.entries.length} weigh-ins will be restored.`)) return;
    const tombs = { ...state.deleted };
    for (const [id, at] of Object.entries(data.deleted || {})) tombs[id] = Math.max(tombs[id] || 0, at);
    state = { ...data, deleted: tombs };
    lastBarWidth.clear();
    applyTheme();
    commit('Backup restored');
  } catch {
    toast("That file isn't a WeightTrack backup");
  }
}

// ---------- Actions ----------

document.addEventListener('click', (ev) => {
  const tabLink = ev.target.closest('.tabbar a[data-tab]');
  if (tabLink) {
    ev.preventDefault();
    navigate(tabLink.dataset.tab);
    return;
  }
  const btn = ev.target.closest('[data-action]');
  if (!btn) return;
  const { action, id, arg } = btn.dataset;
  switch (action) {
    case 'goto':
      closeAllSheets();
      navigate(arg);
      break;
    case 'back':
      goBack();
      break;
    case 'seg':
      ui[btn.dataset.name] = btn.dataset.value;
      render();
      break;
    case 'toggle-table':
      ui.tableView[arg] = !ui.tableView[arg];
      render();
      break;
    case 'add-entry':
      entrySheet();
      break;
    case 'edit-entry':
      entrySheet(id);
      break;
    case 'delete-entry':
      if (confirm('Delete this weigh-in?')) {
        state.entries = state.entries.filter((e) => e.id !== id);
        closeSheet();
        commit('Weigh-in deleted');
      }
      break;
    case 'edit-target':
      if (sheet.open) closeAllSheets();
      targetSheet();
      break;
    case 'delete-target':
      if (confirm('Remove your target weight?\n\nYour weigh-ins stay.')) {
        state.settings.target = null;
        closeSheet();
        commit('Target removed');
      }
      break;
    case 'edit-week':
      weekSheet();
      break;
    case 'edit-height':
      heightSheet();
      break;
    case 'delete-height':
      state.settings.heightCm = null;
      delete state.settings.heightSample;
      closeSheet();
      commit('Height removed');
      break;
    case 'sheet-close':
      closeSheet();
      break;
    case 'export-backup':
      exportBackup();
      break;
    case 'export-csv':
      exportCSV();
      break;
    case 'load-sample': {
      // Sample data is marked so it's never uploaded; your own height (if set) is kept.
      const sample = sampleState();
      const ownHeight = state.settings.heightCm;
      state = {
        ...sample,
        deleted: state.deleted,
        settings: { ...state.settings, target: sample.settings.target, heightCm: ownHeight || sample.settings.heightCm, heightSample: !ownHeight },
      };
      lastBarWidth.clear();
      commit('Sample data added — erase it any time in Settings');
      break;
    }
    case 'erase':
      if (confirm(sync.isOn()
        ? 'Erase all your weigh-ins and your target?\n\nThis also erases them on your other devices that use GitHub sync. Older copies stay in your GitHub history.'
        : 'Erase all your weigh-ins and your target on this device?\n\nThis cannot be undone. Save a backup first if you might need it.')) {
        state = { ...state, entries: [], settings: { ...state.settings, target: null } };
        lastBarWidth.clear();
        commit('All data erased');
      }
      break;
    case 'sync-now':
      sync.now().then(() => {
        if (sync.status.kind === 'ok') toast('Synced with GitHub');
      });
      break;
    case 'sync-off':
      if (confirm('Turn off GitHub sync on this device?\n\nYour weigh-ins stay here and in GitHub. Other devices keep syncing.')) {
        sync.disconnect();
        render();
        toast('Sync turned off on this device');
      }
      break;
    case 'sync-later':
      syncLater.until = Date.now() + 3 * 86400000;
      try { localStorage.setItem('weighttrack.syncLater', String(syncLater.until)); } catch { /* ignore */ }
      render();
      break;
    default:
      break;
  }
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.dataset && t.dataset.setting) {
    state.settings[t.dataset.setting] = t.value;
    if (t.dataset.setting === 'theme') applyTheme();
    commit('Saved');
  } else if (t.id === 'importFile' && t.files && t.files[0]) {
    importBackup(t.files[0]);
    t.value = '';
  }
});

// Connect to GitHub (Settings → GitHub sync).
document.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'syncForm') return;
  ev.preventDefault();
  const form = ev.target;
  const err = $('#syncError');
  const button = $('#syncConnect');
  const fail = (message) => {
    err.textContent = message;
    err.hidden = false;
  };
  err.hidden = true;
  const token = form.token.value.trim();
  const where = parseRepo(form.repo.value);
  if (!where) return fail('Type the repository as owner/name, e.g. your-name/weight-tracker-data.');
  if (!token) return fail('Paste your access key first.');
  if (/\s/.test(token) || token.length < 20) return fail("That doesn't look like a GitHub key. It's one long line starting with github_pat_.");
  button.disabled = true;
  button.textContent = 'Connecting…';
  try {
    // Sample data is only for trying the app out — never upload it.
    // Settings that only came from the sample are reset with "never changed" stamps, so your real ones win.
    const sampleTarget = state.settings.target && state.settings.target.sample;
    const sampleHeight = state.settings.heightSample;
    const realEntries = state.entries.filter((e) => !e.sample);
    if (realEntries.length !== state.entries.length || sampleTarget || sampleHeight) {
      const settings = { ...state.settings, stamps: { ...state.settings.stamps } };
      if (sampleTarget) {
        settings.target = null;
        settings.stamps.target = 0;
      }
      if (sampleHeight) {
        settings.heightCm = null;
        settings.stamps.heightCm = 0;
        delete settings.heightSample;
      }
      state = { ...emptyState(), ...state, entries: realEntries, settings };
      saveState(state);
      lastSnapshot = snapshot(state);
    }
    await sync.connect({ token, owner: where.owner, repo: where.repo });
    form.token.value = '';
    render();
    toast('GitHub sync is on');
  } catch (e) {
    fail(e && e.message ? e.message : 'Could not connect. Check the key and try again.');
    button.disabled = false;
    button.innerHTML = `${ICON.cloud}${sync.isOn() ? 'Save new key' : 'Connect'}`;
  }
});

window.addEventListener('popstate', () => {
  closeAllSheets();
  render();
  window.scrollTo(0, 0);
});
window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});

// Another tab (e.g. on the Mac) changed the data — pick it up.
window.addEventListener('storage', (ev) => {
  if (ev.key === STORAGE_KEY) {
    state = loadState();
    lastSnapshot = snapshot(state);
    applyTheme();
    render();
  }
});

// Coming back to the app (maybe on a new day) — refresh, and fetch changes from other devices.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    render();
    sync.now();
  } else if (sync.hasPending()) {
    sync.now();
  }
});
window.addEventListener('online', () => sync.now());
window.addEventListener('pagehide', () => { if (sync.hasPending()) sync.now(); });
setInterval(() => {
  if (document.visibilityState === 'visible' && sync.isOn()) sync.now();
}, 120000);
setInterval(updateSyncBits, 30000);

let lastWidth = window.innerWidth;
let resizeTimer;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastWidth) return;
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (currentTab() === 'progress' || currentTab() === 'today') render();
  }, 150);
});

// Tap outside a chart hides its tooltip (touch screens).
document.addEventListener('pointerdown', (ev) => {
  if (!ev.target.closest('.chart')) {
    $$('.chart-tip').forEach((t) => { t.hidden = true; });
    $$('.hover-band').forEach((b) => b.setAttribute('opacity', 0));
    $$('.crosshair, .focus-dot').forEach((b) => b.setAttribute('opacity', 0));
  }
});

// ---------- Start ----------

applyTheme();
render();
sync.now();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline mode unavailable', err));
  });
}
