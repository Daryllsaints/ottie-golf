import { AUTO, Game, Scale } from 'phaser';
import { GolfScene } from './scenes/GolfScene';
import { COLORS, COURSE, DEBUG } from './constants';

// Day 1 Phaser config: Matter top-down (no gravity), single GolfScene,
// FIT scale so the course centers and resizes with the viewport.
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width:  COURSE.width  + 80,   // a little padding around the course
    height: COURSE.height + 80,
    parent: 'game-container',
    backgroundColor: COLORS.background,
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH,
    },
    physics: {
        default: 'matter',
        matter: {
            gravity: { x: 0, y: 0 },
            debug: DEBUG.showMatterBodies,
        },
    },
    scene: [ GolfScene ],
};

const StartGame = (parent: string) => {
    return new Game({ ...config, parent });
};

export default StartGame;
