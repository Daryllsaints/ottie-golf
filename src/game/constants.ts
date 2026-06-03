export const COLORS = {
  ottieRust: 0xE8922A,
  grassGreen: 0x7CB342,    // soft cozy green — not lime
  ball: 0xFFFFFF,
  hole: 0x1A1A1A,
  background: 0x4E342E,    // warm dark brown framing the course
  aimGuide: 0xFFF8E7,      // cream — trajectory preview line
  aimGuideStrong: 0xFFD56E, // warmer cream for higher power
} as const

export const COURSE = {
  width: 800,
  height: 600,
  teePosition: { x: 150, y: 300 },
  holePosition: { x: 650, y: 300 },
  ballRadius: 8,
  holeRadius: 14,
  ottieSize: 64,
} as const

export const SWING = {
  // Hit radius for "tap on the ball" — generous so finger-precision
  // isn't punishing on mobile.
  hitRadiusPx: 48,
  // Drag distance in screen pixels mapped to velocity. Beyond this,
  // the gauge clamps — pulling further doesn't add power.
  maxDragPx: 200,
  // Minimum drag distance that counts as a swing (anything shorter
  // is treated as a tap / cancel).
  minDragPx: 12,
  // Max ball speed (Matter velocity units) at full pull-back.
  // Tuned by feel — a full pull should comfortably reach the hole.
  maxSpeed: 14,
  // Ball is considered "at rest" below this speed; locks back to
  // IDLE so the next swing can fire.
  restSpeedThreshold: 0.12,
} as const

export const BALL_PHYSICS = {
  // Slightly damped from Day 1 spec so the ball settles in 2-3s.
  restitution: 0.6,
  frictionAir: 0.025,
  // density keeps the ball light so the player's swing translates
  // to satisfying motion.
  density: 0.001,
} as const

export const DEBUG = {
  showMatterBodies: false,   // flip to true to see physics body outlines
} as const
