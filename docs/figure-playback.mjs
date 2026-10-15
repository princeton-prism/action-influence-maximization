/** Figure 1's three supplied 33-frame, 20-fps recordings share one clock. */
const figure = document.getElementById('command-figure');
const videos = [...figure.querySelectorAll('video')];
videos.forEach((video) => {
  video.muted = true;
  video.defaultMuted = true;
  video.playbackRate = .5;
});
const master = videos[0];
const button = figure.querySelector('.figure-play');
const slider = figure.querySelector('input');
let playing = false;
let looping = false;
let playVersion = 0;
let unavailable = false;

function pause() {
  playVersion++;
  playing = false;
  videos.forEach((video) => video.pause());
  button.textContent = 'Play';
  button.setAttribute('aria-label', 'Play Figure 1');
}

async function play() {
  const version = ++playVersion;
  try {
    await Promise.all(videos.map((video) => video.play()));
    if (version !== playVersion) {
      return;
    }
    playing = true;
    button.textContent = 'Pause';
    button.setAttribute('aria-label', 'Pause Figure 1');
  } catch (error) {
    if (version === playVersion) {
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

function initialize() {
  const ready = () => {
    slider.disabled = unavailable || !videos.every((video) => video.readyState >= 1);
  };
  const failed = () => {
    pause();
    unavailable = true;
    button.disabled = true;
    slider.disabled = true;
    button.textContent = 'Video unavailable';
  };
  videos.forEach((video) => {
    video.addEventListener('loadedmetadata', ready);
    video.addEventListener('error', failed);
  });
  // Play may start loading on iOS; decoded-frame readiness cannot gate it.
  button.disabled = false;
  ready();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    play();
  }
}

initialize();
const baseline = document.querySelector('#baseline-figure video');
baseline.autoplay = !matchMedia('(prefers-reduced-motion: reduce)').matches;
