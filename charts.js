// Small hand-made SVG charts: thin columns, hover/tap tooltips, and a table view.

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Rounded data-end on top, square at the baseline. */
function columnPath(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Clean axis steps such as 0 / 50 / 100 / 150. */
export function niceTicks(max, count = 4) {
  if (!(max > 0)) return { ticks: [0], top: 1 };
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { ticks, top };
}

/**
 * Grouped column chart.
 * points: [{ tick: 'Mon', title: 'Monday 28 Sep', values: { spent: 12, saved: 0 } }]
 * series: [{ key: 'spent', label: 'Spent', color: 'var(--spent)' }]
 */
export function columnChart(container, { points, series, format, formatAxis, labelEvery = 1, ariaLabel, plotHeight = 170 }) {
  container.textContent = '';
  container.classList.add('chart');

  const width = Math.max(260, Math.floor(container.clientWidth || 320));
  const padL = 46;
  const padR = 6;
  const padT = 10;
  const plotH = plotHeight;
  const axisH = 26;
  const height = padT + plotH + axisH;
  const innerW = width - padL - padR;

  const max = Math.max(0, ...points.flatMap((p) => series.map((s) => p.values[s.key] || 0)));
  const { ticks, top } = niceTicks(max);
  const band = innerW / points.length;
  const gap = 2;
  const groupW = Math.min(band * (band < 16 ? 0.84 : 0.7), series.length * 24 + (series.length - 1) * gap);
  const barW = Math.max(2, (groupW - (series.length - 1) * gap) / series.length);
  const yOf = (v) => padT + plotH - (v / top) * plotH;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: 'group',
    'aria-label': ariaLabel || 'Chart',
  });

  // Gridlines + y labels
  for (const t of ticks) {
    const y = yOf(t);
    svg.append(svgEl('line', { x1: padL, x2: width - padR, y1: y, y2: y, class: t === 0 ? 'baseline' : 'grid' }));
    const label = svgEl('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', class: 'axis-label' });
    label.textContent = formatAxis(t);
    svg.append(label);
  }

  const hover = svgEl('rect', { x: 0, y: padT, width: band, height: plotH, rx: 6, class: 'hover-band', opacity: 0 });
  svg.append(hover);

  const tip = el('div', 'chart-tip');
  tip.hidden = true;

  const showTip = (i) => {
    const p = points[i];
    hover.setAttribute('x', padL + i * band + 1);
    hover.setAttribute('width', Math.max(0, band - 2));
    hover.setAttribute('opacity', 1);
    tip.textContent = '';
    tip.append(el('div', 'tip-title', p.title));
    for (const s of series) {
      const row = el('div', 'tip-row');
      const key = el('span', 'tip-key');
      key.style.background = s.color;
      row.append(key, el('strong', '', format(p.values[s.key] || 0)), el('span', 'tip-name', s.label));
      tip.append(row);
    }
    tip.hidden = false;
    const scale = container.clientWidth / width || 1;
    const center = (padL + i * band + band / 2) * scale;
    const tipW = tip.offsetWidth;
    const left = Math.min(Math.max(4, center - tipW / 2), container.clientWidth - tipW - 4);
    tip.style.left = `${left}px`;
    tip.style.top = `${padT * scale}px`;
  };
  const hideTip = () => {
    tip.hidden = true;
    hover.setAttribute('opacity', 0);
  };

  points.forEach((p, i) => {
    const x0 = padL + i * band + (band - groupW) / 2;
    series.forEach((s, j) => {
      const v = p.values[s.key] || 0;
      if (v <= 0) return;
      const h = Math.max(2, (v / top) * plotH);
      const x = x0 + j * (barW + gap);
      svg.append(svgEl('path', { d: columnPath(x, padT + plotH - h, barW, h, 4), fill: s.color, class: 'bar' }));
    });

    // Count labels back from the newest column so "today" / "this month" is always labelled.
    if ((points.length - 1 - i) % labelEvery === 0) {
      const t = svgEl('text', { x: padL + i * band + band / 2, y: padT + plotH + 18, 'text-anchor': 'middle', class: 'axis-label' });
      t.textContent = p.tick;
      svg.append(t);
    }

    // Hit target: the whole column band (bigger than the bars), works with mouse, touch and keyboard.
    const hit = svgEl('rect', {
      x: padL + i * band, y: padT, width: band, height: plotH + axisH, fill: 'transparent', tabindex: 0,
      class: 'hit', 'aria-label': `${p.title}: ${series.map((s) => `${s.label} ${format(p.values[s.key] || 0)}`).join(', ')}`,
    });
    hit.addEventListener('pointerenter', () => showTip(i));
    hit.addEventListener('pointerdown', () => showTip(i));
    hit.addEventListener('focus', () => showTip(i));
    hit.addEventListener('blur', hideTip);
    svg.append(hit);
  });

  svg.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') hideTip();
  });

  container.append(svg, tip);
}

