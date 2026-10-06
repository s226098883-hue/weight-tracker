// WeightTrack data: saving, upgrades, merging changes from other devices, and small helpers.
// Everything is stored in this browser (localStorage) and, with GitHub sync on, in your private repository.

export const STORAGE_KEY = 'weighttrack.v1';
export const APP_VERSION = '1.0.0';

// ---------- State ----------
// IMPORTANT: never rename STORAGE_KEY. Changing it would make every phone "forget" its data after an update.

/** Version of the data format. Newer versions only ever add fields, so older data always loads. */
export const SCHEMA = 1;

export const MIN_KG = 20;
export const MAX_KG = 400;

// Settings sync one by one: each remembers when it was last changed (stamps), so a change on one device
// never undoes a different change made on another — and a brand-new device's defaults never win.
const SETTING_KEYS = ['theme', 'heightCm', 'target', 'weeklyTarget'];

function defaultSettings() {
  return {
    theme: 'system',
    heightCm: null,
    // target: { kg, date, startKg, startDate, createdAt } or null
    target: null,
    // weeklyTarget: 'target' = worked out every Monday from your target, 'fixed' = your own kg a week, 'off' = hidden
    weeklyTarget: { mode: 'target', kg: 0.5, direction: 'lose' },
    stamps: {},
  };
}

export function emptyState() {
  return { version: 1, schema: SCHEMA, entries: [], deleted: {}, settings: defaultSettings() };
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const isISODate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s) => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const validKg = (v) => num(v) >= MIN_KG && num(v) <= MAX_KG;

/**
 * Cleans up anything loaded from storage, a backup file or GitHub so the app never crashes on odd data.
 * It keeps any extra fields it doesn't know about, so data saved by a newer version is never lost.
 */
export function normalise(data) {
  const base = emptyState();
  if (!isObj(data)) return base;
  const entries = (Array.isArray(data.entries) ? data.entries : [])
    .filter((e) => isObj(e) && isISODate(e.date) && validKg(e.kg))
    .map((e) => ({
      ...e,
      id: String(e.id || uid()),
      date: e.date,
      time: isTime(e.time) ? e.time : '',
      kg: round2(num(e.kg)),
      note: String(e.note || '').slice(0, 120),
      createdAt: num(e.createdAt) || Date.now(),
      updatedAt: num(e.updatedAt) || num(e.createdAt) || 0,
    }));

  const deleted = {};
  if (isObj(data.deleted)) {
    for (const [id, at] of Object.entries(data.deleted)) if (num(at) > 0) deleted[id] = num(at);
  }

  const s = isObj(data.settings) ? data.settings : {};
  const legacy = isObj(data.settings) && !isObj(s.stamps);
  const stamps = {};
  for (const k of SETTING_KEYS) stamps[k] = num(isObj(s.stamps) ? s.stamps[k] : 0) || (legacy ? 1 : 0);

  const t = isObj(s.target) ? s.target : null;
  const target = t && validKg(t.kg) && isISODate(t.date)
    ? {
      ...t,
      kg: round2(num(t.kg)),
      date: t.date,
      startKg: validKg(t.startKg) ? round2(num(t.startKg)) : round2(num(t.kg)),
      startDate: isISODate(t.startDate) ? t.startDate : todayISO(),
      createdAt: num(t.createdAt) || Date.now(),
    }
    : null;
  const wt = isObj(s.weeklyTarget) ? s.weeklyTarget : {};
  const height = num(s.heightCm);

  const settings = {
    ...s,
    theme: ['system', 'light', 'dark'].includes(s.theme) ? s.theme : 'system',
    heightCm: height >= 100 && height <= 250 ? Math.round(height * 10) / 10 : null,
    target,
    weeklyTarget: {
      mode: ['target', 'fixed', 'off'].includes(wt.mode) ? wt.mode : 'target',
      kg: num(wt.kg) > 0 && num(wt.kg) <= 5 ? round2(num(wt.kg)) : 0.5,
      direction: wt.direction === 'gain' ? 'gain' : 'lose',
    },
    stamps,
  };
  return {
    ...data,
    version: 1,
    schema: Math.max(SCHEMA, num(data.schema)),
    entries,
    deleted,
    settings,
  };
}

export let storageWorks = true;

