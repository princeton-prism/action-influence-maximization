/** Appendix page 25; one illustrative round with the full FitReward call. */
export const ALGORITHMS = [
  {
    number: 1, title: 'Batch AIM collection',
    requires: 'Replay D₀, density checkpoint M₋₁, rounds K, batch sizes Bₖ',
    lines: [
      {number: 1, stage: 'replay', text: 'for k = 0, …, K − 1 do'},
      {number: 2, stage: 'density', text: 'Fit reward and annotate replay using Algorithm 2:\n(Mₖ, D̂ₖ) ← FitReward(Dₖ, Mₖ₋₁)'},
      {number: 3, stage: 'collector', text: 'Initialize collector πₖ from Mₖ’s behavior chunk policy; reset IQL critic and value heads'},
      {number: 4, stage: 'collector', text: 'Fit IQL, behavior cloning, and AWR flow matching on D̂ₖ; enable AWR after critic warmup'},
      {number: 5, stage: 'collection', text: 'Collect Bₖ environment trajectories Tₖ using πₖ'},
      {number: 6, stage: 'growth', text: 'Dₖ₊₁ ← Dₖ ∪ Tₖ'},
      {number: 7, stage: 'growth', text: 'end for'},
      {number: 8, stage: 'training', text: 'return D_K for downstream world-model training'},
    ],
  },
  {
    number: 2, title: 'Reward fitting and annotation',
    requires: 'Replay Dₖ, prior checkpoint Mₖ₋₁',
    declaration: 'FitReward(Dₖ, Mₖ₋₁):',
    lines: [
      {number: 1, stage: 'density', text: 'Use a uniform state reference'},
      {number: 2, stage: 'density', text: 'Warm-start from Mₖ₋₁; fit q̂ₖ, β̂ₖ, d̂ₖ, and a behavior chunk policy on Dₖ'},
      {number: 3, stage: 'density', text: 'Jointly train divergence heads for the three reward densities'},
      {number: 4, stage: 'density', text: 'Select checkpoint Mₖ using held-out likelihood; freeze it'},
      {number: 5, stage: 'annotation', text: 'Integrate flows and learned divergences to score all replay transitions'},
      {number: 6, stage: 'annotation', text: 'mₖ = log q̂ₖ − log β̂ₖ'},
      {number: 7, stage: 'annotation', text: 'cₖ = log d̂ₖ'},
      {number: 8, stage: 'annotation', text: 'Standardize each term using refreshed global replay statistics:\nr̂ₖ = zₖ(mₖ) − zₖ(cₖ)'},
      {number: 9, stage: 'annotation', text: 'Annotate Dₖ with r̂ₖ to obtain D̂ₖ, fixed for policy fitting'},
      {number: 10, stage: 'annotation', text: 'return (Mₖ, D̂ₖ)'},
    ],
  },
];

export const STAGES = [
  {id: 'replay', label: 'Existing replay', symbol: 'Dₖ', algorithm: 1, line: 1},
  {id: 'density', label: 'Fit densities', symbol: 'q̂ₖ, β̂ₖ, d̂ₖ', algorithm: 2, line: 2},
  {id: 'annotation', label: 'Score & annotate', symbol: 'r̂ₖ, D̂ₖ', algorithm: 2, line: 8},
  {id: 'collector', label: 'Fit collector', symbol: 'πₖ', algorithm: 1, line: 3},
  {id: 'collection', label: 'Collect rollouts', symbol: 'Tₖ', algorithm: 1, line: 5},
  {id: 'growth', label: 'Grow replay', symbol: 'Dₖ₊₁', algorithm: 1, line: 6},
  {id: 'training', label: 'Train world model', symbol: 'D_K', algorithm: 1, line: 8},
];

export const WALKTHROUGH = [
  {algorithm: 1, line: 1}, {algorithm: 1, line: 2},
  ...ALGORITHMS[1].lines.map(({number}) => ({algorithm: 2, line: number})),
  ...ALGORITHMS[0].lines.slice(2).map(({number}) => ({algorithm: 1, line: number})),
];

export function cursorForLine(algorithm, line) {
  const cursor = WALKTHROUGH.findIndex((s) => s.algorithm === algorithm && s.line === line);
  if (cursor < 0) throw new RangeError('Unknown algorithm line');
  return cursor;
}

export function cursorForStage(id) {
  const stage = STAGES.find((s) => s.id === id);
  if (!stage) throw new RangeError('Unknown cycle station');
  return cursorForLine(stage.algorithm, stage.line);
}

export function stepCursor(cursor, direction) {
  return cursor + direction >= WALKTHROUGH.length ? 0 : Math.max(0, cursor + direction);
}

export function snapshot(cursor) {
  const step = WALKTHROUGH[cursor];
  if (!step) throw new RangeError('Unknown walkthrough position');
  const line = ALGORITHMS[step.algorithm - 1].lines[step.line - 1];
  const after = (algorithm, number) => cursor >= cursorForLine(algorithm, number);
  const state = {
    ...step, stage: line.stage, text: line.text,
    frozen: after(2, 4), scored: after(2, 5), normalized: after(2, 8),
    annotated: after(2, 9), criticReset: after(1, 3), collectorFit: after(1, 4),
    collected: after(1, 5), replayGrown: after(1, 6), done: after(1, 8),
  };
  state.variables = [
    ['Replay', state.done ? 'D_K returned for training' : state.replayGrown ?
      'Dₖ₊₁ = Dₖ ∪ Tₖ' : state.annotated ? 'Dₖ with fixed annotations D̂ₖ' : 'Dₖ'],
    ['Checkpoint', state.frozen ? 'Mₖ frozen' : after(2, 2) ?
      'Fit q̂ₖ, β̂ₖ, d̂ₖ and behavior policy' : 'Prior Mₖ₋₁'],
    ['Reward', state.annotated ? 'r̂ₖ fixed during policy fitting' : state.normalized ?
      'r̂ₖ = zₖ(mₖ) − zₖ(cₖ)' : after(2, 7) ?
        'mₖ = log q̂ₖ − log β̂ₖ; cₖ = log d̂ₖ' : after(2, 6) ?
          'mₖ = log q̂ₖ − log β̂ₖ' : state.scored ? 'Replay likelihoods scored' : 'Not scored'],
    ['Collector', state.collectorFit ? 'πₖ fit: IQL / BC / AWR after critic warmup' :
      state.criticReset ? 'πₖ initialized; Q/V heads reset' : 'Not initialized'],
    ['New batch', state.collected ? 'Tₖ: recorded AIM examples' : 'Not collected'],
  ];
  return state;
}
