import { Scene } from 'phaser';
import { COLORS, COURSE, SWING, BALL_PHYSICS, HOLE_1 } from '../constants';
import { EventBus } from '../EventBus';

// Day 3: hand-crafted course diorama. Drag-back gesture from Day 2
// unchanged. Course is drawn from polygon paths in constants.ts
// (rough silhouette → fairway → green ellipse → sand bunker → trees)
// so the hole reads as a designed dogleg, not a flat field.

type SwingState = 'IDLE' | 'AIMING' | 'IN_FLIGHT';

type MatterBodyLike = { position: { x: number; y: number } };

const TEXTURE_OTTIE_READY = 'ottie-ready';
const TEXTURE_OTTIE_SWING = 'ottie-swing';

export class GolfScene extends Scene
{
    private state: SwingState = 'IDLE';
    private strokes = 0;
    private ballBody!: MatterBodyLike;
    private ballSprite!: Phaser.GameObjects.Arc;
    private ottie!: Phaser.GameObjects.Image;
    private courseOffsetX = 0;
    private courseOffsetY = 0;
    private aimGfx!: Phaser.GameObjects.Graphics;
    private dragOrigin = { x: 0, y: 0 };
    private dragCurrent = { x: 0, y: 0 };

    constructor()
    {
        super('GolfScene');
    }

    preload()
    {
        this.load.image(TEXTURE_OTTIE_READY, '/sprites/ottie-ready.png');
        this.load.image(TEXTURE_OTTIE_SWING, '/sprites/ottie-swing.png');
    }

    create()
    {
        const cx = this.scale.width  / 2;
        const cy = this.scale.height / 2;
        this.courseOffsetX = cx - COURSE.width  / 2;
        this.courseOffsetY = cy - COURSE.height / 2;

        this.drawCourse();
        this.drawHazards();
        this.drawHole();
        this.drawTrees();
        this.placeOttie();
        this.placeBall();

        this.aimGfx = this.add.graphics().setDepth(50);

        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
        this.input.on('pointerup',   (p: Phaser.Input.Pointer) => this.onPointerUp(p));
        this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onPointerUp(p));

