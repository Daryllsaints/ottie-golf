// Day 5 GolfScene: PPG-fidelity tile-based renderer with scrolling
// camera. Course is built from Pixellab Wang tilesets (ocean→grass,
// grass→sand, grass→green). Trees scatter along the rough edges.
// Camera follows the ball.

import { Scene } from 'phaser';
import { SWING, BALL_PHYSICS, COLORS, COURSE, CLUBS, type ClubKey } from '../constants';
import { EventBus } from '../EventBus';
import { ambient, themeFor } from '../ambient';
import {
    Terrain, TILE_PX, GRID_COLS, GRID_ROWS, WORLD_W, WORLD_H, PX_PER_YARD,
    TEE_WORLD, HOLE_WORLD, ACTIVE_HOLE, activeHoleIndex,
    buildTerrainGrid, cornerPattern, allSame, anyIs, generateTreePositions, isOverWater,
} from '../terrain';

type SwingState = 'IDLE' | 'AIMING' | 'SWINGING' | 'IN_FLIGHT';

// Wall-clock offsets from swing-release to the impact frame in the
// 9-frame animation. Computed from the frameMs curve in
// playOttieSwingAnim; see comment block there for the source numbers.
const IMPACT_FRAME_OFFSET_MS_NORMAL = 925;
const IMPACT_FRAME_OFFSET_MS_PURE   = 1100;
type MatterBodyLike = { position: { x: number; y: number } };
type WangCorner = 'lower' | 'upper' | 'transition';
type TileMeta = {
    id: string;
    corners: { NE: WangCorner; NW: WangCorner; SE: WangCorner; SW: WangCorner };
    bounding_box: { x: number; y: number; width: number; height: number };
};
type TilesetJson = { tileset_data: { tiles: TileMeta[] } };

type WangSet = {
    textureKey: string;
    patternToFrame: Map<string, string>;
    fallbackFrame: string;
};

const TEX = {
    oceanRough:    'ts-ocean-rough',
    roughFairway:  'ts-rough-fairway',
    fairwaySand:   'ts-fairway-sand',
    fairwayGreen:  'ts-fairway-green',
    tree:          'tree',
    ottie:         'ottie-ready',
    ottieSwing:    'ottie-swing',
    swingFrame:    (i: number) => `ottie-swing-${i}` as const,
} as const;

const SWING_FRAME_COUNT = 9;
// Frame index that lines up with ball contact (club at the ball,
// dust kicked up). Used for the PURE arc / flash timing.
const SWING_IMPACT_FRAME = 6;

const SFX = {
    swing:     'sfx-swing',
    sink:      'sfx-sink',
    cupRattle: 'sfx-cup-rattle',
    splash:    'sfx-splash',
    heckle:    'sfx-heckle',
    tap:       'sfx-tap',
} as const;

const JSON_KEY = {
    oceanRough:    'jsts-ocean-rough',
    roughFairway:  'jsts-rough-fairway',
    fairwaySand:   'jsts-fairway-sand',
    fairwayGreen:  'jsts-fairway-green',
} as const;

export class GolfScene extends Scene {
    private state: SwingState = 'IDLE';
    private strokes = 0;
    private ballBody!: MatterBodyLike;
    private ballSprite!: Phaser.GameObjects.Arc;
    private ballShadow!: Phaser.GameObjects.Ellipse;
    private trailGfx!: Phaser.GameObjects.Graphics;
    private trail: Array<{ x: number; y: number; t: number }> = [];
    private ottie!: Phaser.GameObjects.Image;
    private ottieIdleTween?: Phaser.Tweens.Tween;
    private aimGfx!: Phaser.GameObjects.Graphics;
    private dragOrigin = { x: 0, y: 0 };
    private dragCurrent = { x: 0, y: 0 };
    private dragStartMs = 0;
    private holeSunk = false;
    private oobIndicator?: Phaser.GameObjects.Text;
    private oobIndicatorHideAt = 0;
    private sinkOverlay?: Phaser.GameObjects.Container;
    private grid!: Terrain[][];
    private wangOceanRough!:   WangSet;
    private wangRoughFairway!: WangSet;
    private wangFairwaySand!:  WangSet;
    private wangFairwayGreen!: WangSet;
    private aimHintGfx!: Phaser.GameObjects.Graphics;
    private flagSprite?: Phaser.GameObjects.Graphics;
    private overviewZoom = 1.0;
    private cupHaloTween?: Phaser.Tweens.Tween;
    private cupHalo?: Phaser.GameObjects.Arc;
    private panActive = false;
    private panLastAvg = { x: 0, y: 0 };
    private suppressSingleDrag = false;
    private tutSwingContainer?: Phaser.GameObjects.Container;
    private tutSwingTween?: Phaser.Tweens.Tween;
    private firstShotTaken = false;
    private armedHeckleLevel = 0;
    private waterHazardsThisHole = 0;
    private currentClub: ClubKey = 'iron';
    private flagWavePhase = 0;
    private ottieShadow?: Phaser.GameObjects.Ellipse;
    private titleCard?: Phaser.GameObjects.Container;
    private edgeWarning?: Phaser.GameObjects.Graphics;
    private edgeWarningPhase = 0;
    private ottieIdleAnchor = { x: 0, y: 0 };
    private heckleInterferedLastShot = false;
    private powerLabel?: Phaser.GameObjects.Text;
    private lastAimZone: 'under' | 'sweet' | 'over' | null = null;
    private pendingGrade: { label: string; color: string; isPure: boolean; cause: string } | null = null;
    private cupApproachSlowTriggered = false;
    private swingFrameTimers: Phaser.Time.TimerEvent[] = [];

    constructor() { super('GolfScene'); }

    preload() {
        // Wang tileset PNGs + metadata JSONs. The ocean-grass file is
        // the ocean->rough boundary tileset (kept the legacy filename
        // since it ships against an existing path).
        this.load.image(TEX.oceanRough,   '/tiles/ocean-grass.png');
        this.load.image(TEX.roughFairway, '/tiles/rough-fairway.png');
        this.load.image(TEX.fairwaySand,  '/tiles/fairway-sand.png');
        this.load.image(TEX.fairwayGreen, '/tiles/fairway-green.png');
        this.load.json(JSON_KEY.oceanRough,   '/tiles/ocean-grass.json');
        this.load.json(JSON_KEY.roughFairway, '/tiles/rough-fairway.json');
        this.load.json(JSON_KEY.fairwaySand,  '/tiles/fairway-sand.json');
        this.load.json(JSON_KEY.fairwayGreen, '/tiles/fairway-green.json');
        // Sprites
        this.load.image(TEX.tree,       '/sprites/tree.png');
        this.load.image(TEX.ottie,      '/sprites/ottie-ready.png');
        this.load.image(TEX.ottieSwing, '/sprites/ottie-swing.png');
        for (let i = 0; i < SWING_FRAME_COUNT; i++) {
            this.load.image(TEX.swingFrame(i), `/sprites/swing/${i}.png`);
        }
        // SFX (Kenney CC0 packs, see CREDITS.md)
        this.load.audio(SFX.swing,     '/sounds/swing.ogg');
        this.load.audio(SFX.sink,      '/sounds/sink.ogg');
        this.load.audio(SFX.cupRattle, '/sounds/cup-rattle.ogg');
        this.load.audio(SFX.splash,    '/sounds/splash.ogg');
        this.load.audio(SFX.heckle,    '/sounds/heckle.ogg');
        this.load.audio(SFX.tap,       '/sounds/tap.ogg');
    }

    create() {
        // Matter world bounds keep the ball in-world. Camera bounds are
        // intentionally NOT set so the overview camera can center the
        // smaller-than-viewport world horizontally on portrait phones
        // (otherwise bounds clamp the camera and push the world to one
        // side of the screen).
        this.matter.world.setBounds(0, 0, WORLD_W, WORLD_H);

        // Register Wang tileset frames + build pattern lookups
        this.wangOceanRough   = this.buildWangSet(TEX.oceanRough,   JSON_KEY.oceanRough);
        this.wangRoughFairway = this.buildWangSet(TEX.roughFairway, JSON_KEY.roughFairway);
        this.wangFairwaySand  = this.buildWangSet(TEX.fairwaySand,  JSON_KEY.fairwaySand);
        this.wangFairwayGreen = this.buildWangSet(TEX.fairwayGreen, JSON_KEY.fairwayGreen);

        // Build terrain grid + render the course
        this.grid = buildTerrainGrid();
        this.drawCourse();
        this.drawTrees();
        this.drawHole();
        this.placeOttie();
        this.placeBall();

        // Camera: cover-zoom so the world fills the frame (no brown
        // letterbox). The world is portrait-aspect; phones are even
        // more elongated, so fitting by width crops a bit of ocean
        // off the top/bottom; fine, the green and tee both stay in
        // view because they sit in the middle of the world.
        this.overviewZoom = this.computeOverviewZoom();
        this.applyOverviewCamera();

        // Re-fit on viewport resize.
        this.scale.on('resize', () => {
            this.overviewZoom = this.computeOverviewZoom();
            if (this.state !== 'IN_FLIGHT') this.applyOverviewCamera();
        });

        this.aimHintGfx = this.add.graphics().setDepth(450);
        this.aimGfx = this.add.graphics().setDepth(500);
        this.drawAimHint();

        this.input.addPointer(1);
        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
        this.input.on('pointerup',   (p: Phaser.Input.Pointer) => this.onPointerUp(p));
        this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onPointerUp(p));

        EventBus.emit('current-scene-ready', this);
        EventBus.emit('strokes-changed', this.strokes);
        EventBus.emit('distance-to-pin', this.computeDistanceToPin());

