'use strict';

// ---------- Textos y formatos ----------

const SPORTS = {
  Run: 'Carrera', TrailRun: 'Trail', VirtualRun: 'Carrera virtual',
  Ride: 'Ciclismo', VirtualRide: 'Ciclismo virtual', GravelRide: 'Gravel',
  MountainBikeRide: 'MTB', EBikeRide: 'E-bike', EMountainBikeRide: 'E-MTB',
  Walk: 'Caminata', Hike: 'Senderismo', Swim: 'Natación',
  WeightTraining: 'Pesas', Workout: 'Entrenamiento', Yoga: 'Yoga', Pilates: 'Pilates',
  Crossfit: 'Crossfit', HighIntensityIntervalTraining: 'HIIT',
  Rowing: 'Remo', VirtualRow: 'Remo virtual', Elliptical: 'Elíptica', StairStepper: 'Escaladora',
  Soccer: 'Fútbol', Tennis: 'Tenis', Padel: 'Pádel',
  AlpineSki: 'Esquí alpino', NordicSki: 'Esquí de fondo', BackcountrySki: 'Esquí de travesía', Snowboard: 'Snowboard',
  Kayaking: 'Kayak', StandUpPaddling: 'Paddle surf', Surfing: 'Surf',
};
const PACE_SPORTS = new Set(['Run', 'TrailRun', 'VirtualRun', 'Walk', 'Hike']);
const RUN_SPORTS = new Set(['Run', 'TrailRun', 'VirtualRun']);
const SPEED_SPORTS = new Set(['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide', 'EMountainBikeRide']);

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const RANGES = [
  ['30', '30 días'],
  ['90', '90 días'],
  ['365', '12 meses'],
  ['ytd', 'Este año'],
  ['all', 'Todo'],
];

const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' });
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, useGrouping: 'always' });
const monthYear = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const longDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

const sportName = (s) => SPORTS[s] || s.replace(/([a-z])([A-Z])/g, '$1 $2');
const fmtKm = (meters) => {
  const k = meters / 1000;
  return `${k >= 100 ? nf0.format(k) : nf1.format(k)} km`;
};
const fmtDuration = (seconds) => {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${nf0.format(h)} h ${m} min` : `${m} min`;
};
const fmtPace = (secondsPerKm) => {
  const total = Math.round(secondsPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} /km`;
};
const shortDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const fullShortDate = (d) => `${shortDate(d)} ${d.getFullYear()}`;

function paceOrSpeed(a) {
  if (!a.distance || !a.movingTime) return '—';
  if (PACE_SPORTS.has(a.sport)) return fmtPace(a.movingTime / (a.distance / 1000));
  if (SPEED_SPORTS.has(a.sport)) return `${nf1.format(a.distance / 1000 / (a.movingTime / 3600))} km/h`;
  if (a.sport === 'Swim') return `${fmtPace(a.movingTime / (a.distance / 100)).replace('/km', '/100 m')}`;
  return '—';
}

// ---------- Fechas ----------

function parseLocal(str) {
  const [d, t = '00:00'] = str.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return new Date(y, mo - 1, da, h, mi);
}
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const weekStart = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

// ---------- Estado ----------

