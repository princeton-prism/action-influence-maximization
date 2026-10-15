/** Recorded model-conditioning XY deltas, aligned with displayed target frames. */
const DISPLAY_RADIUS_M = .05;
const dataRoot = new URL('./static/data/action-inputs/', import.meta.url);
const resources = new Map();

async function readJson(url) {
  if (!resources.has(url.href)) {
    resources.set(url.href, fetch(url).then((response) => {
      if (!response.ok) {
        throw new Error('Recorded inputs unavailable');
      }
      return response.json();
    }).catch((error) => {
      resources.delete(url.href);
      throw error;
    }));
  }
  return resources.get(url.href);
}

export function caseInputs(bank, caseId, frames) {
  const inputs = bank.cases?.[caseId];
  if (!Array.isArray(inputs) || inputs.length !== frames || frames < 1) {
    throw new Error('Recorded input timeline does not match the video');
  }
  if (inputs.some((row) => !Array.isArray(row) || row.length !== 2 ||
      !row.every(Number.isFinite))) {
    throw new Error('Recorded inputs must contain finite XY pairs');
  }
  return inputs;
}

export async function loadCaseInputs(dataset, caseId, frames) {
  const index = await readJson(new URL('index.json', dataRoot));
  const path = index.datasets[dataset];
  if (index.schema_version !== 1 || index.units !== 'm' || !path ||
      !/^\.\/static\/data\/action-inputs\/d\d+\.json$/.test(path)) {
    throw new Error('Recorded input scale or distribution unavailable');
  }
  const bank = await readJson(new URL(path.split('/').at(-1), dataRoot));
  return caseInputs(bank, caseId, frames);
}

/** Rebuild history from the selected frame, including backward seeks and loops. */
export function inputTrail(inputs, frame) {
  if (!Number.isInteger(frame) || frame < 0 || frame >= inputs.length) {
    throw new Error('Recorded input frame is outside the timeline');
  }
  const start = Math.max(0, frame - 8);
  return inputs.slice(start, frame + 1).map(([x, y], offset) => {
    const magnitude = Math.hypot(x, y);
    const scale = 36 / Math.max(DISPLAY_RADIUS_M, magnitude);
    return {index: start + offset, x: 50 + x * scale, y: 50 - y * scale,
      clipped: magnitude > DISPLAY_RADIUS_M,
      opacity: Math.exp((start + offset - frame) / 3)};
  });
}

export function renderActionInput(root, inputs, frame) {
  const trail = root.querySelector('.input-trail');
  const readout = root.querySelector('output');
  const svg = root.querySelector('svg');
  const caption = root.querySelector('.input-caption');
  caption.textContent = 'Action · mm';
  trail.replaceChildren();
  root.dataset.frame = inputs ? frame : -1;
  if (!inputs) {
    readout.textContent = 'Unavailable';
    svg.setAttribute('aria-label', 'Recorded action unavailable');
    return;
  }
  const points = inputTrail(inputs, frame);
  const append = (tag, attributes) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, value);
    }
    trail.append(node);
  };
  points.forEach((point, index) => {
    if (index) {
      const previous = points[index - 1];
      append('line', {x1: previous.x, y1: previous.y, x2: point.x, y2: point.y,
        opacity: point.opacity, class: 'input-history'});
    }
  });
  const current = points.at(-1);
  append('line', {x1: 50, y1: 50, x2: current.x, y2: current.y,
    class: 'input-vector'});
  append('circle', {cx: current.x, cy: current.y, r: 3,
    class: `input-puck${current.clipped ? ' input-overflow' : ''}`});
  if (current.clipped) {
    caption.textContent = 'Action >50 mm';
  }
  const [x, y] = inputs[frame].map((value) => value * 1000);
  const signed = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
  readout.textContent = `${signed(x)}, ${signed(y)}`;
  svg.setAttribute('aria-label', `Action: X ${signed(x)} mm, Y ${signed(y)} mm` +
    (current.clipped ? '; exceeds the 50 mm display radius' : ''));
}
