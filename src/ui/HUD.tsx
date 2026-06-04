// HUD chip cards inspired by Pixel Pro Golf's overlay style.
// Top-left: orange 'card' button + dark hatched par/shot/best block.
// Top-right: dark hatched wind card with arrow + speed.
// All pointer-events: none so the canvas swing input passes through.

import { WIND } from '../game/constants';
import { ACTIVE_HOLE } from '../game/terrain';

type Props = {
    holeName?: string;
    strokes?: number;
    distance?: number;
};

const HATCHED = 'repeating-linear-gradient(-45deg, #2d4a2d, #2d4a2d 5px, #1f3a1f 5px, #1f3a1f 10px)';

const cardCommon = {
    color: '#FFF8E7',
    borderRadius: 8,
    padding: '10px 14px',
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.35,
    boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
};

const styles = {
    topLeftStack: {
        position: 'fixed' as const,
        top: 16,
        left: 16,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 8,
        zIndex: 10,
        pointerEvents: 'none' as const,
    },
    cardBtn: {
        background: '#E8922A',
        color: '#FFF8E7',
        fontWeight: 700,
        padding: '8px 16px',
        borderRadius: 8,
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
        fontSize: 14,
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center' as const,
        pointerEvents: 'none' as const,
        userSelect: 'none' as const,
        width: 64,
    },
    parCard: {
        ...cardCommon,
        background: HATCHED,
        minWidth: 80,
    },
    parLine: { display: 'block' as const },
    subLine: {
        display: 'block' as const,
        fontSize: 10,
        fontWeight: 500,
        opacity: 0.7,
        marginTop: 4,
        fontStyle: 'italic' as const,
    },
    topRight: {
        position: 'fixed' as const,
        top: 16,
        right: 16,
        zIndex: 10,
        ...cardCommon,
        background: HATCHED,
        textAlign: 'center' as const,
        minWidth: 76,
    },
    windLabel: {
        fontSize: 13,
        fontWeight: 700,
        marginBottom: 4,
    },
    windArrow: {
        display: 'inline-block',
        fontSize: 22,
        lineHeight: 1,
        transform: `rotate(${WIND.directionDeg}deg)`,
        marginBottom: 4,
    },
    windSpeed: {
        fontSize: 15,
        fontWeight: 700,
    },
    flagBadge: {
        position: 'fixed' as const,
        top: 22,
        left: 90,
        zIndex: 11,
        background: '#C8543A',
        color: '#FFF8E7',
        padding: '2px 8px',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
        fontWeight: 700,
        borderRadius: 4,
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        pointerEvents: 'none' as const,
        userSelect: 'none' as const,
    },
    distance: {
        position: 'fixed' as const,
        top: 96,
        right: 16,
        zIndex: 10,
        color: '#FFF8E7',
        textShadow: '1px 1px 0 #1a1a1a, -1px 1px 0 #1a1a1a, 1px -1px 0 #1a1a1a, -1px -1px 0 #1a1a1a',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        fontWeight: 700,
        pointerEvents: 'none' as const,
        userSelect: 'none' as const,
    },
};

export function HUD({ strokes = 0, distance = 0 }: Props) {
    return (
        <>
            <div style={styles.topLeftStack}>
                <div style={styles.cardBtn}>card</div>
                <div style={styles.parCard}>
                    <span style={styles.parLine}>{ACTIVE_HOLE.name}</span>
                    <span style={styles.parLine}>par {ACTIVE_HOLE.par} · shot {strokes + 1}</span>
                    <span style={styles.subLine}>after {ACTIVE_HOLE.inspiration}</span>
                </div>
            </div>
            <div style={styles.topRight}>
                <div style={styles.windLabel}>wind</div>
                <div style={styles.windArrow}>↑</div>
                <div style={styles.windSpeed}>{WIND.speedMph}</div>
            </div>
            <div style={styles.distance}>{distance} yds to pin</div>
        </>
    );
}
