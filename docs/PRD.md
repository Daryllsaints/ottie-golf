# Ottie Golf, Product Requirements Document

Status: Draft, snapshot of v0.5 (commit `9ab83a3`, 2026-06-04)
Owner: Daryll Santos (Dee)
Live: https://ottiesworld.com

## 1. Vision

Ottie Golf is a cozy, async, 3-hole mini-golf game designed to live inside an iMessage thread. One player shares a link, the other plays without installing anything, and the comedy of the format comes from a button-mash "heckle" gauge that one player pre-loads to wobble the other's swing on their next attempt.

Positioning: pool-game-simple controls, golf-game charm, iMessage-game social shape, and a single off-the-shelf comedy mechanic (the heckle) that makes the asynchronous handoff feel alive rather than turn-by-turn dead air.

Not in scope (intentionally): realism, full 18-hole rounds, ranked play, real-money stakes, persistent accounts.

## 2. Target user

Primary: iPhone users in casual group chats who already play "pass the phone" or "send me your score" games (Wordle, 8 Ball Pool by iMessage, etc). Mostly mobile Safari, no native app.

Secondary: a single player wanting a 60-90 second cozy break (the solo route).

Anti-persona: tournament players, golf simulator enthusiasts, anyone expecting persistent stats.

## 3. Pillars

1. **Friction-free handoff.** No accounts, no installs. A shared URL IS the invite, the resume token, and the notification. iMessage delivers the push.
2. **Cozy, not competitive.** Pastel pixel art, no time pressure, no lose-state. Bad shots are funny, not punishing.
3. **Comedy beats over fairness.** The heckle mechanic intentionally injects unfairness. The trolled player must clearly know they were heckled, and how hard.
4. **Three holes, one sitting.** A full match should fit in a 5-minute coffee break.

## 4. Core gameplay loops

### 4.1 Swing loop (per shot)

1. Player sees overview of current hole (top-down, cover-fit zoom)
2. Player drags one finger anywhere on screen; the further they drag, the more power. A power gauge shows on the aim line.
3. On release: ball launches, camera zooms in to follow ball flight.
4. Ball comes to rest, camera zooms back to overview, Ottie tweens over to stand next to the ball.

Inputs: one-finger drag to swing, two-finger drag to pan the camera, one tap to dismiss tutorial overlays.

### 4.2 Hole loop (per hole)

1. Tee shot from hole-specific tee position.
2. Subsequent shots until ball is sunk OR ball lands in water (1-stroke penalty + respawn at tee) OR ball leaves world (treated as OOB, +1 + respawn at tee).
3. On sink, ShareCard modal appears with the score, verdict (eagle / birdie / par / bogey / +N), and a "MASH TO HECKLE" tap counter.
4. Player either taps "next hole" (restarts scene at hole + 1) or, on the last hole, sees the match-complete summary.

### 4.3 Match loop (per match, 3 holes)

1. Player A starts a match from the menu screen, gets a unique URL `/m/abc123`.
2. A plays all three holes solo, mashing a heckle level (0-100%) on each ShareCard. Each shot saves to Supabase: match_id, hole, player='A', strokes, heckle_level.
3. A shares the URL with B via iMessage. The iMessage notification is the push.
4. B opens the URL, the app loads B's match progress (= count of B's sunk shots + 1 = next hole for B). On first load, the app reads A's most recent heckle and arms it for B's next swing release.
5. B plays through, sees a "your friend heckled you X%" toast and feels the jitter, and a per-shot score comparison against A's totals.
6. When both A and B have finished all 3 holes, match.status flips to 'complete' in DB.

### 4.4 Sharing loop

A player tapping "send your score" on the ShareCard hits `navigator.share({ text, url })` which opens the native iOS share sheet. Default selection is Messages, but Twitter, WhatsApp, Slack, Discord, copy-link all work. The link itself is the credential, no auth.

## 5. Features (current state)

### 5.1 Solo and async multiplayer routes

- `/` renders the menu with two CTAs: "start match with a friend" (creates match in Supabase, redirects to `/m/:code`) and "play solo".
- `/m/:code` joins or auto-claims slot B if A is the creator. Match-level scoreboard, hole tracking, heckle wiring all live here. Solo route skips all Supabase calls.

### 5.2 Three holes

| # | Name | Inspiration | Par | Hazards |
|---|------|-------------|-----|---------|
| 1 | The Island | TPC Sawgrass #17 | 3 | Ocean wraps everything; one bunker front-right of green |
| 2 | Cliff Top | Pebble Beach #7 | 3 | Ocean right/back of green; 3 bunkers ring the green |
| 3 | The Road Hole | St Andrews #17 | 4 | Inland, dogleg right, Road Bunker front-left of narrow green |

