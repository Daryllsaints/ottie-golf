// Day 3 HUD: hole name + stroke counter + wind indicator + distance.
// pointer-events: none on the whole stack so the canvas stays
// interactive underneath.

import { WIND } from '../game/constants';

type Props = {
    holeName?: string;
    strokes?: number;
    distance?: number;
};

const cardBase = {
    background: '#FFF8E7',
    color: '#E8922A',
    borderRadius: 8,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
};

const styles = {
    topLeft: {
        position: 'fixed' as const,
        top: 16,
        left: 16,
        padding: '12px 16px',
        zIndex: 10,
        ...cardBase,
    },
    topRight: {
        position: 'fixed' as const,
        top: 16,
        right: 16,
        padding: '10px 14px',
        zIndex: 10,
        textAlign: 'right' as const,
        ...cardBase,
    },
    heading: {
        fontSize: 18,
        fontWeight: 600,
        lineHeight: 1.2,
    },
    stat: {
        fontSize: 13,
        fontWeight: 500,
        opacity: 0.85,
        marginTop: 2,
    },
    windRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 6,
        fontSize: 13,
        fontWeight: 600,
    },
    arrow: {
        display: 'inline-block',
        transformOrigin: 'center center',
        // wind direction 0 = up (north), rotates clockwise
        transform: `rotate(${WIND.directionDeg}deg)`,
        lineHeight: 1,
        fontSize: 16,
    },
    distance: {
        fontSize: 13,
        fontWeight: 500,
        opacity: 0.85,
        marginTop: 4,
    },
};

export function HUD({ holeName = 'Hole 1', strokes = 0, distance = 0 }: Props) {
    return (
        <>
            <div style={styles.topLeft}>
                <div style={styles.heading}>{holeName}</div>
                <div style={styles.stat}>Strokes: {strokes}</div>
            </div>
            <div style={styles.topRight}>
                <div style={styles.windRow}>
                    <span style={styles.arrow}>↑</span>
                    <span>{WIND.speedMph} mph</span>
                </div>
                <div style={styles.distance}>{distance} px to pin</div>
            </div>
        </>
    );
}
