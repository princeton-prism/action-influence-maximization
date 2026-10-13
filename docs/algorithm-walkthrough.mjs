import {ALGORITHMS, STAGES, cursorForLine, cursorForStage,
  snapshot, stepCursor} from './algorithm-steps.mjs';

export function sampleCollectionExample(examples, previousId, random = Math.random) {
  if (!examples.length) throw new RangeError('No collection recordings');
  const alternatives = examples.filter((example) => example.id !== previousId);
  const candidates = alternatives.length ? alternatives : examples;
  return candidates[Math.floor(random() * candidates.length)];
}

export function renderAlgorithmWalkthrough(root) {
  let cursor = 0;
  let selectedExample = 'example-01';
  let examplesPromise;
  let generation = 0;
  let cardAnimation;
  const clip = root.querySelector('video');
  const card = root.querySelector('.collection-examples');
  const rearCard = card.parentElement.querySelector('img');
  const rearPoster = rearCard.src;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mediaError = root.querySelector('.collection-error');
  const controls = root.querySelector('.walkthrough-controls');
  const variables = root.querySelector('.walkthrough-variables');
  const narrow = matchMedia('(max-width: 600px)');
  const paths = [...root.querySelectorAll('[data-flow-stages]')];
  paths.forEach((path) => { path.dataset.desktopPath = path.getAttribute('d'); });
  const updatePaths = () => paths.forEach((path) => {
    path.setAttribute('d', narrow.matches ? path.dataset.mobilePath : path.dataset.desktopPath);
  });
  narrow.addEventListener('change', updatePaths);
  updatePaths();

  const showingCollection = () => ['collection', 'growth'].includes(snapshot(cursor).stage);

  async function collectionExamples() {
    if (!examplesPromise) {
      examplesPromise = fetch('./static/data/aim-collection-examples.json')
        .then(async (response) => {
          if (!response.ok) throw new Error('Example catalog unavailable');
          return (await response.json()).examples;
        }).catch((error) => { examplesPromise = undefined; throw error; });
    }
    return examplesPromise;
  }

  for (const algorithm of ALGORITHMS) {
    const panel = root.querySelector(`.algorithm-panel[data-algorithm="${algorithm.number}"]`);
    panel.querySelector('h4').textContent = `Algorithm ${algorithm.number} · ${algorithm.title}`;
    panel.querySelector('.algorithm-requires').textContent = `Require: ${algorithm.requires}`;
    panel.querySelector('.algorithm-declaration').textContent = algorithm.declaration || '';
    for (const line of algorithm.lines) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'algorithm-line';
      button.dataset.algorithm = algorithm.number;
      button.dataset.line = line.number;
      button.setAttribute('aria-label', `Algorithm ${algorithm.number}, line ${line.number}: ${line.text}`);
      const number = document.createElement('span');
      number.className = 'line-number';
      number.textContent = line.number;
      number.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.className = 'line-text';
      text.textContent = line.text;
      button.append(number, text);
      button.addEventListener('click', () => select(cursorForLine(algorithm.number, line.number)));
      item.append(button);
      panel.querySelector('ol').append(item);
    }
  }
  for (const stage of STAGES) {
    const button = root.querySelector(`[data-stage-jump="${stage.id}"]`);
    const label = button.querySelector('.cycle-label').innerText.replace(/\s+/g, ' ').trim();
    button.setAttribute('aria-label', `${label}: Algorithm ${stage.algorithm}, line ${stage.line}`);
    button.addEventListener('click', () => select(cursorForStage(stage.id)));
  }
  root.querySelectorAll('[data-algorithm-jump]').forEach((button) => {
    button.addEventListener('click', () => select(cursorForLine(
      Number(button.dataset.algorithmJump), 1)));
  });
  controls.addEventListener('click', (event) => {
    const action = event.target.closest('[data-step-action]')?.dataset.stepAction;
    if (action === 'reset') {
      selectedExample = 'example-01';
      generation++;
      cardAnimation?.cancel();
      cardAnimation = undefined;
      rearCard.src = rearPoster;
      clip.pause();
      clip.removeAttribute('src');
      clip.load();
      select(0);
    } else if (action === 'next' || action === 'previous') {
      select(stepCursor(cursor, action === 'next' ? 1 : -1));
    }
  });
  clip.addEventListener('error', () => {
    if (showingCollection()) {
      mediaError.hidden = false;
      mediaError.textContent = 'Recording unavailable. Revisit Collect to retry.';
    }
  });

  async function showExample(version) {
    mediaError.hidden = true;
    try {
      const examples = await collectionExamples();
      if (version !== generation || !showingCollection()) return;
      const example = examples.find((e) => e.id === selectedExample);
      if (!example) throw new Error('Selected recording unavailable');
      const source = new URL(example.url, location.href).href;
      clip.pause();
      clip.autoplay = !reducedMotion.matches;
      if (clip.src !== source || clip.error) {
        clip.src = source;
        clip.load();
      } else {
        clip.currentTime = 0;
        if (clip.autoplay) await clip.play();
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (version === generation && showingCollection()) {
        mediaError.hidden = false;
        mediaError.textContent = 'Recording unavailable. Revisit Collect to retry.';
      }
    }
  }

  async function rotateCollection(version) {
    mediaError.hidden = true;
    try {
      const examples = await collectionExamples();
      if (version !== generation) return;
      let frame;
      if (clip.readyState >= 2) {
        clip.pause();
        const canvas = document.createElement('canvas');
        canvas.width = clip.videoWidth;
        canvas.height = clip.videoHeight;
        canvas.getContext('2d').drawImage(clip, 0, 0);
        frame = canvas.toDataURL();
        if (!reducedMotion.matches) {
          cardAnimation = card.animate([
            {transform: 'translate(0, 0)', zIndex: 3},
            {transform: 'translate(-35%, -35%) rotate(-10deg)', offset: .5, zIndex: 3},
            {transform: 'translate(-16px, -16px) scale(.96)', zIndex: 0},
          ], {duration: 650, easing: 'ease-in-out'});
          await cardAnimation.finished;
          cardAnimation = undefined;
        }
      }
      if (version !== generation) return;
      if (frame) rearCard.src = frame;
      selectedExample = sampleCollectionExample(examples, selectedExample).id;
      await showExample(version);
    } catch (error) {
      if (error.name !== 'AbortError' && version === generation) {
        mediaError.hidden = false;
        mediaError.textContent = 'Recording unavailable. Revisit Collect to retry.';
      }
    }
  }

  function select(position) {
    const previousStage = snapshot(cursor).stage;
    cursor = position;
    const state = snapshot(cursor);
    if (state.stage !== previousStage || state.stage === 'collection') {
      generation++;
      cardAnimation?.cancel();
      cardAnimation = undefined;
    }
    const version = generation;
    root.dataset.cursor = cursor;
    root.dataset.stage = state.stage;
    root.querySelector('.walkthrough-location').textContent = state.algorithm === 2 ?
      `Algorithm 1:2 → Algorithm 2:${state.line}` : `Algorithm 1:${state.line}`;
    controls.querySelector('[data-step-action="previous"]').disabled = cursor === 0;
    controls.querySelector('[data-step-action="next"]').disabled = false;
    root.querySelectorAll('.algorithm-panel').forEach((panel) => {
      panel.hidden = Number(panel.dataset.algorithm) !== state.algorithm;
    });
    root.querySelectorAll('[data-algorithm-jump]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.algorithmJump) === state.algorithm));
    });
    root.querySelectorAll('.algorithm-line').forEach((button) => {
      button.removeAttribute('aria-current');
      if (Number(button.dataset.algorithm) === state.algorithm &&
        Number(button.dataset.line) === state.line) {
        button.setAttribute('aria-current', 'step');
        const list = button.closest('ol');
        const lineBox = button.getBoundingClientRect();
        const listBox = list.getBoundingClientRect();
        // Scroll only the code panel, not the reader's position in the article.
        if (lineBox.top < listBox.top) list.scrollTop += lineBox.top - listBox.top;
        else if (lineBox.bottom > listBox.bottom) list.scrollTop += lineBox.bottom - listBox.bottom;
      }
    });
    root.querySelectorAll('[data-stage-jump]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.stageJump === state.stage));
    });
    root.querySelectorAll('[data-flow-stages]').forEach((path) => {
      path.dataset.active = path.dataset.flowStages.split(' ').includes(state.stage);
    });
    variables.replaceChildren();
    for (const [name, value] of state.variables) {
      const label = document.createElement('dt');
      const description = document.createElement('dd');
      label.textContent = name;
      description.textContent = value;
      variables.append(label, description);
    }
    if (!showingCollection()) {
      mediaError.hidden = true;
      clip.pause();
      clip.autoplay = false;
    } else if (state.stage === 'collection') {
      showExample(version);
    } else if (previousStage !== 'growth') {
      clip.pause();
      clip.autoplay = false;
      rotateCollection(version);
    }
  }
  select(0);
}
