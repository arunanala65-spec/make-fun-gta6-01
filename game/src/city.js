// The Portside district of Neon Harbor: a 6x6-block grid, two parks, a plaza,
// a parking lot, and a boardwalk on the bay to the south. Pure data + one
// canvas for the ground texture; no Three.js in here, so the layout is the
// same for the renderer, the minimap and the screenshot autopilot.
import { WORLD } from './config.js';

const ROADS = WORLD.roads;
const HALF = WORLD.half;

function blockRect(bx, bz) {
  const x0 = ROADS[bx] + WORLD.roadWidth / 2 + 1;
  const z0 = ROADS[bz] + WORLD.roadWidth / 2 + 1;
  const x1 = ROADS[bx + 1] - WORLD.roadWidth / 2 - 1;
  const z1 = ROADS[bz + 1] - WORLD.roadWidth / 2 - 1;
  return { x0, z0, x1, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}

export function buildCity(random) {
  const buildings = [];
  const parks = [];
  const trees = [];
  const lamps = [];
  const benches = [];
  const parkBlocks = [[1, 4], [4, 1]];
  const plazaBlock = [3, 3];
  const lotBlock = [5, 5];
  const isPark = (bx, bz) => parkBlocks.some(([a, b]) => a === bx && b === bz);
  const isPlaza = (bx, bz) => bx === plazaBlock[0] && bz === plazaBlock[1];
  const isLot = (bx, bz) => bx === lotBlock[0] && bz === lotBlock[1];

  for (let bx = 0; bx < 6; bx += 1) {
    for (let bz = 0; bz < 6; bz += 1) {
      const r = blockRect(bx, bz);
      if (isPark(bx, bz)) {
        parks.push(r);
        const n = random.int(9, 13);
        for (let i = 0; i < n; i += 1) {
          trees.push({ x: random.range(r.x0 + 4, r.x1 - 4), z: random.range(r.z0 + 4, r.z1 - 4), s: random.range(0.8, 1.4) });
        }
        benches.push({ x: r.cx - 8, z: r.cz, rot: 0 });
        benches.push({ x: r.cx + 8, z: r.cz, rot: Math.PI });
        continue;
      }
      if (isPlaza(bx, bz)) {
        benches.push({ x: r.cx - 10, z: r.cz - 6, rot: 0 });
        benches.push({ x: r.cx + 10, z: r.cz + 6, rot: Math.PI });
        benches.push({ x: r.cx, z: r.cz - 10, rot: Math.PI / 2 });
        for (let i = 0; i < 5; i += 1) trees.push({ x: random.range(r.x0 + 4, r.x1 - 4), z: random.range(r.z0 + 4, r.z1 - 4), s: random.range(0.8, 1.2) });
        continue;
      }
      if (isLot(bx, bz)) continue; // open parking lot: parked cars live here
      // 2x2 quadrants, each usually one building; taller toward the middle.
      const distC = Math.hypot(r.cx, r.cz) / 260;
      for (let qx = 0; qx < 2; qx += 1) {
        for (let qz = 0; qz < 2; qz += 1) {
          if (!random.chance(0.82)) continue;
          const qw = r.w / 2;
          const qd = r.d / 2;
          const w = random.range(13, Math.min(19, qw - 2));
          const d = random.range(13, Math.min(19, qd - 2));
          const x = r.x0 + qx * qw + qw / 2 + random.range(-1.5, 1.5);
          const z = r.z0 + qz * qd + qd / 2 + random.range(-1.5, 1.5);
          const h = Math.round(random.range(10, 26) + (1 - distC) * random.range(8, 30));
          buildings.push({ x, z, w, d, h, palette: random.int(0, 4), lit: random.range(0.25, 0.7) });
        }
      }
    }
  }

  // Street lamps at every other intersection, two corners each.
  for (let ix = 0; ix < ROADS.length; ix += 1) {
    for (let iz = 0; iz < ROADS.length; iz += 1) {
      if ((ix + iz) % 2 !== 0) continue;
      const x = ROADS[ix];
      const z = ROADS[iz];
      lamps.push({ x: x + 9, z: z + 9 });
      lamps.push({ x: x - 9, z: z - 9 });
    }
  }
  // Trees along a few sidewalks.
  for (let i = 0; i < 26; i += 1) {
    const road = random.pick(ROADS);
    const along = random.range(-180, 180);
    const side = random.chance(0.5) ? 1 : -1;
    if (random.chance(0.5)) trees.push({ x: road + side * 9.5, z: along, s: random.range(0.8, 1.2) });
    else trees.push({ x: along, z: road + side * 9.5, s: random.range(0.8, 1.2) });
  }

  // Road graph: one node per intersection, edges along the roads.
  const nodes = [];
  const nodeId = {};
  for (let ix = 0; ix < ROADS.length; ix += 1) {
    for (let iz = 0; iz < ROADS.length; iz += 1) {
      const id = nodes.length;
      nodeId[`${ix},${iz}`] = id;
      nodes.push({ id, x: ROADS[ix], z: ROADS[iz], ix, iz, next: [] });
    }
  }
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const n of nodes) {
    for (const [dx, dz] of dirs) {
      const jx = n.ix + dx;
      const jz = n.iz + dz;
      if (jx < 0 || jx >= ROADS.length || jz < 0 || jz >= ROADS.length) continue;
      n.next.push(nodeId[`${jx},${jz}`]);
    }
  }

  // Mission places: all on roads, so cars can reach them.
  const garage = { x: 180, z: -60 };
  const safehouse = { x: -180, z: 120 };
  const drops = [
    { x: 0, z: -180 },
    { x: 120, z: 60 },
    { x: -120, z: 0 },
  ];
  const playerStart = { x: -150, z: -180, heading: Math.PI / 2 }; // on the northern road, facing east
  const lotRect = blockRect(5, 5);

  return {
    buildings, parks, trees, lamps, benches, nodes, nodeId,
    garage, safehouse, drops, playerStart, lotRect,
    parkBlocks, plazaBlock, lotBlock,
    blockRect,
  };
}

