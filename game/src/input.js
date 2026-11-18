// Keyboard + mouse input. The loop reads one plain object per frame:
//   { move: {x, y} } — camera-relative wish (-1..1, y forward) on foot,
//   { drive: {throttle, steer} } — in a car,
//   plus one-shot action flags taken once by the loop.
// Mouse drag orbits the camera; the shots autopilot writes the same shape.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_MUTE = 8;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let orbitX = 0;
  let orbitY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) event.preventDefault();
      return;
    }
    keys.add(event.code);
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (INTERACT.has(event.code)) actions |= ACTION_INTERACT;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    if (FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || CONFIRM.has(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    orbitX += event.clientX - lastX;
    orbitY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function held(set) {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  }

  return {
    /** The frame's wish, in camera space. Consumed by the loop, then cleared. */
    read() {
      const move = {
        x: (held(RIGHT) ? 1 : 0) - (held(LEFT) ? 1 : 0),
        y: (held(FORWARD) ? 1 : 0) - (held(BACK) ? 1 : 0),
      };
      const sprint = held(SPRINT);
      const orbit = { x: orbitX, y: orbitY };
      orbitX = 0;
      orbitY = 0;
      const taken = actions;
      actions = 0;
      return { move, sprint, orbit, actions: taken };
    },
    /** Synthesized input for the screenshot autopilot (same shape as read()). */
    synth(move, sprint, actions) {
      return { move, sprint, orbit: { x: 0, y: 0 }, actions };
    },
  };
}
