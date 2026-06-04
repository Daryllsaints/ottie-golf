import { AUTO, Game, Scale } from 'phaser';
import { GolfScene } from './scenes/GolfScene';
import { COLORS, DEBUG } from './constants';

// Day 5 (PPG-fidelity rebuild): canvas fills the window, world is
// much larger than the viewport, Matter.js drives the ball, the
// camera follows.
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: typeof window !== 'undefined' ? window.innerWidth : 800,
    height: typeof window !== 'undefined' ? window.innerHeight : 600,
    parent: 'game-container',
    backgroundColor: COLORS.background,
    pixelArt: true,
    scale: {
        mode: Scale.RESIZE,
        autoCenter: Scale.NO_CENTER,
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
