import {loadCatalog, loadExperimentData} from './static-data.mjs';
import {
  appendExperiment,
  frameAtTime,
  metricSeries,
  matchesExperiment,
  selectLeaderboard,
  summarizeNotebook,
} from './experiments.mjs';
import {datasetInfo, METRICS, modelInfo, QUESTIONS} from './presentation.mjs';
import {renderPreferenceFigure} from './preference-figure.mjs';
import {renderAlgorithmWalkthrough} from './algorithm-walkthrough.mjs';
import {loadCaseInputs, renderActionInput} from './action-inputs.mjs';

const $ = (id) => document.getElementById(id);
const videos = ['gt', 'a', 'b'].map((id) => $(`video-${id}`));
const master = videos[0];
const colors = ['var(--a)', 'var(--b)'];
const metricNames = Object.fromEntries(Object.entries(METRICS).map(
  ([key, value]) => [key, value.label],
));
let catalog;
let dataset;
let trial;
let notebook = [];
let metric = 'ee';
let playing = false;
let scrubbing = false;
let resumeAfterScrub = false;
let countExperiment = false;
let completed = false;
let looping = false;
let generation = 0;
let storageKey;
let storageAvailable = true;
let currentFrame = -1;
let loading = false;
let renderingReady = false;
let loadingError = false;
let loadedAssets = 0;
let retryQuery;
let retryCounts = false;
let actionInputs = null;

function label(text) {
  return modelInfo(text).label;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function percent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';
}


function showError(error) {
  $('error').hidden = false;
  $('error').textContent = error.message;
}

function setBusy(busy) {
  loading = busy;
  for (const id of ['run', 'model-a', 'model-b']) {
    $(id).disabled = busy;
  }
  for (const button of document.querySelectorAll(
    '[data-preset], #distributions button',
  )) {
    button.disabled = busy;
  }
  $('run').querySelector('span:first-child').textContent = busy ? '◌' : '⚄';
  $('run').disabled = busy || $('model-a').value === $('model-b').value;
  updateRenderingState();
}

function selectedQuery() {
  return new URLSearchParams({
    dataset, a: $('model-a').value, b: $('model-b').value,
  });
}

function updateRenderingState() {
  const matches = renderingReady && matchesExperiment(trial,
    Object.fromEntries(selectedQuery()));
  const state = loading ? 'loading' : loadingError ? 'error' :
    matches ? 'ready' : 'invalid';
  const rendering = $('experiment-rendering');
  rendering.dataset.state = state;
  rendering.classList.toggle('is-stale', state !== 'ready');
  rendering.setAttribute('aria-busy', String(loading));
  rendering.inert = state !== 'ready';
  $('experiment-state').hidden = state === 'ready';
  $('experiment-state-title').textContent = state === 'error' ?
    'Experiment unavailable' : state === 'invalid' ?
      'Choose two different models' : 'Loading rollouts';
  $('experiment-state-description').hidden = state !== 'error';
  $('experiment-state-description').textContent = state === 'error' ?
    'The recorded experiment could not load. Try again.' : '';
  $('experiment-progress-group').hidden = !loading;
  $('experiment-progress').value = loadedAssets;
  $('experiment-progress-description').textContent = loadedAssets === 0 ?
    'Sampling a paired trajectory…' : `${loadedAssets - 1} / 3 videos ready`;
  $('experiment-state-action').hidden = state !== 'error';
  $('experiment-state-action').disabled = $('run').disabled;
  $('play').disabled = state !== 'ready';
  $('scrubber').disabled = state !== 'ready';
  if (state !== 'ready') {
    setPlaying(false);
  }
}

function loadSelection() {
  describeComparison();
  loadingError = false;
  const invalid = $('model-a').value === $('model-b').value;
  $('run').disabled = loading || invalid;
  $('error').hidden = true;
  if (invalid) {
    showError(new Error('Choose two different models for a paired experiment.'));
    updateRenderingState();
    return;
  }
  if (renderingReady && matchesExperiment(trial,
    Object.fromEntries(selectedQuery()))) {
    updateRenderingState();
    return;
  }
  loadExperiment(selectedQuery(), false);
}

