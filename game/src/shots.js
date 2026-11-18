// The screenshot scenes behind ?shot=start|drive|chase|done. Each one plays
// the real rules forward from a fresh world, steered by a simple autopilot
// (walk to the nearest parked car, steal it, follow the road graph to the
// mission marker), so the frame is what a short game really looks like and
// the same seed always gives the same frame.
import { STEP } from './config.js';
import { EVENT_MISSION_DONE } from './world.js';

const ZERO = { moveX: 0, moveZ: 0, throttle: 0, steer: 0, sprint: false, actions: 0 };

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/** Breadth-first path over the road-graph nodes, as a list of {x, z}. */
function findPath(city, from, to) {
  const start = nearestNodeOf(city, from.x, from.z);
  const goal = nearestNodeOf(city, to.x, to.z);
  const prev = new Map([[start, -1]]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const n of city.nodes[cur].next) {
      if (!prev.has(n)) {
        prev.set(n, cur);
        queue.push(n);
      }
    }
  }
  if (!prev.has(goal)) return [{ x: to.x, z: to.z }];
  const ids = [];
  let cur = goal;
  while (cur !== -1) {
    ids.unshift(cur);
    cur = prev.get(cur);
  }
  const pts = ids.map((id) => ({ x: city.nodes[id].x, z: city.nodes[id].z }));
  pts.push({ x: to.x, z: to.z });
  return pts;
}

function nearestNodeOf(city, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (const n of city.nodes) {
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bestD) { bestD = d; best = n.id; }
  }
  return best;
}

/**
 * Drive the player (walk, steal, drive) toward `goal` for up to `maxSeconds`
 * of simulated time. Returns the events seen, so the caller can tell whether
 * a mission finished on the way.
 */
function autopilotTo(world, renderer, goal, maxSeconds, wanted) {
  const s = world.state;
  let events = 0;
  let path = null;
  let pathIndex = 0;
  let interacted = false;
  let walkTarget = world.nearestParkedCar(500);
  if (wanted !== undefined) s.stars = wanted;
  const steps = Math.floor(maxSeconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const p = s.player;
    let input;
    if (!p.inCar) {
      if (!walkTarget) break;
      const dx = walkTarget.x - p.x;
      const dz = walkTarget.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.2 && !interacted) {
        input = { moveX: 0, moveZ: 0, throttle: 0, steer: 0, sprint: false, actions: 4 };
        interacted = true;
      } else {
        input = { moveX: dx / d, moveZ: dz / d, throttle: 0, steer: 0, sprint: true, actions: 0 };
      }
    } else {
      const car = p.inCar;
      if (!path) {
        path = findPath(s.city, { x: car.x, z: car.z }, goal);
        pathIndex = 0;
      }
      while (pathIndex < path.length - 1 && Math.hypot(path[pathIndex].x - car.x, path[pathIndex].z - car.z) < 9) pathIndex += 1;
      const wp = path[pathIndex];
      const desired = Math.atan2(wp.x - car.x, wp.z - car.z);
      const diff = angleDiff(desired, car.heading);
      const dist = Math.hypot(wp.x - car.x, wp.z - car.z);
      // U-turn: stop first, then turn — a fast U-turn wedges the car in a wall.
      let throttle;
      let steer;
      if (Math.abs(diff) > 2.4 && Math.abs(car.speed) > 4) {
        throttle = -0.7;
        steer = 0;
      } else {
        // Ease off for sharp turns: slower in, faster out — fewer building hits.
        throttle = Math.abs(diff) > 0.9 ? 0.25 : Math.abs(diff) > 0.45 ? 0.45 : 0.6;
        steer = clamp(diff * 2.4, -1, 1);
      }
      input = {
        moveX: 0, moveZ: 0,
        throttle,
        steer,
        sprint: false, actions: 0,
      };
      if (dist < 5 && pathIndex >= path.length - 1) {
        // Arrived at the final waypoint; ease off.
        input.throttle = 0;
      }
    }
    events |= world.step(STEP, input);
    if (renderer) renderer.setCamera(s.player.heading, 0.62, null, null);
    if (events & EVENT_MISSION_DONE) break;
    if (s.over) break;
  }
  return events;
}

/** Final framing for a screenshot: a slightly offset high view that shows the car. */
function frameShot(world, renderer, pitch, dist, height) {
  if (!renderer) return;
  renderer.setCamera(world.state.player.heading + 0.4, pitch, dist, height);
}

export function stageShot(name, world, renderer) {
  world.reset();
  if (name === 'start' || !name) {
    for (let i = 0; i < 6 / STEP; i += 1) world.step(STEP, ZERO);
    return { screen: 'title', banner: '' };
  }
  if (name === 'drive') {
    const target = world.missionTarget();
    autopilotTo(world, renderer, target, 14, undefined);
    frameShot(world, renderer, 0.55, 19, 11.5);
    return { screen: 'play', banner: '' };
  }
  if (name === 'chase') {
    const target = world.missionTarget();
    autopilotTo(world, renderer, target, 11, 3);
    frameShot(world, renderer, 0.55, 19, 11.5);
    return { screen: 'play', banner: '' };
  }
  if (name === 'done') {
    const target = world.missionTarget();
    const events = autopilotTo(world, renderer, target, 45, undefined);
    const done = (events & EVENT_MISSION_DONE) !== 0;
    if (done) {
      // Roll on toward the next job for a few seconds, so the frame is a
      // street view with the city ahead, not the garage wall.
      const next = world.missionTarget();
      if (next) autopilotTo(world, renderer, next, 6, undefined);
    }
    // High top-down victory framing: no single wall can fill this view.
    frameShot(world, renderer, 0.78, 26, 15);
    return { screen: 'play', banner: done ? 'Job Complete! +$400' : '' };
  }
  for (let i = 0; i < 6 / STEP; i += 1) world.step(STEP, ZERO);
  return { screen: 'title', banner: '' };
}
