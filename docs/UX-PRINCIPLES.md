# Ottie Golf, UX Principles Mapping

Companion document to `PRD.md`. Maps the current build to two design frameworks and proposes a prioritized list of changes.

Frameworks:
1. **Hooked** (Nir Eyal): the four-stage Trigger -> Action -> Variable Reward -> Investment loop that builds habit.
2. **The Gamer's Brain** (Celia Hodent): cognitive UX principles for games, organized around perception, memory, attention, motivation, emotion, learning, and game flow.

Both are evaluated as of v0.5 (commit `9ab83a3`).

## Part 1, Hooked model mapping

### 1.1 Trigger

What it is: the prompt that initiates the behavior. External triggers come from the environment; internal triggers come from emotion or routine.

**Current state.** External trigger only: an iMessage with the match URL. The iMessage notification is the entire push surface (we deliberately skipped web push in V1).

**Gaps.**
- No internal trigger. Nothing pulls a player back after the match ends. The game does not own any habit-forming hook beyond "your friend texted you again."
- No re-engagement for stalled matches. If A plays and B never opens the link, no nudge fires.
- The menu screen has zero hooks for returning players: no "your last match", no "X wants to play again."

**Recommendations.**
1. **Match expiry nudge.** When `expires_at` is within 24 hours, fire a one-time iMessage-friendly nudge through whatever channel A originally used (we cannot push, but we CAN tell A's app to surface a "your match with B is about to expire, send them a reminder" button on next open).
2. **Menu screen memory.** Add a "your matches" strip showing in-progress and recently-completed matches per browser session. Even without auth, the local UUID can recall match IDs the browser has touched.
3. **Light internal trigger via streaks.** Cozy-flavored only: "you played 3 days in a row, ottie made you a hat." Avoid leaderboards or rank, they break Pillar 2 of the PRD (cozy not competitive).

### 1.2 Action

What it is: the simplest behavior performed in anticipation of reward. Lower friction beats higher motivation.

**Current state.** Tap a link -> drag a finger -> release. This is already in the same friction class as Wordle and 8 Ball Pool. Drag-from-anywhere removed the "ball at edge of screen" friction.

**Gaps.**
- First swing still requires understanding the drag mapping. The tutorial overlay covers it, but a finger needs to MOVE for the lesson to land.
- The "MASH TO HECKLE" action is high-friction for the heckler (4 seconds of repeated taps). Some users will skip it just because mashing feels like work.

**Recommendations.**
1. **Tap-to-swing fallback.** For first-time players, allow a single tap on the ball to auto-aim at the pin and use a medium-power shot. Removes the "I do not understand drag" failure mode.
2. **Heckle expression alternatives.** Offer a one-tap "send a stock heckle" option (random preset taunt + fixed 30% level) alongside the mash. Lowers the action cost.

### 1.3 Variable reward

What it is: unpredictable outcomes that hold attention. Three flavors: tribe (social), hunt (resources), self (mastery).

**Current state.**
- Tribe: heckle interactions, score comparison. Decent but rare (one heckle per match).
- Hunt: sinking the ball is the resource. Each sink has variable strokes (3 vs 5).
- Self: hitting the sweet spot, the visible green-band feedback.

**Gaps.**
- No collectibles. Nothing to hunt for beyond score.
- Ottie has one outfit forever. No personalization affordance.
- Scoring outcomes are predictable on hole-replay (same hole = same shot patterns yield same result).
- The heckle is the ONLY social reward; if both players skip mashing, the social loop is silent.

**Recommendations.**
1. **Ottie outfits as a tribe + self reward.** Random small unlocks after specific events: "first eagle" hat, "5 holes in a row in regulation" visor, "got heckled and still birdied" earned medal pin. Persist in localStorage.
2. **Variable Ottie celebrations.** Currently sink behavior is identical for every outcome. Differentiate: eagles get confetti + ottie does a spin, par gets a calm nod, bogey gets a shrug, water hazard gets a tiny "oh no" overlay. Animations are cheap and the variance compounds.
3. **Surprise heckle reactions.** When B successfully sinks DESPITE being heckled, send a celebratory micro-toast to A's app on next open: "your friend birdied through your 80% heckle." Closes the social loop even when A is not actively in the game.
4. **Daily ottie mood.** Each calendar day, ottie wears a small different accessory (scarf, glasses, beanie). Zero gameplay impact, all variable-reward value.

### 1.4 Investment

What it is: actions that increase the probability of returning. Time, data, effort, social capital. Investment compounds the trigger.

**Current state.** Effectively zero. Sessions are anonymous. Match data is per-URL, not per-player. Nothing persists beyond a localStorage UUID and tutorial flags. Clear browser data = total reset.

**Gaps.** This is the weakest stage by far. No friend list, no profile, no history, no unlocks, no preferences. The game is single-serving by design and does not retain its players.

**Recommendations.** Pick AT LEAST one of these even if it costs the "no accounts" pillar a tiny crack:
1. **Optional display name.** Single text field on the menu, stored in localStorage. Heckle toasts become "DEE heckled you 80%" instead of "your friend heckled you 80%". Negligible friction, large relatedness gain.
2. **Match history strip on the menu.** Last 5 matches with the player's score, opponent's score, date. Loads from a `seen_matches` localStorage list of IDs.
3. **Personal bests per hole.** "Your best on The Island: 2 (birdie, May 28)". Tracks investment in skill without needing competitive ranking.
4. **Friend nicknames.** When B claims slot B, B is asked to "name this rival" (locally only). On B's device, the match becomes "vs Maria". On A's device, A names B independently. Lightweight relationship investment.
5. **Ottie scrapbook.** Memorable shots auto-save (eagles, water-hazard recoveries, heckle-defying birdies) and the menu has a "scrapbook" tab. Pure investment surface; players come back to see "their" history.

## Part 2, Gamer's Brain mapping

### 2.1 Perception (signs and feedback)

What it covers: how the player's senses pick up game state. Affordances, signifiers, visual feedback loops.

**Current state.**
- Aim guide colors (green/yellow/red) signal sweet spot ✓
- Ball trail signals shot path ✓
- Cup halo pulses to draw eye to the pin ✓
- Distance-to-pin text updates live ✓

**Gaps.**
- The heckle "your friend heckled you 50%" toast is a passive grey text bar. Easy to miss while you are looking at the ball.
- No haptics on swing release, sink, water, or heckle delivery. Haptics are free on iOS via `navigator.vibrate` (Android) and `Haptics` web API (limited Safari).
- The wind chip displays a fixed value that does not affect physics. False signal that costs perceptual bandwidth.

**Recommendations.**
1. **Bigger heckle delivery.** Replace the corner toast with a center-screen "HECKLE INCOMING" card that snaps in, holds 1 second, snaps out. Optional screen shake at high heckle levels.
2. **Vibration on key beats.** Swing release: short tap. Sink: triple tap. Water: long buzz. Heckle armed: rolling rumble.
3. **Either wire wind into physics OR remove the wind chip.** Right now it lies, which trains the player to ignore HUD elements generally.

### 2.2 Memory (cognitive load)

What it covers: working memory has ~4 slots. Reduce what the player has to hold in their head.

**Current state.** Mostly clean: one hole at a time, minimal HUD, simple controls.

**Gaps.**
- During a match, the player has to remember their own running total and their friend's total. The HUD only shows the CURRENT hole's shot count.
- After flipping to hole 2, the player has no recall of how they did on hole 1.
- The tutorial fires once and never returns. A player on day 30 has lost the muscle memory and there is no refresher.

**Recommendations.**
1. **Running total chip.** Tiny "you 4 | friend 5" chip in the HUD, top-right under the wind card. Updates after each hole.
2. **Hole transition card.** Between holes, show a 2-second card: "Hole 1 done. You 3, friend 4. Now: Cliff Top, par 3." Frees memory from carrying score.
3. **Optional "show me the controls" link in the menu** that re-runs the swing tutorial. Costs nothing but re-onboards lapsed players.

### 2.3 Attention (guidance and focus)

What it covers: attention is a finite resource. Guide it to what matters.

**Current state.** Decent. The HUD chips sit in corners. The aim line dominates focus during AIMING. The ball trail draws the eye during IN_FLIGHT.

**Gaps.**
- During the heckle window, the screen has the sink celebration AND the heckle gauge AND the share button competing for attention. The most important thing (the gauge) gets the smallest visual share.
- The pan tutorial toast fires DURING a moment when the player is mentally celebrating their first shot. Wrong timing.
- The big pulsing cup halo competes with the ball during flight.

**Recommendations.**
1. **Stagger the ShareCard reveal.** Show sink celebration alone for 1.2 seconds, THEN slide in the heckle gauge with focus. Then show the share button.
2. **Move the pan tutorial.** Trigger it on the SECOND shot (after the player has internalized the swing), not the first.
3. **Dim the cup halo during IN_FLIGHT.** Restore brightness when state goes back to IDLE.

### 2.4 Motivation (Self-Determination Theory)

Three intrinsic drivers: autonomy, competence, relatedness.

**Current state.**
- Autonomy: drag from anywhere, drag any angle, choose to heckle or skip ✓
- Competence: sweet spot feedback, getting better at the gesture ✓
- Relatedness: iMessage handoff, heckle social interactions ✓

**Gaps.**
- No long-arc competence progression. A first-time player and a 100-match veteran experience the same loop with no markers of growth.
- Autonomy is limited to micro-choices (this swing). No macro choices (which course, which Ottie outfit, which difficulty).
- Relatedness is bilateral (A and B) but never multilateral. No "group chat" mode.

**Recommendations.**
1. **Personal-best markers.** "Your best on this hole: birdie" appears below the par chip. Quiet mastery signal.
2. **Course picker on menu.** Even with three holes, let the player choose "play just hole 1" or "play hole 3 over and over". Autonomy lever.
3. **Group chat mode (future).** A single match URL that 3-8 players can claim spots on. Heckle becomes a many-to-one mash race.

### 2.5 Emotion (immersion, flow, presence)

What it covers: the felt experience of being in the game.

**Current state.** Cozy palette, pixel art, Ottie character. Good visual presence. **Zero audio.**

**Gaps.**
- Silence is the loudest emotional gap in the build. Audio is the cheapest immersion lever and we have none.
- The sink moment is undersold. Currently the ball disappears, a "SUNK" eyebrow appears, and the ShareCard opens. The "ohhhh" moment is missing.
- Water hazard is a tiny toast. Should be a small splash + an "oh no" beat.

**Recommendations.**
1. **Audio pass.** Free + small additions:
   - Swing thwack on release
   - Ball roll loop while IN_FLIGHT
   - Distinct cup-rattle then drop on sink
   - Water splash on hazard
   - Heckle buzzer on toast
   - Ambient bird/wind loop (very low volume) on idle
2. **Sink celebration polish.** A 0.5s cup-rattle animation before the ShareCard opens. The ball visibly drops into the cup with a small bounce. This is the most-replayed moment in the game.
3. **Water hazard beat.** Brief splash sprite + Ottie does a "tsk" sprite swap before the respawn.

### 2.6 Learning (onboarding curve)

What it covers: how the game teaches itself.

**Current state.** Two tutorial overlays (swing, pan), localStorage-gated. Both are present-once.

**Gaps.**
- The swing tutorial teaches the gesture but not the power zone. New players bomb past the green or fall short with no idea why.
- No progressive difficulty. Hole 1 is the famous SAWGRASS ISLAND, arguably the hardest par-3 in real golf. Brutal first-time experience.
- The over-pull penalty zone is not taught. Players learn it by failing.

**Recommendations.**
1. **Power zone callout on first AIM.** When the first drag enters the over-pull zone (>92% of max), show a tiny "too far!" hint near the aim line for one-shot only.
2. **Hole order rethink.** Open with the easiest hole to land on the green (probably Road Hole because it is a par 4 with fairway recovery option), end with the spectacular hard one (Sawgrass island). Better climax + better onboarding.
3. **Practice mode.** A "warm up" hole accessible from the menu, with no scoring, just a wide fairway and a big green. Lets new players find the gesture before stakes apply.

### 2.7 Game flow (Csikszentmihalyi)

Three requirements: clear goals, immediate feedback, balanced challenge.

**Current state.**
- Clear goals: "sink the ball" ✓
- Immediate feedback: aim guide, trail, score ✓
- Balanced challenge: borderline. First-time player on Sawgrass = high risk of repeat water-hazard and frustration drop-off.

**Recommendations.**
1. **Reorder holes (repeat from 2.6).** Difficulty ramp matters for flow.
2. **Soft mulligan.** First water-hazard per hole costs ZERO strokes for the first time only. Frames the punishment as a learning beat rather than failure. Cozy-compatible.
3. **Adaptive aim assist (optional).** If a player takes 5+ shots on the same hole, on the 6th the aim guide widens its sweet spot by 10%. Invisible help, no patronizing message.

## Part 3, Prioritized changes (top 10)

Ranked by impact-to-effort:

| # | Change | Framework hook | Effort |
|---|--------|----------------|--------|
| 1 | Audio pass (swing thwack, sink, water splash, ambient) | Emotion | M |
| 2 | Running total HUD chip ("you 4 \| friend 5") | Memory | XS |
| 3 | Reorder holes for difficulty ramp | Learning + Game flow | XS |
| 4 | Soft mulligan: free first water-hazard per hole | Game flow | S |
| 5 | Optional display name in menu, used in heckle toast | Investment + Relatedness | S |
| 6 | Variable sink celebrations (eagle/par/bogey differ) | Variable reward + Emotion | S |
| 7 | Bigger center-screen heckle delivery card + haptics | Perception | S |
| 8 | Match history strip on the menu | Investment | M |
| 9 | Wire wind into physics OR remove the wind chip | Perception (anti-pattern fix) | S-M |
| 10 | Hole-transition recap card between holes | Memory | S |

XS = under an hour. S = an afternoon. M = a session. L = a weekend.

## Part 4, Open questions for the gaming agent

1. **Cozy vs hooked tension.** Hooked frameworks are typically deployed to maximize daily active users. Our Pillar 2 is "cozy, not competitive." Where is the right line? Is "ottie outfits" cozy variable reward, or is it secretly a skinner box?
2. **Audio direction.** What is the right palette? Lo-fi acoustic? Chiptune? Cozy game references (Stardew, Animal Crossing) or sports references (real golf claps, polo announcer)?
3. **Difficulty curve.** Is "open with easy, end with hard" right for a 3-hole match designed for friend competition? Or do we want all three at similar difficulty so the friend comparison is fair?
4. **Investment without accounts.** Localstorage-only investment is fragile (clear data = lose everything). Is that acceptable as part of the cozy promise, or do we need a soft auth (claim your name + we email you a magic link to restore)?
5. **Group chat mode prioritization.** The PRD says "two players, async iMessage". A "group chat heckle race" is a different game shape. Is it a future expansion or a parallel product?
6. **The "lying wind chip" anti-pattern.** Quick fix: remove. Better fix: wire wind into physics. Wire it as the proper fix or remove until we have a use? Trade-off: removing simplifies, wiring opens design surface for a "windy day" variant.

## Part 5, What to NOT do

Both Hooked and Gamer's Brain can be weaponized into dark patterns. Things to explicitly avoid:

- Streak punishment (losing a streak should never feel like loss). Streaks should be additive, not subtractive.
- FOMO timers ("your match expires in 5 minutes!"). Stays a 24-hour soft nudge max.
- Leaderboard chasing. Breaks the cozy pillar.
- Energy / wait systems ("you have 0 swings, wait 1 hour or pay"). Never.
- Dark-pattern heckles ("buy more heckle gauge"). Heckle is a comedy mechanic, not a monetization vector.
- Personalized difficulty that the player cannot disable. Adaptive aim assist must be a setting, not a silent rubber-band.

## References

- Eyal, Nir. *Hooked: How to Build Habit-Forming Products* (2014).
- Hodent, Celia. *The Gamer's Brain: How Neuroscience and UX Can Impact Video Game Design* (2017).
- Csikszentmihalyi, Mihaly. *Flow: The Psychology of Optimal Experience* (1990).
- Deci & Ryan. Self-Determination Theory.
