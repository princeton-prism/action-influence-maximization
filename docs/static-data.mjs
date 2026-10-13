/** On-demand recorded experiments for a static, seed-1 comparison site. */
const siteRoot = new URL('./', import.meta.url);
const resources = new Map();

function assetUrl(path) {
  if (!path.startsWith('./') || path.includes('..')) {
    throw new Error('Invalid experiment asset URL');
  }
  return new URL(path, siteRoot).href;
}

async function readJson(path) {
  const url = assetUrl(path);
  if (!resources.has(url)) {
    resources.set(url, fetch(url).then(async (response) => {
      if (!response.ok) {
        throw new Error('Recorded experiment data could not load. Please retry.');
      }
      return response.json();
    }).catch((error) => {
      resources.delete(url);
      throw error;
    }));
  }
  return resources.get(url);
}

export function loadCatalog() {
  return readJson('./static/data/catalog.json');
}

/** Sample a shared case or reopen it, retaining the exact valid-frame metrics. */
export function assembleExperiment(catalog, cases, predictions, query,
  random = Math.random) {
  const params = new URLSearchParams(query);
  const dataset = params.get('dataset');
  const selected = [params.get('a'), params.get('b')];
  if (!catalog.datasets.some((row) => row.id === dataset)) {
    throw new Error('Unknown evaluation distribution');
  }
  if (selected[0] === selected[1] || selected.some((id) =>
    !catalog.models.some((row) => row.id === id))) {
    throw new Error('Choose two different, available models');
  }
  for (const name of ['seed_a', 'seed_b']) {
    if (params.has(name) && params.get(name) !== '1') {
      throw new Error('This website includes rollout seed 1 only.');
    }
  }
  for (const [index, arm] of predictions.entries()) {
    if (arm.seed !== 1 || arm.dataset !== dataset ||
      arm.model !== selected[index]) {
      throw new Error('Recorded prediction identity does not match selection');
    }
  }
  const shared = cases.filter((row) =>
    (!params.has('case') || row.id === params.get('case')) &&
    predictions.every((arm) => arm.predictions[row.id]));
  if (!shared.length) {
    throw new Error('No shared evaluation case for this selection');
  }
  const chosen = shared[Math.floor(random() * shared.length)];
  const models = selected.map((id, index) => {
    const {video, metrics} = predictions[index].predictions[chosen.id];
    if (!['ee', 'tee'].every((key) =>
      metrics[key].length === chosen.valid_transitions)) {
      throw new Error('Recall timeline does not match the recorded window');
    }
    return {id, label: catalog.models.find((row) => row.id === id).label,
      seed: 1, video, metrics};
  });
  const canonical = new URLSearchParams({dataset, a: selected[0], b: selected[1],
    case: chosen.id, seed_a: '1', seed_b: '1'}).toString();
  const {ground_truth: groundTruth, ...caseInfo} = chosen;
  return {id: `${catalog.release}|${canonical}`, query: canonical,
    release: catalog.release, dataset, fps: catalog.fps, case: caseInfo,
    ground_truth: groundTruth, models};
}

export async function loadExperimentData(query) {
  const params = new URLSearchParams(query);
  const catalog = await loadCatalog();
  const dataset = catalog.datasets.find((row) => row.id === params.get('dataset'));
  const models = ['a', 'b'].map((name) =>
    catalog.models.find((row) => row.id === params.get(name)));
  if (!dataset || models.some((row) => !row)) {
    throw new Error('Choose an available distribution and two models');
  }
  const [index, ...predictions] = await Promise.all([
    readJson(dataset.index),
    ...models.map((row) => readJson(row.data[dataset.id])),
  ]);
  const trial = assembleExperiment(catalog, index.cases, predictions, params);
  trial.ground_truth = assetUrl(trial.ground_truth);
  trial.models.forEach((row) => { row.video = assetUrl(row.video); });
  return trial;
}
