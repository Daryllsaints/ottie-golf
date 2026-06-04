import { Scene } from 'phaser';
import { COLORS, COURSE, SWING, BALL_PHYSICS, HOLE_1, HOLE_1_PAR } from '../constants';
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
    private dragStartMs = 0;
    private holeSunk = false;
    private oobIndicator?: Phaser.GameObjects.Text;
    private oobIndicatorHideAt = 0;
    private sinkOverlay?: Phaser.GameObjects.Container;
    private ballShadow!: Phaser.GameObjects.Ellipse;
    private trailGfx!: Phaser.GameObjects.Graphics;
    private trail: Array<{ x: number; y: number; t: number }> = [];
    private ottieIdleTween?: Phaser.Tweens.Tween;

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
        const bx = this.ballBody.position.x;
        const by = this.ballBody.position.y;
        this.ballSprite.setPosition(bx, by);
        this.ballShadow.setPosition(bx + 2, by + 4);

        // Accumulate flight trail.
        if (this.state === 'IN_FLIGHT' && !this.holeSunk)
        {
            this.trail.push({ x: bx, y: by, t: this.time.now });
        }
        this.drawTrail();

        // Aim guide must redraw every frame while AIMING so the
        // hold-penalty oscillation animates live (sine wave whose
        // amplitude grows with hold time).
        if (this.state === 'AIMING') this.drawAimGuide();

        // Fade the OOB indicator after its display window.
        if (this.oobIndicator && this.time.now > this.oobIndicatorHideAt)
        {
            this.oobIndicator.destroy();
            this.oobIndicator = undefined;
        }

        if (this.state === 'IN_FLIGHT' && !this.holeSunk)
        {
            // Sink detection — ball center within HOLE area of cup.
            const holeX = this.courseOffsetX + COURSE.holePosition.x;
            const holeY = this.courseOffsetY + COURSE.holePosition.y;
            const distToHole = Math.hypot(
                this.ballBody.position.x - holeX,
                this.ballBody.position.y - holeY,
            );
            if (distToHole < COURSE.holeRadius)
            {
                this.sinkBall();
                return;
            }

            // OOB detection — ball center outside the course rectangle
            // (the visible playfield). Using the rect, not the rough
            // polygon, so the playable bounds are forgiving: anywhere
            // on the brown frame is still in play.
            const ballX = this.ballBody.position.x;
            const ballY = this.ballBody.position.y;
            const inBounds =
                ballX >= this.courseOffsetX &&
                ballX <= this.courseOffsetX + COURSE.width &&
                ballY >= this.courseOffsetY &&
                ballY <= this.courseOffsetY + COURSE.height;
            if (!inBounds)
            {
                this.handleOutOfBounds();
                return;
            }

            const v = (this.ballBody as unknown as { velocity: { x: number; y: number } }).velocity;
            const speed = Math.hypot(v.x, v.y);
            if (speed < SWING.restSpeedThreshold)
            {
                this.matter.body.setVelocity(this.ballBody as unknown as MatterJS.BodyType, { x: 0, y: 0 });
                this.state = 'IDLE';
                this.ottie.setTexture(TEXTURE_OTTIE_READY);
                this.trail = [];
                this.trailGfx.clear();
                this.startOttieIdleBob();
                EventBus.emit('distance-to-pin', this.computeDistanceToPin());
            }
        }
    }

    private drawTrail()
    {
        const now = this.time.now;
        const LIFETIME = 600;
        // Cull old points.
        this.trail = this.trail.filter(p => now - p.t < LIFETIME);
        this.trailGfx.clear();
        for (const p of this.trail)
        {
            const age = (now - p.t) / LIFETIME;
            const alpha = 1 - age;
            const r = COURSE.ballRadius * 0.55 * (1 - age);
            this.trailGfx.fillStyle(COLORS.ballTrail, alpha * 0.5);
            this.trailGfx.fillCircle(p.x, p.y, r);
        }
    }

    // ─── Hole completion + OOB ────────────────────────────────────

    private sinkBall()
    {
        this.holeSunk = true;
        this.matter.body.setVelocity(this.ballBody as unknown as MatterJS.BodyType, { x: 0, y: 0 });
        const holeX = this.courseOffsetX + COURSE.holePosition.x;
        const holeY = this.courseOffsetY + COURSE.holePosition.y;
        this.matter.body.setPosition(this.ballBody as unknown as MatterJS.BodyType, { x: holeX, y: holeY }, false);
        this.ballSprite.setVisible(false);
        this.ballShadow.setVisible(false);
        this.trail = [];
        this.trailGfx.clear();
        this.ottie.setTexture(TEXTURE_OTTIE_READY);
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

    private showSinkOverlay(verdict: string, verdictColor: string, subtitle: string)
    {
        const w = this.scale.width;
        const h = this.scale.height;
        const container = this.add.container(0, 0).setDepth(1000);

        const backdrop = this.add.rectangle(0, 0, w, h, 0x1A1A1A, 0.5).setOrigin(0, 0);
        container.add(backdrop);

        // Rounded card via Graphics so we can use real corner radius.
        const cardW = 300;
        const cardH = 200;
        const cardX = (w - cardW) / 2;
        const cardY = (h - cardH) / 2;
        const cardShadow = this.add.graphics();
        cardShadow.fillStyle(0x000000, 0.25);
        cardShadow.fillRoundedRect(cardX + 3, cardY + 6, cardW, cardH, 18);
        container.add(cardShadow);

        const card = this.add.graphics();
        card.fillStyle(0xFFF8E7, 1);
        card.fillRoundedRect(cardX, cardY, cardW, cardH, 18);
        card.lineStyle(2, 0xE8922A, 0.85);
        card.strokeRoundedRect(cardX, cardY, cardW, cardH, 18);
        container.add(card);

        // Layout inside the card
        const eyebrow = this.add.text(w / 2, cardY + 28, 'SUNK', {
            fontFamily: 'system-ui, sans-serif', fontSize: '11px',
            color: '#A68B6D', fontStyle: 'bold',
            letterSpacing: '2px',
        } as Phaser.Types.GameObjects.Text.TextStyle).setOrigin(0.5);
        container.add(eyebrow);

        const big = this.add.text(w / 2, cardY + 70, verdict, {
            fontFamily: 'system-ui, sans-serif', fontSize: '32px',
            color: verdictColor, fontStyle: 'bold',
        }).setOrigin(0.5);
        container.add(big);

        const strokeLine = this.add.text(w / 2, cardY + 110, `${this.strokes} stroke${this.strokes === 1 ? '' : 's'} · par ${HOLE_1_PAR}`, {
            fontFamily: 'system-ui, sans-serif', fontSize: '14px',
            color: '#3A2814',
        }).setOrigin(0.5);
        container.add(strokeLine);

        const kay = this.add.text(w / 2, cardY + 140, subtitle, {
            fontFamily: 'system-ui, sans-serif', fontSize: '15px',
            color: '#E8922A', fontStyle: 'italic',
        }).setOrigin(0.5);
        container.add(kay);

        const hint = this.add.text(w / 2, cardY + 175, 'tap to replay', {
            fontFamily: 'system-ui, sans-serif', fontSize: '12px',
            color: '#A68B6D', fontStyle: 'italic',
        }).setOrigin(0.5);
        container.add(hint);

        this.sinkOverlay = container;
    }

    private handleOutOfBounds()
    {
        const teeX = this.courseOffsetX + COURSE.teePosition.x;
        const teeY = this.courseOffsetY + COURSE.teePosition.y;
        this.matter.body.setVelocity(this.ballBody as unknown as MatterJS.BodyType, { x: 0, y: 0 });
        this.matter.body.setPosition(this.ballBody as unknown as MatterJS.BodyType, { x: teeX, y: teeY }, false);

        this.strokes += 1; // OOB penalty stroke (lost ball)
        this.state = 'IDLE';
        this.ottie.setTexture(TEXTURE_OTTIE_READY);
        EventBus.emit('strokes-changed', this.strokes);
        EventBus.emit('distance-to-pin', this.computeDistanceToPin());

        // Visible feedback for ~1.6s.
        this.oobIndicator?.destroy();
        this.oobIndicator = this.add.text(
            this.scale.width / 2, this.scale.height * 0.35,
            'out of bounds · +1', {
                fontFamily: 'system-ui, sans-serif', fontSize: '18px',
                color: '#FFF8E7', backgroundColor: '#C8543A',
                padding: { x: 12, y: 6 },
            },
        ).setOrigin(0.5).setDepth(900);
        this.oobIndicatorHideAt = this.time.now + 1600;
    }

    private resetHole()
    {
        const teeX = this.courseOffsetX + COURSE.teePosition.x;
        const teeY = this.courseOffsetY + COURSE.teePosition.y;
        this.matter.body.setVelocity(this.ballBody as unknown as MatterJS.BodyType, { x: 0, y: 0 });
        this.matter.body.setPosition(this.ballBody as unknown as MatterJS.BodyType, { x: teeX, y: teeY }, false);
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

    // ─── Difficulty helpers ────────────────────────────────────────

    /** Returns the current oscillation offset in radians based on
     *  how long the drag has been held. Zero during the grace period;
     *  amplitude grows linearly afterward up to holdDriftMaxDeg. */
    private currentHoldOscRad(): number
    {
        const heldMs = this.time.now - this.dragStartMs;
        const overGraceSec = Math.max(0, heldMs - SWING.holdGraceMs) / 1000;
        const ampDeg = Math.min(overGraceSec * SWING.holdDriftRateDegPerSec, SWING.holdDriftMaxDeg);
        if (ampDeg <= 0) return 0;
        const tSec = this.time.now / 1000;
        const phase = Math.sin(tSec * SWING.holdOscHz * Math.PI * 2);
        return phase * ampDeg * Math.PI / 180;
    }

    /** Classifies the current pull magnitude into a power zone. */
    private powerZone(tNorm: number): 'under' | 'sweet' | 'over'
    {
        if (tNorm < SWING.sweetSpotMin) return 'under';
        if (tNorm <= SWING.sweetSpotMax) return 'sweet';
        return 'over';
    }

    // ─── Course rendering ──────────────────────────────────────────

    private drawCourse()
    {
        // Playfield backdrop — a rounded rectangle behind everything so
        // the course has a defined edge against the brown background.
        const bed = this.add.graphics();
        bed.fillStyle(COLORS.courseBed, 1);
        bed.fillRoundedRect(
            this.courseOffsetX, this.courseOffsetY,
            COURSE.width, COURSE.height, 22,
        );
        bed.setDepth(-1);

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
        this.startOttieIdleBob();
    }

    private startOttieIdleBob()
    {
        this.ottieIdleTween?.stop();
        this.ottieIdleTween = this.tweens.add({
            targets: this.ottie,
            scaleX: 0.42,
            scaleY: 0.38,
            duration: 1400,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
        });
    }

    private stopOttieIdleBob()
    {
        this.ottieIdleTween?.stop();
        this.ottieIdleTween = undefined;
        this.ottie.setScale(0.4);
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
        this.ballShadow = this.add.ellipse(
            ballX + 2, ballY + 4,
            COURSE.ballRadius * 2.0, COURSE.ballRadius * 1.1,
            COLORS.ballShadow, 0.25,
        ).setDepth(19);
        this.ballSprite = this.add.circle(ballX, ballY, COURSE.ballRadius, COLORS.ball, 1)
            .setStrokeStyle(1, 0x444444, 0.6).setDepth(20);
        this.trailGfx = this.add.graphics().setDepth(18);
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
        // Tap-to-replay when the sink overlay is showing.
        if (this.holeSunk)
        {
            this.resetHole();
            return;
        }
        if (this.state !== 'IDLE') return;
        const bx = this.ballBody.position.x;
        const by = this.ballBody.position.y;
        const d = Math.hypot(p.x - bx, p.y - by);
        if (d > SWING.hitRadiusPx) return;
        this.state = 'AIMING';
        this.dragOrigin = { x: bx, y: by };
        this.dragCurrent = { x: p.x, y: p.y };
        this.dragStartMs = this.time.now;
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
        const tNorm = clamped / SWING.maxDragPx;
        const baseAngle = Math.atan2(-pullY / pullMag, -pullX / pullMag);

        // Hold penalty: snapshot oscillation phase at release.
        let finalAngle = baseAngle + this.currentHoldOscRad();

        // Power zone:
        //   under: weak shot, linear power scale, no jitter
        //   sweet: 100% clean strike
        //   over:  capped 65% power + random direction jitter (mishit)
        const zone = this.powerZone(tNorm);
        let powerMul: number;
        if (zone === 'sweet') {
            powerMul = 1.0;
        } else if (zone === 'under') {
            powerMul = tNorm; // linear 0..0.75 maps to 0..0.75 of max speed
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
        const baseAngle = Math.atan2(-pullY / pullMag, -pullX / pullMag);

        // Hold-penalty oscillation: aim wobbles around the base
        // direction in a sine wave whose amplitude grows after the
        // grace period. Player sees this live as the line wobbles.
        const oscAngle = baseAngle + this.currentHoldOscRad();
        const endX = this.dragOrigin.x + Math.cos(oscAngle) * clamped;
        const endY = this.dragOrigin.y + Math.sin(oscAngle) * clamped;

        // Color by power zone.
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

        // Power dots along the oscillated aim.
        const dotCount = 6;
        for (let i = 1; i <= dotCount; i++)
        {
            const t = i / (dotCount + 1);
            const dx = this.dragOrigin.x + Math.cos(oscAngle) * clamped * t;
            const dy = this.dragOrigin.y + Math.sin(oscAngle) * clamped * t;
            this.aimGfx.fillStyle(color, 0.7);
            this.aimGfx.fillCircle(dx, dy, 2);
        }

        // Sweet-spot tick marks along the BASE direction (un-oscillated)
        // at the sweetSpotMin / sweetSpotMax pull magnitudes. Acts as
        // the visible target band — release within these ticks for a
        // clean strike. Drawn always so the player can plan even
        // before they reach the band.
        const perpX = -Math.sin(baseAngle);
        const perpY =  Math.cos(baseAngle);
        const tickLen = 8;
        this.aimGfx.lineStyle(2, COLORS.aimGuideSweet, 0.85);
        for (const tFrac of [SWING.sweetSpotMin, SWING.sweetSpotMax])
        {
            const tx = this.dragOrigin.x + Math.cos(baseAngle) * tFrac * SWING.maxDragPx;
            const ty = this.dragOrigin.y + Math.sin(baseAngle) * tFrac * SWING.maxDragPx;
            this.aimGfx.beginPath();
            this.aimGfx.moveTo(tx - perpX * tickLen, ty - perpY * tickLen);
            this.aimGfx.lineTo(tx + perpX * tickLen, ty + perpY * tickLen);
            this.aimGfx.strokePath();
        }
    }
}