export function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Could not load saved data', err);
    storageWorks = false;
    return emptyState();
  }
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw);
    const data = normalise(parsed);
    if (!parsed || !parsed.schema) {
      // Data from an older version: keep an untouched copy, then save it in the new format.
      try {
        if (!localStorage.getItem(`${STORAGE_KEY}.before-upgrade`)) localStorage.setItem(`${STORAGE_KEY}.before-upgrade`, raw);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch { /* storage full — the data still loads */ }
    }
    return data;
  } catch (err) {
    // Unreadable data is set aside (never thrown away) before anything new is saved.
    console.warn('Saved data could not be read — kept a copy', err);
    try { localStorage.setItem(`${STORAGE_KEY}.unreadable-${Date.now()}`, raw); } catch { /* ignore */ }
    return emptyState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageWorks = true;
    return true;
  } catch (err) {
    console.warn('Could not save data', err);
    storageWorks = false;
    return false;
  }
}

/** Asks the browser not to clear this site's data when space runs low. */
export async function askForPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (!already) await navigator.storage.persist();
    }
  } catch {
    /* not supported — fine */
  }
}

// ---------- Change tracking + merging (for GitHub sync) ----------
// Every weigh-in remembers when it last changed (updatedAt). Deleting one leaves a small note in
// `deleted` ({ id: time }), so a delete on one device also reaches the others.

export const snapshot = (state) => JSON.parse(JSON.stringify(state));

const withoutStamps = (value) => JSON.stringify(value, (k, v) => (k === 'updatedAt' ? undefined : v));

/** Compares the state before and after a change and stamps whatever is new, edited or deleted. */
export function stampChanges(prev, next, now = Date.now()) {
  const deleted = { ...(next.deleted || {}) };
  const prevEntries = new Map((prev.entries || []).map((e) => [e.id, e]));
  const nextIds = new Set();
  for (const e of next.entries) {
    nextIds.add(e.id);
    const before = prevEntries.get(e.id);
    const tomb = deleted[e.id];
    if (!before || withoutStamps(before) !== withoutStamps(e) || (tomb && tomb >= (e.updatedAt || 0))) e.updatedAt = now;
    delete deleted[e.id];
  }
  for (const id of prevEntries.keys()) if (!nextIds.has(id)) deleted[id] = now;

  const ps = prev.settings || {};
  const ns = next.settings;
  ns.stamps = { ...(ns.stamps || {}) };
  for (const k of SETTING_KEYS) {
    if (JSON.stringify(ps[k] ?? null) !== JSON.stringify(ns[k] ?? null)) ns.stamps[k] = now;
  }
  next.deleted = deleted;
  return next;
}

/** The newer of two copies of the same item (ties are broken the same way on every device). */
function newer(a, b) {
  const ua = a.updatedAt || 0;
  const ub = b.updatedAt || 0;
  if (ua !== ub) return ua > ub ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

/**
 * Combines this device's data with the copy on GitHub. Nothing is lost: everything added anywhere is kept,
 * the newest edit of each weigh-in wins, and deletes are applied everywhere.
 */
export function mergeStates(local, remote) {
  if (!remote) return normalise(local);
  const a = normalise(local);
  const b = normalise(remote);
  const deleted = { ...b.deleted };
  for (const [id, at] of Object.entries(a.deleted)) deleted[id] = Math.max(deleted[id] || 0, at);
  const alive = (x) => !(deleted[x.id] && deleted[x.id] >= (x.updatedAt || 0));

  const map = new Map();
  for (const x of a.entries) map.set(x.id, x);
  for (const y of b.entries) map.set(y.id, map.has(y.id) ? newer(map.get(y.id), y) : y);
  const entries = [...map.values()].filter(alive);

  const settings = { ...b.settings, ...a.settings, stamps: {} };
  for (const k of SETTING_KEYS) {
    const ta = a.settings.stamps[k] || 0;
    const tb = b.settings.stamps[k] || 0;
    const va = a.settings[k] ?? null;
    const vb = b.settings[k] ?? null;
    let useB = tb > ta;
    if (ta === tb) useB = va === null ? vb !== null : vb !== null && JSON.stringify(vb) > JSON.stringify(va);
    settings[k] = useB ? vb : va;
    settings.stamps[k] = Math.max(ta, tb);
  }
  return normalise({ ...b, ...a, schema: Math.max(a.schema, b.schema), entries, deleted, settings });
}

/** The data in a fixed order, so two copies with the same content always look identical. */
export function canonical(state) {
  const s = normalise(state);
  const byId = (x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
  const { version, ...rest } = s;
  return {
    ...rest,
    app: 'WeightTrack',
    entries: [...s.entries].sort(byId),
    deleted: Object.fromEntries(Object.entries(s.deleted).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))),
  };
}

