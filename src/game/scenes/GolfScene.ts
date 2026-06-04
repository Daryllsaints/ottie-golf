// Day 5 GolfScene — PPG-fidelity tile-based renderer with scrolling
// camera. Course is built from Pixellab Wang tilesets (ocean→grass,
// grass→sand, grass→green). Trees scatter along the rough edges.
// Camera follows the ball.

import { Scene } from 'phaser';
import { SWING, BALL_PHYSICS, HOLE_1_PAR, COLORS, COURSE } from '../constants';
import { EventBus } from '../EventBus';
import {
    Terrain, TILE_PX, GRID_COLS, GRID_ROWS, WORLD_W, WORLD_H,
    TEE_WORLD, HOLE_WORLD,
    buildTerrainGrid, cornerPattern, generateTreePositions,
} from '../terrain';

type SwingState = 'IDLE' | 'AIMING' | 'IN_FLIGHT';
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
    oceanGrass: 'ts-ocean-grass',
    grassSand:  'ts-grass-sand',
    grassGreen: 'ts-grass-green',
    tree:       'tree',
    ottie:      'ottie-ready',
    ottieSwing: 'ottie-swing',
} as const;

const JSON_KEY = {
    oceanGrass: 'jsts-ocean-grass',
    grassSand:  'jsts-grass-sand',
    grassGreen: 'jsts-grass-green',
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
    private wangOceanGrass!: WangSet;
    private wangGrassSand!:  WangSet;
    private wangGrassGreen!: WangSet;

    constructor() { super('GolfScene'); }

    preload() {
        // Wang tileset PNGs + metadata JSONs
        this.load.image(TEX.oceanGrass, '/tiles/ocean-grass.png');
        this.load.image(TEX.grassSand,  '/tiles/grass-sand.png');
        this.load.image(TEX.grassGreen, '/tiles/grass-green.png');
        this.load.json(JSON_KEY.oceanGrass, '/tiles/ocean-grass.json');
        this.load.json(JSON_KEY.grassSand,  '/tiles/grass-sand.json');
        this.load.json(JSON_KEY.grassGreen, '/tiles/grass-green.json');
        // Sprites
        this.load.image(TEX.tree,       '/sprites/tree.png');
        this.load.image(TEX.ottie,      '/sprites/ottie-ready.png');
        this.load.image(TEX.ottieSwing, '/sprites/ottie-swing.png');
    }

    create() {
        // World + camera bounds
        this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
        this.matter.world.setBounds(0, 0, WORLD_W, WORLD_H);

        // Register Wang tileset frames + build pattern lookups
        this.wangOceanGrass = this.buildWangSet(TEX.oceanGrass, JSON_KEY.oceanGrass);
        this.wangGrassSand  = this.buildWangSet(TEX.grassSand,  JSON_KEY.grassSand);
        this.wangGrassGreen = this.buildWangSet(TEX.grassGreen, JSON_KEY.grassGreen);

        // Build terrain grid + render the course
        this.grid = buildTerrainGrid();
        this.drawCourse();
        this.drawTrees();
        this.drawHole();
        this.placeOttie();
        this.placeBall();

        // Camera follows ball, slight smoothing
        this.cameras.main.startFollow(this.ballSprite, true, 0.08, 0.08);

        this.aimGfx = this.add.graphics().setDepth(500);

        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
        this.input.on('pointerup',   (p: Phaser.Input.Pointer) => this.onPointerUp(p));
        this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onPointerUp(p));

        EventBus.emit('current-scene-ready', this);
        EventBus.emit('strokes-changed', this.strokes);
        EventBus.emit('distance-to-pin', this.computeDistanceToPin());
    }

    update(_t: number, _dt: number) {
        const bx = this.ballBody.position.x;
        const by = this.ballBody.position.y;
        this.ballSprite.setPosition(bx, by);
        this.ballShadow.setPosition(bx + 1, by + 3);

        if (this.state === 'IN_FLIGHT' && !this.holeSunk) {
            this.trail.push({ x: bx, y: by, t: this.time.now });
        }
        this.drawTrail();

        if (this.state === 'AIMING') this.drawAimGuide();

        if (this.oobIndicator && this.time.now > this.oobIndicatorHideAt) {
            this.oobIndicator.destroy();
            this.oobIndicator = undefined;
        }

        if (this.state === 'IN_FLIGHT' && !this.holeSunk) {
            // Sink detection
            const distToHole = Math.hypot(bx - HOLE_WORLD.x, by - HOLE_WORLD.y);
            if (distToHole < COURSE.holeRadius + 2) { this.sinkBall(); return; }

            // OOB: ball outside world rect (matter world bounds will
            // bounce it; this is a softer respawn for clean UX)
            if (bx < 0 || bx > WORLD_W || by < 0 || by > WORLD_H) {
                this.handleOutOfBounds(); return;
            }

            const v = (this.ballBody as unknown as { velocity: { x: number; y: number } }).velocity;
            const speed = Math.hypot(v.x, v.y);
            if (speed < SWING.restSpeedThreshold) {
                this.matter.body.setVelocity(this.ballBody as unknown as MatterJS.BodyType, { x: 0, y: 0 });
                this.state = 'IDLE';
                this.ottie.setTexture(TEX.ottie);
                this.trail = [];
                this.trailGfx.clear();
                this.startOttieIdleBob();
                EventBus.emit('distance-to-pin', this.computeDistanceToPin());
            }
        }
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
        for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
                const [tl, tr, br, bl] = cornerPattern(this.grid, col, row);
                const cx = col * TILE_PX + TILE_PX / 2;
                const cy = row * TILE_PX + TILE_PX / 2;

                // Layer 1 — ocean (lower) → grass (upper). Renders for every cell.
                const t1 = (t: Terrain): 'lower' | 'upper' => t === 'ocean' ? 'lower' : 'upper';
                const frame1 = this.pickFrame(this.wangOceanGrass, t1(tl), t1(tr), t1(br), t1(bl));
                this.add.image(cx, cy, TEX.oceanGrass, frame1).setDepth(0);

                // Layer 2 — grass (lower) → sand (upper). Skip cells with no sand corners.
                if (tl === 'sand' || tr === 'sand' || br === 'sand' || bl === 'sand') {
                    const t2 = (t: Terrain): 'lower' | 'upper' => t === 'sand' ? 'upper' : 'lower';
                    const frame2 = this.pickFrame(this.wangGrassSand, t2(tl), t2(tr), t2(br), t2(bl));
                    this.add.image(cx, cy, TEX.grassSand, frame2).setDepth(1);
                }

                // Layer 3 — grass (lower) → green (upper). Skip cells with no green corners.
                if (tl === 'green' || tr === 'green' || br === 'green' || bl === 'green') {
                    const t3 = (t: Terrain): 'lower' | 'upper' => t === 'green' ? 'upper' : 'lower';
                    const frame3 = this.pickFrame(this.wangGrassGreen, t3(tl), t3(tr), t3(br), t3(bl));
                    this.add.image(cx, cy, TEX.grassGreen, frame3).setDepth(2);
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
        // Cup
        this.add.circle(HOLE_WORLD.x, HOLE_WORLD.y, COURSE.holeRadius, COLORS.hole, 1).setDepth(10);
        // Flag pole + flag
        const pole = this.add.graphics().setDepth(11);
        pole.lineStyle(2, 0xF0EAD2, 1);
        pole.beginPath();
        pole.moveTo(HOLE_WORLD.x, HOLE_WORLD.y);
        pole.lineTo(HOLE_WORLD.x, HOLE_WORLD.y - 28);
        pole.strokePath();
        pole.fillStyle(0xC8543A, 1);
        pole.fillTriangle(
            HOLE_WORLD.x, HOLE_WORLD.y - 28,
            HOLE_WORLD.x + 16, HOLE_WORLD.y - 24,
            HOLE_WORLD.x, HOLE_WORLD.y - 18,
        );
    }

    private placeOttie() {
        this.ottie = this.add.image(
            TEE_WORLD.x - 22, TEE_WORLD.y - 4,
            TEX.ottie,
        ).setOrigin(0.5, 0.85).setDepth(15).setScale(0.3);
        this.startOttieIdleBob();
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
            scaleX: 0.32,
            scaleY: 0.28,
            duration: 1400,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
        });
    }

    private stopOttieIdleBob() {
        this.ottieIdleTween?.stop();
        this.ottieIdleTween = undefined;
        this.ottie.setScale(0.3);
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
        if (tNorm < SWING.sweetSpotMin) return 'under';
        if (tNorm <= SWING.sweetSpotMax) return 'sweet';
        return 'over';
    }

    // ─── Input ────────────────────────────────────────────────────

    private onPointerDown(p: Phaser.Input.Pointer) {
        if (this.holeSunk) { this.resetHole(); return; }
        if (this.state !== 'IDLE') return;
        const bx = this.ballBody.position.x;
        const by = this.ballBody.position.y;
        const d = Math.hypot(p.worldX - bx, p.worldY - by);
        if (d > SWING.hitRadiusPx) return;
        this.state = 'AIMING';
        this.dragOrigin = { x: bx, y: by };
        this.dragCurrent = { x: p.worldX, y: p.worldY };
        this.dragStartMs = this.time.now;
        this.drawAimGuide();
    }

    private onPointerMove(p: Phaser.Input.Pointer) {
        if (this.state !== 'AIMING') return;
        this.dragCurrent = { x: p.worldX, y: p.worldY };
        this.drawAimGuide();
    }

    private onPointerUp(_p: Phaser.Input.Pointer) {
        if (this.state !== 'AIMING') return;

        const pullX = this.dragCurrent.x - this.dragOrigin.x;
        const pullY = this.dragCurrent.y - this.dragOrigin.y;
        const pullMag = Math.hypot(pullX, pullY);

        this.aimGfx.clear();

        if (pullMag < SWING.minDragPx) { this.state = 'IDLE'; return; }

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
            powerMul = SWING.overpowerPenalty;
            const jitterRad = (Math.random() - 0.5) * 2 * SWING.overpowerJitterDeg * Math.PI / 180;
            finalAngle += jitterRad;
        }

        const speed = powerMul * SWING.maxSpeed;
        this.matter.body.setVelocity(
            this.ballBody as unknown as MatterJS.BodyType,
            { x: Math.cos(finalAngle) * speed, y: Math.sin(finalAngle) * speed },
        );

        this.state = 'IN_FLIGHT';
        this.strokes += 1;
        EventBus.emit('strokes-changed', this.strokes);
        this.stopOttieIdleBob();
        this.ottie.setTexture(TEX.ottieSwing);
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
        const endX = this.dragOrigin.x + Math.cos(oscAngle) * clamped;
        const endY = this.dragOrigin.y + Math.sin(oscAngle) * clamped;

        const zone = this.powerZone(tNorm);
        const color =
            zone === 'sweet' ? COLORS.aimGuideSweet :
            zone === 'over'  ? COLORS.aimGuideOver  :
                               COLORS.aimGuideUnder;

        this.aimGfx.lineStyle(3, color, 0.95);
        this.aimGfx.beginPath();
        this.aimGfx.moveTo(this.dragOrigin.x, this.dragOrigin.y);
        this.aimGfx.lineTo(endX, endY);
        this.aimGfx.strokePath();

        const dotCount = 6;
        for (let i = 1; i <= dotCount; i++) {
            const t = i / (dotCount + 1);
            const dx = this.dragOrigin.x + Math.cos(oscAngle) * clamped * t;
            const dy = this.dragOrigin.y + Math.sin(oscAngle) * clamped * t;
            this.aimGfx.fillStyle(color, 0.7);
            this.aimGfx.fillCircle(dx, dy, 2);
        }

        const perpX = -Math.sin(baseAngle);
        const perpY =  Math.cos(baseAngle);
        const tickLen = 8;
        this.aimGfx.lineStyle(2, COLORS.aimGuideSweet, 0.85);
        for (const tFrac of [SWING.sweetSpotMin, SWING.sweetSpotMax]) {
            const tx = this.dragOrigin.x + Math.cos(baseAngle) * tFrac * SWING.maxDragPx;
            const ty = this.dragOrigin.y + Math.sin(baseAngle) * tFrac * SWING.maxDragPx;
            this.aimGfx.beginPath();
            this.aimGfx.moveTo(tx - perpX * tickLen, ty - perpY * tickLen);
            this.aimGfx.lineTo(tx + perpX * tickLen, ty + perpY * tickLen);
            this.aimGfx.strokePath();
        }
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
        this.matter.body.setVelocity(this.ballBody as unknown as MatterJS.BodyType, { x: 0, y: 0 });
        this.matter.body.setPosition(this.ballBody as unknown as MatterJS.BodyType, { x: HOLE_WORLD.x, y: HOLE_WORLD.y }, false);
        this.ballSprite.setVisible(false);
        this.ballShadow.setVisible(false);
        this.trail = [];
        this.trailGfx.clear();
        this.ottie.setTexture(TEX.ottie);
        this.startOttieIdleBob();

        const diff = this.strokes - HOLE_1_PAR;
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

        this.showSinkOverlay(verdict, verdictColor, subtitle);
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
        container.add(this.add.text(w / 2, cardY + 110, `${this.strokes} stroke${this.strokes === 1 ? '' : 's'} · par ${HOLE_1_PAR}`, {
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
        this.matter.body.setVelocity(this.ballBody as unknown as MatterJS.BodyType, { x: 0, y: 0 });
        this.matter.body.setPosition(this.ballBody as unknown as MatterJS.BodyType, { x: TEE_WORLD.x, y: TEE_WORLD.y }, false);
        this.strokes += 1;
        this.state = 'IDLE';
        this.ottie.setTexture(TEX.ottie);
        this.startOttieIdleBob();
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
        EventBus.emit('strokes-changed', this.strokes);
        EventBus.emit('distance-to-pin', this.computeDistanceToPin());
    }

    private computeDistanceToPin(): number {
        return Math.round(Math.hypot(
            this.ballBody.position.x - HOLE_WORLD.x,
            this.ballBody.position.y - HOLE_WORLD.y,
        ));
    }
}
