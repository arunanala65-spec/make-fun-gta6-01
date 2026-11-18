// Drawing only: the world's state in, pixels out. Three.js scene, dusk
// lighting with shadows, procedural canvas textures for the buildings and
// the ground, a 2D minimap, and DOM HUD updates. No rules live here.
import * as THREE from 'three';
import { CAR, MISSIONS, PALETTE, PLAYER, WORLD } from './config.js';
import { createGroundCanvas } from './city.js';

function buildingTextures(paletteIndex) {
  const base = PALETTE.building[paletteIndex];
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  const e = document.createElement('canvas');
  e.width = 128;
  e.height = 256;
  const ge = e.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 128, 256);
  // Window grid; a seeded-looking scatter of lit windows.
  let seed = paletteIndex * 7919 + 13;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let y = 14; y < 244; y += 22) {
    for (let x = 10; x < 118; x += 18) {
      const lit = rnd() < 0.42;
      g.fillStyle = lit ? '#ffd98a' : '#1a2233';
      g.fillRect(x, y, 11, 14);
      if (lit) {
        ge.fillStyle = '#ffca6a';
        ge.fillRect(x, y, 11, 14);
      }
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = new THREE.CanvasTexture(e);
  return { map, emissiveMap };
}

function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x11151c, metalness: 0.9, roughness: 0.15 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.58, 2.2), glassMat);
  cabin.position.set(0, 1.08, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.9 });
  const wheels = [];
  for (const [x, z] of [[-0.85, 1.45], [0.85, 1.45], [-0.85, -1.45], [0.85, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.36, z);
    w.castShadow = true;
    group.add(w);
    wheels.push(w);
  }
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffeeb0, emissiveIntensity: 1.4 });
  for (const x of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), headMat);
    h.position.set(x, 0.62, 2.21);
    group.add(h);
  }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xdd2222, emissiveIntensity: 1.2 });
  for (const x of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), tailMat);
    t.position.set(x, 0.62, -2.21);
    group.add(t);
  }
  let lightBar = null;
  if (isPolice) {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 2 }));
    red.position.x = -0.28;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2244ff, emissiveIntensity: 2 }));
    blue.position.x = 0.28;
    bar.add(red, blue);
    bar.position.set(0, 1.46, -0.25);
    group.add(bar);
    lightBar = { red: red.material, blue: blue.material };
    // Black-and-white doors.
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x181818, metalness: 0.5, roughness: 0.4 });
    const doors = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.34, 1.6), doorMat);
    doors.position.set(0, 0.62, 0.1);
    group.add(doors);
  }
  return { group, wheels, lightBar };
}

function makePersonMesh(jacket) {
  const group = new THREE.Group();
  const jacketMat = new THREE.MeshStandardMaterial({ color: jacket, roughness: 0.8 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x23232e, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9a986, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), jacketMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skinMat);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.24, 0.09, 12), jacketMat);
  cap.position.y = 1.8;
  group.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.68, 0.26), pantsMat);
  legL.geometry.translate(0, -0.34, 0);
  legL.position.set(-0.16, 0.68, 0);
  legL.castShadow = true;
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legL, legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.2), jacketMat);
  armL.geometry.translate(0, -0.3, 0);
  armL.position.set(-0.42, 1.36, 0);
  const armR = armL.clone();
  armR.position.x = 0.42;
  group.add(armL, armR);
  return { group, legL, legR, armL, armR };
}

