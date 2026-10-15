/** Aggregate Table 1 preference scores. */
import {modelInfo} from './presentation.mjs';

export const PREFERENCE_DATA = {
  interval: 'Reported Table 1 intervals',
  distributions: ['BC', 'BC Failure', 'Push-Away'],
  // Each pair is score and reported ± value, in distribution order above.
  models: [
    {model: 'PPO100', scores: [[843, 155], [1040, 185], [816, 128]]},
    {model: 'PPO1', scores: [[732, 155], [824, 171], [889, 132]]},
    {model: 'PPO1 + AIM500', scores: [[1190, 167], [1049, 185], [1029, 134]]},
    {model: 'PPO1 + Recovery500', scores: [[979, 155], [989, 200], [735, 128]]},
    {model: 'PPO1 + ICM500', scores: [[868, 145], [934, 186], [924, 141]]},
    {model: 'PPO1 + DIAYN500', scores: [[693, 145], [976, 167], [741, 129]]},
    {model: 'Recovery1', scores: [[1059, 158], [1099, 202], [1250, 147]]},
    {model: 'Recovery1 + transferred AIM500', scores: [[1412, 183], [1147, 212], [1317, 178]]},
    {model: 'PPO1 + fixed-policy AIM500', scores: [[1388, 174], [1047, 169], [1092, 138]]},
    {model: 'PPO1 + AIM500 (novelty only)', scores: [[1107, 208], [964, 151], [1076, 207]]},
    {model: 'PPO1 + AIM500 (MI only)', scores: [[1376, 295], [1128, 191], [1048, 184]]},
  ],
};

export function preferenceRows(distribution) {
  if (!PREFERENCE_DATA.distributions[distribution]) {
    throw new RangeError('Unknown preference distribution');
  }
  return PREFERENCE_DATA.models.map((row) => ({
    model: row.model,
    label: modelInfo(row.model).label,
    score: row.scores[distribution][0],
    interval: row.scores[distribution][1],
  })).sort((a, b) => b.score - a.score);
}

export function intervalGeometry(score, interval) {
  const x = (value) => value / 1800 * 400;
  return {center: x(score), low: x(score - interval), high: x(score + interval)};
}

export function renderPreferenceFigure(root) {
  const tabs = root.querySelector('.preference-tabs');
  const rows = root.querySelector('.preference-rows');
  function node(tag, text, className) {
    const result = document.createElement(tag);
    if (text !== undefined) {
      result.textContent = text;
    }
    if (className) {
      result.className = className;
    }
    return result;
  }
  function svg(tag, attributes) {
    const result = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) {
      result.setAttribute(key, value);
    }
    return result;
  }
  function select(distribution) {
    root.dataset.distribution = PREFERENCE_DATA.distributions[distribution];
    [...tabs.children].forEach((button, index) => {
      button.classList.toggle('active', index === distribution);
      button.setAttribute('aria-pressed', String(index === distribution));
    });
    rows.replaceChildren();
    for (const row of preferenceRows(distribution)) {
      const entry = node('div', undefined, 'preference-row');
      const value = `${row.score} ± ${row.interval}`;
      const geometry = intervalGeometry(row.score, row.interval);
      const chart = svg('svg', {viewBox: '0 0 400 28', role: 'img',
        'aria-label': `${row.label}: ${value}, reported interval`});
      const title = svg('title', {});
      title.textContent = `${row.label}: ${value}`;
      chart.append(title, svg('rect', {x: 0, y: 5, width: geometry.center,
        height: 18, class: 'preference-bar'}));
      chart.append(svg('line', {x1: geometry.low, x2: geometry.high,
        y1: 14, y2: 14, class: 'preference-interval'}));
      for (const x of [geometry.low, geometry.high]) {
        chart.append(svg('line', {x1: x, x2: x, y1: 9, y2: 19,
          class: 'preference-interval'}));
      }
      chart.append(svg('circle', {cx: geometry.center, cy: 14, r: 3}));
      entry.append(node('span', row.label, 'preference-name'), chart,
        node('span', value, 'preference-score'));
      rows.append(entry);
    }
  }
  PREFERENCE_DATA.distributions.forEach((label, index) => {
    const button = node('button', label);
    button.type = 'button';
    button.addEventListener('click', () => select(index));
    tabs.append(button);
  });
  select(0);
}
