import {ALGORITHMS, STAGES, cursorForLine, cursorForStage,
  snapshot, splitAlgorithmMath, stepCursor} from './algorithm-steps.mjs';
import {renderMath} from './math-rendering.mjs';

const CARD_TRANSFER_MS = 450;

function setAlgorithmText(node, text) {
  node.replaceChildren();
  for (const part of splitAlgorithmMath(text)) {
    if (!part.tex) node.append(part.text);
    else {
      const math = document.createElement('span');
      math.dataset.tex = part.tex;
      math.dataset.mathText = part.text;
      math.textContent = part.text;
      node.append(math);
    }
  }
}

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
  let transfer;
  let clip = root.querySelector('video');
  let nextRecording;
  const card = root.querySelector('.collection-examples');
  const incoming = document.createElement('span');
  incoming.className = 'collection-incoming';
  card.before(incoming);
  const rearCard = card.parentElement.querySelector('img');
  const rearPoster = rearCard.src;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mediaError = root.querySelector('.collection-error');
  const controls = root.querySelector('.walkthrough-controls');
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

  function discardNextRecording() {
    const pending = nextRecording;
    nextRecording = undefined;
    if (pending?.video) {
      pending.video.pause();
      pending.video.removeAttribute('src');
      pending.video.load();
    }
  }

  function prepareNextRecording() {
    if (nextRecording?.previousId === selectedExample) return nextRecording.ready;
    discardNextRecording();
    const pending = {previousId: selectedExample};
    nextRecording = pending;
    pending.ready = collectionExamples().then(async (examples) => {
      if (nextRecording !== pending) return;
      pending.example = sampleCollectionExample(examples, pending.previousId);
      const video = document.createElement('video');
      video.width = clip.width;
      video.height = clip.height;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('aria-label', clip.getAttribute('aria-label'));
      bindClipEvents(video);
      pending.video = video;
      const ready = new Promise((resolve, reject) => {
        const events = ['loadeddata', 'error', 'abort', 'emptied'];
        const settle = (event) => {
          events.forEach((type) => video.removeEventListener(type, settle));
          if (event.type === 'loadeddata') resolve();
          else reject(new Error('Next recording unavailable'));
        };
        events.forEach((type) => video.addEventListener(type, settle));
      });
      video.src = new URL(pending.example.url, location.href).href;
      await ready;
      return pending;
    }).catch((error) => {
      if (nextRecording === pending) nextRecording = undefined;
      // Report a failed preload only if a handoff actually needs it.
      return {error};
    });
    return pending.ready;
  }

  for (const algorithm of ALGORITHMS) {
    const panel = root.querySelector(`.algorithm-panel[data-algorithm="${algorithm.number}"]`);
    panel.querySelector('h4').textContent = `Algorithm ${algorithm.number} · ${algorithm.title}`;
    setAlgorithmText(panel.querySelector('.algorithm-requires'), `Require: ${algorithm.requires}`);
    setAlgorithmText(panel.querySelector('.algorithm-declaration'), algorithm.declaration || '');
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
      setAlgorithmText(text, line.text);
      button.append(number, text);
      button.addEventListener('click', () => select(cursorForLine(algorithm.number, line.number)));
      item.append(button);
      panel.querySelector('ol').append(item);
    }
  }
  renderMath(root);
  for (const stage of STAGES) {
    const button = root.querySelector(`[data-stage-jump="${stage.id}"]`);
    const label = button.querySelector('.cycle-label').innerText.replace(/\s+/g, ' ').trim();
    button.setAttribute('aria-label', `${label}: Algorithm ${stage.algorithm}, line ${stage.line}`);
    button.addEventListener('click', () => select(cursorForStage(stage.id), {
      cycleCollection: stage.id === 'growth',
    }));
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
      transfer = undefined;
      discardNextRecording();
      incoming.replaceChildren();
      card.replaceChildren(clip);
      rearCard.src = rearPoster;
      clip.poster = rearPoster;
      clip.pause();
      clip.removeAttribute('src');
      clip.load();
      select(0);
    } else if (action === 'next' || action === 'previous') {
      select(stepCursor(cursor, action === 'next' ? 1 : -1));
    }
  });
  function bindClipEvents(video) {
    let playbackFrame;
    const checkPlayback = () => {
      playbackFrame = undefined;
      if (video !== clip || video.paused || video.ended) return;
      if (snapshot(cursor).stage === 'collection' && !reducedMotion.matches &&
          !transfer && video.duration - video.currentTime <= CARD_TRANSFER_MS / 1000) {
        rotateCollection(generation);
        return;
      }
      playbackFrame = requestAnimationFrame(checkPlayback);
    };
    video.addEventListener('playing', () => {
      if (!playbackFrame) playbackFrame = requestAnimationFrame(checkPlayback);
    });
    video.addEventListener('error', () => {
      if (video === clip && showingCollection()) {
        mediaError.hidden = false;
        mediaError.textContent = 'Recording unavailable. Revisit Collect to retry.';
      }
    });
    video.addEventListener('ended', () => {
      if (video === clip && video.ended && snapshot(cursor).stage === 'collection' &&
          !reducedMotion.matches && !transfer) {
        rotateCollection(generation);
      }
    });
  }
  bindClipEvents(clip);

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
      if (clip.autoplay) prepareNextRecording();
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (version === generation && showingCollection()) {
        mediaError.hidden = false;
        mediaError.textContent = 'Recording unavailable. Revisit Collect to retry.';
      }
    }
  }

  async function rotateCollection(version) {
    if (transfer?.version === version) return;
    const activeTransfer = {version};
    transfer = activeTransfer;
    mediaError.hidden = true;
    const stage = snapshot(cursor).stage;
    try {
      const next = await prepareNextRecording();
      if (version !== generation) return;
      if (next.error) throw next.error;
      const outgoing = clip;
      incoming.append(next.video);
      if (!reducedMotion.matches) {
        cardAnimation = card.animate([
          {transform: 'translate(0, 0)', zIndex: 4},
          {transform: 'translate(-45%, -30%) rotate(-10deg)', offset: .5, zIndex: 4},
          {transform: getComputedStyle(rearCard).transform, zIndex: 0},
        ], {duration: CARD_TRANSFER_MS, easing: 'ease-in-out', fill: 'forwards'});
        await cardAnimation.finished;
      }
      if (version !== generation) return;
      if (outgoing.readyState >= 2) {
        const canvas = document.createElement('canvas');
        canvas.width = outgoing.videoWidth;
        canvas.height = outgoing.videoHeight;
        canvas.getContext('2d').drawImage(outgoing, 0, 0);
        rearCard.src = canvas.toDataURL();
      }
      outgoing.pause();
      outgoing.autoplay = false;
      outgoing.removeAttribute('src');
      outgoing.load();
      clip = next.video;
      selectedExample = next.example.id;
      nextRecording = undefined;
      const selectedStage = snapshot(cursor).stage;
      card.replaceChildren(clip);
      clip.autoplay = !reducedMotion.matches &&
        (selectedStage === 'collection' || selectedStage === stage);
      if (!clip.autoplay) clip.pause();
      else {
        clip.play().catch(() => {
          // Autoplay denial or Reset must not interrupt the visual handoff.
        });
        prepareNextRecording();
      }
    } catch (error) {
      if (error.name !== 'AbortError' && version === generation) {
        mediaError.hidden = false;
        mediaError.textContent = 'Recording unavailable. Revisit Collect to retry.';
      }
    } finally {
      if (transfer === activeTransfer) transfer = undefined;
      if (version === generation) {
        if (card.firstElementChild !== clip) card.replaceChildren(clip);
        cardAnimation?.cancel();
        cardAnimation = undefined;
      }
    }
  }

  function select(position, {cycleCollection = false} = {}) {
    const previousStage = snapshot(cursor).stage;
    cursor = position;
    const state = snapshot(cursor);
    const loadCollection = state.stage === 'collection' &&
      (previousStage !== 'collection' || !clip.getAttribute('src') ||
        clip.error || !mediaError.hidden);
    // Navigation preserves an active handoff; Reset remains a hard cancellation.
    if (!cardAnimation &&
        (state.stage !== previousStage || loadCollection || cycleCollection)) {
      generation++;
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
    if (cardAnimation) return;
    if (!showingCollection()) {
      discardNextRecording();
      mediaError.hidden = true;
      clip.pause();
      clip.autoplay = false;
    } else if (cycleCollection || (state.stage === 'growth' && previousStage !== 'growth')) {
      rotateCollection(version);
    } else if (loadCollection) {
      showExample(version);
    }
  }
  select(0);
}
