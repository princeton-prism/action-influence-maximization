/** Pure accounting for measured, browser-local evaluation experiments. */

export function matchesExperiment(trial, selection) {
  return Boolean(trial && trial.dataset === selection.dataset &&
    trial.models[0]?.id === selection.a && trial.models[1]?.id === selection.b);
}

export function metricSeries(model, metric) {
  if (metric !== 'joint') {
    return model.metrics[metric];
  }
  return model.metrics.ee.map((value, index) => {
    const tee = model.metrics.tee[index];
    return Number.isFinite(value) && Number.isFinite(tee) ?
      Math.min(value, tee) : null;
  });
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) /
    valid.length : null;
}

export function appendExperiment(rows, trial) {
  if (rows.some((row) => row.id === trial.id)) {
    return rows;
  }
  return [...rows, {
    id: trial.id,
    dataset: trial.dataset,
    caseId: trial.case.id,
    trajectoryId: trial.case.trajectory_id,
    window: trial.case.window_index,
    recordedAt: new Date().toISOString(),
    query: trial.query,
    models: trial.models.map((model) => ({
      id: model.id,
      label: model.label,
      seed: model.seed,
      means: Object.fromEntries(['ee', 'tee', 'joint'].map(
        (metric) => [metric, mean(metricSeries(model, metric))],
      )),
    })),
  }];
}

export function summarizeNotebook(rows, dataset, metric) {
  const models = new Map();
  for (const row of rows.filter((row) => row.dataset === dataset)) {
    for (const model of row.models) {
      if (!models.has(model.id)) {
        models.set(model.id, {
          id: model.id, label: model.label, values: [],
          cases: new Set(), trajectories: new Set(), runs: 0,
        });
      }
      const item = models.get(model.id);
      item.values.push(model.means[metric]);
      item.cases.add(row.caseId);
      item.trajectories.add(row.trajectoryId);
      item.runs++;
    }
  }
  return [...models.values()].map((item) => ({
    id: item.id, label: item.label, mean: mean(item.values),
    cases: item.cases.size, trajectories: item.trajectories.size,
    runs: item.runs,
  })).sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1));
}

/** Select the top three and lowest from a descending notebook summary. */
export function selectLeaderboard(ranks) {
  const scored = ranks.filter((row) => Number.isFinite(row.mean));
  if (!scored.length) {
    return [];
  }
  const lowestMean = scored.at(-1).mean;
  const tiedLowest = scored.filter((row) => row.mean === lowestMean).length > 1;
  const selected = scored.slice(0, 3);
  if (scored.length > 3) {
    selected.push(scored.at(-1));
  }
  return selected.map((row) => ({
    ...row, rank: scored.indexOf(row) + 1,
    lowest: scored.length > 1 && row.mean === lowestMean,
    tiedLowest: row.mean === lowestMean && tiedLowest,
  }));
}

export function frameAtTime(time, frames, fps) {
  return Math.max(0, Math.min(frames - 1, Math.floor(time * fps + .00001)));
}