// --- Ground texture: one 2048 canvas painted once at boot -----------------
const GROUND_PX = 2048;
const SCALE = GROUND_PX / WORLD.size; // px per metre

function toPx(v) {
  return (v + HALF) * SCALE;
}

export function createGroundCanvas(city) {
  const canvas = document.createElement('canvas');
  canvas.width = GROUND_PX;
  canvas.height = GROUND_PX;
  const g = canvas.getContext('2d');
  // Base: sidewalk slabs.
  g.fillStyle = '#484854';
  g.fillRect(0, 0, GROUND_PX, GROUND_PX);
  // Blocks: subtle per-block tone so the grid reads from above.
  for (let bx = 0; bx < 6; bx += 1) {
    for (let bz = 0; bz < 6; bz += 1) {
      const r = city.blockRect(bx, bz);
      g.fillStyle = (bx + bz) % 2 === 0 ? '#4e4e5a' : '#454551';
      g.fillRect(toPx(r.x0), toPx(r.z0), (r.x1 - r.x0) * SCALE, (r.z1 - r.z0) * SCALE);
    }
  }
  // Parks: grass + paths.
  for (const p of city.parks) {
    g.fillStyle = '#2e5230';
    g.fillRect(toPx(p.x0), toPx(p.z0), p.w * SCALE, p.d * SCALE);
    g.strokeStyle = '#c9b48a';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(toPx(p.cx), toPx(p.z0));
    g.lineTo(toPx(p.cx), toPx(p.z1));
    g.moveTo(toPx(p.x0), toPx(p.cz));
    g.lineTo(toPx(p.x1), toPx(p.cz));
    g.stroke();
  }
  // Plaza: pale paving.
  {
    const r = city.blockRect(city.plazaBlock[0], city.plazaBlock[1]);
    g.fillStyle = '#55555f';
    g.fillRect(toPx(r.x0), toPx(r.z0), r.w * SCALE, r.d * SCALE);
    g.strokeStyle = '#6a6a76';
    g.lineWidth = 2;
    for (let i = 1; i < 4; i += 1) {
      g.beginPath();
      g.moveTo(toPx(r.x0 + (r.w * i) / 4), toPx(r.z0));
      g.lineTo(toPx(r.x0 + (r.w * i) / 4), toPx(r.z1));
      g.stroke();
    }
  }
  // Parking lot: asphalt + stall lines.
  {
    const r = city.blockRect(city.lotBlock[0], city.lotBlock[1]);
    g.fillStyle = '#26262e';
    g.fillRect(toPx(r.x0), toPx(r.z0), r.w * SCALE, r.d * SCALE);
    g.strokeStyle = '#c8c8c8';
    g.lineWidth = 2;
    for (let i = 0; i < 6; i += 1) {
      const x = toPx(r.x0 + 4 + i * 6.4);
      g.beginPath();
      g.moveTo(x, toPx(r.z0 + 4));
      g.lineTo(x, toPx(r.z0 + 16));
      g.moveTo(x, toPx(r.z1 - 4));
      g.lineTo(x, toPx(r.z1 - 16));
      g.stroke();
    }
  }
  // Boardwalk on the bay (south strip).
  g.fillStyle = '#6b4a2f';
  g.fillRect(0, toPx(WORLD.waterZ), GROUND_PX, (HALF - WORLD.waterZ) * SCALE);
  g.strokeStyle = '#54371f';
  g.lineWidth = 2;
  for (let z = WORLD.waterZ; z < HALF; z += 2) {
    g.beginPath();
    g.moveTo(0, toPx(z));
    g.lineTo(GROUND_PX, toPx(z));
    g.stroke();
  }
  // Roads: asphalt.
  g.fillStyle = '#2d2d38';
  for (const r of ROADS) {
    g.fillRect(0, toPx(r - WORLD.roadWidth / 2), GROUND_PX, WORLD.roadWidth * SCALE);
    g.fillRect(toPx(r - WORLD.roadWidth / 2), 0, WORLD.roadWidth * SCALE, GROUND_PX);
  }
  // Centre dashes.
  g.fillStyle = '#d8b93a';
  for (const r of ROADS) {
    for (let v = -HALF; v < HALF; v += 8) {
      g.fillRect(toPx(v), toPx(r - 0.4), 4 * SCALE, 0.8 * SCALE);
      g.fillRect(toPx(r - 0.4), toPx(v), 0.8 * SCALE, 4 * SCALE);
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = '#d8d8d8';
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      for (let i = -2; i <= 2; i += 1) {
        g.fillRect(toPx(rx + i * 2.4 - 0.8), toPx(rz - 7), 1.6 * SCALE, 3 * SCALE);
        g.fillRect(toPx(rx + i * 2.4 - 0.8), toPx(rz + 4), 1.6 * SCALE, 3 * SCALE);
        g.fillRect(toPx(rx - 7), toPx(rz + i * 2.4 - 0.8), 3 * SCALE, 1.6 * SCALE);
        g.fillRect(toPx(rx + 4), toPx(rz + i * 2.4 - 0.8), 3 * SCALE, 1.6 * SCALE);
      }
    }
  }
  return canvas;
}

