// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. Screens: title,
// play, paused, game over. ?seed=N fixes the district. ?shot=start|drive|
// chase|done (with &seed=N) stages that scene instead of running the loop,
// paints it twice and sets window.__shotReady for a screenshot.
import { MISSIONS, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_BUSTED, EVENT_CRASH, EVENT_CRIME, EVENT_DROP, EVENT_ENTER_CAR, EVENT_EXIT_CAR,
  EVENT_MISSION_DONE, EVENT_MISSION_FAIL, EVENT_PICKUP, EVENT_STEAL, EVENT_WASTED,
  createWorld,
} from './world.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const hud = {
  cash: document.getElementById('hud-cash'),
  stars: document.getElementById('hud-stars'),
  objective: document.getElementById('hud-objective'),
  distance: document.getElementById('hud-distance'),
  speed: document.getElementById('hud-speed'),
  healthFill: document.getElementById('hud-health-fill'),
  prompt: document.getElementById('hud-prompt'),
};
const toastEl = document.getElementById('hud-toast');
const bannerEl = document.getElementById('hud-banner');
const overlays = {
  title: document.getElementById('screen-title'),
  pause: document.getElementById('screen-pause'),
  over: document.getElementById('screen-over'),
};
const overTitle = document.getElementById('over-title');
const overLines = document.getElementById('over-lines');
const bestLine = document.getElementById('best-line');

const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, document.getElementById('minimap'), hud);
renderer.buildWorld(world);
const audio = createAudio();
// Debug handle for play-testing in a browser console.
window.__neonHarbor = { world, renderer };

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { best: 0, missions: 0 };
    const data = JSON.parse(raw);
    return { best: Number(data.best) || 0, missions: Math.min(MISSIONS.length, Number(data.missions) || 0) };
  } catch {
    return { best: 0, missions: 0 };
  }
}

function saveGame(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off: progress then lasts this visit only.
  }
}

const save = loadSave();
if (save.missions > 0 && save.missions < MISSIONS.length) world.startMission(save.missions);
bestLine.textContent = save.best > 0 ? `Best cash: $${save.best.toLocaleString('en-US')} · Jobs done: ${save.missions}/${MISSIONS.length}` : 'First time in Portside? Steal a car, run the jobs, dodge the heat.';

let toastTimer = 0;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  toastTimer = 3;
}

let bannerTimer = 0;
function banner(message) {
  bannerEl.textContent = message;
  bannerEl.classList.add('show');
  bannerTimer = 4;
}

function showOverlay(name) {
  for (const key of Object.keys(overlays)) overlays[key].classList.toggle('show', key === name);
}

function bankProgress() {
  save.best = Math.max(save.best, world.state.cash);
  save.missions = Math.max(save.missions, Math.min(MISSIONS.length, world.state.mission.index));
  saveGame(save);
}

function handleEvents(events) {
  const s = world.state;
  const p = s.player;
  if (events & EVENT_PICKUP) audio.pickup();
  if (events & EVENT_CRASH) {
    audio.crash(0.5);
    renderer.burst(p.x, 1.2, p.z, 22, 1, 0.62, 0.15, 6);
  }
  if (events & EVENT_STEAL) {
    audio.steal();
    toast('Car stolen — the cops are coming!');
  }
  if (events & EVENT_CRIME) toast(`Wanted level: ${'★'.repeat(s.stars)}${'☆'.repeat(5 - s.stars)}`);
  if (events & EVENT_DROP) {
    audio.pickup();
    toast('Package delivered.');
  }
  if (events & EVENT_ENTER_CAR) audio.click();
  if (events & EVENT_EXIT_CAR) audio.click();
  if (events & EVENT_MISSION_DONE) {
    audio.missionDone();
    bankProgress();
    if (s.mission.phase === 'complete') banner('PORTSIDE LEGEND — all jobs done! +$500 bonus');
    else banner(`Job complete! +$${MISSIONS[s.mission.index - 1].reward}`);
  }
  if (events & EVENT_MISSION_FAIL) {
    audio.missionFail();
    banner('Job failed — press Enter to retry');
  }
  if (events & (EVENT_BUSTED | EVENT_WASTED)) {
    audio.busted();
    bankProgress();
  }
}