/** Simple table twin of a chart (every value readable without hovering). */
export function chartTable(container, { columns, rows }) {
  container.textContent = '';
  const table = el('table', 'data-table');
  const thead = el('thead');
  const hr = el('tr');
  columns.forEach((c, i) => {
    const th = el('th', i === 0 ? '' : 'num', c);
    th.scope = 'col';
    hr.append(th);
  });
  thead.append(hr);
  const tbody = el('tbody');
  for (const r of rows) {
    const tr = el('tr');
    r.forEach((cell, i) => tr.append(el(i === 0 ? 'th' : 'td', i === 0 ? '' : 'num', cell)));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  container.append(table);
}

// ---------- Weight charts ----------

/** Clean axis steps that don't have to start at zero, e.g. 72 / 74 / 76 / 78. */
export function niceRange(min, max, count = 4) {
  if (!(max > min)) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { ticks, lo, hi, step };
}

const DAY = 86400000;
const isoDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
};
const dayIso = (n) => new Date(n * DAY).toISOString().slice(0, 10);

/**
 * Line chart over a date range, with a crosshair tooltip that lists every series at the nearest date.
 * series: [{ key, label, color, points: [{ date, value }], dots, width }]
 * refLine: { value, label } — a dashed threshold line (e.g. your target)
 */