const state = { range: '90', sport: 'all' };
let activities = [];

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}
function svg(tag, attrs = {}, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

// ---------- Carga ----------

async function loadData() {
  try {
    const r = await fetch('data/strava.json', { cache: 'no-store' });
    if (r.ok) return { data: await r.json(), sample: false };
  } catch { /* sin datos reales todavía */ }
  const r = await fetch('data/sample.json', { cache: 'no-store' });
  return { data: await r.json(), sample: true };
}

async function init() {
  const { data, sample } = await loadData();
  activities = data.activities.map((a) => ({ ...a, d: parseLocal(a.date) }));

  $('sample-notice').hidden = !sample;
  if (!sample && data.athlete?.name) {
    $('title').textContent = `Panel deportivo de ${data.athlete.name}`;
    document.title = `Panel de ${data.athlete.name}`;
  }
  $('synced').textContent = `Actualizado el ${longDate.format(new Date(data.syncedAt))}`;

  buildFilters();
  render();
  new ResizeObserver(() => renderVolume(currentBins)).observe($('volume-chart'));
}

function buildFilters() {
  const ranges = $('ranges');
  for (const [value, label] of RANGES) {
    const b = el('button', { type: 'button', 'data-range': value, 'aria-pressed': String(value === state.range) }, label);
    b.addEventListener('click', () => {
      state.range = value;
      for (const other of ranges.children) other.setAttribute('aria-pressed', String(other === b));
      render();
    });
    ranges.append(b);
  }

  const counts = new Map();
  for (const a of activities) counts.set(a.sport, (counts.get(a.sport) || 0) + 1);
  const select = $('sport');
  select.append(el('option', { value: 'all' }, 'Todos los deportes'));
  for (const [sport] of [...counts].sort((x, y) => y[1] - x[1])) {
    select.append(el('option', { value: sport }, sportName(sport)));
  }
  select.addEventListener('change', () => {
    state.sport = select.value;
    render();
  });
}

function rangeStart() {
  const today = startOfDay(new Date());
  if (state.range === 'ytd') return new Date(today.getFullYear(), 0, 1);
  if (state.range === 'all') {
    const first = activities.at(-1);
    return first ? startOfDay(first.d) : today;
  }
  return addDays(today, -(Number(state.range) - 1));
}

// ---------- Render ----------

let currentBins = null;

function render() {
  const start = rangeStart();
  const list = activities.filter((a) => a.d >= start && (state.sport === 'all' || a.sport === state.sport));

  const empty = list.length === 0;
  $('empty').hidden = !empty;
  document.querySelector('.grid').hidden = empty;

  renderStats(list, start);
  currentBins = buildBins(list, start);
  if (empty) return;
  renderVolume(currentBins);
  renderVolumeTable(currentBins);
  renderSports(list);
  renderRecords(list);
  renderActivities(list);
}

function renderStats(list, start) {
  const sum = (key) => list.reduce((s, a) => s + a[key], 0);
  $('stat-distance').textContent = fmtKm(sum('distance'));
  $('stat-count').textContent = nf0.format(list.length);
  $('stat-time').textContent = fmtDuration(sum('movingTime'));
  $('stat-elevation').textContent = `${nf0.format(sum('elevation'))} m`;
  $('stat-period').textContent = `Desde el ${longDate.format(start)}`;
}

function buildBins(list, start) {
  const today = startOfDay(new Date());
  const monthly = (today - start) / 864e5 > 200;
  const bins = [];
  const byKey = new Map();
  let cursor = monthly ? monthStart(start) : weekStart(start);
  while (cursor <= today) {
    const bin = { start: cursor, distance: 0, count: 0, time: 0 };
    bins.push(bin);
    byKey.set(cursor.getTime(), bin);
    cursor = monthly ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1) : addDays(cursor, 7);
  }
  for (const a of list) {
    const bin = byKey.get((monthly ? monthStart(a.d) : weekStart(a.d)).getTime());
    if (!bin) continue;
    bin.distance += a.distance;
    bin.count += 1;
    bin.time += a.movingTime;
  }
  bins.monthly = monthly;
  return bins;
}

