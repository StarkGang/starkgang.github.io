
export const TUNING = {

  scale: {
    heightRatio: 0.155,
    minPx: 112,
    maxPx: 196,
  },

  body: {
    halfWidthRatio: 0.17,
    collideHeightRatio: 0.38,
    collideMaxPx: 54,
    sitHeightRatio: 0.72,
    headroomRatio: 1.0,
  },

  speed: {
    walk: 118,
    run: 200,
    sneak: 64,
    accel: 520,
    decel: 900,
    brake: 420,
    turnRate: 10,
    bob: 1.6,
    lean: 0.055,
  },

  jump: {
    upRatio: 1.7,
    reachRatio: 1.25,
    landRatio: 1.45,
    crouchMs: 110,
    landMs: 150,
    squash: 0.16,
    dust: true,
  },

  flight: {
    speed: 460,
    minDuration: 0.65,
    maxDuration: 3.2,
    climbArc: 0.24,
    minArc: 60,
    maxArc: 220,
    bankMax: 0.14,
    pitchMax: 0.20,
    flarePhase: 0.84,
    distanceThreshold: 240,
    flyChance: 0.70,
    groundRunMax: 600,
    farFlyChance: 0.90,
  },

  screen: {
    edgeRatio: 0.22,
    pad: 4,
    headPad: 4,
  },

  follow: {
    stopDistance: 92,
    resumeDistance: 138,
    forgetMs: 18000,
    replanDistance: 46,
    arriveSlack: 6,
    hopToSurface: true,
  },

  sit: {
    minMs: 4000,
    maxMs: 8000,
    chance: 0.38,
    hopOffMs: 900,
  },

  window: {
    commentMs: [12000, 20000],
    noticeMs: 240,
    swayMax: 0.16,
    stumbleSpeed: 1500,
  },

  reaction: {
    annoyClicks: 3,
    annoyMs: 1400,
    stumbleMs: 1200,
    hoverQuipMs: 800,
  },

  wander: {
    minMs: 18000,
    maxMs: 36000,
    chatterEvery: [14000, 26000],

    mix: { sit: 0.18, icon: 0.2, zone: 0.26, edge: 0.14, play: 0.22 },
    zoneCols: 6,
    zoneRows: 3,
  },

  nap: {
    afterMs: 45000,
  },

  bubble: {
    margin: 10,
    gap: 12,
  },
};