function updateDistribution() {
  const current = catalog.datasets.find((row) => row.id === dataset);
  const info = datasetInfo(current);
  $('distribution-description').textContent = info.summary;
  for (const button of $('distributions').children) {
    const active = button.dataset.distribution === dataset;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  renderNotebook();
}

function setPreset(preset) {
  const aim = catalog.models.find((model) => model.label === 'PPO1 + AIM500');
  const baseline = catalog.models.find((model) => model.label === (
    preset === 'scale' ? 'PPO100' : preset === 'collection' ? 'PPO1' :
      'PPO1 + AIM500 (MI only)'
  ));
  $('model-a').value = aim.id;
  $('model-b').value = baseline.id;
}

function describeComparison() {
  const a = catalog.models.find((model) => model.id === $('model-a').value);
  const b = catalog.models.find((model) => model.id === $('model-b').value);
  const preset = a.label === 'PPO1 + AIM500' ? {
    PPO100: 'scale', PPO1: 'collection', 'PPO1 + AIM500 (MI only)': 'ablation',
  }[b.label] : null;
  for (const button of document.querySelectorAll('[data-preset]')) {
    const active = button.dataset.preset === preset;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  $('question-description').textContent = QUESTIONS[preset] || '';
  $('question-description').hidden = !preset;
}

function setPlaying(value) {
  playing = value;
  $('play').textContent = value ? 'Ⅱ' : '▶';
  $('play').setAttribute('aria-label', value ? 'Pause playback' : 'Play playback');
  if (!value) {
    videos.forEach((video) => video.pause());
  }
}

async function play() {
  if (!renderingReady || !matchesExperiment(trial,
    Object.fromEntries(selectedQuery()))) {
    return;
  }
  setPlaying(true);
  try {
    await Promise.all(videos.map((video) => video.play()));
  } catch (error) {
    if (error.name !== 'AbortError') {
      setPlaying(false);
      showError(new Error('Playback could not start. Press Play to try again.'));
    }
  }
}

function waitForVideo(video, source) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Video loading timed out.')),
      15000);
    function finish(error) {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', loaded);
      video.removeEventListener('error', failed);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }
    const loaded = () => finish();
    const failed = () => finish(new Error('An evaluation video could not load.'));
    video.addEventListener('loadeddata', loaded, {once: true});
    video.addEventListener('error', failed, {once: true});
    video.src = source;
    video.load();
  });
}

async function loadExperiment(query, shouldCount) {
  const version = ++generation;
  actionInputs = null;
  renderActionInput($('action-input'), null, 0);
  renderingReady = false;
  loadingError = false;
  loadedAssets = 0;
  retryQuery = new URLSearchParams(query);
  retryCounts = shouldCount;
  describeComparison();
  setPlaying(false);
  setBusy(true);
  $('error').hidden = true;
  try {
    const next = await loadExperimentData(query);
    if (version !== generation) {
      return;
    }
    loadedAssets++;
    updateRenderingState();
    trial = next;
    loadCaseInputs(next.dataset, next.case.id, next.case.valid_transitions)
      .then((inputs) => {
        if (version === generation) {
          actionInputs = inputs;
          renderActionInput($('action-input'), inputs, Math.max(0, currentFrame));
        }
      }).catch(() => {
        // Input metadata must not prevent the recorded videos from playing.
      });
    countExperiment = shouldCount;
    completed = notebook.some((row) => row.id === trial.id);
    currentFrame = -1;
    $('scrubber').max = trial.case.valid_transitions - 1;
    $('scrubber').value = 0;
    $('scrubber').disabled = true;
    $('play').disabled = true;
    for (const [index, name] of ['a', 'b'].entries()) {
      const model = trial.models[index];
      const modelLabel = label(model.label);
      $(`label-${name}`).textContent = modelLabel;
      $(`score-label-${name}`).textContent = modelLabel;
      $(`legend-label-${name}`).textContent = modelLabel;
      $(`seed-${name}`).textContent = 'Prediction';
      $(`note-${name}`).textContent = modelInfo(model.label).description;
    }
    await Promise.all(videos.map(async (video, i) => {
      await waitForVideo(video,
        i === 0 ? trial.ground_truth : trial.models[i - 1].video);
      if (version === generation) {
        loadedAssets++;
        updateRenderingState();
      }
    }));
    if (version !== generation) {
      return;
    }
    renderingReady = true;
    videos.forEach((video) => {
      video.playbackRate = Number($('speed').value);
    });
    $('scrubber').disabled = false;
    $('play').disabled = false;
    const shareQuery = new URLSearchParams(trial.query);
    history.replaceState(null, '', `?${shareQuery}`);
    renderFrame(0);

    if (!matchMedia('(prefers-reduced-motion: reduce)').matches || shouldCount) {
      await play();
    }
  } catch (error) {
    if (version === generation) {
      loadingError = true;
      showError(error);
    }
  } finally {
    if (version === generation) {
      setBusy(false);
    }
  }
}