const binLabel = (b, monthly) => (monthly ? `${MONTHS[b.start.getMonth()]} ${String(b.start.getFullYear()).slice(2)}` : shortDate(b.start));
const binTitle = (b, monthly) => {
  if (!monthly) return `Semana del ${fullShortDate(b.start)}`;
  const s = monthYear.format(b.start);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function niceScale(maxValue) {
  if (maxValue <= 0) return { max: 10, step: 5 };
  const raw = maxValue / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  return { max: Math.ceil(maxValue / step) * step, step };
}

function roundTop(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function renderVolume(bins) {
  const box = $('volume-chart');
  if (!bins || box.offsetParent === null) return;
  const monthly = bins.monthly;
  $('volume-title').textContent = monthly ? 'Distancia por mes' : 'Distancia por semana';

  const W = Math.max(280, box.clientWidth);
  const H = 260;
  const m = { t: 12, r: 4, b: 30, l: 48 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const values = bins.map((b) => b.distance / 1000);
  const { max, step } = niceScale(Math.max(...values));
  const y = (v) => m.t + ih - (v / max) * ih;

  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`, height: H,
    role: 'img', 'aria-label': `Kilómetros por ${monthly ? 'mes' : 'semana'}`,
  });

  for (let v = 0; v <= max + 1e-9; v += step) {
    root.append(svg('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'axis-line' : 'grid-line' }));
    root.append(svg('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, nf0.format(v)));
  }

  const band = iw / bins.length;
  const bw = Math.max(2, Math.min(24, band * 0.7));
  const every = Math.max(1, Math.ceil(58 / band));

  bins.forEach((b, i) => {
    const v = values[i];
    const x0 = m.l + i * band;
    const hit = svg('rect', {
      x: x0, y: m.t, width: band, height: ih, class: 'hit', tabindex: 0,
      'aria-label': `${binTitle(b, monthly)}: ${fmtKm(b.distance)}, ${b.count} actividades`,
    });
    root.append(hit);

    let bar = null;
    const h = (v / max) * ih;
    if (h > 0) {
      bar = svg('path', { d: roundTop(x0 + (band - bw) / 2, m.t + ih - h, bw, h), class: 'bar' });
      root.append(bar);
    }

    const show = () => {
      hit.classList.add('active');
      bar?.classList.add('active');
      const rect = hit.getBoundingClientRect();
      showTip(rect.left + rect.width / 2, (bar ?? hit).getBoundingClientRect().top, fmtKm(b.distance), binTitle(b, monthly),
        b.count ? `${b.count} ${b.count === 1 ? 'actividad' : 'actividades'} · ${fmtDuration(b.time)}` : 'Sin actividades');
    };
    const hide = () => {
      hit.classList.remove('active');
      bar?.classList.remove('active');
      hideTip();
    };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', show);
    hit.addEventListener('blur', hide);
    // las barras están por encima de la zona sensible; que no corten el hover
    if (bar) bar.style.pointerEvents = 'none';

    if (i % every === 0) {
      root.append(svg('text', { x: x0 + band / 2, y: H - 8, 'text-anchor': 'middle', class: 'tick' }, binLabel(b, monthly)));
    }
  });

  box.replaceChildren(root);
}

function renderVolumeTable(bins) {
  const table = $('volume-table');
  table.replaceChildren();
  const head = el('tr');
  head.append(el('th', {}, bins.monthly ? 'Mes' : 'Semana'), el('th', { class: 'num' }, 'Distancia'),
    el('th', { class: 'num' }, 'Actividades'), el('th', { class: 'num' }, 'Tiempo'));
  const thead = el('thead');
  thead.append(head);
  table.append(thead);
  const body = el('tbody');
  for (const b of [...bins].reverse()) {
    const tr = el('tr');
    tr.append(el('td', {}, binTitle(b, bins.monthly)), el('td', { class: 'num' }, fmtKm(b.distance)),
      el('td', { class: 'num' }, nf0.format(b.count)), el('td', { class: 'num' }, b.time ? fmtDuration(b.time) : '—'));
    body.append(tr);
  }
  table.append(body);
}

function renderSports(list) {
  const totals = new Map();
  for (const a of list) {
    const t = totals.get(a.sport) || { time: 0, distance: 0, count: 0 };
    t.time += a.movingTime;
    t.distance += a.distance;
    t.count += 1;
    totals.set(a.sport, t);
  }
  let rows = [...totals].map(([sport, t]) => ({ name: sportName(sport), ...t })).sort((x, y) => y.time - x.time);
  if (rows.length > 7) {
    const rest = rows.slice(6).reduce((s, r) => ({ time: s.time + r.time, distance: s.distance + r.distance, count: s.count + r.count }), { time: 0, distance: 0, count: 0 });
    rows = [...rows.slice(0, 6), { name: 'Otros', ...rest }];
  }
  const max = Math.max(...rows.map((r) => r.time));

  const box = $('sport-bars');
  box.replaceChildren();
  for (const r of rows) {
    const row = el('div', { class: 'sport-row', tabindex: 0, 'aria-label': `${r.name}: ${fmtDuration(r.time)}` });
    const track = el('div', { class: 'sport-track' });
    const bar = el('div', { class: 'sport-bar' });
    bar.style.width = `calc((100% - 96px) * ${r.time / max})`;
    bar.style.minWidth = '2px';
    track.append(bar, el('span', { class: 'sport-value' }, fmtDuration(r.time)));
    row.append(el('span', { class: 'sport-name', title: r.name }, r.name), track);

    const show = () => {
      const rect = bar.getBoundingClientRect();
      const detail = [`${r.count} ${r.count === 1 ? 'actividad' : 'actividades'}`];
      if (r.distance) detail.push(fmtKm(r.distance));
      showTip(rect.right, rect.top, fmtDuration(r.time), r.name, detail.join(' · '));
    };
    row.addEventListener('pointerenter', show);
    row.addEventListener('pointerleave', hideTip);
    row.addEventListener('focus', show);
    row.addEventListener('blur', hideTip);
    box.append(row);
  }
}

function renderRecords(list) {
  const maxBy = (items, f) => items.reduce((best, a) => (f(a) > f(best) ? a : best), items[0]);
  const records = [];
  const withDistance = list.filter((a) => a.distance > 0);
  if (withDistance.length) {
    const a = maxBy(withDistance, (x) => x.distance);
    records.push(['Actividad más larga', fmtKm(a.distance), a]);
  }
  const a2 = maxBy(list, (x) => x.elevation);
  if (a2.elevation > 0) records.push(['Más desnivel', `${nf0.format(a2.elevation)} m`, a2]);
  const a3 = maxBy(list, (x) => x.movingTime);
  records.push(['Más tiempo', fmtDuration(a3.movingTime), a3]);
  const runs = list.filter((a) => RUN_SPORTS.has(a.sport) && a.distance >= 5000);
  if (runs.length) {
    const a = maxBy(runs, (x) => x.distance / x.movingTime);
    records.push(['Mejor ritmo (≥ 5 km)', fmtPace(a.movingTime / (a.distance / 1000)), a]);
  }

  const box = $('records');
  box.replaceChildren();
  for (const [label, value, a] of records) {
    const item = el('div');
    item.append(el('dt', {}, label), el('dd', { class: 'value' }, value),
      el('dd', { class: 'detail', title: a.name }, `${a.name} · ${fullShortDate(a.d)}`));
    box.append(item);
  }
}

function renderActivities(list) {
  const table = $('activities');
  table.replaceChildren();
  const head = el('tr');
  head.append(el('th', {}, 'Fecha'), el('th', {}, 'Actividad'), el('th', {}, 'Deporte'),
    el('th', { class: 'num' }, 'Distancia'), el('th', { class: 'num' }, 'Tiempo'),
    el('th', { class: 'num' }, 'Desnivel'), el('th', { class: 'num' }, 'Ritmo / velocidad'));
  const thead = el('thead');
  thead.append(head);
  table.append(thead);
  const body = el('tbody');
  for (const a of list.slice(0, 15)) {
    const tr = el('tr');
    tr.append(
      el('td', { class: 'muted' }, fullShortDate(a.d)),
      el('td', { class: 'name' }, a.name),
      el('td', {}, sportName(a.sport)),
      el('td', { class: 'num' }, a.distance ? fmtKm(a.distance) : '—'),
      el('td', { class: 'num' }, fmtDuration(a.movingTime)),
      el('td', { class: 'num' }, a.elevation ? `${nf0.format(a.elevation)} m` : '—'),
      el('td', { class: 'num' }, paceOrSpeed(a)),
    );
    body.append(tr);
  }
  table.append(body);
}

// ---------- Tooltip ----------

function showTip(x, y, value, label, detail) {
  const tip = $('tooltip');
  const row = el('div', { class: 'tt-row' });
  row.append(el('span', { class: 'tt-key' }), el('strong', {}, value));
  tip.replaceChildren(row, el('div', { class: 'tt-label' }, label));
  if (detail) tip.append(el('div', { class: 'tt-label' }, detail));
  tip.hidden = false;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const left = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8);
  const top = y - h - 10 < 8 ? y + 16 : y - h - 10;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}
function hideTip() {
  $('tooltip').hidden = true;
}
window.addEventListener('scroll', hideTip, { passive: true });

init().catch((err) => {
  console.error(err);
  $('empty').hidden = false;
  $('empty').textContent = 'No se han podido cargar los datos.';
});
