// Every tuning number in one place. The district is a 420x420 grid of roads
// (pitch 60, width 14) with 6x6 blocks between them; the south strip is a
// boardwalk on the water. All speeds are metres per second.
export const STEP = 1 / 60;

export const WORLD = {
  size: 420,
  half: 210,
  roadPitch: 60,
  roadWidth: 14,
  roads: [-180, -120, -60, 0, 60, 120, 180],
  waterZ: 196, // south of this line is the boardwalk and the bay
};

export const PLAYER = {
  radius: 0.6,
  walkSpeed: 6,
  sprintSpeed: 10.5,
  accel: 40,
  health: 100,
  turnRate: 12,
};

export const CAR = {
  radius: 1.7,
  length: 4.4,
  width: 2.0,
  accel: 17,
  brake: 34,
  maxSpeed: 40,
  maxReverse: 12,
  steerRate: 2.4,
  drag: 0.55,
  trafficSpeed: 12,
  policeSpeed: 26,
};

export const TRAFFIC_COUNT = 10;
export const PARKED_COUNT = 14;
export const PED_COUNT = 14;
export const PICKUP_COUNT = 10;
export const PICKUP_VALUE = 50;

export const WANTED = {
  max: 5,
  crimeCooldown: 4, // seconds between wanted gains from the same kind of crime
  decayQuiet: 10, // seconds with no crime before stars start falling
  decayEvery: 6, // seconds per star lost while quiet and unseen
  bustSeconds: 2.5, // police on foot contact needed to get busted
  bustRange: 3.2,
};

export const MISSIONS = [
  {
    id: 'borrowed-wheels',
    name: 'Borrowed Wheels',
    brief: 'Steal any car and bring it to the garage marker.',
    reward: 400,
    timeLimit: 120,
    target: 'garage',
  },
  {
    id: 'package-run',
    name: 'Package Run',
    brief: 'Drop the packages at all three markers, in order.',
    reward: 700,
    timeLimit: 180,
    target: 'drops',
  },
  {
    id: 'heat-wave',
    name: 'Heat Wave',
    brief: 'The heat is on: survive the chase, then reach the safehouse.',
    reward: 1200,
    timeLimit: 150,
    target: 'safehouse',
    surviveSeconds: 45,
    startWanted: 3,
  },
];

export const PALETTE = {
  sky: 0x2b1d4e,
  fog: 0x2b1d4e,
  sun: 0xffc98a,
  hemiSky: 0x9a86d8,
  hemiGround: 0x2c2620,
  asphalt: '#23232b',
  sidewalk: '#3a3a44',
  building: ['#4a4a6a', '#5d4a5e', '#3e5a6a', '#6a4a3e', '#44503f'],
  roof: '#2a2a33',
  glass: '#141a26',
  car: [0xc23b2e, 0x2e6fc2, 0xe0a52e, 0x3fae6a, 0x8a5fc2, 0xd8d8d8, 0x222226],
  police: 0xe8e8e8,
  playerJacket: 0xe86a1e,
  pedJackets: [0x3fae6a, 0x2e6fc2, 0xc2a52e, 0x8a5fc2, 0xd8d8d8, 0x5a5a6a],
  marker: 0xffc21e,
  cash: 0x7dff5e,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best cash and finished missions are kept between visits. */
export const SAVE_KEY = 'neon-harbor.save.v1';