// ---------- Small helpers ----------

export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export const round1 = (n) => Math.round(n * 10) / 10;
export const round2 = (n) => Math.round(n * 100) / 100;

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Number typing: digits and one decimal point, at most two decimals. */
export function sanitizeNumber(text, maxLen = 6) {
  let out = '';
  let seenSep = false;
  let decimals = 0;
  for (const ch of String(text)) {
    if (ch >= '0' && ch <= '9') {
      if (seenSep) {
        if (decimals >= 2) continue;
        decimals += 1;
      }
      out += ch;
    } else if ((ch === '.' || ch === ',') && !seenSep) {
      seenSep = true;
      if (!out) out = '0';
      out += '.';
    }
  }
  return out.slice(0, maxLen);
}

export function parseNumber(text) {
  const n = Number(String(text).trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

// ---------- Dates (stored as local YYYY-MM-DD strings) ----------

const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayISO = () => toISO(new Date());
export const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export const daysBetween = (fromIso, toIso) => Math.round((fromISO(toIso) - fromISO(fromIso)) / 86400000);
export const monthOf = (iso) => iso.slice(0, 7);
/** Monday of the week that contains `iso`. */
export function weekStart(iso) {
  const d = fromISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
}
export function addMonths(ym, n) {
  let y = Number(ym.slice(0, 4));
  let m = Number(ym.slice(5, 7)) + n;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return `${y}-${pad(m)}`;
}

// ---------- Weight maths ----------

/** Weigh-ins newest first (by date, then time, then when they were added). */
export function sortedEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if ((a.time || '') !== (b.time || '')) return (a.time || '') < (b.time || '') ? 1 : -1;
    return b.createdAt - a.createdAt;
  });
}

/** One value per day: the average of that day's weigh-ins. Oldest first. */
export function dailySeries(entries) {
  const byDay = new Map();
  for (const e of entries) {
    const list = byDay.get(e.date) || [];
    list.push(e.kg);
    byDay.set(e.date, list);
  }
  return [...byDay.entries()]
    .map(([date, list]) => ({ date, kg: round2(list.reduce((s, v) => s + v, 0) / list.length) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** The average of the weigh-ins in the 7 days up to and including each day (smooths out daily ups and downs). */
export function movingAverage(series, days = 7) {
  return series.map((p) => {
    const from = addDays(p.date, -(days - 1));
    const win = series.filter((q) => q.date >= from && q.date <= p.date);
    return { date: p.date, kg: round2(win.reduce((s, q) => s + q.kg, 0) / win.length) };
  });
}

/** Latest daily value on or before `iso` (or null). */
export function valueOnOrBefore(series, iso) {
  let found = null;
  for (const p of series) {
    if (p.date <= iso) found = p;
    else break;
  }
  return found;
}

export function bmiOf(kg, heightCm) {
  if (!heightCm || !kg) return null;
  const m = heightCm / 100;
  return round1(kg / (m * m));
}

/** Adult BMI bands (WHO). */
export function bmiBand(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return { key: 'under', label: 'Below the healthy range' };
  if (bmi < 25) return { key: 'healthy', label: 'In the healthy range' };
  if (bmi < 30) return { key: 'over', label: 'Above the healthy range' };
  return { key: 'obese', label: 'Well above the healthy range' };
}

export function healthyRange(heightCm) {
  if (!heightCm) return null;
  const m2 = (heightCm / 100) ** 2;
  return { low: round1(18.5 * m2), high: round1(24.9 * m2) };
}

// ---------- Sample data (Settings → "Try it with sample data") ----------

export function sampleState() {
  const t = todayISO();
  const entries = [];
  let kg = 84.2;
  // Seeded wobble so the sample looks the same every time.
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let d = 120; d >= 0; d -= 1) {
    kg -= 0.045 + (d < 40 ? 0.01 : 0);
    if (rand() < 0.22) continue; // not every day
    const wobble = (rand() - 0.5) * 0.9;
    entries.push({
      id: uid(), date: addDays(t, -d), time: '07:0' + Math.floor(rand() * 10), kg: round1(kg + wobble), note: d === 120 ? 'Starting out' : '',
      createdAt: Date.now() - d * 86400000, sample: true,
    });
  }
  const startDate = addDays(t, -120);
  return {
    ...emptyState(),
    entries,
    settings: {
      ...defaultSettings(),
      heightCm: 176,
      target: { kg: 74, date: addDays(t, 100), startKg: 84.2, startDate, createdAt: Date.now(), sample: true },
    },
  };
}