function svgElement(tag, attributes, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, value);
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function renderChart(frame) {
  const chart = $('recall-chart');
  chart.replaceChildren();
  const n = trial.case.valid_transitions;
  const x = (i) => 32 + i / Math.max(1, n - 1) * 312;
  const y = (value) => 16 + (1 - value) * 170;
  for (const value of [0, .25, .5, .75, 1]) {
    chart.append(svgElement('line', {
      x1: 32, x2: 344, y1: y(value), y2: y(value),
      stroke: 'var(--line)', 'stroke-width': 1,
    }));
    chart.append(svgElement('text', {
      x: 24, y: y(value) + 3, 'text-anchor': 'end',
    }, `${value * 100}`));
  }
  chart.append(svgElement('text', {x: 32, y: 207}, '1'));
  chart.append(svgElement('text', {x: 188, y: 216, 'text-anchor': 'middle'},
    'Prediction frame'));
  chart.append(svgElement('text', {x: 344, y: 207, 'text-anchor': 'end'}, `${n}`));
  chart.append(svgElement('line', {
    x1: x(frame), x2: x(frame), y1: 16, y2: 186,
    stroke: 'var(--muted)', 'stroke-dasharray': '3 4',
  }));
  trial.models.forEach((model, index) => {
    const series = metricSeries(model, metric);
    let path = '';
    let inSegment = false;
    for (let i = 0; i <= frame; i++) {
      if (!Number.isFinite(series[i])) {
        inSegment = false;
        continue;
      }
      path += `${inSegment ? 'L' : 'M'}${x(i).toFixed(2)},${
        y(series[i]).toFixed(2)} `;
      inSegment = true;
    }
    chart.append(svgElement('path', {
      d: path, fill: 'none', stroke: colors[index], 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
    if (Number.isFinite(series[frame])) {
      chart.append(svgElement('circle', {
        cx: x(frame), cy: y(series[frame]), r: 3.5,
        fill: colors[index], stroke: 'var(--paper)', 'stroke-width': 1.5,
      }));
    }
    $(`recall-${index ? 'b' : 'a'}`).textContent = percent(series[frame]);
  });
}

function renderFrame(frame) {
  if (!trial || frame === currentFrame) {
    return;
  }
  currentFrame = frame;
  if (!scrubbing) {
    $('scrubber').value = frame;
  }
  $('frame-label').textContent = `${String(frame + 1).padStart(2, '0')} / ${
    trial.case.valid_transitions}`;
  renderChart(frame);
  renderActionInput($('action-input'), actionInputs, frame);
}


function renderLeaderboard(ranks, selected) {
  const entries = selectLeaderboard(ranks);
  $('leaderboard-description').textContent = `${selected.label} · ${
    metricNames[metric]} mean recall`;
  $('leaderboard-rows').replaceChildren();
  $('leaderboard-note').hidden = !entries.length;
  if (!entries.length) {
    $('leaderboard-rows').append(element('p', 'empty-state',
      ranks.length ? `No valid ${metricNames[metric].toLowerCase()} recall in these experiments.` :
        'Complete an experiment to start your leaderboard.'));
  }
  for (const row of entries) {
    const entry = element('div', 'leaderboard-row');
    entry.dataset.model = row.id;
    entry.classList.toggle('is-lowest', row.lowest);
    entry.append(element('span', 'leaderboard-place', String(row.rank)));
    const description = element('div');
    description.append(element('span', 'leaderboard-name', label(row.label)));
    if (row.lowest) {
      description.append(element('span', 'leaderboard-lowest',
        row.tiedLowest ? 'Lowest (tied)' : 'Lowest'));
    }
    description.append(element('p', 'leaderboard-samples',
      `${row.runs} run${row.runs === 1 ? '' : 's'} · ${
        row.cases} window${row.cases === 1 ? '' : 's'}`));
    entry.append(description, element('span', 'leaderboard-score',
      percent(row.mean)));
    $('leaderboard-rows').append(entry);
  }
}

function renderNotebook() {
  if (!catalog) {
    return;
  }
  const selected = catalog.datasets.find((row) => row.id === dataset);
  $('ranking-title').textContent = `${metricNames[metric]} recall`;
  $('notebook-description').textContent = `${selected.label} · mean recall over your sampled windows`;
  const ranks = summarizeNotebook(notebook, dataset, metric);
  renderLeaderboard(ranks, selected);
  $('rankings').replaceChildren();
  if (!ranks.length) {
    $('rankings').append(element('p', 'empty-state',
      'Run an experiment on this distribution to start comparing models.'));
  }
  for (const [index, row] of ranks.entries()) {
    const rank = element('div', 'rank-row');
    rank.append(element('span', 'rank-place', String(index + 1)));
    const content = element('div');
    content.append(element('span', 'rank-name', label(row.label)));
    const track = element('div', 'rank-track');
    const fill = element('div', 'rank-fill');
    fill.style.width = `${(row.mean ?? 0) * 100}%`;
    track.append(fill);
    content.append(track, element('p', 'rank-meta',
      `${row.runs} runs · ${row.cases} windows · ${row.trajectories} source trajectories`));
    rank.append(content, element('span', 'rank-score', percent(row.mean)));
    $('rankings').append(rank);
  }
  const rows = notebook.filter((row) => row.dataset === dataset);
  $('experiment-count').textContent = `${rows.length} experiment${
    rows.length === 1 ? '' : 's'}`;
  $('experiment-log').replaceChildren();
  if (!rows.length) {
    $('experiment-log').append(element('p', 'empty-state',
      'Each completed experiment is saved here, automatically. Your notebook stays in this browser.'));
  }
  for (const [index, row] of rows.slice(-5).reverse().entries()) {
    const entry = element('button', 'log-row');
    entry.append(element('span', 'log-index',
      String(rows.length - index).padStart(2, '0')));
    const description = element('span', '',
      `${label(row.models[0].label)} vs. ${label(row.models[1].label)}`);
    const [a, b] = row.models.map((model) => model.means[metric]);
    const gap = Number.isFinite(a) && Number.isFinite(b) ? a - b : null;
    entry.append(description, element('span', 'log-gap', gap === null ? '—' :
      `${gap >= 0 ? 'A' : 'B'} +${(Math.abs(gap) * 100).toFixed(1)} pp ↗`));
    entry.addEventListener('click', () => {
      $('model-a').value = row.models[0].id;
      $('model-b').value = row.models[1].id;
      loadExperiment(row.query, false);
      $('experiment').scrollIntoView({behavior: 'smooth'});
    });
    $('experiment-log').append(entry);
  }
}

function saveNotebook() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(notebook));
  } catch {
    storageAvailable = false;
    showError(new Error('Browser storage is unavailable. This notebook remains in memory only and will be lost when you leave.'));
  }
}