        // First-launch onboarding: drag-to-swing finger animation.
        this.maybeShowSwingHint();

        // Course title card swoops in for the first 1.5 seconds of the
        // hole. Frees the player from reading the HUD chip to know
        // what they're looking at.
        this.showCourseTitleCard();

        // Per-course ambient soundscape. iOS Safari blocks audio until
        // the first user gesture; we start the engine here anyway and
        // let the AudioContext stay suspended until pointerdown bumps
        // it. The resume happens inside onPointerDown.
        ambient.start(themeFor(ACTIVE_HOLE.name, ACTIVE_HOLE.inspiration));
        this.events.once('shutdown', () => ambient.stop());
        this.events.once('destroy',  () => ambient.stop());

        // React side dispatches this after loading a match if the
        // opponent sent a heckle. Scene applies the jitter to the
        // very next swing release.
        EventBus.on('heckle-armed', (level: number) => {
            this.armedHeckleLevel = Math.max(0, Math.min(100, level));
        });
        EventBus.on('heckle-sfx', () => this.sfx(SFX.heckle, 0.7));
        EventBus.on('club-changed', (key: ClubKey) => {
            this.currentClub = key;
        });
    }

    update(_t: number, dt: number) {
        const bx = this.ballBody.position.x;
        const by = this.ballBody.position.y;
        this.ballSprite.setPosition(bx, by);
        this.ballShadow.setPosition(bx + 1, by + 3);

        // Flag wave: phase advances every frame, redraw once.
        this.flagWavePhase += dt * 0.005;
        this.redrawFlag(this.flagWavePhase);

        if (this.state === 'IN_FLIGHT' && !this.holeSunk) {
            this.trail.push({ x: bx, y: by, t: this.time.now });
            // Motion stretch: slightly elongate the ball along its
            // velocity direction so fast shots feel fast. Reset to
            // round when the ball is moving slowly or at rest.
            const v = (this.ballBody as unknown as { velocity: { x: number; y: number } }).velocity;
            const speed = Math.hypot(v.x, v.y);
            const stretch = Math.min(1.5, 1 + speed * 0.045);
            const squash = 1 / Math.sqrt(stretch);
            const angle = Math.atan2(v.y, v.x);
            this.ballSprite.setRotation(angle);
            this.ballSprite.setScale(stretch, squash);
        } else {
            this.ballSprite.setRotation(0);
            this.ballSprite.setScale(1, 1);
        }
        this.drawTrail();

        if (this.state === 'AIMING') {
            this.drawAimGuide();
            const holdMs = this.time.now - this.dragStartMs;
            this.updateBadMomentTelegraph(holdMs);
        }

        if (this.oobIndicator && this.time.now > this.oobIndicatorHideAt) {
            this.oobIndicator.destroy();
            this.oobIndicator = undefined;
        }

        if (this.state === 'IN_FLIGHT' && !this.holeSunk) {
            // Sink detection
            const distToHole = Math.hypot(bx - HOLE_WORLD.x, by - HOLE_WORLD.y);
            if (distToHole < COURSE.holeRadius + 2) { this.sinkBall(); return; }

            // Cup-approach micro slow-mo. Fires once per shot when the
            // ball drifts within striking range of the cup and is
            // still moving. The 'will it / won't it' beat.
            if (
                !this.cupApproachSlowTriggered &&
                distToHole < 60 && distToHole > COURSE.holeRadius + 2
            ) {
                const vel = (this.ballBody as unknown as { velocity: { x: number; y: number } }).velocity;
                const sp = Math.hypot(vel.x, vel.y);
                if (sp > 0.6 && sp < 6) {
                    this.cupApproachSlowTriggered = true;
                    this.triggerCupApproachSlowMo();
                }
            }

            // OOB: ball outside world rect (matter world bounds will
            // bounce it; this is a softer respawn for clean UX)
            if (bx < 0 || bx > WORLD_W || by < 0 || by > WORLD_H) {
                this.handleOutOfBounds(); return;
            }

            const v = (this.ballBody as unknown as { velocity: { x: number; y: number } }).velocity;
            const speed = Math.hypot(v.x, v.y);
            if (speed < SWING.restSpeedThreshold) {
                this.matter.body.setVelocity(this.ballBody as unknown as MatterJS.BodyType, { x: 0, y: 0 });
                // Water hazard check: if the ball came to rest in the
                // ocean (i.e. the player missed the green island), apply
                // a one-stroke penalty and respawn at the tee.
                if (isOverWater(this.grid, bx, by)) {
                    this.handleWaterHazard();
                    return;
                }
                this.state = 'IDLE';
                this.ottie.setTexture(TEX.ottie);
                this.trail = [];
                this.trailGfx.clear();
                this.moveOttieToBall(bx, by);
                this.zoomToOverview();
                if (!this.firstShotTaken) {
                    this.firstShotTaken = true;
                    this.maybeShowPanHint();
                }
                this.drawAimHint();
                EventBus.emit('distance-to-pin', this.computeDistanceToPin());
                EventBus.emit('hud-visibility', true);
                // Now the story has played out, show the verdict.
                if (this.pendingGrade) {
                    this.showContactGrade(
                        this.pendingGrade.label,
                        this.pendingGrade.color,
                        this.pendingGrade.isPure,
                        this.pendingGrade.cause,
                    );
                    this.pendingGrade = null;
                }
            }
        }
    }

    private handleWaterHazard() {
        this.pendingGrade = null;
        this.matter.body.setPosition(this.ballBody as unknown as MatterJS.BodyType, { x: TEE_WORLD.x, y: TEE_WORLD.y }, false);
        // Soft mulligan: first water-hazard per hole is free, framed
        // as a learning beat rather than a punishment. Subsequent ones
        // cost a stroke as normal.
        const isMulligan = this.waterHazardsThisHole === 0;
        this.waterHazardsThisHole += 1;
        if (!isMulligan) this.strokes += 1;
        this.haptic(isMulligan ? [40] : [80, 40, 40]);
        this.sfx(SFX.splash, 0.55);
        this.state = 'IDLE';
        this.ottie.setTexture(TEX.ottie);
        this.trail = [];
        this.trailGfx.clear();
        this.moveOttieToBall(TEE_WORLD.x, TEE_WORLD.y, true);
        this.zoomToOverview();
        this.drawAimHint();
        EventBus.emit('strokes-changed', this.strokes);
        EventBus.emit('distance-to-pin', this.computeDistanceToPin());

        this.oobIndicator?.destroy();
        const label = isMulligan ? 'splash · mulligan, no penalty' : 'splash · +1';
        const bg = isMulligan ? '#4A9D5D' : '#3a87b8';
        this.oobIndicator = this.add.text(
            this.scale.width / 2, 60,
            label, {
                fontFamily: 'system-ui, sans-serif', fontSize: '16px',
                color: '#FFF8E7', backgroundColor: bg,
                padding: { x: 12, y: 6 },
            },
        ).setOrigin(0.5).setScrollFactor(0).setDepth(900);
        this.oobIndicatorHideAt = this.time.now + 1800;
    }

    // ─── Wang tile setup ──────────────────────────────────────────

    private buildWangSet(textureKey: string, jsonKey: string): WangSet {
        const meta = this.cache.json.get(jsonKey) as TilesetJson;
        const tex = this.textures.get(textureKey);
        const patternToFrame = new Map<string, string>();
        let fallbackFrame = '';

        for (const t of meta.tileset_data.tiles) {
            const frameName = `f_${t.id}`;
            tex.add(frameName, 0, t.bounding_box.x, t.bounding_box.y, t.bounding_box.width, t.bounding_box.height);
            const key = `${t.corners.NW},${t.corners.NE},${t.corners.SE},${t.corners.SW}`;
            if (!patternToFrame.has(key)) patternToFrame.set(key, frameName);
            if (t.corners.NW === 'lower' && t.corners.NE === 'lower' && t.corners.SE === 'lower' && t.corners.SW === 'lower') {
                fallbackFrame = frameName;
            }
        }

        return { textureKey, patternToFrame, fallbackFrame };
    }

    private pickFrame(set: WangSet, nw: 'lower' | 'upper', ne: 'lower' | 'upper', se: 'lower' | 'upper', sw: 'lower' | 'upper'): string {
        const key = `${nw},${ne},${se},${sw}`;
        const direct = set.patternToFrame.get(key);
        if (direct) return direct;
        // Try treating each upper corner as transition to find a softer match
        const variants: WangCorner[][] = [
            [nw === 'upper' ? 'transition' : nw, ne, se, sw],
            [nw, ne === 'upper' ? 'transition' : ne, se, sw],
            [nw, ne, se === 'upper' ? 'transition' : se, sw],
            [nw, ne, se, sw === 'upper' ? 'transition' : sw],
        ];
        for (const v of variants) {
            const fb = set.patternToFrame.get(`${v[0]},${v[1]},${v[2]},${v[3]}`);
            if (fb) return fb;
        }
        return set.fallbackFrame;
    }

    // ─── Course render ────────────────────────────────────────────

    private drawCourse() {
        // Base layer: flat ocean across the entire world. Everything
        // else paints over it. Avoids the Wang tiles being misused as
        // bulk fill (which produced the chaotic checker pattern).
        this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, COLORS.fillOcean, 1).setDepth(-2);

        // Each cell is composited from up to 4 boundary layers, painted
        // in order: ocean->rough, rough->fairway, fairway->sand,
        // fairway->green. Inside pure regions we just paint a flat
        // color; at boundaries we use the appropriate Wang tile.
        for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
                const corners = cornerPattern(this.grid, col, row);
                const cx = col * TILE_PX + TILE_PX / 2;
                const cy = row * TILE_PX + TILE_PX / 2;

                const same       = allSame(corners);
                const hasOcean   = anyIs(corners, 'ocean');
                const hasRough   = anyIs(corners, 'rough');
                const hasFairway = anyIs(corners, 'fairway');
                const hasSand    = anyIs(corners, 'sand');
                const hasGreen   = anyIs(corners, 'green');

                // LAYER 0: ocean->rough shoreline, or flat rough base.
                if (same === 'ocean') {
                    // pure ocean; flat base already covers
                } else if (hasOcean) {
                    const t = (x: Terrain): 'lower' | 'upper' => x === 'ocean' ? 'lower' : 'upper';
                    const frame = this.pickFrame(this.wangOceanRough, t(corners[0]), t(corners[1]), t(corners[2]), t(corners[3]));
                    this.add.image(cx, cy, TEX.oceanRough, frame).setDepth(0);
                } else {
                    // Pure land cell. Paint rough as the land base; brighter
                    // surfaces (fairway/sand/green) overlay below.
                    this.add.rectangle(cx, cy, TILE_PX, TILE_PX, COLORS.fillRough, 1).setDepth(0);
                }

                // LAYER 1: rough->fairway boundary or flat fairway fill.
                if (hasFairway && !hasOcean) {
                    if (same === 'fairway') {
                        this.add.rectangle(cx, cy, TILE_PX, TILE_PX, COLORS.fillFairway, 1).setDepth(1);
                    } else if (hasRough) {
                        const t = (x: Terrain): 'lower' | 'upper' => x === 'fairway' ? 'upper' : 'lower';
                        const frame = this.pickFrame(this.wangRoughFairway, t(corners[0]), t(corners[1]), t(corners[2]), t(corners[3]));
                        this.add.image(cx, cy, TEX.roughFairway, frame).setDepth(1);
                    } else {
                        // fairway only mixed with sand/green; paint flat
                        // fairway under those overlays.
                        this.add.rectangle(cx, cy, TILE_PX, TILE_PX, COLORS.fillFairway, 1).setDepth(1);
                    }
                }

                // LAYER 2: sand bunker boundary (sand sits on fairway).
                if (same === 'sand') {
                    this.add.rectangle(cx, cy, TILE_PX, TILE_PX, COLORS.fillSand, 1).setDepth(2);
                } else if (hasSand) {
                    const t = (x: Terrain): 'lower' | 'upper' => x === 'sand' ? 'upper' : 'lower';
                    const frame = this.pickFrame(this.wangFairwaySand, t(corners[0]), t(corners[1]), t(corners[2]), t(corners[3]));
                    this.add.image(cx, cy, TEX.fairwaySand, frame).setDepth(2);
                }

                // LAYER 3: putting green boundary (green sits on fairway).
                if (same === 'green') {
                    this.add.rectangle(cx, cy, TILE_PX, TILE_PX, COLORS.fillGreen, 1).setDepth(3);
                } else if (hasGreen) {
                    const t = (x: Terrain): 'lower' | 'upper' => x === 'green' ? 'upper' : 'lower';
                    const frame = this.pickFrame(this.wangFairwayGreen, t(corners[0]), t(corners[1]), t(corners[2]), t(corners[3]));
                    this.add.image(cx, cy, TEX.fairwayGreen, frame).setDepth(3);
                }
            }
        }
    }

    private drawTrees() {
        const positions = generateTreePositions(this.grid);
        for (const p of positions) {
            this.add.image(p.x + 1, p.y + 4, TEX.tree)
                .setOrigin(0.5, 0.85)
                .setDepth(3)
                .setScale(0.85 + ((p.x + p.y) % 5) * 0.06);
        }
    }

    private drawHole() {
        // Pulsing halo around the cup so the target reads from far away.
        this.cupHalo = this.add.circle(HOLE_WORLD.x, HOLE_WORLD.y, 18, 0xFFF8E7, 0.25).setDepth(9);
        this.cupHaloTween = this.tweens.add({
            targets: this.cupHalo,
            radius: 26,
            alpha: 0.05,
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // Cup with depth. Outer light-tan rim simulates the cut grass
        // collar around the cup, then the dark hole sits inside it.
        this.add.circle(HOLE_WORLD.x, HOLE_WORLD.y, COURSE.holeRadius + 2, 0xC9D9A8, 1).setDepth(9.5);
        this.add.circle(HOLE_WORLD.x, HOLE_WORLD.y, COURSE.holeRadius, COLORS.hole, 1).setDepth(10);
        // Inner highlight crescent to suggest the cup's curved lip.
        const lip = this.add.graphics().setDepth(10.1);
        lip.fillStyle(0x2A2A2A, 1);
        lip.fillCircle(HOLE_WORLD.x, HOLE_WORLD.y + 2, COURSE.holeRadius - 2);

        // Flag pole + flag. Stored as a member so update() can redraw
        // the flag each frame with a wave offset.
        this.flagSprite = this.add.graphics().setDepth(11);
        this.redrawFlag(0);
    }

    /** Redraw the flag pole and triangular cloth with a phase-based
     *  wave so the cloth swims gently as if caught by wind. */
    private redrawFlag(phase: number) {
        if (!this.flagSprite) return;
        const g = this.flagSprite;
        const px = HOLE_WORLD.x;
        const py = HOLE_WORLD.y;
        const tipY = py - 28;
        const baseRightX = px + 16;
        const swayX = Math.sin(phase) * 3;
        const swayY = Math.sin(phase * 1.3 + 0.5) * 1.5;

        g.clear();
        // Pole shadow
        g.lineStyle(2, 0x000000, 0.25);
        g.beginPath();
        g.moveTo(px + 1, py + 1);
        g.lineTo(px + 1, tipY + 1);
        g.strokePath();
        // Pole
        g.lineStyle(2, 0xF0EAD2, 1);
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px, tipY);
        g.strokePath();
        // Flag cloth, right corner sways
        g.fillStyle(0xC8543A, 1);
        g.fillTriangle(
            px, tipY,
            baseRightX + swayX, tipY + 4 + swayY,
            px, tipY + 10,
        );
        // Cloth highlight along the pole side
        g.fillStyle(0xE07555, 0.8);
        g.fillTriangle(
            px + 1, tipY + 1,
            px + 4 + swayX * 0.3, tipY + 4 + swayY * 0.3,
            px + 1, tipY + 8,
        );
    }

    /** Big translucent course title card centered on the screen for
     *  the first ~1.6 seconds of a hole. 'HOLE 1 · THE ROAD HOLE · PAR 4' */
    private showCourseTitleCard() {
        const w = this.scale.width;
        const h = this.scale.height;
        const cy = h * 0.42;
        const c = this.add.container(0, 0).setDepth(1400).setScrollFactor(0).setAlpha(0);

        const eyebrow = this.add.text(w / 2, cy - 22, `HOLE ${this.holeNumber()} OF 3`, {
            fontFamily: 'system-ui, sans-serif', fontSize: '11px',
            color: '#E8922A', fontStyle: 'bold',
        }).setOrigin(0.5).setScrollFactor(0);
        eyebrow.setStroke('#1A1A1A', 4);

        const title = this.add.text(w / 2, cy + 4, ACTIVE_HOLE.name, {
            fontFamily: 'system-ui, sans-serif', fontSize: '34px',
            color: '#FFF8E7', fontStyle: 'bold',
        }).setOrigin(0.5).setScrollFactor(0);
        title.setStroke('#1A1A1A', 6);
        title.setShadow(0, 3, '#1A1A1A', 6, true, true);

        const sub = this.add.text(w / 2, cy + 40, `par ${ACTIVE_HOLE.par} · after ${ACTIVE_HOLE.inspiration}`, {
            fontFamily: 'system-ui, sans-serif', fontSize: '13px',
            color: '#FFF8E7', fontStyle: 'italic',
        }).setOrigin(0.5).setScrollFactor(0);
        sub.setStroke('#1A1A1A', 4);

        c.add([eyebrow, title, sub]);
        this.titleCard = c;

        this.tweens.add({
            targets: c, alpha: 1, y: -8,
            duration: 280, ease: 'Cubic.easeOut',
            onComplete: () => {
                this.tweens.add({
                    targets: c, alpha: 0, y: -16,
                    delay: 1200, duration: 400, ease: 'Cubic.easeIn',
                    onComplete: () => { c.destroy(); this.titleCard = undefined; },
                });
            },
        });
    }

    private holeNumber(): number {
        return activeHoleIndex() + 1;
    }

    private drawAimHint() {
        this.aimHintGfx.clear();
        if (this.state !== 'IDLE' || this.holeSunk) return;
        const bx = this.ballBody.position.x;
        const by = this.ballBody.position.y;
        const dx = HOLE_WORLD.x - bx;
        const dy = HOLE_WORLD.y - by;
        const dist = Math.hypot(dx, dy);
        if (dist < 20) return;
        const ux = dx / dist;
        const uy = dy / dist;
        // Dashed line from ball to cup: 12px dashes, 10px gaps.
        const dashLen = 14;
        const gapLen = 10;
        const seg = dashLen + gapLen;
        const startOffset = 18; // pull away from ball so it doesn't overlap
        const endOffset = 22;   // pull back from cup to avoid the pin
        const usable = dist - startOffset - endOffset;
        if (usable < seg) return;
        this.aimHintGfx.lineStyle(2, 0xFFF8E7, 0.45);
        for (let d = startOffset; d + dashLen <= dist - endOffset; d += seg) {
            const x1 = bx + ux * d;
            const y1 = by + uy * d;
            const x2 = bx + ux * (d + dashLen);
            const y2 = by + uy * (d + dashLen);
            this.aimHintGfx.beginPath();
            this.aimHintGfx.moveTo(x1, y1);
            this.aimHintGfx.lineTo(x2, y2);
            this.aimHintGfx.strokePath();
        }
    }

    /** Fire a vibration pattern where the device supports it. iOS
     *  Safari currently ignores navigator.vibrate (the API exists but
     *  is a no-op), Android Chrome respects it; we call it
     *  unconditionally and let the platform decide. */
    private haptic(pattern: number[]) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    }

    /** Play a sfx by key. Wraps Phaser's sound system with a try/catch
     *  because iOS Safari blocks audio until the first user gesture
     *  and the AudioContext can throw 'NotAllowedError' on autoplay. */
    private sfx(key: string, volume = 0.6) {
        try {
            this.sound.play(key, { volume });
        } catch (err) {
            // First-touch unlock has not happened yet, or device denies audio.
            // Silent fail keeps gameplay flowing.
            void err;
        }
    }

    // ─── Onboarding tutorials ────────────────────────────────────

    private readTutFlag(key: string): boolean {
        try { return window.localStorage.getItem(`ottiegolf:tut:${key}`) === '1'; }
        catch { return false; }
    }

    private writeTutFlag(key: string): void {
        try { window.localStorage.setItem(`ottiegolf:tut:${key}`, '1'); } catch { /* ignore */ }
    }

    /** First-launch hint: dim the screen, show an animated finger
     *  sliding down-and-away to teach the drag-anywhere swing.
     *  Dismissed by any tap (which also starts the first real swing). */
    private maybeShowSwingHint() {
        if (this.readTutFlag('swing')) return;
        const w = this.scale.width;
        const h = this.scale.height;
        const cx = w / 2;
        const cy = h / 2;

        const c = this.add.container(0, 0).setDepth(1500).setScrollFactor(0);
        const backdrop = this.add.rectangle(0, 0, w, h, 0x000000, 0.55)
            .setOrigin(0, 0).setScrollFactor(0);
        const finger = this.add.circle(cx, cy, 18, 0xFFF8E7, 0.95).setScrollFactor(0);
        const ring = this.add.circle(cx, cy, 28, 0x000000, 0)
            .setStrokeStyle(2, 0xFFF8E7, 0.7).setScrollFactor(0);
        const caption = this.add.text(cx, cy - 80, 'drag anywhere to swing', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '18px',
            color: '#FFF8E7',
            fontStyle: 'bold',
        }).setOrigin(0.5).setScrollFactor(0);
        const sub = this.add.text(cx, cy - 56, 'release to launch the ball', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '13px',
            color: '#FFF8E7',
        }).setOrigin(0.5).setScrollFactor(0).setAlpha(0.75);
        c.add([backdrop, finger, ring, caption, sub]);

        this.tutSwingTween = this.tweens.add({
            targets: [finger, ring],
            y: { from: cy, to: cy + 90 },
            alpha: { from: 0.95, to: 0.05 },
            duration: 1100,
            repeat: -1,
            ease: 'Quad.easeIn',
        });

        this.tutSwingContainer = c;
    }

    private dismissSwingHint() {
        if (!this.tutSwingContainer) return;
        this.writeTutFlag('swing');
        this.tutSwingTween?.stop();
        this.tutSwingTween = undefined;
        this.tutSwingContainer.destroy();
        this.tutSwingContainer = undefined;
    }

    /** Post-first-shot badge: a small top-center toast teaching the
     *  two-finger pan gesture. Fades in, holds 3s, fades out. */
    private maybeShowPanHint() {
        if (this.readTutFlag('pan')) return;
        const w = this.scale.width;
        const badge = this.add.text(w / 2, 18, 'two fingers to look around', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '14px',
            color: '#FFF8E7',
            fontStyle: 'bold',
            backgroundColor: '#1A1A1Acc',
            padding: { left: 14, right: 14, top: 8, bottom: 8 },
        }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1500).setAlpha(0);

        this.tweens.add({
            targets: badge,
            alpha: 1,
            duration: 280,
            onComplete: () => {
                this.tweens.add({
                    targets: badge,
                    alpha: 0,
                    delay: 3200,
                    duration: 420,
                    onComplete: () => badge.destroy(),
                });
            },
        });

        this.writeTutFlag('pan');
    }

    /** Cover-fit zoom: scale so the world fills the viewport on its
     *  smaller dimension. The larger dimension overflows and gets
     *  cropped offscreen, acceptable here because the gameplay
     *  (green + tee) sits in the world center. Capped at 2.0 so we
     *  never blow up the art at silly scales. */
    private computeOverviewZoom(): number {
        const zX = this.scale.width  / WORLD_W;
        const zY = this.scale.height / WORLD_H;
        return Math.min(Math.max(zX, zY), 2.0);
    }

    /** Force the camera viewport to match the current canvas size, then
     *  center the world. setSize() is required because the camera's own
     *  width/height does not auto-sync with the canvas under Scale.RESIZE
     *  in Phaser 4, which made every center calculation wrong. */
    private applyOverviewCamera() {
        const cam = this.cameras.main;
        cam.removeBounds();
        cam.stopFollow();
        cam.setSize(this.scale.width, this.scale.height);
        cam.setZoom(this.overviewZoom);
        cam.centerOn(WORLD_W / 2, WORLD_H / 2);
        this.updateDebugHud();
    }

    private zoomToFollow() {
        const cam = this.cameras.main;
        // Clamp the follow to the world rect so the camera cannot pan
        // into the brown background when the ball is near a world edge.
        // setBounds(...true) auto-centers when the viewport is larger
        // than the world on either axis, which keeps the framing
        // correct even at the lowest zooms.
        cam.setBounds(0, 0, WORLD_W, WORLD_H, true);
        cam.setSize(this.scale.width, this.scale.height);
        cam.zoomTo(1.0, 350, 'Sine.easeInOut');
        cam.startFollow(this.ballSprite, true, 0.1, 0.1);
    }

    /** Cinematic swing focus: glide in on Ottie, hold for the full
     *  swing animation (longer on PURE because of mid-swing slow-mo),
     *  then smoothly hand off to ball-follow. */
    private focusOnOttieThenBall(isPure: boolean) {
        const cam = this.cameras.main;
        cam.stopFollow();
        cam.removeBounds();
        cam.setSize(this.scale.width, this.scale.height);
        const ox = this.ottie.x;
        const oy = this.ottie.y - 6;

        const zoomLevel = isPure ? 1.6 : 1.45;
        const glideInMs = isPure ? 480 : 420;
        const holdMs    = isPure ? 1100 : 800;
        const glideOutMs = 560;

        // Phase 1: glide in to Ottie.
        cam.zoomTo(zoomLevel, glideInMs, 'Sine.easeInOut');
        cam.pan(ox, oy, glideInMs, 'Sine.easeInOut');

        // Phase 2: hold on Ottie through the swing animation. The
        // delay is wall-clock; PURE's mid-swing slow-mo extends the
        // visual swing duration without us needing to extend the
        // camera math.
        this.time.delayedCall(glideInMs + holdMs, () => {
            if (this.state !== 'IN_FLIGHT') return;
            // Phase 3: glide out to ball-follow. Pan ahead of the
            // ball's current position so the cam catches up smoothly
            // rather than snapping when follow engages.
            cam.zoomTo(1.0, glideOutMs, 'Sine.easeInOut');
            cam.pan(
                this.ballBody.position.x,
                this.ballBody.position.y,
                glideOutMs, 'Sine.easeInOut',
            );
            this.time.delayedCall(glideOutMs * 0.8, () => {
                if (this.state !== 'IN_FLIGHT') return;
                cam.startFollow(this.ballSprite, true, 0.08, 0.08);
            });
        });
    }

    private zoomToOverview() {
        const cam = this.cameras.main;
        cam.stopFollow();
        cam.removeBounds();
        cam.setSize(this.scale.width, this.scale.height);
        cam.zoomTo(this.overviewZoom, 400, 'Sine.easeInOut');
        cam.pan(WORLD_W / 2, WORLD_H / 2, 400, 'Sine.easeInOut');
    }

    /** Tiny top-right overlay so we can see what the camera actually
     *  thinks its size is. Only renders when ?debug=1 is in the URL. */
    private debugHud?: Phaser.GameObjects.Text;
    private updateDebugHud() {
        if (typeof window === 'undefined') return;
        if (!new URLSearchParams(window.location.search).has('debug')) return;
        const cam = this.cameras.main;
        const txt = [
            `scale ${this.scale.width.toFixed(0)}x${this.scale.height.toFixed(0)}`,
            `cam   ${cam.width.toFixed(0)}x${cam.height.toFixed(0)}`,
            `zoom  ${cam.zoom.toFixed(3)}`,
            `scrl  ${cam.scrollX.toFixed(1)},${cam.scrollY.toFixed(1)}`,
            `world ${WORLD_W}x${WORLD_H}`,
        ].join('\n');
        if (!this.debugHud) {
            this.debugHud = this.add.text(this.scale.width - 8, 8, txt, {
                fontFamily: 'monospace', fontSize: '11px',
                color: '#ffffff', backgroundColor: '#000000aa',
                padding: { left: 6, right: 6, top: 4, bottom: 4 },
                align: 'right',
            }).setOrigin(1, 0).setScrollFactor(0).setDepth(2000);
        } else {
            this.debugHud.setText(txt);
            this.debugHud.setPosition(this.scale.width - 8, 8);
        }
    }

    private placeOttie() {
        const ox = TEE_WORLD.x - 22;
        const oy = TEE_WORLD.y - 4;
        this.ottieShadow = this.add.ellipse(ox, oy + 2, 30, 8, 0x000000, 0.28).setDepth(14);
        this.ottie = this.add.image(
            ox, oy,
            TEX.ottie,
        ).setOrigin(0.5, 0.85).setDepth(15).setScale(0.42);
        this.ottieIdleAnchor = { x: ox, y: oy };
        this.startOttieIdleBob();
    }

    /** Move Ottie to stand next to the ball at the given world position.
     *  Tween for normal post-shot transitions; immediate for tee respawns
     *  (water/OOB) since a slow walk across water reads weird. The drop
     *  shadow tweens in parallel so it stays glued to his feet. */
    private moveOttieToBall(ballX: number, ballY: number, immediate = false) {
        const tx = ballX - 22;
        const ty = ballY - 4;
        this.ottieIdleAnchor = { x: tx, y: ty };
        this.stopOttieIdleBob();
        if (immediate) {
            this.ottie.setPosition(tx, ty);
            this.ottie.setAngle(0);
            this.ottieShadow?.setPosition(tx, ty + 2);
            this.startOttieIdleBob();
            return;
        }
        this.tweens.add({
            targets: this.ottie,
            x: tx, y: ty,
            angle: 0,
            duration: 550,
            ease: 'Sine.easeInOut',
            onComplete: () => this.startOttieIdleBob(),
        });
        if (this.ottieShadow) {
            this.tweens.add({
                targets: this.ottieShadow,
                x: tx, y: ty + 2,
                duration: 550,
                ease: 'Sine.easeInOut',
            });
        }
    }

    private placeBall() {
        this.ballBody = this.matter.add.circle(TEE_WORLD.x, TEE_WORLD.y, COURSE.ballRadius, {
            restitution: BALL_PHYSICS.restitution,
            frictionAir: BALL_PHYSICS.frictionAir,
            density: BALL_PHYSICS.density,
            label: 'ball',
        }) as unknown as MatterBodyLike;
        this.ballShadow = this.add.ellipse(
            TEE_WORLD.x + 1, TEE_WORLD.y + 3,
            COURSE.ballRadius * 1.8, COURSE.ballRadius * 1.0,
            COLORS.ballShadow, 0.25,
        ).setDepth(19);
        this.ballSprite = this.add.circle(TEE_WORLD.x, TEE_WORLD.y, COURSE.ballRadius, COLORS.ball, 1)
            .setStrokeStyle(1, 0x444444, 0.7).setDepth(20);
        this.trailGfx = this.add.graphics().setDepth(18);
    }

    private startOttieIdleBob() {
        this.ottieIdleTween?.stop();
        this.ottieIdleTween = this.tweens.add({
            targets: this.ottie,
            scaleX: 0.44,
            scaleY: 0.40,
            duration: 1400,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
        });
    }

    private stopOttieIdleBob() {
        this.ottieIdleTween?.stop();
        this.ottieIdleTween = undefined;
        this.ottie.setScale(0.42);
    }

    // ─── Difficulty helpers ───────────────────────────────────────

    private currentHoldOscRad(): number {
        const heldMs = this.time.now - this.dragStartMs;
        const overGraceSec = Math.max(0, heldMs - SWING.holdGraceMs) / 1000;
        const ampDeg = Math.min(overGraceSec * SWING.holdDriftRateDegPerSec, SWING.holdDriftMaxDeg);
        if (ampDeg <= 0) return 0;
        const tSec = this.time.now / 1000;
        const phase = Math.sin(tSec * SWING.holdOscHz * Math.PI * 2);
        return phase * ampDeg * Math.PI / 180;
    }

    private powerZone(tNorm: number): 'under' | 'sweet' | 'over' {
        const club = CLUBS[this.currentClub];
        if (tNorm < club.sweetMin) return 'under';
        if (tNorm <= club.sweetMax) return 'sweet';
        return 'over';
    }

    // ─── Input ────────────────────────────────────────────────────

    private activePointerCount(): number {
        let n = 0;
        const ps = [this.input.pointer1, this.input.pointer2, this.input.pointer3];
        for (const p of ps) if (p && p.isDown) n++;
        return n;
    }

    private avgActivePointerScreen(): { x: number; y: number } {
        const active: Phaser.Input.Pointer[] = [];
        for (const p of [this.input.pointer1, this.input.pointer2, this.input.pointer3]) {
            if (p && p.isDown) active.push(p);
        }
        if (active.length === 0) return { x: 0, y: 0 };
        let sx = 0, sy = 0;
        for (const p of active) { sx += p.x; sy += p.y; }
        return { x: sx / active.length, y: sy / active.length };
    }

    /** Keep the WORLD inside the viewport so no body background bleeds
     *  in around the edges. Two cases per axis:
     *  - viewport in world units (= scale / zoom) is SMALLER than the
     *    world: clamp scroll to [0, WORLD - viewport] so neither edge
     *    leaks past the world rect.
     *  - viewport is LARGER than the world (cover-zoom on portrait
     *    phones can leave one axis larger): center the world. */
    private clampPan() {
        const cam = this.cameras.main;
        const viewW = this.scale.width  / cam.zoom;
        const viewH = this.scale.height / cam.zoom;
        if (viewW >= WORLD_W) {
            cam.scrollX = (WORLD_W - viewW) / 2;
        } else {
            cam.scrollX = Math.max(0, Math.min(WORLD_W - viewW, cam.scrollX));
        }
        if (viewH >= WORLD_H) {
            cam.scrollY = (WORLD_H - viewH) / 2;
        } else {
            cam.scrollY = Math.max(0, Math.min(WORLD_H - viewH, cam.scrollY));
        }
    }

    private onPointerDown(p: Phaser.Input.Pointer) {
        // First touch on any platform unlocks audio. iOS Safari ignores
        // AudioContext.resume() called outside a user gesture, so this
        // path is required for the ambient bed to ever play.
        ambient.unlock();
        if (this.tutSwingContainer) this.dismissSwingHint();
        if (this.holeSunk) { this.resetHole(); return; }

        // Two-finger pan: the moment a second pointer touches down,
        // cancel any in-progress aim and start panning.
        if (this.activePointerCount() >= 2) {
            if (this.state === 'AIMING') {
                this.state = 'IDLE';
                this.aimGfx.clear();
                this.clearEdgeWarning();
                this.resetOttiePoseToIdle();
                this.drawAimHint();
            }
            this.panActive = true;
            this.panLastAvg = this.avgActivePointerScreen();
            this.suppressSingleDrag = true;
            return;
        }

        if (this.state !== 'IDLE') return;
        if (this.suppressSingleDrag) return;

        // Pool-style drag: gesture origin is wherever the finger first
        // touched, not the ball. The aim guide still renders from the
        // ball; only the gesture measurement uses dragOrigin.
        this.state = 'AIMING';
        this.dragOrigin = { x: p.worldX, y: p.worldY };
        this.dragCurrent = { x: p.worldX, y: p.worldY };
        this.dragStartMs = this.time.now;
        this.aimHintGfx.clear();
        this.drawAimGuide();
    }

    private onPointerMove(p: Phaser.Input.Pointer) {
        if (this.panActive) {
            const avg = this.avgActivePointerScreen();
            const dx = avg.x - this.panLastAvg.x;
            const dy = avg.y - this.panLastAvg.y;
            const cam = this.cameras.main;
            cam.scrollX -= dx / cam.zoom;
            cam.scrollY -= dy / cam.zoom;
            this.clampPan();
            this.panLastAvg = avg;
            return;
        }
        if (this.state !== 'AIMING') return;
        this.dragCurrent = { x: p.worldX, y: p.worldY };
        this.drawAimGuide();
    }

    private onPointerUp(_p: Phaser.Input.Pointer) {
        const count = this.activePointerCount();

        if (this.panActive) {
            if (count < 2) this.panActive = false;
            if (count === 0) this.suppressSingleDrag = false;
            else this.panLastAvg = this.avgActivePointerScreen();
            return;
        }

        if (this.suppressSingleDrag) {
            if (count === 0) this.suppressSingleDrag = false;
            return;
        }

        if (this.state !== 'AIMING') return;

        const pullX = this.dragCurrent.x - this.dragOrigin.x;
        const pullY = this.dragCurrent.y - this.dragOrigin.y;
        const pullMag = Math.hypot(pullX, pullY);

        this.aimGfx.clear();

        if (pullMag < SWING.minDragPx) {
            this.state = 'IDLE';
            this.clearEdgeWarning();
            this.resetOttiePoseToIdle();
            this.drawAimHint();
            return;
        }

        const clamped = Math.min(pullMag, SWING.maxDragPx);
        const tNorm = clamped / SWING.maxDragPx;
        const baseAngle = Math.atan2(-pullY / pullMag, -pullX / pullMag);

        let finalAngle = baseAngle + this.currentHoldOscRad();

        const zone = this.powerZone(tNorm);
        let powerMul: number;
        if (zone === 'sweet') {
            powerMul = 1.0;
        } else if (zone === 'under') {
            powerMul = tNorm;
        } else {
            powerMul = CLUBS[this.currentClub].overpowerPenalty;
            const jitterRad = (Math.random() - 0.5) * 2 * CLUBS[this.currentClub].overpowerJitterDeg * Math.PI / 180;
            finalAngle += jitterRad;
        }

        // Heckle handicap: aim jitter proportional to opponent's mash
        // intensity. 100% heckle = up to 12 degrees of release wobble.
        // Applied once and then disarmed so it never carries to a later shot.
        let heckleAppliedAmount = 0;
        if (this.armedHeckleLevel > 0) {
            heckleAppliedAmount = this.armedHeckleLevel;
            const maxDeg = (this.armedHeckleLevel / 100) * 12;
            const heckleJitterRad = (Math.random() - 0.5) * 2 * maxDeg * Math.PI / 180;
            finalAngle += heckleJitterRad;
            this.armedHeckleLevel = 0;
        }

        const speed = powerMul * CLUBS[this.currentClub].maxSpeed;
        const launchVelX = Math.cos(finalAngle) * speed;
        const launchVelY = Math.sin(finalAngle) * speed;

        // Grade the contact but DEFER the verdict label until the
        // ball comes to rest. The release moment belongs to the
        // thwack; the grade is the story's epilogue.
        const holdMs = this.time.now - this.dragStartMs;
        this.pendingGrade = this.gradeContact(zone, tNorm, holdMs, heckleAppliedAmount);
        const isPure = this.pendingGrade?.isPure === true;

        // Immediate work: enter SWINGING (NOT in-flight yet, so update
        // does not run sink / OOB / rest detection on a still-stationary
        // ball), start the visual swing + camera focus.
        this.state = 'SWINGING';
        this.strokes += 1;
        this.cupApproachSlowTriggered = false;
        EventBus.emit('strokes-changed', this.strokes);
        EventBus.emit('hud-visibility', false);
        this.stopOttieIdleBob();
        this.ottie.setTexture(TEX.ottieSwing);
        this.aimHintGfx.clear();
        this.clearEdgeWarning();
        this.playOttieSwingAnim(isPure);
        this.focusOnOttieThenBall(isPure);
        this.lastAimZone = null;

        // Deferred work: at the impact frame of the animation, fire the
        // contact moment (haptic, sfx, dust) and apply the ball
        // velocity. Anything that lets the player feel 'I hit it' lands
        // here so it syncs with the on-screen club hitting the ball.
        const impactDelay = isPure ? IMPACT_FRAME_OFFSET_MS_PURE : IMPACT_FRAME_OFFSET_MS_NORMAL;
        const ballX = this.ballBody.position.x;
        const ballY = this.ballBody.position.y;
        this.time.delayedCall(impactDelay, () => {
            // Guard against scene shutdown / reset cancelling the
            // swing between release and impact.
            if (this.state !== 'SWINGING') return;
            this.state = 'IN_FLIGHT';
            this.matter.body.setVelocity(
                this.ballBody as unknown as MatterJS.BodyType,
                { x: launchVelX, y: launchVelY },
            );
            this.haptic(isPure ? [22, 30, 40] : [18]);
            this.sfx(SFX.swing, isPure ? 0.75 : 0.55);
            this.spawnSwingDust(ballX, ballY, finalAngle);
        });
    }

    /** Play the 9-frame Pixellab swing animation. Frame timing is
     *  hand-tuned so the windup (frames 0-3) takes longer, the
     *  impact (frame 6) lands at the expected moment, and the
     *  follow-through (frames 7-8) holds for the camera. PURE
     *  shots play the impact + follow-through frames in slow-mo
     *  and add the arc trail / contact flash.
     *
     *  Total wall-clock:
     *    normal: ~1330ms (deliberate, weighty)
     *    pure:   ~1740ms (impact / follow-through at 1.6x dwell)
     */
    private playOttieSwingAnim(isPure: boolean) {
        const baseScale = 0.42;
        this.tweens.killTweensOf(this.ottie);
        this.cancelSwingFrameTimers();

        // The frames bake in the body rotation, so zero out any
        // residual windup angle from AIMING and lock scale to base.
        this.ottie.setAngle(0).setScale(baseScale);

        // Per-frame dwell time. Slower across the board so the
        // swing reads as deliberate rather than flickering past.
        const frameMs = (frameIdx: number): number => {
            // Base curve weights the takeaway + top + finish so the
            // body language reads; impact stays comparatively quick.
            const base = [180, 165, 165, 150, 115, 95, 95, 175, 195][frameIdx];
            // PURE further slows the contact + follow-through.
            if (isPure && frameIdx >= 4 && frameIdx <= 8) return Math.round(base * 1.6);
            return base;
        };

        let cumMs = 0;
        for (let i = 0; i < SWING_FRAME_COUNT; i++) {
            const frameIdx = i;
            const fireAt = cumMs;
            const timer = this.time.delayedCall(fireAt, () => {
                this.ottie.setTexture(TEX.swingFrame(frameIdx));
                // PURE: spawn the arc fan just as the downswing kicks in
                if (isPure && frameIdx === 4) this.spawnSwingArc();
                // Contact frame: small scale pop on PURE
                if (frameIdx === SWING_IMPACT_FRAME && isPure) {
                    this.spawnSwingFlash();
                    this.tweens.add({
                        targets: this.ottie,
                        scale: { from: baseScale * 1.18, to: baseScale },
                        duration: 180, ease: 'Sine.easeOut',
                    });
                }
            });
            this.swingFrameTimers.push(timer);
            cumMs += frameMs(frameIdx);
        }

        // After the final frame's dwell, ease back to the static
        // ready texture so any idle bob picks up cleanly.
        const settleTimer = this.time.delayedCall(cumMs, () => {
            this.ottie.setTexture(TEX.ottie);
            this.ottie.setAngle(0).setScale(baseScale);
        });
        this.swingFrameTimers.push(settleTimer);
    }

    private cancelSwingFrameTimers() {
        for (const t of this.swingFrameTimers) {
            try { t.remove(false); } catch { /* ignore */ }
        }
        this.swingFrameTimers = [];
    }

    /** Curved motion arc behind Ottie for PURE shots: three thin
     *  cream lines fanning along the swing path, each fading and
     *  drifting upward over ~480ms. */
    private spawnSwingArc() {
        const ox = this.ottie.x;
        const oy = this.ottie.y;
        for (let i = 0; i < 3; i++) {
            const offset = (i - 1) * 6;
            const arc = this.add.graphics().setDepth(16);
            arc.lineStyle(2, 0xFFF8E7, 0.7);
            arc.beginPath();
            arc.moveTo(ox - 18, oy + 6 + offset);
            // Quadratic curve over Ottie's head simulating the swing path
            const c1x = ox - 4 + offset * 0.5;
            const c1y = oy - 22;
            const c2x = ox + 18;
            const c2y = oy + 4 + offset;
            arc.lineTo(c1x, c1y);
            arc.lineTo(c2x, c2y);
            arc.strokePath();
            this.tweens.add({
                targets: arc,
                alpha: 0,
                y: arc.y - 14,
                duration: 380 + i * 60,
                ease: 'Quad.easeOut',
                onComplete: () => arc.destroy(),
            });
        }
    }

    /** Bright gold flash at Ottie's swing point at PURE contact. */
    private spawnSwingFlash() {
        const flash = this.add.circle(this.ottie.x + 6, this.ottie.y - 4, 18, 0xFFD56E, 0.85).setDepth(17);
        this.tweens.add({
            targets: flash,
            scale: 2.6, alpha: 0,
            duration: 320, ease: 'Quad.easeOut',
            onComplete: () => flash.destroy(),
        });
    }

    /** Smooth Ottie's aim windup: while the player drags, lerp his
     *  angle from 0 to a max windup based on pull strength. Called
     *  from drawAimGuide each AIMING frame. Subtle (max -12deg)
     *  because the real recoil happens at release. */
    private updateAimWindup(tNorm: number) {
        if (!this.ottie) return;
        const maxLean = -12;
        const target = maxLean * Math.min(1, tNorm);
        // Lerp toward target so it doesn't snap.
        const cur = this.ottie.angle;
        const next = cur + (target - cur) * 0.18;
        this.ottie.setAngle(next);
    }

    /** Soft-reset Ottie's angle back to upright when the player
     *  cancels an aim (drag too short / two-finger pan interception)
     *  so he doesn't stay leaning back. */
    private resetOttiePoseToIdle() {
        if (!this.ottie) return;
        this.tweens.add({
            targets: this.ottie,
            angle: 0,
            duration: 220,
            ease: 'Sine.easeOut',
        });
    }

    private drawAimGuide() {
        this.aimGfx.clear();
        const pullX = this.dragCurrent.x - this.dragOrigin.x;
        const pullY = this.dragCurrent.y - this.dragOrigin.y;
        const pullMag = Math.hypot(pullX, pullY);
        if (pullMag < SWING.minDragPx) return;

        const clamped = Math.min(pullMag, SWING.maxDragPx);
        const tNorm = clamped / SWING.maxDragPx;
        const baseAngle = Math.atan2(-pullY / pullMag, -pullX / pullMag);
        const oscAngle = baseAngle + this.currentHoldOscRad();

        const bx = this.ballBody.position.x;
        const by = this.ballBody.position.y;
        const club = CLUBS[this.currentClub];
        const zone = this.powerZone(tNorm);

        // Single thin aim line: subtle, cream-coloured, regardless of
        // zone. Players learn the timing through repetition and the
        // sweet-spot pulse below, not by reading a colored bar.
        const endX = bx + Math.cos(oscAngle) * clamped;
        const endY = by + Math.sin(oscAngle) * clamped;
        this.aimGfx.lineStyle(2, 0xFFF8E7, 0.55);
        this.aimGfx.beginPath();
        this.aimGfx.moveTo(bx, by);
        this.aimGfx.lineTo(endX, endY);
        this.aimGfx.strokePath();

        // 4 fading trajectory dots that commit to direction without
        // revealing exact landing. Dots get smaller and more
        // transparent toward the tip.
        const dotCount = 4;
        for (let i = 1; i <= dotCount; i++) {
            const t = i / (dotCount + 1);
            const dx = bx + Math.cos(oscAngle) * clamped * t;
            const dy = by + Math.sin(oscAngle) * clamped * t;
            const a = 0.7 * (1 - t * 0.6);
            const r = 3 - t * 1.4;
            this.aimGfx.fillStyle(0xFFF8E7, a);
            this.aimGfx.fillCircle(dx, dy, r);
        }

        // Subtle pulse marker at the center of the sweet zone. This
        // is the only visible signal of where to release. Pulses at
        // a steady 1.2 Hz; intensity gently lifts when the current
        // pull is INSIDE the sweet zone (haptic tick handles the
        // crossing event).
        const sweetCenter = (club.sweetMin + club.sweetMax) / 2 * SWING.maxDragPx;
        const mx = bx + Math.cos(oscAngle) * sweetCenter;
        const my = by + Math.sin(oscAngle) * sweetCenter;
        const pulse = 0.55 + 0.35 * Math.sin(this.time.now * 0.008);
        const inSweet = zone === 'sweet';
        const markerR = 6 + (inSweet ? 4 : 2) * pulse;
        const markerA = (inSweet ? 0.85 : 0.55) * pulse;
        this.aimGfx.fillStyle(0xFFF8E7, markerA * 0.4);
        this.aimGfx.fillCircle(mx, my, markerR + 3);
        this.aimGfx.fillStyle(0xFFF8E7, markerA);
        this.aimGfx.fillCircle(mx, my, markerR);

        // Haptic tick when crossing into / out of the sweet zone.
        // Single short vibration, lets the hand learn the threshold.
        if (zone === 'sweet' && this.lastAimZone !== 'sweet') {
            this.haptic([10]);
        }
        this.lastAimZone = zone;

        // Subtle Ottie windup lean: stronger pull = deeper lean back.
        this.updateAimWindup(tNorm);
    }

    private drawTrail() {
        const now = this.time.now;
        const LIFETIME = 600;
        this.trail = this.trail.filter(p => now - p.t < LIFETIME);
        this.trailGfx.clear();
        for (const p of this.trail) {
            const age = (now - p.t) / LIFETIME;
            const alpha = 1 - age;
            const r = COURSE.ballRadius * 0.55 * (1 - age);
            this.trailGfx.fillStyle(COLORS.ballTrail, alpha * 0.5);
            this.trailGfx.fillCircle(p.x, p.y, r);
        }
    }

    // ─── Hole completion / OOB ────────────────────────────────────

    private sinkBall() {
        this.holeSunk = true;
        this.pendingGrade = null;
        this.haptic([30, 50, 30, 50, 60]);
        this.sfx(SFX.cupRattle, 0.5);
        this.time.delayedCall(220, () => this.sfx(SFX.sink, 0.65));
        this.matter.body.setVelocity(this.ballBody as unknown as MatterJS.BodyType, { x: 0, y: 0 });
        this.matter.body.setPosition(this.ballBody as unknown as MatterJS.BodyType, { x: HOLE_WORLD.x, y: HOLE_WORLD.y }, false);
        this.trail = [];
        this.trailGfx.clear();
        this.ottie.setTexture(TEX.ottie);
        this.moveOttieToBall(HOLE_WORLD.x, HOLE_WORLD.y);

        const diff = this.strokes - ACTIVE_HOLE.par;
        const verdict =
            diff <= -2 ? 'eagle!' :
            diff === -1 ? 'birdie' :
            diff === 0  ? 'par'    :
            diff === 1  ? 'bogey'  :
                          `+${diff}`;
        const verdictColor =
            diff <  0 ? '#4A9D5D' :
            diff === 0 ? '#3A2814' :
            diff === 1 ? '#C18B3A' :
                         '#C8543A';
        const subtitle =
            diff <= -2 ? 'kayyyy!!' :
            diff === -1 ? 'kayyyy' :
            diff === 0  ? 'kay.'   :
            diff === 1  ? 'kay…'   :
                          '…kay';

        // Cup-rattle beat: tiny bounce of the ball inside the cup, then
        // it disappears. Gives the sink its 'ohhhh' moment instead of
        // jumping straight to the overlay.
        this.tweens.add({
            targets: this.ballSprite,
            scale: { from: 1, to: 0.4 },
            x: HOLE_WORLD.x,
            y: HOLE_WORLD.y,
            duration: 280,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.ballSprite.setVisible(false);
                this.ballShadow.setVisible(false);
            },
        });

        // Variable celebration. Eagle gets confetti + ottie spin;
        // birdie gets a small particle ring; par gets a calm dust puff;
        // worse gets nothing.
        this.playSinkCelebration(diff);

        // Wait for the rattle before opening the React ShareCard so
        // the celebration plays in clear air.
        this.time.delayedCall(480, () => {
            EventBus.emit('ball-sunk', this.strokes);
            this.showSinkOverlay(verdict, verdictColor, subtitle);
        });
    }

    private playSinkCelebration(diff: number) {
        const cx = HOLE_WORLD.x;
        const cy = HOLE_WORLD.y;

        if (diff <= -2) {
            // Eagle: confetti burst + ottie spin
            this.spawnConfetti(cx, cy, 26, 1.0);
            this.tweens.add({
                targets: this.ottie,
                angle: { from: 0, to: 360 },
                duration: 700,
                ease: 'Cubic.easeOut',
                onComplete: () => this.ottie.setAngle(0),
            });
        } else if (diff === -1) {
            // Birdie: smaller confetti burst
            this.spawnConfetti(cx, cy, 14, 0.85);
        } else if (diff === 0) {
            // Par: small soft particle ring
            this.spawnConfetti(cx, cy, 8, 0.65);
        }
        // Bogey or worse: no celebration (the verdict speaks for itself)
    }

    // ─── Contact grading + cinematic shot moments ────────────────

    /** Five-step contact quality used to pop a grade label and decide
     *  whether the shot earns the PURE cinematic treatment. */
    private gradeContact(
        zone: 'under' | 'sweet' | 'over',
        tNorm: number,
        holdMs: number,
        heckleApplied: number,
    ): { label: string; color: string; isPure: boolean; cause: string } {
        let score = 0;
        const reasons: string[] = [];

        // Power zone is the biggest signal.
        if (zone === 'sweet') { score += 3; }
        else if (zone === 'over') { score -= 2; reasons.push('over-pull'); }
        else { score += tNorm > 0.5 ? 1 : -1; reasons.push('under power'); }

        // Hold-drift cost.
        const grace = SWING.holdGraceMs;
        if (holdMs > grace + 1100) { score -= 2; reasons.push('held too long'); }
        else if (holdMs > grace + 400) { score -= 1; reasons.push('slight hold drift'); }

        // Heckle interference.
        if (heckleApplied >= 60) { score -= 2; reasons.push('heckled hard'); }
        else if (heckleApplied >= 25) { score -= 1; reasons.push('heckled'); }

        const pct = Math.round(tNorm * 100);

        if (zone === 'sweet' && score >= 3) {
            return { label: 'PURE', color: '#FFD56E', isPure: true, cause: `${pct}% · sweet zone` };
        }
        if (zone === 'sweet') {
            return { label: 'CLEAN', color: '#73C47B', isPure: false, cause: reasons[0] ?? `${pct}% · sweet zone` };
        }
        if (zone === 'under') {
            return score >= 0
                ? { label: 'THIN', color: '#E8922A', isPure: false, cause: `only ${pct}% power` }
                : { label: 'FAT',  color: '#857060', isPure: false, cause: reasons.join(' · ') || `only ${pct}% power` };
        }
        return { label: 'SHANKED', color: '#C8543A', isPure: false, cause: reasons.join(' · ') || `${pct}% · over-pull` };
    }

    /** Pop a grade label at screen-center plus a one-line cause
     *  subtitle so the player learns what drove the verdict. */
    private showContactGrade(label: string, color: string, isPure: boolean, cause: string) {
        const w = this.scale.width;
        const h = this.scale.height;
        const startScale = isPure ? 1.6 : 1.1;
        const text = this.add.text(w / 2, h * 0.42, label, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: isPure ? '46px' : '34px',
            color, fontStyle: 'bold',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1450)
            .setAlpha(0).setScale(startScale);
        text.setStroke('#1A1A1A', isPure ? 8 : 6);
        text.setShadow(0, 4, '#1A1A1A', 8, true, true);

        const sub = this.add.text(w / 2, h * 0.42 + (isPure ? 36 : 28), cause, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '13px',
            color: '#FFF8E7',
            fontStyle: 'italic',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1450).setAlpha(0);
        sub.setStroke('#1A1A1A', 4);

        this.tweens.add({
            targets: text, alpha: 1, scale: 1,
            duration: 180, ease: 'Back.easeOut',
            onComplete: () => {
                this.tweens.add({
                    targets: text,
                    alpha: 0,
                    y: text.y - 30,
                    delay: 480,
                    duration: 400,
                    ease: 'Cubic.easeIn',
                    onComplete: () => text.destroy(),
                });
            },
        });
        this.tweens.add({
            targets: sub, alpha: 1,
            delay: 100, duration: 200,
            onComplete: () => {
                this.tweens.add({
                    targets: sub, alpha: 0,
                    delay: 500, duration: 400,
                    onComplete: () => sub.destroy(),
                });
            },
        });
    }

    /** Cup-approach slow-mo: when the ball coasts into striking range
     *  of the cup, drop time scale for the 'will it' beat. Camera
     *  zooms in slightly on the cup so the framing matches the
     *  emotional weight. */
    private triggerCupApproachSlowMo() {
        const cam = this.cameras.main;
        const baseZoom = cam.zoom;
        const physWorld = this.matter.world as unknown as { engine: { timing: { timeScale: number } } };
        const baseEngineTs = physWorld.engine.timing.timeScale;
        const baseSceneTs = this.time.timeScale;

        this.time.timeScale = 0.45;
        physWorld.engine.timing.timeScale = 0.45;
        cam.zoomTo(baseZoom * 1.12, 220, 'Sine.easeInOut');

        // Real-time restore so the slowed timeScale doesn't extend
        // the wall-clock duration.
        window.setTimeout(() => {
            this.time.timeScale = baseSceneTs;
            physWorld.engine.timing.timeScale = baseEngineTs;
            cam.zoomTo(baseZoom, 280, 'Sine.easeInOut');
        }, 520);
    }

    /** Telegraph the bad-moment. When the player is holding past the
     *  grace window, draw a pulsing red vignette on the screen edge
     *  and jitter Ottie's stance. Both effects scale with how far
     *  past the grace window we are. */
    private updateBadMomentTelegraph(holdMs: number) {
        const grace = SWING.holdGraceMs;
        if (holdMs <= grace) {
            this.clearEdgeWarning();
            return;
        }
        const over = holdMs - grace;
        const intensity = Math.min(1, over / 1400);
        this.edgeWarningPhase += 0.18;
        const pulse = 0.5 + 0.5 * Math.sin(this.edgeWarningPhase);
        const alpha = intensity * (0.35 + 0.25 * pulse);

        if (!this.edgeWarning) {
            this.edgeWarning = this.add.graphics().setDepth(1300).setScrollFactor(0);
        }
        const w = this.scale.width;
        const h = this.scale.height;
        const band = 28 + 16 * intensity;
        this.edgeWarning.clear();
        this.edgeWarning.fillStyle(0xC8543A, alpha);
        this.edgeWarning.fillRect(0, 0, w, band);
        this.edgeWarning.fillRect(0, h - band, w, band);
        this.edgeWarning.fillRect(0, 0, band, h);
        this.edgeWarning.fillRect(w - band, 0, band, h);

        // Ottie nervous jitter rises with intensity.
        if (this.ottie) {
            const j = 1.5 * intensity;
            this.ottie.setPosition(
                this.ottieIdleAnchor.x + (Math.random() - 0.5) * 2 * j,
                this.ottieIdleAnchor.y + (Math.random() - 0.5) * 2 * j,
            );
        }
    }

    private clearEdgeWarning() {
        if (this.edgeWarning) {
            this.edgeWarning.clear();
            this.edgeWarning.destroy();
            this.edgeWarning = undefined;
        }
        // Snap Ottie back to his idle anchor so the jitter does not
        // linger after the player releases.
        if (this.ottie && this.ottieIdleAnchor.x !== 0) {
            this.ottie.setPosition(this.ottieIdleAnchor.x, this.ottieIdleAnchor.y);
        }
    }

    /** Small dust puff behind the ball at swing release. Sells the
     *  'whump' of contact and gives the ball a sense of leaving
     *  something behind. */
    private spawnSwingDust(cx: number, cy: number, angle: number) {
        const back = angle + Math.PI;
        for (let i = 0; i < 6; i++) {
            const spread = (Math.random() - 0.5) * 0.9;
            const a = back + spread;
            const dist = 6 + Math.random() * 14;
            const size = 3 + Math.random() * 4;
            const puff = this.add.circle(cx, cy, size, 0xFFF8E7, 0.7).setDepth(19);
            this.tweens.add({
                targets: puff,
                x: cx + Math.cos(a) * dist,
                y: cy + Math.sin(a) * dist,
                alpha: 0,
                scale: { from: 1, to: 0.4 },
                duration: 320 + Math.random() * 180,
                ease: 'Quad.easeOut',
                onComplete: () => puff.destroy(),
            });
        }
    }

    private spawnConfetti(cx: number, cy: number, count: number, intensity: number) {
        const colors = [0xE8922A, 0x4A9D5D, 0xFFD56E, 0x6FB1C9, 0xC8543A, 0xFFF8E7];
        for (let i = 0; i < count; i++) {
            const color = colors[i % colors.length];
            const piece = this.add.rectangle(cx, cy, 5, 8, color, 1).setDepth(950);
            const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
            const speed = (50 + Math.random() * 90) * intensity;
            const driftX = Math.cos(angle) * speed;
            const driftY = Math.sin(angle) * speed - 40 * intensity;
            this.tweens.add({
                targets: piece,
                x: cx + driftX,
                y: cy + driftY + 80 * intensity,
                angle: 720 * (Math.random() < 0.5 ? -1 : 1),
                alpha: { from: 1, to: 0 },
                duration: 850 + Math.random() * 400,
                ease: 'Quad.easeIn',
                onComplete: () => piece.destroy(),
            });
        }
    }

    private showSinkOverlay(verdict: string, verdictColor: string, subtitle: string) {
        const w = this.scale.width;
        const h = this.scale.height;
        const container = this.add.container(0, 0).setDepth(1000).setScrollFactor(0);

        const backdrop = this.add.rectangle(0, 0, w, h, 0x1A1A1A, 0.5).setOrigin(0, 0).setScrollFactor(0);
        container.add(backdrop);

        const cardW = 300;
        const cardH = 200;
        const cardX = (w - cardW) / 2;
        const cardY = (h - cardH) / 2;
        const cardShadow = this.add.graphics().setScrollFactor(0);
        cardShadow.fillStyle(0x000000, 0.25);
        cardShadow.fillRoundedRect(cardX + 3, cardY + 6, cardW, cardH, 18);
        container.add(cardShadow);

        const card = this.add.graphics().setScrollFactor(0);
        card.fillStyle(0xFFF8E7, 1);
        card.fillRoundedRect(cardX, cardY, cardW, cardH, 18);
        card.lineStyle(2, 0xE8922A, 0.85);
        card.strokeRoundedRect(cardX, cardY, cardW, cardH, 18);
        container.add(card);

        container.add(this.add.text(w / 2, cardY + 28, 'SUNK', {
            fontFamily: 'system-ui, sans-serif', fontSize: '11px',
            color: '#A68B6D', fontStyle: 'bold',
        }).setOrigin(0.5).setScrollFactor(0));
        container.add(this.add.text(w / 2, cardY + 70, verdict, {
            fontFamily: 'system-ui, sans-serif', fontSize: '32px',
            color: verdictColor, fontStyle: 'bold',
        }).setOrigin(0.5).setScrollFactor(0));
        container.add(this.add.text(w / 2, cardY + 110, `${this.strokes} stroke${this.strokes === 1 ? '' : 's'} · par ${ACTIVE_HOLE.par}`, {
            fontFamily: 'system-ui, sans-serif', fontSize: '14px',
            color: '#3A2814',
        }).setOrigin(0.5).setScrollFactor(0));
        container.add(this.add.text(w / 2, cardY + 140, subtitle, {
            fontFamily: 'system-ui, sans-serif', fontSize: '15px',
            color: '#E8922A', fontStyle: 'italic',
        }).setOrigin(0.5).setScrollFactor(0));
        container.add(this.add.text(w / 2, cardY + 175, 'tap to replay', {
            fontFamily: 'system-ui, sans-serif', fontSize: '12px',
            color: '#A68B6D', fontStyle: 'italic',
        }).setOrigin(0.5).setScrollFactor(0));

        this.sinkOverlay = container;
    }

    private handleOutOfBounds() {
        this.pendingGrade = null;
        this.matter.body.setVelocity(this.ballBody as unknown as MatterJS.BodyType, { x: 0, y: 0 });
        this.matter.body.setPosition(this.ballBody as unknown as MatterJS.BodyType, { x: TEE_WORLD.x, y: TEE_WORLD.y }, false);
        this.strokes += 1;
        this.state = 'IDLE';
        this.ottie.setTexture(TEX.ottie);
        this.moveOttieToBall(TEE_WORLD.x, TEE_WORLD.y, true);
        EventBus.emit('strokes-changed', this.strokes);
        EventBus.emit('distance-to-pin', this.computeDistanceToPin());

        this.oobIndicator?.destroy();
        this.oobIndicator = this.add.text(
            this.scale.width / 2, 60,
            'out of bounds · +1', {
                fontFamily: 'system-ui, sans-serif', fontSize: '16px',
                color: '#FFF8E7', backgroundColor: '#C8543A',
                padding: { x: 12, y: 6 },
            },
        ).setOrigin(0.5).setScrollFactor(0).setDepth(900);
        this.oobIndicatorHideAt = this.time.now + 1600;
    }

    private resetHole() {
        this.waterHazardsThisHole = 0;
        this.matter.body.setVelocity(this.ballBody as unknown as MatterJS.BodyType, { x: 0, y: 0 });
        this.matter.body.setPosition(this.ballBody as unknown as MatterJS.BodyType, { x: TEE_WORLD.x, y: TEE_WORLD.y }, false);
        this.ballSprite.setVisible(true);
        this.ballShadow.setVisible(true);
        this.trail = [];
        this.trailGfx.clear();
        this.strokes = 0;
        this.holeSunk = false;
        this.state = 'IDLE';
        this.sinkOverlay?.destroy();
        this.sinkOverlay = undefined;
        this.zoomToOverview();
        this.drawAimHint();
        EventBus.emit('strokes-changed', this.strokes);
        EventBus.emit('distance-to-pin', this.computeDistanceToPin());
    }

    private computeDistanceToPin(): number {
        const px = Math.hypot(
            this.ballBody.position.x - HOLE_WORLD.x,
            this.ballBody.position.y - HOLE_WORLD.y,
        );
        return Math.round(px / PX_PER_YARD);
    }
}
