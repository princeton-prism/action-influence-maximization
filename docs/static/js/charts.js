// @ts-check
// Interactive composite result charts: hand-rolled inline SVG, no build step.
// Renders public chart data as interactive panels
// with viridis-mapped curves. Hovering/focusing a curve or its legend entry
// highlights that series across every panel and dims the rest.

const SVGNS = 'http://www.w3.org/2000/svg';

/** @param {string} tag @param {Record<string, string|number>} attrs */
function svgEl(tag, attrs) {
  const el = document.createElementNS(SVGNS, tag);
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  return el;
}

// --- viridis colour ramp (10 anchor stops) ---------------------------------
const VIRIDIS = [
  '#440154', '#482878', '#3e4a89', '#31688e', '#26828e',
  '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725',
];

/** @param {string} hex @returns {[number, number, number]} */
function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Sample the viridis ramp at t in [0, 1]. @param {number} t */
function viridis(t) {
  const x = Math.min(1, Math.max(0, t)) * (VIRIDIS.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  if (i >= VIRIDIS.length - 1) return VIRIDIS[VIRIDIS.length - 1];
  const a = hexRgb(VIRIDIS[i]);
  const b = hexRgb(VIRIDIS[i + 1]);
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// AIM is the "win" — pinned to the bright lime end (site --aim-lime).
const AIM_COLOR = '#a7d129';
// References are neutral, off-ramp (mirror --aim-ink / --aim-muted).
/** @type {Record<string, string>} */
const REF_COLOR = { '300k expert': '#12131a', '3k expert': '#8b9096' };
// Stable order → spread non-AIM methods across the low/mid viridis range.
const METHOD_ORDER = [
  'uniform random', 'on-policy', 'fixed-start random', 'random walk', 'recovery',
  'dads', 'diayn', 'icm', 'metra', 'ppo expert (push-t)', 'oracle ppo (four rooms)',
  'early-stop ppo', 'pomdp ppo', 'uniform random data', 'ppo expert',
];

/** @param {string} key */
function hashT(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0xffff;
  return 0.04 + 0.62 * (h / 0xffff);
}

/** Canonical series id: unify AIM's per-domain labels ("AIM (IQL-AWR)" in
 *  FourRooms, "AIM (active)" in Push-T) so it's one legend entry that
 *  highlights across every panel. @param {string} label */
function canonKey(label) {
  const k = label.trim();
  return /^aim\b/i.test(k) ? 'AIM' : k;
}

/** Colour for a data series, keyed by its label. @param {string} key */
function seriesColor(key) {
  const k = key.trim().toLowerCase();
  if (k.startsWith('aim')) return AIM_COLOR;
  if (k.includes('fixed-start aim')) return viridis(0.72);
  const i = METHOD_ORDER.indexOf(k);
  const t = i >= 0 ? 0.04 + 0.62 * (i / (METHOD_ORDER.length - 1)) : hashT(k);
  return viridis(t);
}

/** @type {Record<string, string>} */
const DASHARRAY = { solid: '', dashed: '7 4', dotted: '2 4', dashdot: '7 3 2 3' };

// --- scales + ticks ---------------------------------------------------------
/** @param {number} range @param {boolean} round */
function niceNum(range, round) {
  const exp = Math.floor(Math.log10(range || 1));
  const f = range / Math.pow(10, exp);
  const nf = round
    ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10)
    : (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10);
  return nf * Math.pow(10, exp);
}

/** @param {number} min @param {number} max @param {number} count */
function linTicks(min, max, count) {
  const step = niceNum((max - min) / Math.max(1, count - 1), true);
  const start = Math.ceil(min / step) * step;
  /** @type {number[]} */ const ticks = [];
  for (let v = start; v <= max + step * 1e-6; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

/** @param {number} min @param {number} max */
function logTicks(min, max) {
  /** @type {number[]} */ const ticks = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    ticks.push(Math.pow(10, e));
  }
  return ticks.filter((t) => t >= min * 0.999 && t <= max * 1.001);
}

/** @param {number} v */
function fmtTick(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  if (a >= 10 || v === 0) return `${Math.round(v)}`;
  return `${+v.toFixed(1)}`;
}

// --- panel rendering --------------------------------------------------------
const W = 520;
const H = 360;
const M = { l: 70, r: 22, t: 18, b: 60 };

/** @param {any} panel */
function renderPanel(panel) {
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;
  const log = panel.xscale === 'log';

  const xs = panel.series.flatMap((/** @type {any} */ s) => s.x);
  const ys = panel.series.flatMap((/** @type {any} */ s) => s.y)
    .concat(panel.refs.map((/** @type {any} */ r) => r.y));
  let [x0, x1] = panel.xlim || [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = panel.ylim || [Math.min(...ys), Math.max(...ys)];
  if (log) x0 = Math.max(x0, Math.min(...xs.filter((/** @type {number} */ v) => v > 0)));

  const fx = (/** @type {number} */ x) => {
    const t = log ? (Math.log10(x) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0))
                  : (x - x0) / (x1 - x0);
    return M.l + t * plotW;
  };
  const fy = (/** @type {number} */ y) => M.t + (1 - (y - y0) / (y1 - y0)) * plotH;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'aim-chart-svg',
    role: 'img', 'aria-label': panel.title || panel.ylabel });

  const clipId = `clip-${Math.abs(hashT(panel.title + panel.ylabel) * 1e6) | 0}`;
  const clip = svgEl('clipPath', { id: clipId });
  clip.appendChild(svgEl('rect', { x: M.l, y: M.t, width: plotW, height: plotH }));
  svg.appendChild(clip);

  // gridlines + tick labels
  const xticks = log ? logTicks(x0, x1) : linTicks(x0, x1, 5);
  const yticks = linTicks(y0, y1, 5);
  for (const yt of yticks) {
    const py = fy(yt);
    svg.appendChild(svgEl('line', { x1: M.l, y1: py, x2: M.l + plotW, y2: py, class: 'aim-chart-grid' }));
    const tl = svgEl('text', { x: M.l - 10, y: py + 5, class: 'aim-chart-tick', 'text-anchor': 'end' });
    tl.textContent = fmtTick(yt);
    svg.appendChild(tl);
  }
  for (const xt of xticks) {
    const px = fx(xt);
    const tl = svgEl('text', { x: px, y: M.t + plotH + 24, class: 'aim-chart-tick', 'text-anchor': 'middle' });
    tl.textContent = fmtTick(xt);
    svg.appendChild(tl);
  }

  // axis frame
  svg.appendChild(svgEl('line', { x1: M.l, y1: M.t + plotH, x2: M.l + plotW, y2: M.t + plotH, class: 'aim-chart-axis' }));
  svg.appendChild(svgEl('line', { x1: M.l, y1: M.t, x2: M.l, y2: M.t + plotH, class: 'aim-chart-axis' }));

  // axis labels
  const xlab = svgEl('text', { x: M.l + plotW / 2, y: H - 10, class: 'aim-chart-axislabel', 'text-anchor': 'middle' });
  xlab.textContent = panel.xlabel;
  svg.appendChild(xlab);
  const ylab = svgEl('text', { x: 18, y: M.t + plotH / 2, class: 'aim-chart-axislabel',
    'text-anchor': 'middle', transform: `rotate(-90 18 ${M.t + plotH / 2})` });
  ylab.textContent = panel.ylabel;
  svg.appendChild(ylab);

  // reference lines — hoverable like series (share the ref label as data-series)
  for (const ref of panel.refs) {
    if (ref.y < y0 || ref.y > y1) continue;
    const py = fy(ref.y);
    const rg = svgEl('g', { class: 'aim-series', 'data-series': ref.label });
    rg.appendChild(svgEl('line', {
      x1: M.l, y1: py, x2: M.l + plotW, y2: py,
      class: 'aim-chart-ref', stroke: REF_COLOR[ref.label] || '#8b9096',
      'stroke-dasharray': DASHARRAY[ref.dash] || '5 4',
    }));
    rg.appendChild(svgEl('line', { x1: M.l, y1: py, x2: M.l + plotW, y2: py, class: 'aim-chart-hit' }));
    svg.appendChild(rg);
  }

  // data series (clipped)
  const plot = svgEl('g', { 'clip-path': `url(#${clipId})` });
  for (const s of panel.series) {
    const key = canonKey(s.key);
    const color = seriesColor(key);
    const pts = s.x.map((/** @type {number} */ x, /** @type {number} */ i) => `${fx(x)},${fy(s.y[i])}`);
    const g = svgEl('g', { class: 'aim-series', 'data-series': key });
    const isScatter = s.type === 'scatter';
    if (!isScatter) {
      g.appendChild(svgEl('polyline', {
        points: pts.join(' '), class: 'aim-chart-line', stroke: color,
        'stroke-dasharray': DASHARRAY[s.dash] || '',
      }));
      // transparent fat hit-line for easy hover
      g.appendChild(svgEl('polyline', { points: pts.join(' '), class: 'aim-chart-hit' }));
    }
    for (let i = 0; i < s.x.length; i++) {
      g.appendChild(svgEl('circle', {
        cx: fx(s.x[i]), cy: fy(s.y[i]), r: isScatter ? 5.5 : 3.4,
        class: 'aim-chart-dot', fill: color,
      }));
      if (isScatter) {
        g.appendChild(svgEl('circle', {
          cx: fx(s.x[i]), cy: fy(s.y[i]), r: 13, class: 'aim-chart-hit-dot',
        }));
      }
    }
    plot.appendChild(g);
  }
  svg.appendChild(plot);
  return svg;
}

