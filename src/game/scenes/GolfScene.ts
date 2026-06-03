import { Scene } from 'phaser';
import { COLORS, COURSE } from '../constants';

// Day 1: static top-down course. Grass rectangle, hole, Ottie
// placeholder, and a Matter.js ball body (currently isStatic).
// No swing mechanic, no obstacles, no animation. Day 2 unlocks the ball.

export class GolfScene extends Scene
{
    constructor()
    {
        super('GolfScene');
    }

    create()
    {
        const cx = this.scale.width  / 2;
        const cy = this.scale.height / 2;

        // Course: centered grass rectangle with slightly rounded corners.
        const courseX = cx - COURSE.width  / 2;
        const courseY = cy - COURSE.height / 2;
        const courseGfx = this.add.graphics();
        courseGfx.fillStyle(COLORS.grassGreen, 1);
        courseGfx.fillRoundedRect(courseX, courseY, COURSE.width, COURSE.height, 16);

        // Hole: solid black circle. Position is given in course-local
        // coords so the tee/hole stay anchored to the course rect.
        const holeX = courseX + COURSE.holePosition.x;
        const holeY = courseY + COURSE.holePosition.y;
        this.add.circle(holeX, holeY, COURSE.holeRadius, COLORS.hole, 1);

        // Ottie placeholder: rust rounded square, 40px left of the ball.
        const ballX = courseX + COURSE.teePosition.x;
        const ballY = courseY + COURSE.teePosition.y;
        const ottieGfx = this.add.graphics();
        ottieGfx.fillStyle(COLORS.ottieRust, 1);
        ottieGfx.fillRoundedRect(
            ballX - 40 - COURSE.ottieSize,
            ballY - COURSE.ottieSize / 2,
            COURSE.ottieSize,
            COURSE.ottieSize,
            12,
        );

        // Ball: Matter.js circle body, static for Day 1. Visual = white
        // circle painted at the body position; the body itself is what
        // Day 2's swing will impart velocity onto.
        this.matter.add.circle(ballX, ballY, COURSE.ballRadius, {
            isStatic: true,
            restitution: 0.6,
            frictionAir: 0.02,
            label: 'ball',
        });
        this.add.circle(ballX, ballY, COURSE.ballRadius, COLORS.ball, 1);
    }
}