        EventBus.emit('current-scene-ready', this);
        EventBus.emit('strokes-changed', this.strokes);
        EventBus.emit('distance-to-pin', this.computeDistanceToPin());
    }

    update()
    {
        this.ballSprite.setPosition(this.ballBody.position.x, this.ballBody.position.y);

        if (this.state === 'IN_FLIGHT')
        {
            const v = (this.ballBody as unknown as { velocity: { x: number; y: number } }).velocity;
            const speed = Math.hypot(v.x, v.y);
            if (speed < SWING.restSpeedThreshold)
            {
                this.matter.body.setVelocity(this.ballBody as unknown as MatterJS.BodyType, { x: 0, y: 0 });
                this.state = 'IDLE';
                this.ottie.setTexture(TEXTURE_OTTIE_READY);
                EventBus.emit('distance-to-pin', this.computeDistanceToPin());
            }
        }
    }

    // ─── Course rendering ──────────────────────────────────────────

    private drawCourse()
    {
        // Outer rough silhouette (slightly larger than the fairway).
        const rough = this.add.graphics();
        rough.fillStyle(COLORS.rough, 1);
        rough.beginPath();
        const r = this.translatePath(HOLE_1.roughPath);
        rough.moveTo(r[0].x, r[0].y);
        for (let i = 1; i < r.length; i++) rough.lineTo(r[i].x, r[i].y);
        rough.closePath();
        rough.fillPath();
        rough.setDepth(0);

        // Fairway — the actual playable path.
        const fair = this.add.graphics();
        fair.fillStyle(COLORS.fairway, 1);
        fair.beginPath();
        const f = this.translatePath(HOLE_1.fairwayPath);
        fair.moveTo(f[0].x, f[0].y);
        for (let i = 1; i < f.length; i++) fair.lineTo(f[i].x, f[i].y);
        fair.closePath();
        fair.fillPath();
        // Subtle inner edge for depth.
        fair.lineStyle(2, COLORS.fairwayShadow, 0.6);
        fair.strokePath();
        fair.setDepth(1);
    }

    private drawHazards()
    {
        // Sand bunker
        const sand = this.add.graphics();
        sand.fillStyle(COLORS.sand, 1);
        sand.fillEllipse(
            this.courseOffsetX + HOLE_1.sandBunker.cx,
            this.courseOffsetY + HOLE_1.sandBunker.cy,
            HOLE_1.sandBunker.rx * 2,
            HOLE_1.sandBunker.ry * 2,
        );
        sand.setDepth(2);
    }

    private drawHole()
    {
        // Putting green ellipse around the hole.
        const green = this.add.graphics();
        green.fillStyle(COLORS.green, 1);
        green.fillEllipse(
            this.courseOffsetX + HOLE_1.green.cx,
            this.courseOffsetY + HOLE_1.green.cy,
            HOLE_1.green.rx * 2,
            HOLE_1.green.ry * 2,
        );
        green.setDepth(2);

        // The cup.
        const holeX = this.courseOffsetX + COURSE.holePosition.x;
        const holeY = this.courseOffsetY + COURSE.holePosition.y;
        this.add.circle(holeX, holeY, COURSE.holeRadius, COLORS.hole, 1).setDepth(3);

        // Flag pole + flag — a simple drawn marker for now.
        const pole = this.add.graphics();
        pole.lineStyle(2, 0xF0EAD2, 1);
        pole.beginPath();
        pole.moveTo(holeX, holeY);
        pole.lineTo(holeX, holeY - 26);
        pole.strokePath();
        pole.fillStyle(0xC8543A, 1);
        pole.fillTriangle(holeX, holeY - 26, holeX + 14, holeY - 22, holeX, holeY - 16);
        pole.setDepth(4);
    }

    private drawTrees()
    {
        for (const t of HOLE_1.trees)
        {
            const x = this.courseOffsetX + t.x;
            const y = this.courseOffsetY + t.y;
            const r = 18 * t.scale;

            // Tree shadow (top-down — ellipse offset below the foliage).
            const shadow = this.add.graphics();
            shadow.fillStyle(0x000000, 0.18);
            shadow.fillEllipse(x + r * 0.3, y + r * 0.45, r * 1.6, r * 0.7);
            shadow.setDepth(5);

            // Foliage canopy (two stacked circles for a fuller silhouette).
            const tree = this.add.graphics();
            tree.fillStyle(COLORS.treeShadow, 1);
            tree.fillCircle(x + r * 0.18, y + r * 0.18, r);
            tree.fillStyle(COLORS.treeFoliage, 1);
            tree.fillCircle(x, y, r * 0.95);
            tree.setDepth(6);
        }
    }

    private placeOttie()
    {
        const ballX = this.courseOffsetX + COURSE.teePosition.x;
        const ballY = this.courseOffsetY + COURSE.teePosition.y;
        this.ottie = this.add.image(
            ballX - 28, ballY - 8,
            TEXTURE_OTTIE_READY,
        ).setOrigin(0.5, 0.85).setDepth(7).setScale(0.4);
    }

    private placeBall()
    {
        const ballX = this.courseOffsetX + COURSE.teePosition.x;
        const ballY = this.courseOffsetY + COURSE.teePosition.y;
        this.ballBody = this.matter.add.circle(ballX, ballY, COURSE.ballRadius, {
            restitution: BALL_PHYSICS.restitution,
            frictionAir: BALL_PHYSICS.frictionAir,
            density:     BALL_PHYSICS.density,
            label: 'ball',
        }) as unknown as MatterBodyLike;
        this.ballSprite = this.add.circle(ballX, ballY, COURSE.ballRadius, COLORS.ball, 1)
            .setStrokeStyle(1, 0x444444, 0.6).setDepth(20);
    }

    private translatePath(path: ReadonlyArray<{ x: number; y: number }>)
    {
        return path.map(p => ({
            x: this.courseOffsetX + p.x,
            y: this.courseOffsetY + p.y,
        }));
    }

    private computeDistanceToPin(): number
    {
        const holeX = this.courseOffsetX + COURSE.holePosition.x;
        const holeY = this.courseOffsetY + COURSE.holePosition.y;
        return Math.round(Math.hypot(
            this.ballBody.position.x - holeX,
            this.ballBody.position.y - holeY,
        ));
    }

    // ─── Input ─────────────────────────────────────────────────────

    private onPointerDown(p: Phaser.Input.Pointer)
    {
        if (this.state !== 'IDLE') return;
        const bx = this.ballBody.position.x;
        const by = this.ballBody.position.y;
        const d = Math.hypot(p.x - bx, p.y - by);
        if (d > SWING.hitRadiusPx) return;
        this.state = 'AIMING';
        this.dragOrigin = { x: bx, y: by };
        this.dragCurrent = { x: p.x, y: p.y };
        this.drawAimGuide();
    }

    private onPointerMove(p: Phaser.Input.Pointer)
    {
        if (this.state !== 'AIMING') return;
        this.dragCurrent = { x: p.x, y: p.y };
        this.drawAimGuide();
    }

    private onPointerUp(_p: Phaser.Input.Pointer)
    {
        if (this.state !== 'AIMING') return;

        const pullX = this.dragCurrent.x - this.dragOrigin.x;
        const pullY = this.dragCurrent.y - this.dragOrigin.y;
        const pullMag = Math.hypot(pullX, pullY);

        this.aimGfx.clear();

        if (pullMag < SWING.minDragPx)
        {
            this.state = 'IDLE';
            return;
        }

        const clamped = Math.min(pullMag, SWING.maxDragPx);
        const powerT = clamped / SWING.maxDragPx;
        const dirX = -pullX / pullMag;
        const dirY = -pullY / pullMag;
        const speed = powerT * SWING.maxSpeed;

        this.matter.body.setVelocity(
            this.ballBody as unknown as MatterJS.BodyType,
            { x: dirX * speed, y: dirY * speed },
        );

        this.state = 'IN_FLIGHT';
        this.strokes += 1;
        EventBus.emit('strokes-changed', this.strokes);
        // Swing pose for the duration of flight.
        this.ottie.setTexture(TEXTURE_OTTIE_SWING);
    }

    private drawAimGuide()
    {
        this.aimGfx.clear();
        const pullX = this.dragCurrent.x - this.dragOrigin.x;
        const pullY = this.dragCurrent.y - this.dragOrigin.y;
        const pullMag = Math.hypot(pullX, pullY);
        if (pullMag < SWING.minDragPx) return;

        const clamped = Math.min(pullMag, SWING.maxDragPx);
        const tNorm = clamped / SWING.maxDragPx;
        const dirX = -pullX / pullMag;
        const dirY = -pullY / pullMag;
        const endX = this.dragOrigin.x + dirX * clamped;
        const endY = this.dragOrigin.y + dirY * clamped;

        const color = tNorm < 0.85 ? COLORS.aimGuide : COLORS.aimGuideStrong;
        this.aimGfx.lineStyle(3, color, 0.9);
        this.aimGfx.beginPath();
        this.aimGfx.moveTo(this.dragOrigin.x, this.dragOrigin.y);
        this.aimGfx.lineTo(endX, endY);
        this.aimGfx.strokePath();

        const dotCount = 6;
        for (let i = 1; i <= dotCount; i++)
        {
            const t = i / (dotCount + 1);
            const dx = this.dragOrigin.x + dirX * clamped * t;
            const dy = this.dragOrigin.y + dirY * clamped * t;
            this.aimGfx.fillStyle(color, 0.7);
            this.aimGfx.fillCircle(dx, dy, 2);
        }
    }
}
