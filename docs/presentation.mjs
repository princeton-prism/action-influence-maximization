/** Reader-facing descriptions of the pinned evaluation archive. */

function ppoAddition(name, collection) {
  return {
    label: `PPO expert 3K + 500 ${name}`,
    description: `3,000 PPO expert trajectories + 500 ${collection} trajectories.`,
  };
}

// Counts refer to collection budgets, not rollout seeds or success rates.
const MODELS = {
  PPO1: {label: 'PPO expert 3K', description: '3,000 PPO expert trajectories (1% of the full dataset).'},
  PPO100: {label: 'PPO expert 300K', description: '300,000 PPO expert trajectories (the full dataset).'},
  Recovery1: {
    label: 'Recovery 3K',
    description: '3,000 recovery trajectories (1%): expert actions mixed with random-walk actions.',
  },
  Recovery100: {
    label: 'Recovery 300K',
    description: '300,000 recovery trajectories (100%): expert actions mixed with random-walk actions.',
  },
  'Recovery1 + transferred AIM500': {
    label: 'Recovery 3K + 500 AIM (transfer)',
    description: '3,000 recovery trajectories + 500 AIM trajectories reused from the PPO collection experiment.',
  },
  'PPO1 + AIM500': ppoAddition('AIM', 'AIM-collected'),
  'PPO1 + AIM500 (MI only)': ppoAddition(
    'AIM (action information only)', 'AIM-collected, without state novelty'),
  'PPO1 + AIM500 (novelty only)': ppoAddition(
    'AIM (novelty only)', 'AIM-collected, without action information'),
  'PPO1 + fixed-policy AIM500': ppoAddition(
    'AIM (fixed collector)', 'AIM-collected with a fixed reward and policy'),
  'PPO1 + Recovery500': ppoAddition('recovery', 'expert/random-walk recovery'),
  'PPO1 + ICM500': ppoAddition('ICM', 'curiosity-collected (ICM)'),
  'PPO1 + DIAYN500': ppoAddition('DIAYN', 'skill-discovery (DIAYN)'),
  'PPO1 + METRA500': ppoAddition('METRA', 'skill-discovery (METRA)'),
  'PPO1 + DADS500': ppoAddition('DADS', 'skill-discovery (DADS)'),
  'PPO1 + Uniform Random500': ppoAddition('uniform random', 'uniform-random-action'),
  'PPO1 + Random Walk500': ppoAddition('random walk', 'random-walk-action'),
};

export function modelInfo(label) {
  return MODELS[label] || {
    label, description: 'Training-data details are unavailable for this model.',
  };
}

const DATASETS = {
  bc: {
    summary: 'Expert-like actions from a learned policy.',
    description: 'A behavior-cloning policy tries to push the object to the goal. This learned policy can differ from the expert that produced the training data. Watch whether predictions track the actual robot and object.',
  },
  'bc-failures-geom23-uniform2-15': {
    summary: 'Actions switch between goal-seeking and disruptive behavior.',
    description: 'These trajectories switch between behavior-cloning and push-away actions to create departures from the expert path. They are constructed stress tests, not just naturally occurring BC failures. Watch whether models follow the changed commands or continue an expert-like future.',
  },
  pushaway: {
    summary: 'Actions deliberately move away from the goal.',
    description: 'A push-away policy moves the object away from the goal instead of completing the training task. Watch whether predictions follow this different behavior, especially through object contact.',
  },
};

export function datasetInfo(dataset) {
  return DATASETS[dataset.id.split('--')[0]] || {
    summary: dataset.description || 'Recorded evaluation actions.',
    description: 'Additional collection details are unavailable for this distribution.',
  };
}

export const METRICS = {
  ee: {
    label: 'Robot',
    description: 'Robot recall: the percentage of ground-truth robot pixels matched within the evaluator’s RGB-error threshold. Higher is better.',
  },
  tee: {
    label: 'Object',
    description: 'Object recall: the percentage of ground-truth object pixels matched within the evaluator’s RGB-error threshold. Higher is better.',
  },
  joint: {
    label: 'Both',
    description: 'Both uses the lower of robot and object recall at each frame. Both masks must be valid. This is visual fidelity, not task success.',
  },
};

export const QUESTIONS = {
  scale: 'Compare PPO expert 3K + 500 AIM with PPO expert 300K. Watch which prediction follows the recorded robot actions.',
  collection: 'Hold the 3,000-trajectory prior fixed. What changes when 500 AIM trajectories are added?',
  ablation: 'Keep the 500-trajectory budget fixed. Does state novelty help alongside action information?',
};