/** Build the shared legend (union of series + refs across panels). @param {any} doc */
function renderLegend(doc) {
  /** @type {{key:string,label:string,color:string,dash:string,ref:boolean}[]} */
  const items = [];
  const seen = new Set();
  for (const p of doc.panels) {
    for (const s of p.series) {
      const key = canonKey(s.key);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ key, label: key === 'AIM' ? 'AIM' : s.label, color: seriesColor(key), dash: s.dash, ref: false });
    }
  }
  for (const p of doc.panels) {
    for (const r of p.refs) {
      if (seen.has(r.label)) continue;
      seen.add(r.label);
      items.push({ key: r.label, label: r.label, color: REF_COLOR[r.label] || '#8b9096', dash: r.dash, ref: true });
    }
  }
  const ul = document.createElement('ul');
  ul.className = 'aim-chart-legend';
  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'aim-chart-legend-item' + (it.ref ? ' is-ref' : '');
    li.setAttribute('data-series', it.key);
    li.tabIndex = 0;
    const sw = document.createElement('span');
    sw.className = 'aim-chart-swatch';
    sw.style.background = it.color;
    if (it.dash === 'dotted') sw.style.opacity = '0.85';
    li.appendChild(sw);
    li.appendChild(document.createTextNode(it.label));
    ul.appendChild(li);
  }
  return ul;
}

