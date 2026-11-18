// Neon Harbor's rules: walking, stealing and driving cars, traffic and
// pedestrians, the wanted level and the police, three missions, cash pickups.
// No drawing and no browser in here — step() takes the frame's wish and
// returns what happened as bit flags, so the renderer and the screenshots
// autopilot both drive the same real rules.
import { CAR, MISSIONS, PICKUP_COUNT, PICKUP_VALUE, PED_COUNT, PARKED_COUNT, TRAFFIC_COUNT, PLAYER, WANTED } from './config.js';
import { buildCity, nearestNode, resolveCircle } from './city.js';

export const EVENT_PICKUP = 1;
export const EVENT_CRASH = 2;
export const EVENT_CRIME = 4;
export const EVENT_MISSION_DONE = 8;
export const EVENT_MISSION_FAIL = 16;
export const EVENT_BUSTED = 32;
export const EVENT_WASTED = 64;
export const EVENT_STEAL = 128;
export const EVENT_ENTER_CAR = 256;
export const EVENT_EXIT_CAR = 512;
export const EVENT_DROP = 1024;

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function angleTo(x, z, tx, tz) {
  return Math.atan2(tx - x, tz - z);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createWorld(random) {
  const city = buildCity(random);
  const state = {
    city,
    elapsed: 0,
    cash: 0,
    over: null, // 'busted' | 'wasted' | null
    bustTimer: 0,
    stars: 0,
    lastCrimeAt: 0,
    crimeAt: {},
    decayTimer: 0,
    player: { x: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, health: PLAYER.health, walkPhase: 0, lastHurtAt: -99, inCar: null },
    cars: [],
    peds: [],
    pickups: [],
    pickupSpots: [],
    mission: { index: 0, phase: 'active', timer: 0, dropIndex: 0, surviveTimer: 0 },
    message: '',
  };

  function randomSidewalkPoint() {
    const road = random.pick(city.nodes.length ? [-180, -120, -60, 0, 60, 120, 180] : [0]);
    const along = random.range(-175, 175);
    const side = random.chance(0.5) ? 1 : -1;
    const off = 7 + 2.5;
    if (random.chance(0.5)) return { x: road + side * off, z: along };
    return { x: along, z: road + side * off };
  }

  function makeCar(kind, x, z, heading, color) {
    return {
      id: Math.floor(random.next() * 1e9),
      kind, x, z, heading, speed: 0, color,
      node: null, nextNode: null, cruise: CAR.trafficSpeed * random.range(0.85, 1.15),
      police: kind === 'police',
    };
  }

  function spawnTrafficCar(farFrom) {
    let node = random.pick(city.nodes);
    let guard = 0;
    while (farFrom && dist2(node.x, node.z, farFrom.x, farFrom.z) < 70 * 70 && guard < 20) {
      node = random.pick(city.nodes);
      guard += 1;
    }
    const car = makeCar('traffic', node.x, node.z, random.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), random.pick([0xc23b2e, 0x2e6fc2, 0xe0a52e, 0x3fae6a, 0x8a5fc2, 0xd8d8d8, 0x222226]));
    const next = random.pick(node.next);
    car.node = node.id;
    car.nextNode = next;
    car.heading = angleTo(node.x, node.z, city.nodes[next].x, city.nodes[next].z);
    car.speed = car.cruise;
    return car;
  }

  function spawnPed() {
    const p = randomSidewalkPoint();
    return {
      x: p.x, z: p.z, heading: random.range(0, Math.PI * 2), speed: 1.3,
      target: randomSidewalkPoint(), down: false, downTimer: 0, fleeTimer: 0,
      jacket: random.pick([0x3fae6a, 0x2e6fc2, 0xc2a52e, 0x8a5fc2, 0xd8d8d8, 0x5a5a6a]),
      phase: random.range(0, Math.PI * 2),
    };
  }

  function reset() {
    const s = state;
    s.elapsed = 0;
    s.cash = 0;
    s.over = null;
    s.bustTimer = 0;
    s.stars = 0;
    s.lastCrimeAt = 0;
    s.crimeAt = {};
    s.decayTimer = 0;
    const p = s.player;
    p.x = city.playerStart.x;
    p.z = city.playerStart.z;
    p.heading = city.playerStart.heading;
    p.vx = 0; p.vz = 0; p.speed = 0;
    p.health = PLAYER.health;
    p.walkPhase = 0;
    p.lastHurtAt = -99;
    p.inCar = null;
    s.cars = [];
    // Parked cars: the lot first, then along roads.
    const lot = city.lotRect;
    for (let i = 0; i < PARKED_COUNT; i += 1) {
      let x; let z; let heading;
      if (i < 8) {
        x = lot.x0 + 4 + (i % 4) * 8;
        z = lot.z0 + 8 + Math.floor(i / 4) * 20;
        heading = 0;
      } else {
        const road = random.pick([-180, -120, -60, 0, 60, 120, 180]);
        const along = random.range(-170, 170);
        if (random.chance(0.5)) { x = road + 5.2; z = along; heading = 0; }
        else { x = along; z = road + 5.2; heading = Math.PI / 2; }
      }
      s.cars.push(makeCar('parked', x, z, heading, random.pick([0xc23b2e, 0x2e6fc2, 0xe0a52e, 0x3fae6a, 0x8a5fc2, 0xd8d8d8, 0x222226])));
    }
    // One car always waits near the player's corner, so the first job starts fast.
    s.cars.push(makeCar('parked', -120, -174.8, Math.PI / 2, 0xc23b2e));
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) s.cars.push(spawnTrafficCar(null));
    s.peds = [];
    for (let i = 0; i < PED_COUNT; i += 1) s.peds.push(spawnPed());
    s.pickupSpots = [];
    for (let i = 0; i < 24; i += 1) s.pickupSpots.push(randomSidewalkPoint());
    s.pickups = [];
    for (let i = 0; i < PICKUP_COUNT; i += 1) {
      const spot = s.pickupSpots[i];
      s.pickups.push({ x: spot.x, z: spot.z, taken: false, respawn: 0, spin: random.range(0, Math.PI * 2) });
    }
    startMission(0);
    s.message = '';
  }

  function startMission(index) {
    const m = state.mission;
    m.index = index;
    m.phase = index >= MISSIONS.length ? 'complete' : 'active';
    m.dropIndex = 0;
    m.surviveTimer = 0;
    m.timer = index < MISSIONS.length ? MISSIONS[index].timeLimit : 0;
    if (index < MISSIONS.length && MISSIONS[index].startWanted) {
      state.stars = MISSIONS[index].startWanted;
      state.lastCrimeAt = state.elapsed;
    }
  }

  function missionTarget() {
    const m = state.mission;
    if (m.phase !== 'active') return null;
    const def = MISSIONS[m.index];
    if (def.target === 'garage') return { ...city.garage, label: 'Garage' };
    if (def.target === 'drops') return { ...city.drops[m.dropIndex], label: `Drop ${m.dropIndex + 1}/3` };
    if (def.target === 'safehouse') {
      if (m.surviveTimer < def.surviveSeconds) return null;
      return { ...city.safehouse, label: 'Safehouse' };
    }
    return null;
  }

  function addStar(reason) {
    const now = state.elapsed;
    if (now - (state.crimeAt[reason] ?? -99) < WANTED.crimeCooldown) return false;
    state.crimeAt[reason] = now;
    state.lastCrimeAt = now;
    if (state.stars < WANTED.max) state.stars += 1;
    return true;
  }

  function hurtPlayer(amount) {
    const p = state.player;
    p.health -= amount;
    p.lastHurtAt = state.elapsed;
    if (p.health <= 0) {
      p.health = 0;
      state.over = 'wasted';
      return EVENT_WASTED;
    }
    return 0;
  }

  function stepPlayer(dt, input) {
    const p = state.player;
    let events = 0;
    if (p.inCar) {
      const car = p.inCar;
      const throttle = input.throttle;
      const steer = input.steer;
      const prevSpeed = car.speed;
      if (throttle !== 0) {
        const accel = throttle > 0 ? CAR.accel : CAR.brake;
        car.speed += throttle * accel * dt;
      }
      // Rolling drag always bites, so half throttle means half speed.
      car.speed -= car.speed * CAR.drag * dt;
      if (throttle === 0 && Math.abs(car.speed) < 0.2) car.speed = 0;
      car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
      const turnAuthority = Math.min(1, Math.abs(car.speed) / 8);
      car.heading += steer * CAR.steerRate * turnAuthority * Math.sign(car.speed || 1) * dt;
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      const hitWall = resolveCircle(state.city, car, CAR.radius);
      if (hitWall) {
        const impact = Math.abs(prevSpeed);
        if (impact > 10) {
          events |= EVENT_CRASH;
          if (state.elapsed - p.lastHurtAt > 1) events |= hurtPlayer((impact - 10) * 0.6);
        }
        car.speed *= 0.45;
      }
      p.x = car.x;
      p.z = car.z;
      p.heading = car.heading;
      p.speed = Math.abs(car.speed);
      return events;
    }
    // On foot.
    const wishX = input.moveX;
    const wishZ = input.moveZ;
    const wishLen = Math.hypot(wishX, wishZ);
    const targetSpeed = wishLen > 0.01 ? (input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed) : 0;
    const nx = wishLen > 0.01 ? wishX / wishLen : 0;
    const nz = wishLen > 0.01 ? wishZ / wishLen : 0;
    p.vx += (nx * targetSpeed - p.vx) * Math.min(1, PLAYER.accel * dt / Math.max(targetSpeed, 1) * 6);
    p.vz += (nz * targetSpeed - p.vz) * Math.min(1, PLAYER.accel * dt / Math.max(targetSpeed, 1) * 6);
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    resolveCircle(state.city, p, PLAYER.radius);
    p.speed = Math.hypot(p.vx, p.vz);
    if (p.speed > 0.5) {
      const targetHeading = Math.atan2(p.vx, p.vz);
      p.heading += angleDiff(targetHeading, p.heading) * Math.min(1, PLAYER.turnRate * dt);
      p.walkPhase += p.speed * dt * 1.7;
    }
    return events;
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic') continue;
      const target = state.city.nodes[car.nextNode];
      const desired = angleTo(car.x, car.z, target.x, target.z);
      const diff = angleDiff(desired, car.heading);
      car.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
      // Brake for a car ahead.
      let ahead = false;
      for (const other of state.cars) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const d = Math.hypot(dx, dz);
        if (d < 7 && d > 0.01) {
          const dot = (dx * Math.sin(car.heading) + dz * Math.cos(car.heading)) / d;
          if (dot > 0.75) { ahead = true; break; }
        }
      }
      const want = ahead ? 0 : car.cruise;
      car.speed += (want - car.speed) * Math.min(1, 2.5 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      if (dist2(car.x, car.z, target.x, target.z) < 9) {
        const from = car.node;
        car.node = car.nextNode;
        const options = state.city.nodes[car.node].next.filter((n) => n !== from);
        car.nextNode = options.length > 0 ? options[Math.floor(random.next() * options.length)] : state.city.nodes[car.node].next[0];
      }
    }
  }

  function stepPeds(dt) {
    const p = state.player;
    const playerCar = p.inCar;
    for (const ped of state.peds) {
      if (ped.down) {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.down = false;
          ped.fleeTimer = 3;
        }
        continue;
      }
      let tx = ped.target.x;
      let tz = ped.target.z;
      let speed = ped.speed;
      if (ped.fleeTimer > 0) {
        ped.fleeTimer -= dt;
        const away = Math.atan2(ped.x - p.x, ped.z - p.z);
        tx = ped.x + Math.sin(away) * 10;
        tz = ped.z + Math.cos(away) * 10;
        speed = 3.2;
      } else if (playerCar && Math.abs(playerCar.speed) > 5 && dist2(ped.x, ped.z, p.x, p.z) < 64) {
        ped.fleeTimer = 2;
      }
      const desired = angleTo(ped.x, ped.z, tx, tz);
      ped.heading += angleDiff(desired, ped.heading) * Math.min(1, 8 * dt);
      ped.x += Math.sin(ped.heading) * speed * dt;
      ped.z += Math.cos(ped.heading) * speed * dt;
      ped.phase += speed * dt * 2.4;
      resolveCircle(state.city, ped, 0.5);
      if (dist2(ped.x, ped.z, tx, tz) < 4) ped.target = randomSidewalkPoint();
      // Run over by the player's car.
      if (playerCar && Math.abs(playerCar.speed) > 3 && dist2(ped.x, ped.z, playerCar.x, playerCar.z) < 4) {
        ped.down = true;
        ped.downTimer = 6;
        addStar('ped');
      }
    }
  }

  function stepCarCollisions(dt) {
    let events = 0;
    const cars = state.cars;
    const p = state.player;
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = 3.4;
        if (d >= min || d < 0.001) continue;
        const nx = dx / d;
        const nz = dz / d;
        const push = (min - d) / 2;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 10) {
          // Both cars shed speed in the impact; nobody gets a free boost.
          a.speed *= 0.8;
          b.speed *= 0.8;
          if (a === p.inCar || b === p.inCar) {
            events |= EVENT_CRASH;
            // At most one damage tick every 1.5 s, however many cars pile in.
            if (state.elapsed - p.lastHurtAt > 1.5) events |= hurtPlayer(Math.max(0, (rel - 12) * 0.4));
            if (a.police || b.police) addStar('police');
          }
        }
      }
    }
    return events;
  }

  function stepPolice(dt) {
    const p = state.player;
    const want = state.stars > 0 ? Math.min(state.stars + 1, 4) : 0;
    const police = state.cars.filter((c) => c.police);
    if (police.length < want) {
      const node = nearestNode(state.city, p.x, p.z);
      let spawn = random.pick(state.city.nodes);
      let guard = 0;
      while (dist2(spawn.x, spawn.z, p.x, p.z) < 70 * 70 && guard < 30) {
        spawn = random.pick(state.city.nodes);
        guard += 1;
      }
      const car = makeCar('police', spawn.x, spawn.z, angleTo(spawn.x, spawn.z, p.x, p.z), 0xe8e8e8);
      car.speed = CAR.policeSpeed;
      car.node = node.id;
      state.cars.push(car);
    } else if (police.length > want) {
      // Wanted cleared: the furthest cruiser leaves.
      let far = police[0];
      let farD = -1;
      for (const c of police) {
        const d = dist2(c.x, c.z, p.x, p.z);
        if (d > farD) { farD = d; far = c; }
      }
      state.cars.splice(state.cars.indexOf(far), 1);
    }
    for (const car of state.cars) {
      if (!car.police) continue;
      const tx = p.x + p.vx * 0.4;
      const tz = p.z + p.vz * 0.4;
      const desired = angleTo(car.x, car.z, tx, tz);
      const diff = angleDiff(desired, car.heading);
      car.heading += Math.max(-2.8 * dt, Math.min(2.8 * dt, diff));
      const d = Math.hypot(tx - car.x, tz - car.z);
      const wantSpeed = p.inCar ? CAR.policeSpeed + state.stars * 0.6 : Math.min(14, d * 1.2);
      car.speed += (wantSpeed - car.speed) * Math.min(1, 2 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      resolveCircle(state.city, car, CAR.radius);
      // On foot, a cruiser sitting on the player busts them.
      if (!p.inCar && d < WANTED.bustRange) {
        state.bustTimer += dt;
        if (state.bustTimer >= WANTED.bustSeconds) {
          state.over = 'busted';
        }
      }
    }
    if (p.inCar || state.cars.every((c) => !c.police || dist2(c.x, c.z, p.x, p.z) > WANTED.bustRange * WANTED.bustRange)) {
      state.bustTimer = Math.max(0, state.bustTimer - dt * 2);
    }
  }

  function stepWanted(dt) {
    if (state.stars === 0) return;
    const nearPolice = state.cars.some((c) => c.police && dist2(c.x, c.z, state.player.x, state.player.z) < 45 * 45);
    if (state.elapsed - state.lastCrimeAt > WANTED.decayQuiet && !nearPolice) {
      state.decayTimer += dt;
      if (state.decayTimer >= WANTED.decayEvery) {
        state.decayTimer = 0;
        state.stars -= 1;
      }
    } else {
      state.decayTimer = 0;
    }
  }

  function stepMission(dt) {
    const m = state.mission;
    if (m.phase !== 'active') return 0;
    m.timer -= dt;
    if (m.timer <= 0) {
      m.phase = 'failed';
      return EVENT_MISSION_FAIL;
    }
    const def = MISSIONS[m.index];
    if (def.target === 'safehouse' && m.surviveTimer < def.surviveSeconds) {
      if (state.stars >= 2) m.surviveTimer += dt;
      return 0;
    }
    const target = missionTarget();
    if (!target) return 0;
    const p = state.player;
    if (dist2(p.x, p.z, target.x, target.z) < 16) {
      if (def.target === 'drops') {
        m.dropIndex += 1;
        if (m.dropIndex >= 3) {
          return finishMission();
        }
        return EVENT_DROP;
      }
      return finishMission();
    }
    return 0;
  }

  function finishMission() {
    const m = state.mission;
    state.cash += MISSIONS[m.index].reward;
    m.phase = 'done';
    if (m.index + 1 >= MISSIONS.length) {
      m.index = MISSIONS.length;
      m.phase = 'complete';
      state.cash += 500; // Portside Legend bonus
    } else {
      startMission(m.index + 1);
    }
    return EVENT_MISSION_DONE;
  }

  function stepPickups(dt) {
    let events = 0;
    const p = state.player;
    for (const pk of state.pickups) {
      if (pk.taken) {
        pk.respawn -= dt;
        if (pk.respawn <= 0) {
          pk.taken = false;
          const spot = state.pickupSpots[Math.floor(random.next() * state.pickupSpots.length)];
          pk.x = spot.x;
          pk.z = spot.z;
        }
        continue;
      }
      pk.spin += dt * 2;
      if (!p.inCar && dist2(p.x, p.z, pk.x, pk.z) < 2) {
        pk.taken = true;
        pk.respawn = 30;
        state.cash += PICKUP_VALUE;
        events |= EVENT_PICKUP;
      }
    }
    return events;
  }

  function interact() {
    const p = state.player;
    let events = 0;
    if (p.inCar) {
      const car = p.inCar;
      car.kind = 'parked';
      car.speed = 0;
      p.inCar = null;
      p.x = car.x - Math.sin(car.heading + Math.PI / 2) * 2.4;
      p.z = car.z - Math.cos(car.heading + Math.PI / 2) * 2.4;
      resolveCircle(state.city, p, PLAYER.radius);
      return EVENT_EXIT_CAR;
    }
    let best = null;
    let bestD = 16;
    for (const car of state.cars) {
      if (car.police) continue;
      const d = dist2(p.x, p.z, car.x, car.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (best) {
      if (best.kind === 'traffic') {
        // The driver bails; a replacement joins the flow elsewhere.
        state.cars.splice(state.cars.indexOf(best), 1);
        state.cars.push(spawnTrafficCar(p));
      }
      best.kind = 'player';
      best.speed = 0;
      p.inCar = best;
      p.x = best.x;
      p.z = best.z;
      p.heading = best.heading;
      events |= EVENT_ENTER_CAR;
      if (addStar('steal')) events |= EVENT_STEAL | EVENT_CRIME;
    }
    return events;
  }

  /**
   * One fixed step. `input` is { moveX, moveZ (world-space wish, on foot),
   * throttle, steer (in a car), sprint, actions } — the loop builds it from
   * the keyboard or the screenshot autopilot builds it by hand.
   */
  function step(dt, input) {
    if (state.over) return 0;
    state.elapsed += dt;
    let events = 0;
    if (input.actions) {
      if (input.actions & 4) events |= interact(); // ACTION_INTERACT
    }
    events |= stepPlayer(dt, input);
    stepTraffic(dt);
    stepPeds(dt);
    events |= stepCarCollisions(dt);
    stepPolice(dt);
    stepWanted(dt);
    events |= stepMission(dt);
    events |= stepPickups(dt);
    if (state.over === 'busted') events |= EVENT_BUSTED;
    if (state.over === 'wasted') events |= EVENT_WASTED;
    // Health comes back slowly when nothing has hurt the player lately.
    const p = state.player;
    if (state.elapsed - p.lastHurtAt > 4 && p.health > 0 && p.health < PLAYER.health) {
      p.health = Math.min(PLAYER.health, p.health + 3 * dt);
    }
    return events;
  }

  function nearestCar(maxDist) {
    const p = state.player;
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of state.cars) {
      if (car.police) continue;
      const d = dist2(p.x, p.z, car.x, car.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function nearestParkedCar(maxDist) {
    const p = state.player;
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of state.cars) {
      if (car.kind !== 'parked') continue;
      const d = dist2(p.x, p.z, car.x, car.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  reset();
  return {
    state, reset, step, startMission, missionTarget, nearestCar, nearestParkedCar,
    retryMission() {
      startMission(state.mission.index >= MISSIONS.length ? MISSIONS.length - 1 : state.mission.index);
      state.stars = 0;
      state.lastCrimeAt = state.elapsed;
    },
  };
}
