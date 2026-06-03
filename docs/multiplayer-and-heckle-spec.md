# Ottie Golf — Multiplayer + Heckle Spec

**Status:** Design locked 2026-06-03. Implementation is post-Day-6 (after swing
mechanic, obstacles, real Ottie poses, sound/gestures all land). This document
exists so the design doesn't drift between now and build time.

## Format

- **Async turn-based.** Cup Pong / Game Pigeon model. Each player has their
  own session. Server holds shared match state. No real-time sync, no live
  multiplayer infra.
- **3 holes per match.** A back-and-forth completes the same day. Fast enough
  to feel like an iMessage game, long enough that a heckle in hole 1 still
  matters in hole 3.
- **iMessage-style notification flow.** After a turn ends, the system share
  sheet pops the match URL. Player sends via iMessage / WhatsApp / whatever.
  Friend taps link, game loads, plays. No push notifications in V1; can
  layer web push as V1.5 opt-in.

## Turn flow

Per turn, in order:

1. **Open match.** State syncs from server.
2. **Heckle confirmation (if any).** Fullscreen popup before swing UI loads:
   ```
   🦦 [friend] heckled you
   "wide left, baby"
   [ok, fine]
   ```
   Tap to acknowledge. This is the comedy beat — the trolled player has to
   read the heckle out loud.
3. **Swing UI loads.** If heckled, aim wobble + power-meter dead zone apply
   based on heckle strength.
4. **Take shot.** Drag, release, ball flies, ball lands. Strokes recorded.
   If next-shot OOB, no replay: heckle effect was for whatever swing came
   next. Bad lie is extra suffering.
5. **HECKLE WINDOW — 3 seconds.** Mash anywhere to charge the gauge.
6. **Heckle text picker.** Bottom sheet with the tier-tagged pool (auto-
   filtered to your gauge strength) and an "or type your own" input. Pick
   one or type one. Default-pick if you don't choose in 3 seconds.
7. **Share to friend.** Native share sheet with the match URL pre-filled.
   "Your turn, [friend]: ottiesworld.com/m/abc123"
8. **Save state to server, exit match.**

## Heckle gauge calibration

3-second mash window. Tap rate counted, tiered at the buzzer:

| Tier    | Min taps in 3s | ~rate     | Difficulty                  |
|---------|----------------|-----------|-----------------------------|
| WEAK    | 18+            | 6/sec     | sustained 1-thumb           |
| SOLID   | 30+            | 10/sec    | alternating fingers         |
| PERFECT | 42+            | 14/sec    | multi-finger real effort    |
| (miss)  | < 18           | -         | nothing fires               |

PERFECT must feel earned. Tune by play-test, but start here.

## Effect by tier

| Tier    | Aim wobble | Power dead zone        |
|---------|------------|------------------------|
| WEAK    | ±5°        | none                   |
| SOLID   | ±10°       | 10% from max           |
| PERFECT | ±15°       | 15% from max + jittery |

Aim wobble = aim line oscillates around the player's chosen direction during
their swing-UI period, settling within the wobble range at release. Power
dead zone = portion of the power meter where the indicator doesn't track
the drag distance correctly (some inputs feel like they "stick").

V1 ships these two effects only. Mid-flight nudge and swing-UI shake are
out of scope.

## Heckle text

**Two input modes per heckle:**

1. **Type your own.** Single-line text input, 60 char max. No moderation
   in V1 since it's friend-to-friend. If we get abuse reports later, add
   a profanity gate.

2. **Pick from list.** Tier-tagged pool of 30-50 phrases. The list shown to
   the heckler is filtered to their gauge tier (WEAK gets light snark,
   PERFECT gets savage). Mix of:
   - **Generic trash talk:** "wide left, baby", "shank it", "miss it"
   - **Ottie voice:** "kayyyy this should be good", "kay-kay sorry not sorry"

   Per the [LLM Boundary Contract](https://github.com/Daryllsaints/ottiegotchi/blob/main/PRD.md#23-llm-boundary-contract-binding):
   I draft this pool, operator reviews, every phrase needs approval before
   ship. User-typed bypasses review (it's the player's voice).

## Data model

```
matches
  id              text primary key (short code, e.g. 'abc123')
  course_id       text default 'course-1'
  player_a_id     uuid (anon supabase user)
  player_b_id     uuid nullable until joined
  current_turn   text 'A' | 'B'
  current_hole    int 1..3
  status          'open' | 'in_progress' | 'complete' | 'abandoned'
  created_at      timestamptz
  updated_at      timestamptz
  expires_at      timestamptz (auto-clean stale matches after 7d)

shots
  id              uuid
  match_id        text
  hole            int
  player          'A' | 'B'
  strokes         int
  sequence_idx    int (ordering within hole)
  out_of_bounds   boolean
  sunk            boolean
  created_at      timestamptz

heckles
  id              uuid
  match_id        text
  hole            int (the hole the TARGET will play)
  troller         'A' | 'B'
  target          'A' | 'B'
  strength        'WEAK' | 'SOLID' | 'PERFECT'
  text            text (the heckle line)
  source          'typed' | 'list'
  fired           boolean (true after target acknowledges)
  created_at      timestamptz
```

## Endpoints

```
POST   /api/match                 create new match, return code + share URL
GET    /api/match/:id             read match state
POST   /api/match/:id/join        join as player B (link recipient)
POST   /api/match/:id/shot        record a shot (auth: current player)
POST   /api/match/:id/heckle      record a heckle (auth: current player)
POST   /api/match/:id/ack-heckle  mark heckle as fired (auth: target player)
```

## V1.5+ (deferred)

- **Web push notifications** when it's your turn. Opt-in per match.
- **Live multiplayer (sync)** with websockets. Real-time troll-while-swing
  with the "live shake" mechanic (bird flies across, tap to nudge).
- **Heckle effect taxonomy expansion:** mid-flight wind nudge, swing-UI
  shake, ball spin variation.
- **Tournament mode:** 9 holes, score persists across matches.
- **Friend graph:** save friends from past matches, see "[friend] is online".
- **Replay sharing:** GIF / video of your sunken put with the heckle that
  failed to stop it.

## Implementation order (post-Day-6)

1. Match data model + Supabase tables + RLS
2. POST /api/match + match URL + share-sheet flow
3. State sync (player joins via link, sees opponent's prior shots)
4. Heckle gauge UI + recorder
5. Heckle confirmation popup on target's turn
6. Aim wobble + power dead zone effects wired into swing UI
7. Heckle text pool curated + reviewed
8. Polish + tune difficulty thresholds by play-test