export function lineChart(container, {
  start, end, series, refLine, format, formatAxis, tickLabel, titleOf, ariaLabel, plotHeight = 190,
}) {
  container.textContent = '';
  container.classList.add('chart');
  const width = Math.max(260, Math.floor(container.clientWidth || 320));
  const padL = 46;
  const padR = 10;
  const padT = 14;
  const axisH = 26;
  const height = padT + plotHeight + axisH;
  const innerW = width - padL - padR;
  const d0 = isoDay(start);
  const d1 = Math.max(isoDay(end), d0 + 1);
  const xOf = (iso) => padL + ((isoDay(iso) - d0) / (d1 - d0)) * innerW;

  const values = series.flatMap((s) => s.points.map((p) => p.value));
  if (refLine) values.push(refLine.value);
  const { ticks, lo, hi } = niceRange(Math.min(...values), Math.max(...values));
  const yOf = (v) => padT + plotHeight - ((v - lo) / (hi - lo)) * plotHeight;

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'group', 'aria-label': ariaLabel || 'Chart' });

  for (const t of ticks) {
    const y = yOf(t);
    svg.append(svgEl('line', { x1: padL, x2: width - padR, y1: y, y2: y, class: 'grid' }));
    const label = svgEl('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', class: 'axis-label' });
    label.textContent = formatAxis(t);
    svg.append(label);
  }
  svg.append(svgEl('line', { x1: padL, x2: width - padR, y1: padT + plotHeight, y2: padT + plotHeight, class: 'baseline' }));

  // Date labels: evenly spaced, never crowded.
  const count = Math.max(2, Math.min(6, Math.floor(innerW / 72)));
  for (let i = 0; i < count; i += 1) {
    const n = Math.round(d0 + ((d1 - d0) * i) / (count - 1));
    const x = padL + ((n - d0) / (d1 - d0)) * innerW;
    const t = svgEl('text', {
      x, y: padT + plotHeight + 18, 'text-anchor': i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle', class: 'axis-label',
    });
    t.textContent = tickLabel(dayIso(n));
    svg.append(t);
  }

  if (refLine) {
    const y = yOf(refLine.value);
    svg.append(svgEl('line', { x1: padL, x2: width - padR, y1: y, y2: y, class: 'ref-line' }));
    const t = svgEl('text', { x: width - padR, y: y - 6, 'text-anchor': 'end', class: 'ref-label' });
    t.textContent = refLine.label;
    svg.append(t);
  }

  for (const s of series) {
    if (!s.points.length) continue;
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.date).toFixed(1)},${yOf(p.value).toFixed(1)}`).join('');
    svg.append(svgEl('path', {
      d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'series-line',
    }));
    if (s.dots) {
      for (const p of s.points) {
        svg.append(svgEl('circle', { cx: xOf(p.date), cy: yOf(p.value), r: 4, fill: s.color, class: 'series-dot' }));
      }
    }
  }

  // Crosshair + tooltip: the pointer finds the nearest date that has a value.
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const lookup = series.map((s) => new Map(s.points.map((p) => [p.date, p.value])));
  const cross = svgEl('line', { x1: 0, x2: 0, y1: padT, y2: padT + plotHeight, class: 'crosshair', opacity: 0 });
  svg.append(cross);
  const marks = series.map((s) => {
    const c = svgEl('circle', { r: 5, fill: s.color, class: 'focus-dot', opacity: 0 });
    svg.append(c);
    return c;
  });
  const tip = el('div', 'chart-tip');
  tip.hidden = true;
  let current = -1;

  const show = (i) => {
    if (i < 0 || i >= dates.length) return;
    current = i;
    const date = dates[i];
    const x = xOf(date);
    cross.setAttribute('x1', x);
    cross.setAttribute('x2', x);
    cross.setAttribute('opacity', 1);
    tip.textContent = '';
    tip.append(el('div', 'tip-title', titleOf(date)));
    series.forEach((s, j) => {
      const v = lookup[j].get(date);
      if (v == null) {
        marks[j].setAttribute('opacity', 0);
        return;
      }
      marks[j].setAttribute('cx', x);
      marks[j].setAttribute('cy', yOf(v));
      marks[j].setAttribute('opacity', 1);
      const row = el('div', 'tip-row');
      const key = el('span', 'tip-key');
      key.style.background = s.color;
      row.append(key, el('strong', '', format(v)), el('span', 'tip-name', s.label));
      tip.append(row);
    });
    tip.hidden = false;
    const scale = container.clientWidth / width || 1;
    const tipW = tip.offsetWidth;
    const left = Math.min(Math.max(4, x * scale - tipW / 2), container.clientWidth - tipW - 4);
    tip.style.left = `${left}px`;
    tip.style.top = `${padT * scale}px`;
  };
  const hide = () => {
    tip.hidden = true;
    cross.setAttribute('opacity', 0);
    marks.forEach((m) => m.setAttribute('opacity', 0));
  };
  const nearest = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * width;
    let best = -1;
    let bestDist = Infinity;
    dates.forEach((dte, i) => {
      const dist = Math.abs(xOf(dte) - x);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  };
  const hit = svgEl('rect', {
    x: padL - 6, y: 0, width: innerW + 12, height: padT + plotHeight + axisH, fill: 'transparent', tabindex: 0, class: 'hit',
    'aria-label': `${ariaLabel || 'Chart'} Use the left and right arrow keys to read each day.`,
  });
  hit.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  hit.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  hit.addEventListener('focus', () => show(current >= 0 ? current : dates.length - 1));
  hit.addEventListener('blur', hide);
  hit.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(Math.max(0, current - 1)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); show(Math.min(dates.length - 1, current + 1)); }
  });
  svg.append(hit);
  container.append(svg, tip);
}

/**
 * Columns that go up or down from zero (e.g. weight change each week).
 * points: [{ tick, title, value }]; up / down: { color, label }
 */
export function changeChart(container, { points, up, down, format, formatAxis, labelEvery = 1, ariaLabel, plotHeight = 150 }) {
  container.textContent = '';
  container.classList.add('chart');
  const width = Math.max(260, Math.floor(container.clientWidth || 320));
  const padL = 46;
  const padR = 6;
  const padT = 10;
  const axisH = 26;
  const height = padT + plotHeight + axisH;
  const innerW = width - padL - padR;
  const vals = points.map((p) => p.value ?? 0);
  const { ticks, lo, hi } = niceRange(Math.min(0, ...vals), Math.max(0, ...vals), 4);
  const yOf = (v) => padT + plotHeight - ((v - lo) / (hi - lo)) * plotHeight;
  const band = innerW / points.length;
  const barW = Math.min(24, Math.max(3, band * 0.6));

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'group', 'aria-label': ariaLabel || 'Chart' });
  for (const t of ticks) {
    const y = yOf(t);
    svg.append(svgEl('line', { x1: padL, x2: width - padR, y1: y, y2: y, class: Math.abs(t) < 1e-9 ? 'baseline' : 'grid' }));
    const label = svgEl('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', class: 'axis-label' });
    label.textContent = formatAxis(t);
    svg.append(label);
  }
  const hover = svgEl('rect', { x: 0, y: padT, width: band, height: plotHeight, rx: 6, class: 'hover-band', opacity: 0 });
  svg.append(hover);
  const tip = el('div', 'chart-tip');
  tip.hidden = true;
  const showTip = (i) => {
    const p = points[i];
    hover.setAttribute('x', padL + i * band + 1);
    hover.setAttribute('width', Math.max(0, band - 2));
    hover.setAttribute('opacity', 1);
    tip.textContent = '';
    tip.append(el('div', 'tip-title', p.title));
    const row = el('div', 'tip-row');
    if (p.value == null) {
      row.append(el('span', 'tip-name', 'Not enough weigh-ins'));
    } else {
      const key = el('span', 'tip-key');
      key.style.background = p.value > 0 ? up.color : down.color;
      row.append(key, el('strong', '', format(p.value)), el('span', 'tip-name', p.value > 0 ? up.label : p.value < 0 ? down.label : 'No change'));
    }
    tip.append(row);
    tip.hidden = false;
    const scale = container.clientWidth / width || 1;
    const center = (padL + i * band + band / 2) * scale;
    const tipW = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(4, center - tipW / 2), container.clientWidth - tipW - 4)}px`;
    tip.style.top = `${padT * scale}px`;
  };
  const hideTip = () => {
    tip.hidden = true;
    hover.setAttribute('opacity', 0);
  };
  points.forEach((p, i) => {
    const x = padL + i * band + (band - barW) / 2;
    if (p.value != null && Math.abs(p.value) > 0.004) {
      const y0 = yOf(0);
      const y1 = yOf(p.value);
      const h = Math.max(2, Math.abs(y1 - y0));
      // Rounded at the data end, square at the zero line.
      const path = p.value > 0 ? columnPath(x, y0 - h, barW, h, 4) : flippedColumnPath(x, y0, barW, h, 4);
      svg.append(svgEl('path', { d: path, fill: p.value > 0 ? up.color : down.color, class: 'bar' }));
    }
    if ((points.length - 1 - i) % labelEvery === 0) {
      const t = svgEl('text', { x: padL + i * band + band / 2, y: padT + plotHeight + 18, 'text-anchor': 'middle', class: 'axis-label' });
      t.textContent = p.tick;
      svg.append(t);
    }
    const hit = svgEl('rect', {
      x: padL + i * band, y: padT, width: band, height: plotHeight + axisH, fill: 'transparent', tabindex: 0, class: 'hit',
      'aria-label': `${p.title}: ${p.value == null ? 'not enough weigh-ins' : format(p.value)}`,
    });
    hit.addEventListener('pointerenter', () => showTip(i));
    hit.addEventListener('pointerdown', () => showTip(i));
    hit.addEventListener('focus', () => showTip(i));
    hit.addEventListener('blur', hideTip);
    svg.append(hit);
  });
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hideTip(); });
  container.append(svg, tip);
}

/** Like columnPath but hanging down from the zero line, rounded at the bottom. */
function flippedColumnPath(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y}V${y + h - rr}Q${x},${y + h} ${x + rr},${y + h}H${x + w - rr}Q${x + w},${y + h} ${x + w},${y + h - rr}V${y}Z`;
}
