export const COLORS = {
  ottieRust: 0xE8922A,
  // Course palette inspired by Pixel Pro Golf cozy aesthetic.
  fairway:        0x7CB342,   // primary playable grass — soft cozy green
  rough:          0x5C8C3A,   // darker, slightly muted — frames the fairway
  green:          0xA8D080,   // putting green — lighter pastel
  sand:           0xE6C77A,   // warm bunker sand
  water:          0x6FB1C9,   // pond blue
  ball:           0xFFFFFF,
  hole:           0x1A1A1A,
  background:     0x4E342E,   // warm dark brown framing
  fairwayShadow:  0x6BA13C,   // slight depth/edge on fairway
  treeFoliage:    0x3A6B3E,
  treeShadow:     0x2A4E2D,
  aimGuide:       0xFFF8E7,
  aimGuideStrong: 0xFFD56E,
  aimGuideUnder:  0xF5E0A8,   // muted cream — under-powered, weak shot
  aimGuideSweet:  0x73C47B,   // green — clean strike zone
  aimGuideOver:   0xC8543A,   // red — over-pull mishit zone
} as const

export const COURSE = {
  width: 800,
  height: 600,
  teePosition:  { x: 150, y: 420 },  // tee bottom-left for the dogleg shape
  holePosition: { x: 660, y: 180 },  // hole upper-right
  ballRadius: 10,                     // slightly bigger so it reads on phone
  holeRadius: 14,
  ottieSize: 64,
} as const

// Hand-crafted Hole 1 layout. Numbers are relative to the course
// origin (0,0 = top-left of the course rectangle). Polygons describe
// the fairway path and the rough that frames it. The putting green
// is a flat ellipse around the hole.
export const HOLE_1 = {
  // Fairway shape: dogleg from tee (lower-left) → curve → green (upper-right).
  // Closed polygon, drawn filled with COLORS.fairway. Outer rough is
  // drawn first as a softer outline then the fairway sits on top.
  fairwayPath: [
    { x: 80,  y: 480 },
    { x: 250, y: 500 },
    { x: 380, y: 460 },
    { x: 460, y: 380 },
    { x: 500, y: 290 },
    { x: 540, y: 220 },
    { x: 620, y: 170 },
    { x: 720, y: 150 },
    { x: 740, y: 220 },
    { x: 690, y: 280 },
    { x: 600, y: 320 },
    { x: 520, y: 370 },
    { x: 470, y: 440 },
    { x: 360, y: 530 },
    { x: 220, y: 560 },
    { x: 90,  y: 540 },
  ],
  // Rough is the slightly larger silhouette behind the fairway —
  // gives the dogleg a framed look.
  roughPath: [
    { x: 50,  y: 470 },
    { x: 240, y: 510 },
    { x: 380, y: 470 },
    { x: 470, y: 380 },
    { x: 510, y: 270 },
    { x: 560, y: 190 },
    { x: 640, y: 130 },
    { x: 760, y: 130 },
    { x: 780, y: 240 },
    { x: 710, y: 300 },
    { x: 620, y: 340 },
    { x: 540, y: 390 },
    { x: 490, y: 470 },
    { x: 380, y: 560 },
    { x: 220, y: 590 },
    { x: 70,  y: 570 },
  ],
  // Putting green: ellipse around the hole.
  green: { cx: 660, cy: 180, rx: 65, ry: 50 },
  // Sand bunker tempting a carry across the dogleg.
  sandBunker: { cx: 510, cy: 360, rx: 50, ry: 30 },
  // Two trees framing the dogleg corner.
  trees: [
    { x: 380, y: 290, scale: 1.0 },
    { x: 600, y: 460, scale: 0.9 },
    { x: 720, y: 380, scale: 0.85 },
    { x: 200, y: 380, scale: 0.95 },
  ],
} as const

export const SWING = {
  hitRadiusPx: 48,
  maxDragPx: 200,
  minDragPx: 12,
  maxSpeed: 14,
  restSpeedThreshold: 0.12,

  // Power accuracy zone: release the drag with the pull magnitude
  // inside this band for a clean 100%-power strike.
  sweetSpotMin: 0.75,   // 75% of max pull
  sweetSpotMax: 0.90,   // 90% of max pull
  // Releasing PAST sweetSpotMax (over-pull) caps power at this
  // fraction of max and adds a random direction jitter to simulate
  // a flinched, mishit swing.
  overpowerPenalty: 0.65,
  overpowerJitterDeg: 8,

  // Hold penalty: after the grace period, the aim begins oscillating
  // in a sine wave. Amplitude grows with hold time. The actual aim
  // applied at release is the current sine value times the amplitude,
  // so a skilled player times the release to the zero crossing for
  // a clean strike.
  holdGraceMs: 800,
  holdDriftRateDegPerSec: 12,
  holdDriftMaxDeg: 18,
  holdOscHz: 1.6,
} as const

export const BALL_PHYSICS = {
  restitution: 0.6,
  frictionAir: 0.025,
  density: 0.001,
} as const

// Day 3: wind is visual-only. Day 4 wires it into ball flight physics.
export const WIND = {
  // Demo: stiff breeze from the east. Day 4 will randomize per-hole.
  speedMph: 8,
  directionDeg: 270,   // 0 = north (up), 90 = east, 180 = south, 270 = west
} as const

export const DEBUG = {
  showMatterBodies: false,
} as const