function runShot(name) {
  const staged = stageShot(name, world, renderer);
  if (staged.banner) banner(staged.banner);
  let painted = 0;
  function paint() {
    renderer.draw(performance.now() / 1000, staged.screen, 1 / 60);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  showOverlay(staged.screen === 'title' ? 'title' : null);
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = 'title';
  let accumulator = 0;
  let last = performance.now();
  let lastActions = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    if (save.missions > 0 && save.missions < MISSIONS.length) world.startMission(save.missions);
    accumulator = 0;
    screen = 'play';
    showOverlay(null);
    audio.unlock();
    announce('Playing. Steal a car and follow the marker.');
  }

  function endGame(kind) {
    screen = 'over';
    showOverlay('over');
    overTitle.textContent = kind === 'busted' ? 'Busted!' : 'Wasted!';
    overLines.textContent = `Cash banked: $${world.state.cash.toLocaleString('en-US')} · Best: $${save.best.toLocaleString('en-US')} · Jobs done: ${save.missions}/${MISSIONS.length}`;
    announce(`${overTitle.textContent} Cash banked ${world.state.cash}. Press Space to play again.`);
  }

  function handleActions(frame) {
    const actions = frame.actions;
    if (actions & ACTION_MUTE) {
      const muted = audio.setMuted(!audio.isMuted());
      toast(muted ? 'Sound off (M to turn back on)' : 'Sound on');
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === 'title' || screen === 'over') startGame();
      else if (screen === 'play' && world.state.mission.phase === 'failed') {
        world.retryMission();
        banner('Job restarted — good luck!');
      }
    } else if (actions & ACTION_PAUSE) {
      if (screen === 'play') {
        screen = 'paused';
        showOverlay('pause');
        announce('Paused.');
      } else if (screen === 'paused') {
        screen = 'play';
        showOverlay(null);
        announce('Playing.');
      }
    }
    lastActions = actions;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dtReal = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const frameInput = input.read();
    renderer.orbit(frameInput.orbit.x, frameInput.orbit.y);
    // While driving and not dragging the mouse, ease the camera behind the car.
    if (world.state.player.inCar && frameInput.orbit.x === 0 && frameInput.orbit.y === 0) {
      renderer.alignYaw(world.state.player.heading, dtReal);
    }
    handleActions(frameInput);
    if (toastTimer > 0) {
      toastTimer -= dtReal;
      if (toastTimer <= 0) toastEl.classList.remove('show');
    }
    if (bannerTimer > 0) {
      bannerTimer -= dtReal;
      if (bannerTimer <= 0) bannerEl.classList.remove('show');
    }
    if (screen === 'title') {
      accumulator += dtReal;
      while (accumulator >= STEP) {
        world.step(STEP, { moveX: 0, moveZ: 0, throttle: 0, steer: 0, sprint: false, actions: 0 });
        accumulator -= STEP;
      }
      renderer.draw(now / 1000, 'title', dtReal);
      return;
    }
    if (screen !== 'play') {
      audio.engine(0, 0);
      audio.siren(false);
      renderer.draw(now / 1000, screen === 'paused' ? 'paused' : 'over', dtReal);
      return;
    }
    accumulator += dtReal;
    const yaw = renderer.getYaw();
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const mx = frameInput.move.x;
    const my = frameInput.move.y;
    const wish = { moveX: sin * my + cos * mx, moveZ: cos * my - sin * mx };
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      const stepInput = {
        moveX: wish.moveX,
        moveZ: wish.moveZ,
        throttle: my,
        steer: mx,
        sprint: frameInput.sprint,
        actions: steps === 0 ? (lastActions & ACTION_INTERACT) : 0,
      };
      const events = world.step(STEP, stepInput);
      handleEvents(events);
      if (world.state.over) {
        endGame(world.state.over);
        break;
      }
      accumulator -= STEP;
      steps += 1;
    }
    if (steps >= 5) accumulator = 0;
    const p = world.state.player;
    audio.engine(p.inCar ? Math.abs(p.inCar.speed) / 40 : 0, p.inCar ? Math.abs(frameInput.move.y) : 0);
    audio.siren(world.state.stars > 0);
    renderer.draw(now / 1000, 'play', dtReal);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      showOverlay('pause');
      announce('Paused.');
    }
  });

  showOverlay('title');
  announce('Neon Harbor. Press Space or click Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