export function createRenderer(canvas, minimapCanvas, hud) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.fog, 90, 430);

  // Dusk sky dome: a vertical gradient painted on a canvas, inside a sphere.
  {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#160f2e');
    grad.addColorStop(0.45, '#3a2358');
    grad.addColorStop(0.72, '#8a4a6e');
    grad.addColorStop(0.88, '#e07a4e');
    grad.addColorStop(1, '#2a1a2e');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(760, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
    );
    scene.add(sky);
  }

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.0);
  sun.position.set(140, 190, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 520;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  // Cool moonlight fill from the opposite side, so faces turned away from
  // the low sun stay readable instead of going black.
  const fill = new THREE.DirectionalLight(0x6a7bd8, 0.6);
  fill.position.set(-120, 100, -140);
  scene.add(fill);

  const cam = { yaw: 0, pitch: 0.42, dist: null, height: null };
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1600);
  const cameraTarget = new THREE.Vector3();

  let world = null;
  const carMeshes = new Map();
  const pedMeshes = [];
  let playerMesh = null;
  let beacon = null;
  let beaconRing = null;

  // One pooled Points cloud for crash sparks and pickup glints.
  const PARTICLE_MAX = 240;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PARTICLE_MAX * 3);
  const pCol = new Float32Array(PARTICLE_MAX * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  const particles = [];
  for (let i = 0; i < PARTICLE_MAX; i += 1) particles.push({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1 });
  let pCursor = 0;

  function burst(x, y, z, n, r, g, b, speed) {
    for (let i = 0; i < n; i += 1) {
      const p = particles[pCursor];
      pCursor = (pCursor + 1) % PARTICLE_MAX;
      p.life = 0.7;
      p.x = x; p.y = y; p.z = z;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 4 + 1;
      p.vx = Math.cos(a) * speed * Math.random();
      p.vz = Math.sin(a) * speed * Math.random();
      p.vy = up;
      p.r = r; p.g = g; p.b = b;
    }
  }

  function buildWorld(nextWorld) {
    world = nextWorld;
    const city = world.state.city;
    // Ground.
    const groundTex = new THREE.CanvasTexture(createGroundCanvas(city));
    groundTex.colorSpace = THREE.SRGBColorSpace;
    groundTex.anisotropy = 8;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.size, WORLD.size),
      new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    // The bay, south of the boardwalk.
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.size, 320),
      new THREE.MeshStandardMaterial({ color: 0x0e3a5c, metalness: 0.7, roughness: 0.25 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.25, WORLD.half + 160);
    scene.add(water);
    // Buildings.
    const textures = [0, 1, 2, 3, 4].map(buildingTextures);
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    for (const b of city.buildings) {
      const { map, emissiveMap } = textures[b.palette];
      const mat = new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: b.lit * 0.9, roughness: 0.85 });
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.scale.set(b.w, b.h, b.d);
      mesh.position.set(b.x, b.h / 2, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      // Roof trim + a rooftop box for silhouette variety.
      const roofMat = new THREE.MeshStandardMaterial({ color: PALETTE.roof, roughness: 0.95 });
      const roof = new THREE.Mesh(boxGeo, roofMat);
      roof.scale.set(b.w + 0.4, 0.5, b.d + 0.4);
      roof.position.set(b.x, b.h + 0.25, b.z);
      scene.add(roof);
      if (b.h > 24) {
        const ac = new THREE.Mesh(boxGeo, roofMat);
        ac.scale.set(2.4, 1.2, 2.4);
        ac.position.set(b.x + b.w * 0.2, b.h + 1.1, b.z - b.d * 0.15);
        ac.castShadow = true;
        scene.add(ac);
      }
    }
    // Lamps.
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.7, metalness: 0.5 });
    const lampHeadGeo = new THREE.SphereGeometry(0.28, 10, 8);
    const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffc860, emissiveIntensity: 2.2 });
    for (const l of city.lamps) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(l.x, 2.7, l.z);
      pole.castShadow = true;
      const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
      head.position.set(l.x, 5.5, l.z);
      scene.add(pole, head);
    }
    // Trees.
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.8, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.95 });
    const leafGeo = new THREE.SphereGeometry(1.5, 10, 8);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2c4a26, roughness: 0.95 });
    for (const t of city.trees) {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(t.x, 0.9 * t.s, t.z);
      trunk.castShadow = true;
      const leaves = new THREE.Mesh(leafGeo, leafMat);
      leaves.scale.setScalar(t.s);
      leaves.position.set(t.x, (1.8 + 1.1) * t.s, t.z);
      leaves.castShadow = true;
      scene.add(trunk, leaves);
    }
    // Benches.
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
    for (const b of city.benches) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.7), benchMat);
      bench.position.set(b.x, 0.45, b.z);
      bench.rotation.y = b.rot;
      bench.castShadow = true;
      scene.add(bench);
    }
    // Mission beacon.
    const beaconMat = new THREE.MeshBasicMaterial({ color: PALETTE.marker, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 34, 20, 1, true), beaconMat);
    beacon.position.y = 17;
    scene.add(beacon);
    beaconRing = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.1, 32),
      new THREE.MeshBasicMaterial({ color: PALETTE.marker, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    beaconRing.rotation.x = -Math.PI / 2;
    beaconRing.position.y = 0.12;
    scene.add(beaconRing);
    // Player + pedestrians.
    playerMesh = makePersonMesh(PALETTE.playerJacket);
    scene.add(playerMesh.group);
    for (const ped of world.state.peds) {
      const m = makePersonMesh(ped.jacket);
      scene.add(m.group);
      pedMeshes.push(m);
    }
    // Cash pickups: small spinning gold boxes.
    for (const pk of world.state.pickups) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.5, 0.7),
        new THREE.MeshStandardMaterial({ color: PALETTE.cash, emissive: 0x39d353, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3 }),
      );
      mesh.position.set(pk.x, 0.9, pk.z);
      mesh.castShadow = true;
      scene.add(mesh);
      pk.mesh = mesh;
    }
  }

  function syncCarMesh(car, now) {
    let entry = carMeshes.get(car.id);
    if (!entry) {
      entry = makeCarMesh(car.color, car.police);
      scene.add(entry.group);
      carMeshes.set(car.id, entry);
    }
    entry.group.position.set(car.x, 0, car.z);
    entry.group.rotation.y = car.heading;
    const spin = car.speed * 0.016;
    for (const w of entry.wheels) w.rotation.x += spin;
    if (entry.lightBar) {
      const on = Math.floor(now * 2.4) % 2 === 0;
      entry.lightBar.red.emissiveIntensity = on ? 3 : 0.4;
      entry.lightBar.blue.emissiveIntensity = on ? 0.4 : 3;
    }
  }

  function syncPerson(mesh, x, z, heading, phase, speed, down) {
    mesh.group.position.set(x, down ? 0.25 : 0, z);
    mesh.group.rotation.y = heading;
    if (down) {
      mesh.group.rotation.x = Math.PI / 2 - 0.15;
      return;
    }
    mesh.group.rotation.x = 0;
    const swing = Math.min(1, speed / 6) * 0.55;
    const s = Math.sin(phase);
    mesh.legL.rotation.x = s * swing;
    mesh.legR.rotation.x = -s * swing;
    mesh.armL.rotation.x = -s * swing * 0.8;
    mesh.armR.rotation.x = s * swing * 0.8;
  }

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // Keep the camera out of buildings: pull it toward the player until the
  // spot is clear (above the ground, outside every building's box).
  function cameraClear(x, y, z) {
    if (!world || y < 1.0) return false;
    for (const b of world.state.city.buildings) {
      if (Math.abs(x - b.x) < b.w / 2 + 1.2 && Math.abs(z - b.z) < b.d / 2 + 1.2 && y < b.h + 1) return false;
    }
    return true;
  }

  function drawMinimap() {
    const g = minimapCanvas.getContext('2d');
    const S = minimapCanvas.width;
    const scale = S / WORLD.size;
    const px = (v) => (v + WORLD.half) * scale;
    g.fillStyle = '#101018';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#2c2c36';
    for (const r of WORLD.roads) {
      g.fillRect(0, px(r - WORLD.roadWidth / 2), S, WORLD.roadWidth * scale);
      g.fillRect(px(r - WORLD.roadWidth / 2), 0, WORLD.roadWidth * scale, S);
    }
    g.fillStyle = '#1d4a2a';
    for (const p of world.state.city.parks) g.fillRect(px(p.x0), px(p.z0), p.w * scale, p.d * scale);
    g.fillStyle = '#0e3a5c';
    g.fillRect(0, px(WORLD.waterZ), S, S - px(WORLD.waterZ));
    const target = world.missionTarget();
    if (target) {
      const pulse = 3 + Math.sin(performance.now() / 240) * 1.5;
      g.strokeStyle = '#ffc21e';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(px(target.x), px(target.z), pulse + 3, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#ffc21e';
      g.beginPath();
      g.arc(px(target.x), px(target.z), 2.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#7dff5e';
    for (const pk of world.state.pickups) {
      if (!pk.taken) g.fillRect(px(pk.x) - 1.5, px(pk.z) - 1.5, 3, 3);
    }
    for (const car of world.state.cars) {
      g.fillStyle = car.police ? (Math.floor(performance.now() / 300) % 2 === 0 ? '#ff4444' : '#4488ff') : '#e0a52e';
      g.beginPath();
      g.arc(px(car.x), px(car.z), car.police ? 3 : 2.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#9a9aa8';
    for (const ped of world.state.peds) g.fillRect(px(ped.x) - 1, px(ped.z) - 1, 2, 2);
    const p = world.state.player;
    g.save();
    g.translate(px(p.x), px(p.z));
    g.rotate(Math.PI - p.heading);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4.5, 5);
    g.lineTo(-4.5, 5);
    g.closePath();
    g.fill();
    g.restore();
  }

  function updateHud() {
    const s = world.state;
    hud.cash.textContent = `$${s.cash.toLocaleString('en-US')}`;
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < s.stars ? '★' : '☆';
    hud.stars.textContent = stars;
    hud.stars.classList.toggle('hot', s.stars >= 3);
    const m = s.mission;
    if (m.phase === 'complete') {
      hud.objective.textContent = 'Portside Legend — all jobs done. Free roam!';
      hud.distance.textContent = '';
    } else if (m.phase === 'failed') {
      hud.objective.textContent = `${MISSIONS[m.index].name} failed — press Enter to retry`;
      hud.distance.textContent = '';
    } else if (m.phase === 'done') {
      hud.objective.textContent = 'Job done!';
      hud.distance.textContent = '';
    } else {
      const def = MISSIONS[m.index];
      hud.objective.textContent = `${def.name}: ${def.brief}`;
      const target = world.missionTarget();
      if (target) {
        const d = Math.hypot(s.player.x - target.x, s.player.z - target.z);
        hud.distance.textContent = `${target.label} — ${Math.round(d)}m · ${Math.max(0, Math.ceil(m.timer))}s`;
      } else {
        hud.distance.textContent = `Lay low — ${Math.max(0, Math.ceil(m.timer))}s · survive ${Math.ceil(def.surviveSeconds - m.surviveTimer)}s more`;
      }
    }
    const p = s.player;
    hud.speed.textContent = p.inCar ? `${Math.round(Math.abs(p.inCar.speed) * 3.6)} km/h` : '';
    hud.healthFill.style.width = `${Math.max(0, p.health)}%`;
    hud.healthFill.classList.toggle('low', p.health < 35);
    const near = p.inCar ? null : world.nearestCar(4);
    hud.prompt.textContent = near ? 'Press E to steal the car' : '';
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  window.addEventListener('resize', resize);
  resize();

  return {
    buildWorld,
    getYaw() {
      return cam.yaw;
    },
    setYaw(yaw) {
      cam.yaw = yaw;
    },
    /** Ease the camera behind the player's heading (driving follow). */
    alignYaw(target, dt) {
      cam.yaw += angleDiff(target, cam.yaw) * Math.min(1, 1.4 * dt);
    },
    orbit(dx, dy) {
      cam.yaw -= dx * 0.004;
      cam.pitch = Math.max(0.12, Math.min(1.1, cam.pitch + dy * 0.003));
    },
    setCamera(yaw, pitch, dist, height) {
      cam.yaw = yaw;
      cam.pitch = pitch;
      cam.dist = dist;
      cam.height = height;
    },
    burst,
    draw(now, screen, dt) {
      const s = world.state;
      const p = s.player;
      // Sync meshes.
      for (const car of s.cars) syncCarMesh(car, now);
      for (const [id, entry] of [...carMeshes]) {
        if (!s.cars.some((c) => c.id === id)) {
          scene.remove(entry.group);
          carMeshes.delete(id);
        }
      }
      for (let i = 0; i < s.peds.length; i += 1) {
        const ped = s.peds[i];
        syncPerson(pedMeshes[i], ped.x, ped.z, ped.heading, ped.phase, ped.down ? 0 : ped.speed, ped.down);
      }
      if (playerMesh) {
        playerMesh.group.visible = !p.inCar;
        if (!p.inCar) syncPerson(playerMesh, p.x, p.z, p.heading, p.walkPhase, p.speed, false);
      }
      for (const pk of s.pickups) {
        if (!pk.mesh) {
          pk.mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.5, 0.7),
            new THREE.MeshStandardMaterial({ color: PALETTE.cash, emissive: 0x39d353, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3 }),
          );
          pk.mesh.position.set(pk.x, 0.9, pk.z);
          pk.mesh.castShadow = true;
          scene.add(pk.mesh);
        }
        pk.mesh.visible = !pk.taken;
        if (!pk.taken) {
          pk.mesh.rotation.y = pk.spin;
          pk.mesh.position.y = 0.9 + Math.sin(pk.spin * 1.4) * 0.15;
        }
      }
      const target = world.missionTarget();
      if (beacon && target) {
        beacon.visible = true;
        beaconRing.visible = true;
        beacon.position.x = target.x;
        beacon.position.z = target.z;
        beaconRing.position.x = target.x;
        beaconRing.position.z = target.z;
        const pulse = 1 + Math.sin(now * 3) * 0.12;
        beacon.scale.set(pulse, 1, pulse);
        beacon.material.opacity = 0.18 + Math.sin(now * 3) * 0.06;
        beaconRing.scale.setScalar(pulse);
      } else if (beacon) {
        beacon.visible = false;
        beaconRing.visible = false;
      }
      // Particles.
      for (let i = 0; i < PARTICLE_MAX; i += 1) {
        const pt = particles[i];
        if (pt.life > 0) {
          pt.life -= dt;
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.z += pt.vz * dt;
          pt.vy -= 9 * dt;
          if (pt.y < 0.05) { pt.y = 0.05; pt.vy *= -0.4; }
        }
        pPos[i * 3] = pt.x;
        pPos[i * 3 + 1] = pt.life > 0 ? pt.y : -99;
        pPos[i * 3 + 2] = pt.z;
        pCol[i * 3] = pt.r;
        pCol[i * 3 + 1] = pt.g;
        pCol[i * 3 + 2] = pt.b;
      }
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.color.needsUpdate = true;
      // Camera.
      if (screen === 'title') {
        const a = now * 0.05;
        camera.position.set(Math.sin(a) * 150, 95, Math.cos(a) * 150);
        camera.lookAt(0, 10, 0);
        camera.fov = 55;
      } else {
        const inCar = !!p.inCar;
        const baseDist = cam.dist ?? (inCar ? 16 : 13);
        const height = cam.height ?? (inCar ? 10 : 7);
        const tx = p.x;
        const tz = p.z;
        const camPosAt = (d) => ({
          x: tx - Math.sin(cam.yaw) * Math.cos(cam.pitch) * d,
          y: height + Math.sin(cam.pitch) * d * 0.55 + (baseDist - d) * 0.9,
          z: tz - Math.cos(cam.yaw) * Math.cos(cam.pitch) * d,
        });
        let d = baseDist;
        let cp = camPosAt(d);
        while (d > 4.5 && !cameraClear(cp.x, cp.y, cp.z)) {
          d -= 1.5;
          cp = camPosAt(d);
        }
        const cx = cp.x;
        const cy = cp.y;
        const cz = cp.z;
        const k = 1 - Math.exp(-6 * dt);
        camera.position.x += (cx - camera.position.x) * k;
        camera.position.y += (cy - camera.position.y) * k;
        camera.position.z += (cz - camera.position.z) * k;
        cameraTarget.set(tx + Math.sin(p.heading) * 3, 1.6, tz + Math.cos(p.heading) * 3);
        camera.lookAt(cameraTarget);
        const targetFov = inCar ? 60 + Math.min(10, Math.abs(p.inCar.speed) * 0.25) : 60;
        camera.fov += (targetFov - camera.fov) * Math.min(1, 4 * dt);
      }
      camera.updateProjectionMatrix();
      // Sun shadow follows the player.
      sun.position.set(p.x + 140, 190, p.z + 80);
      sun.target.position.set(p.x, 0, p.z);
      sun.target.updateMatrixWorld();
      renderer.render(scene, camera);
      if (screen === 'play') {
        drawMinimap();
        updateHud();
      }
    },
  };
}