master.addEventListener('ended', async () => {
  if (!trial || looping || loading || !renderingReady) {
    return;
  }
  looping = true;
  const version = generation;
  renderFrame(trial.case.valid_transitions - 1);
  if (countExperiment && !completed) {
    notebook = appendExperiment(notebook, trial);
    completed = true;
    saveNotebook();
    renderNotebook();

  }
  const resume = playing && !scrubbing;
  videos.forEach((video) => {
    video.pause();
    video.currentTime = 0;
  });
  if (resume && version === generation) {
    await play();
  }
  looping = false;
});

function tick() {
  if (trial && renderingReady && !loading && master.readyState >= 2 && !scrubbing) {
    const frame = frameAtTime(master.currentTime,
      trial.case.valid_transitions, trial.fps);
    renderFrame(frame);
    if (playing && !looping && !master.seeking) {
      for (const follower of videos.slice(1)) {
        if (!follower.seeking && Math.abs(follower.currentTime -
          master.currentTime) > .08) {
          follower.currentTime = master.currentTime;
        }
      }
    }
  }
  requestAnimationFrame(tick);
}

function startScrub() {
  if (!scrubbing) {
    resumeAfterScrub = playing;
    scrubbing = true;
    setPlaying(false);
  }
}

function seekFrame(frame) {
  const time = frame / trial.fps;
  videos.forEach((video) => { video.currentTime = time; });
  currentFrame = -1;
  renderFrame(frame);
}

function endScrub() {
  if (!scrubbing) {
    return;
  }
  scrubbing = false;
  if (resumeAfterScrub) {
    play();
  }
}

$('scrubber').addEventListener('pointerdown', startScrub);
$('scrubber').addEventListener('input', () => {
  startScrub();
  seekFrame(Number($('scrubber').value));
});
$('scrubber').addEventListener('change', endScrub);
window.addEventListener('pointerup', endScrub);
$('scrubber').addEventListener('keyup', endScrub);
$('play').addEventListener('click', () => playing ? setPlaying(false) : play());
$('speed').addEventListener('change', () => {
  videos.forEach((video) => { video.playbackRate = Number($('speed').value); });
});
$('experiment-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!loading && $('model-a').value !== $('model-b').value) {
    loadExperiment(selectedQuery(), true);
  }
});
$('experiment-state-action').addEventListener('click', () => {
  if (loadingError && !loading) {
    loadExperiment(retryQuery, retryCounts);
  }
});

