/** Figure 1's three supplied 33-frame, 20-fps recordings share one clock. */
const figure = document.getElementById('command-figure');
const videos = [...figure.querySelectorAll('video')];
videos.forEach((video) => { video.playbackRate = .5; });
const master = videos[0];
const button = figure.querySelector('.figure-play');
const slider = figure.querySelector('input');
let playing = false;
let looping = false;

function pause() {
  playing = false;
  videos.forEach((video) => video.pause());
  button.textContent = 'Play';
  button.setAttribute('aria-label', 'Play Figure 1');
}

async function play() {
  playing = true;
  button.textContent = 'Pause';
  button.setAttribute('aria-label', 'Pause Figure 1');
  try {
    await Promise.all(videos.map((video) => video.play()));
  } catch (error) {
    if (error.name !== 'AbortError') {
      pause();
    }
  }
}

function seek(frame) {
  slider.value = frame;
  videos.forEach((video) => { video.currentTime = frame / 20; });
}

button.addEventListener('click', () => playing ? pause() : play());
slider.addEventListener('pointerdown', pause);
slider.addEventListener('input', () => {
  pause();
  seek(Number(slider.value));
});
master.addEventListener('timeupdate', () => {
  if (!playing || looping || master.seeking) {
    return;
  }
  slider.value = Math.min(32, Math.floor(master.currentTime * 20));
  for (const video of videos.slice(1)) {
    if (Math.abs(video.currentTime - master.currentTime) > .075) {
      video.currentTime = master.currentTime;
    }
  }
});
master.addEventListener('ended', async () => {
  if (!playing || looping) {
    return;
  }
  looping = true;
  seek(0);
  await play();
  looping = false;
});

async function initialize() {
  try {
    await Promise.all(videos.map((video) => new Promise((resolve, reject) => {
      if (video.readyState >= 2) {
        resolve();
        return;
      }
      const cleanup = () => {
        video.removeEventListener('loadeddata', ready);
        video.removeEventListener('error', failed);
      };
      const ready = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error('Figure video unavailable')); };
      video.addEventListener('loadeddata', ready, {once: true});
      video.addEventListener('error', failed, {once: true});
    })));
    button.disabled = false;
    slider.disabled = false;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await play();
    }
  } catch {
    button.textContent = 'Video unavailable';
  }
}

initialize();
const baseline = document.querySelector('#baseline-figure video');
baseline.autoplay = !matchMedia('(prefers-reduced-motion: reduce)').matches;