All three holes share an 18x30 tile world (576x960 px) so the camera and physics never re-configure.

### 5.3 Heckle/mash mechanic

After A sinks a hole, the ShareCard opens a 4-second window where each tap on the MASH button adds 8% to a gauge (capped at 100%). The final fill saves with the shot as `heckle_level INTEGER 0-100`. When B opens the match, the most-recent un-responded-to A heckle arms B's NEXT swing with an aim jitter of up to `(level/100) * 12` degrees at release. The handicap auto-consumes after one swing.

Visible to the trolled player: a top-center toast "your friend heckled you 50%" appears for 3.5 seconds on match load.

Known V1 limitation: the heckle finds the LATEST opponent heckle regardless of hole, not the per-hole heckle. Per-hole granularity is a follow-up.

### 5.4 Swing physics

- Drag-from-anywhere model (8 Ball Pool style); the gesture origin is wherever the finger touches, not the ball.
- Power maps drag distance to ball speed with a sweet-spot zone (65-95% of max drag for clean 100% power, undershoot for short, overshoot for 82% power with 2.5deg jitter).
- Hold-to-aim has an 1800ms grace period before drift starts accumulating, drift rate 4deg/sec, ceiling 8deg, oscillation 1.0Hz.
- Ottie idle bobs at the tee, swaps to a swing sprite when AIMING, returns to idle and tweens to ball position when shot lands.

### 5.5 Onboarding

- First-launch swing hint: dim backdrop with animated finger sliding down-and-away, caption "drag anywhere to swing". Dismissed by first tap.
- Post-first-shot pan hint: small top-center toast "two fingers to look around" for 3 seconds.
- Both gated by localStorage flags `ottiegolf:tut:swing` and `ottiegolf:tut:pan`.

### 5.6 Camera

- Cover-fit zoom so the world fills the viewport (slight ocean crop top/bottom, gameplay always visible)
- Smooth zoom-in to follow ball during flight, smooth zoom-out to overview when ball rests
- Two-finger drag to pan, clamped so the world center stays in view

### 5.7 Tilesets

Four Pixellab-generated Wang tilesets, chained via base_tile_id so colors stay consistent across boundaries:
- ocean -> rough
- rough -> fairway
- fairway -> sand
- fairway -> green

All use `transition_size=0` and flat shading after we learned the model auto-fills "transition tile" slots with wooden boardwalk planks.

### 5.8 Standing rules / writing voice

- No em dashes anywhere (copy, code, commits)
- Ottie voice: lowercase, no exclamation marks, no FOMO/marketing tone
- LLM Boundary Contract: any LLM-drafted user-facing copy requires operator review before ship; Ottie speaks only in "kay" variants

## 6. Technical architecture

### 6.1 Stack

- Frontend: React 19 + Vite 6 + TypeScript 5.7, deployed on Vercel
- Game engine: Phaser 4 (canvas renderer) + Matter.js for ball physics
- Backend: Supabase project `eqjyqwigafgfpvypkban` (PostgreSQL + RLS)
- Domain: ottiesworld.com via Vercel
- Source: github.com/Daryllsaints/ottie-golf

### 6.2 Database

Tables in `public` schema:

- `og_matches`: `id text PK`, `course_id text default 'sawgrass17'`, `player_a_id uuid`, `player_b_id uuid`, `current_turn text check in (A,B)`, `current_hole integer default 1`, `status text check in (open,in_progress,complete,abandoned)`, `created_at`, `updated_at`, `expires_at default now()+7days`
- `og_shots`: `id uuid PK`, `match_id text FK`, `hole integer`, `player text check in (A,B)`, `strokes integer`, `sunk boolean`, `oob_count integer default 0`, `heckle_level integer 0..100 default 0`, `created_at`

RLS is currently permissive (V1: URL = credential). Tightening is a follow-up if abuse appears.

### 6.3 Session model

Each browser gets a UUID stored in `localStorage.ottiegolf:sessionId` on first visit. This is the "player identity" for the lifetime of that browser. No auth, no email, no profile.

### 6.4 Routing

Client-side via `window.location.pathname`:
- `/` -> menu
- `/m/:code` -> match
Vercel rewrites handle SPA fallback for `/m/*`.

### 6.5 PWA