for (const button of document.querySelectorAll('[data-metric]')) {
  button.addEventListener('click', () => {
    metric = button.dataset.metric;
    document.querySelectorAll('[data-metric]').forEach((tab) => {
      tab.classList.toggle('active', tab === button);
      tab.setAttribute('aria-pressed', String(tab === button));
    });
    $('metric-definition').textContent = METRICS[metric].description;
    if (trial) {
      currentFrame = -1;
      renderFrame(frameAtTime(master.currentTime,
        trial.case.valid_transitions, trial.fps));
    }
    renderNotebook();

  });
}

for (const button of document.querySelectorAll('.mobile-model-tabs button')) {
  button.addEventListener('click', () => {
    document.querySelector('.video-grid').dataset.mobileView = button.dataset.view;
    document.querySelectorAll('.mobile-model-tabs button').forEach((tab) => {
      tab.classList.toggle('active', tab === button);
      tab.setAttribute('aria-pressed', String(tab === button));
    });
  });
}

for (const button of document.querySelectorAll('[data-preset]')) {
  button.addEventListener('click', () => {
    setPreset(button.dataset.preset);
    loadSelection();
  });
}

for (const link of document.querySelectorAll('[data-story-preset]')) {
  link.addEventListener('click', () => {
    if (loading) {
      return;
    }
    setPreset(link.dataset.storyPreset);
    if (link.dataset.storyPreset === 'collection') {
      dataset = catalog.datasets.find((row) => row.label === 'BC failures').id;
      updateDistribution();
    }
    loadSelection();
  });
}

for (const select of [$('model-a'), $('model-b')]) {
  select.addEventListener('change', loadSelection);
}

$('reset').addEventListener('click', () => {
  notebook = [];
  countExperiment = false;
  saveNotebook();
  renderNotebook();

});

async function initialize() {
  try {
    $('metric-definition').textContent = METRICS[metric].description;
    catalog = await loadCatalog();
    dataset = catalog.datasets[0].id;
    storageKey = `aim-experiments-${catalog.release}`;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      notebook = Array.isArray(stored) ? stored.filter((row) => (
        typeof row.id === 'string' && typeof row.query === 'string' &&
        row.models?.length === 2 && row.models.every((model) => model.means)
      )) : [];
    } catch {
      notebook = [];
      storageAvailable = false;
    }
    const preferred = ['PPO1 + AIM500', 'PPO100', 'PPO1'];
    const models = [...catalog.models].sort((a, b) => {
      const rank = (model) => preferred.includes(model.label) ?
        preferred.indexOf(model.label) : 3;
      return rank(a) - rank(b) || a.label.localeCompare(b.label);
    });
    for (const select of [$('model-a'), $('model-b')]) {
      for (const model of models) {
        const option = element('option', '', label(model.label));
        option.value = model.id;
        select.append(option);
      }
    }
    for (const row of catalog.datasets) {
      const button = element('button', '', row.label);
      button.dataset.distribution = row.id;
      button.addEventListener('click', () => {
        const alreadyLoaded = dataset === row.id && renderingReady &&
          trial.dataset === row.id && !loadingError;
        if (loading || alreadyLoaded) {
          return;
        }
        dataset = row.id;
        updateDistribution();
        loadSelection();
      });
      $('distributions').append(button);
    }
    setPreset('scale');
    const query = new URLSearchParams(location.search);
    // The landing preview is illustrative; subsequent experiments still sample.
    if (!['dataset', 'a', 'b', 'case'].some((key) => query.has(key))) {
      for (const [key, value] of selectedQuery()) {
        query.set(key, value);
      }
      query.set('case',
        'sha256:930892582f7ab87701041716a061506e2c6989990fbaee8318edda0ade9e77d8');
      query.set('seed_a', '1');
      query.set('seed_b', '1');
    }
    if (catalog.datasets.some((row) => row.id === query.get('dataset')) &&
      catalog.models.some((row) => row.id === query.get('a')) &&
      catalog.models.some((row) => row.id === query.get('b'))) {
      dataset = query.get('dataset');
      $('model-a').value = query.get('a');
      $('model-b').value = query.get('b');
    }
    updateDistribution();
    await loadExperiment(query.has('case') ? query : selectedQuery(), false);
    if (!storageAvailable) {
      showError(new Error('The stored notebook could not be read. You can still run new experiments.'));
    }
  } catch (error) {
    showError(error);
  }
}

requestAnimationFrame(tick);
renderPreferenceFigure($('preference-figure'));
renderAlgorithmWalkthrough($('algorithm-walkthrough'));
initialize();
