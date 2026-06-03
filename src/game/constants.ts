export const COLORS = {
  ottieRust: 0xE8922A,
  grassGreen: 0x7CB342,    // soft cozy green — not lime
  ball: 0xFFFFFF,
  hole: 0x1A1A1A,
  background: 0x4E342E,    // warm dark brown framing the course
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

export const DEBUG = {
  showMatterBodies: false,   // flip to true to see physics body outlines
} as const