/** Wire hover/focus highlight across all [data-series] in the chart root. @param {HTMLElement} root */
function wireHighlight(root) {
  const setActive = (/** @type {string} */ key, /** @type {boolean} */ on) => {
    root.classList.toggle('is-hovering', on);
    root.querySelectorAll(`[data-series="${CSS.escape(key)}"]`).forEach((el) =>
      el.classList.toggle('is-active', on));
  };
  root.querySelectorAll('[data-series]').forEach((el) => {
    const key = el.getAttribute('data-series') || '';
    el.addEventListener('mouseenter', () => setActive(key, true));
    el.addEventListener('mouseleave', () => setActive(key, false));
    el.addEventListener('focus', () => setActive(key, true));
    el.addEventListener('blur', () => setActive(key, false));
  });
}

/** @param {HTMLElement} container @param {any} doc */
function renderChart(container, doc) {
  container.textContent = '';
  const panels = document.createElement('div');
  panels.className = 'aim-chart-panels';
  for (const panel of doc.panels) {
    if (panel.heading) {
      const panelContainer = document.createElement('div');
      const heading = document.createElement('h4');
      panelContainer.className = 'aim-chart-panel';
      heading.className = 'aim-chart-panel-heading';
      heading.textContent = panel.heading;
      panelContainer.append(heading, renderPanel(panel));
      panels.appendChild(panelContainer);
    } else {
      panels.appendChild(renderPanel(panel));
    }
  }
  container.appendChild(panels);
  container.appendChild(renderLegend(doc));
  wireHighlight(container);
}

/** Find [data-chart-data] containers, fetch their JSON, and render. */
async function initCharts() {
  const nodes = document.querySelectorAll('[data-chart-data]');
  for (const node of nodes) {
    const url = node.getAttribute('data-chart-data');
    if (!url || !(node instanceof HTMLElement)) continue;
    try {
      const doc = await (await fetch(url)).json();
      renderChart(node, doc);
    } catch (err) {
      node.classList.add('aim-chart-failed'); // <noscript>/img fallback shows
    }
  }
}

if (document.readyState !== 'loading') {
  initCharts();
} else {
  document.addEventListener('DOMContentLoaded', initCharts);
}