Currently DISABLED via self-destruct service worker (commit `1b1c503`). The first attempt cached aggressively and produced black screens. The kill-switch unregisters any stale SW and drops all caches. Re-enabling will require a network-first strategy for HTML and JS, cache-first only for the small art bundle.

### 6.6 Asset pipeline

- Tilesets generated via Pixellab MCP (`mcp__pixellab__create_topdown_tileset`), downloaded as 128x128 PNG spritesheets + JSON metadata
- Character sprites (ottie-ready, ottie-swing) hand-curated from earlier Pixellab generations
- All tiles are 32x32 px

## 7. Things that exist but need polish

- Heckle is global per match, should be per-hole
- ShareCard onDismiss for non-final holes immediately restarts the scene; should give a beat for "next hole loading"
- HUD wind chip shows a fixed wind value (8 mph, west); wind does not yet affect ball flight
- Distance-to-pin reads in yards but uses an arbitrary `PX_PER_YARD=6.4` mapping; not tuned to real course distances
- Ottie sprite is one-pose; he stays facing the same direction regardless of shot direction
- Trees only spawn on rough cells adjacent to ocean; St Andrews has zero trees as a result, which is wrong for an inland hole
- Out-of-bounds detection is "ball outside world rect"; we don't yet penalize landing in rough/sand or differentiate between water hazard types
- No sound

## 8. Roadmap

### Near term (next session)

- Per-hole heckle arming
- Wind affects ball flight (currently visual only)
- Better OOB messaging (currently a tiny "out of bounds +1" toast)
- Hole 3 needs trees / decorative props since it has no ocean shoreline

### Medium term

- PWA re-enablement with safe caching strategy
- Match expiry handling (matches auto-delete after 7 days per `expires_at`, untested)
- Spectator mode for >2 viewers on a match URL
- Per-player hole transition smoothing (don't snap-restart, do a "next hole" intermission)

### Long term, blue-sky

- Course editor (drop terrain types on a grid)
- More holes (a 9-hole "Augusta" set, a 9-hole "links" set, etc.)
- Native iMessage extension app (current web flow already covers 90% of the value, but a real extension would let the conversation thread show inline scoreboards)
- Sound design

## 9. Open design questions for the gaming agent

1. **Heckle balance.** Is 12 degrees of jitter at 100% mash too punishing? Too tame? Should the swinger see the heckle gauge fill up live before their swing for added comedy, or is the post-hoc toast better?
2. **Multi-player asymmetry.** Currently A plays solo, then B plays solo against A's score. Should we instead make it strict turn alternation (A hole 1, B hole 1, A hole 2, etc.) so the heckle feels more "live"? Trade-off: alternation requires both players to be active in the same window of time, kills the truly async feel.
3. **Loss conditions.** Currently you can take infinite strokes on a hole. Should we cap at a max and force a "give up" + score the hole as par+5? Or keep it forgiving?
4. **Hole 4+.** When the format proves out, do we extend to 9 or 18, or keep the 3-hole format and just ship more "courses" (each a set of 3 themed holes)?
5. **Heckler agency.** Right now the heckle is committed within 4 seconds of sinking. Should A be able to NOT heckle and have that be a meaningful choice (e.g., banking heckles for the final hole)?
6. **Co-op variant.** Could we offer a co-op mode where A and B alternate shots on the same ball, totalling strokes for a shared score? Different game, but same engine and assets.

## 10. Success metrics (proposed)

This is a "ship and see" product, not metrics-driven. But for instinct calibration:

- Conversion from "open share link" to "complete at least 1 hole": > 60%
- Match completion rate (both players finish all 3 holes): > 25%
- Time to first swing on a shared link: < 15 seconds
- Heckle activation rate (mashes > 0% during the window): > 40%
- Repeat play (same browser plays > 1 match in a week): > 20%

## 11. Engineering ground rules

- Surgical changes only. Changes over ~50 lines get proposed in plain text before code.
- No dependencies added without explicit approval.
- No em dashes (this applies to code comments and commit messages too).
- Investigation-first for non-trivial work: read the code, report findings, get sign-off, then implement.
- Auto-merge low-risk PRs during active sessions, confirm only for destructive / architectural changes.

## 12. References

- Inspiration deck (verbal): Pixel Pro Golf (visual fidelity), Sawgrass #17 / Pebble #7 / St Andrews #17 (hole design), 8 Ball Pool by iMessage (the social shape), 8 Ball Pool by Miniclip (drag-from-anywhere swing)
- Existing detail spec: `docs/multiplayer-and-heckle-spec.md`
