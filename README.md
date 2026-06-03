# Ottie Golf

A top-down cozy mini-golf game starring Ottie (kawaii otter, rust + cream
palette). Built on React + Vite + Phaser 4 + Matter.js + TypeScript.

## Day 1 — foundation

What's shipped in this build:

- `src/game/main.ts` Phaser config with **Matter.js** (gravity 0, top-down)
  and `Scale.FIT + CENTER_BOTH` so the course centers and resizes with the
  viewport.
- `src/game/scenes/GolfScene.ts` renders a static **800x600 grass course**
  (rounded corners), a **black hole**, an **Ottie placeholder** rust square
  to the left of the **white ball**. Matter circle body on the ball is
  currently `isStatic` — Day 2 unlocks it.
- `src/game/constants.ts` exports `COLORS`, `COURSE`, `DEBUG`. Flip
  `DEBUG.showMatterBodies = true` to see body outlines.
- `src/ui/HUD.tsx` is a fixed top-left React overlay showing **"Hole 1"
  / Strokes: 0** with `pointer-events: none` so the Day 6 gesture handler
  passes through.
- `index.html` title set to "Ottie Golf"; mobile viewport tag includes
  `viewport-fit=cover` for iOS safe area.

## Run

```bash
npm install
npm run dev      # http://localhost:8080
npm run build    # production bundle into dist/
```

## What's intentionally not yet built

Day 2-6 will add the swing mechanic, ball physics tuning, obstacles,
real Ottie sprite, animations, sound, and mobile gesture handling.
See the Day 1 spec for the full roadmap.