// --- Collision: push a circle out of buildings and the district edge -------
export function resolveCircle(city, pos, radius) {
  let hit = false;
  for (const b of city.buildings) {
    const hw = b.w / 2;
    const hd = b.d / 2;
    const dx = pos.x - b.x;
    const dz = pos.z - b.z;
    const px = hw + radius - Math.abs(dx);
    const pz = hd + radius - Math.abs(dz);
    if (px <= 0 || pz <= 0) continue;
    hit = true;
    if (px < pz) pos.x = b.x + (dx >= 0 ? hw + radius : -(hw + radius));
    else pos.z = b.z + (dz >= 0 ? hd + radius : -(hd + radius));
  }
  // District edge + the bay railing.
  const lim = HALF - radius;
  if (pos.x < -lim) { pos.x = -lim; hit = true; }
  if (pos.x > lim) { pos.x = lim; hit = true; }
  if (pos.z < -lim) { pos.z = -lim; hit = true; }
  const waterLim = WORLD.waterZ - radius;
  if (pos.z > waterLim) { pos.z = waterLim; hit = true; }
  return hit;
}

export function nearestNode(city, x, z) {
  let best = city.nodes[0];
  let bestD = Infinity;
  for (const n of city.nodes) {
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

export function onRoad(x, z) {
  for (const r of ROADS) {
    if (Math.abs(x - r) <= WORLD.roadWidth / 2 + 0.5) return true;
    if (Math.abs(z - r) <= WORLD.roadWidth / 2 + 0.5) return true;
  }
  return false;
}
