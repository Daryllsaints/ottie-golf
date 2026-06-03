import { Scene } from 'phaser';
import { COLORS, COURSE, SWING, BALL_PHYSICS } from '../constants';
import { EventBus } from '../EventBus';

// Day 2: drop isStatic, add the swing mechanic.
//
// State machine:
//   IDLE     — ball at rest, waiting for input
//   AIMING   — pointer down within hit radius, drag tracking + aim preview
//   IN_FLIGHT — ball moving; input blocked until rest
//
// Pull-back inversion: pointer drag direction is OPPOSITE the shot
// direction. Drag 100px south of the ball → ball fires 100px north.
// Power scales linearly with drag distance, clamped at maxDragPx.

type SwingState = 'IDLE' | 'AIMING' | 'IN_FLIGHT';

type MatterBodyLike = { position: { x: number; y: number } };

export class GolfScene extends Scene
{
    private state: SwingState = 'IDLE';
    private strokes = 0;
    private ballBody!: MatterBodyLike;
    private ballSprite!: Phaser.GameObjects.Arc;
    private courseOffsetX = 0;
    private courseOffsetY = 0;
    private aimGfx!: Phaser.GameObjects.Graphics;
    private dragOrigin = { x: 0, y: 0 };
    private dragCurrent = { x: 0, y: 0 };

    constructor()
    {
        super('GolfScene');
    }

    create()
    {
        const cx = this.scale.width  / 2;
        const cy = this.scale.height / 2;
        this.courseOffsetX = cx - COURSE.width  / 2;
        this.courseOffsetY = cy - COURSE.height / 2;

        const courseGfx = this.add.graphics();
        courseGfx.fillStyle(COLORS.grassGreen, 1);
        courseGfx.fillRoundedRect(
            this.courseOffsetX, this.courseOffsetY,
            COURSE.width, COURSE.height, 16,
        );

        const holeX = this.courseOffsetX + COURSE.holePosition.x;
        const holeY = this.courseOffsetY + COURSE.holePosition.y;
        this.add.circle(holeX, holeY, COURSE.holeRadius, COLORS.hole, 1);

        const ballX = this.courseOffsetX + COURSE.teePosition.x;
        const ballY = this.courseOffsetY + COURSE.teePosition.y;
        const ottieGfx = this.add.graphics();
        ottieGfx.fillStyle(COLORS.ottieRust, 1);
        ottieGfx.fillRoundedRect(
            ballX - 40 - COURSE.ottieSize,
            ballY - COURSE.ottieSize / 2,
            COURSE.ottieSize, COURSE.ottieSize,
            12,
        );

        // Ball with Matter body. No longer static — Matter takes over.
        this.ballBody = this.matter.add.circle(ballX, ballY, COURSE.ballRadius, {
            restitution: BALL_PHYSICS.restitution,
            frictionAir: BALL_PHYSICS.frictionAir,
            density:     BALL_PHYSICS.density,
            label: 'ball',
        }) as unknown as MatterBodyLike;

        this.ballSprite = this.add.circle(ballX, ballY, COURSE.ballRadius, COLORS.ball, 1);
        this.ballSprite.setDepth(10);

        // Aim guide graphics layered above the course but below the ball.
        this.aimGfx = this.add.graphics().setDepth(5);

        // Input wiring.
        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
        this.input.on('pointerup',   (p: Phaser.Input.Pointer) => this.onPointerUp(p));
        this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onPointerUp(p));

        EventBus.emit('current-scene-ready', this);
        EventBus.emit('strokes-changed', this.strokes);
    }

    update()
    {
        // Sync visual sprite to physics body each frame.
        this.ballSprite.setPosition(this.ballBody.position.x, this.ballBody.position.y);

        // Drop back to IDLE when the ball settles.
        if (this.state === 'IN_FLIGHT')
        {
            const v = (this.ballBody as unknown as { velocity: { x: number; y: number } }).velocity;
            const speed = Math.hypot(v.x, v.y);
            if (speed < SWING.restSpeedThreshold)
            {
                // Snap velocity hard to zero so Matter doesn't keep trickling.
                this.matter.body.setVelocity(this.ballBody as unknown as MatterJS.BodyType, { x: 0, y: 0 });
                this.state = 'IDLE';
            }
        }
    }

    private onPointerDown(p: Phaser.Input.Pointer)
    {
        if (this.state !== 'IDLE') return;
        // Hit-test: pointer must land within hitRadiusPx of the ball
        // (forgiving on mobile, where finger-precision is bad).
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

        // Pull-back vector points FROM ball TOWARD pointer. Shot
        // direction is the opposite (firing AWAY from where you pulled).
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
        // Negate to invert direction (pull-back → shoot-forward).
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
        // Trajectory line points OPPOSITE the pull, length matched to pull.
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

        // Power dots along the trajectory — visual feedback that scales.
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
