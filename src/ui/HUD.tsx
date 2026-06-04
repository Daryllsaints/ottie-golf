// HUD chip cards inspired by Pixel Pro Golf's overlay style.
// Top-left: orange 'card' button + dark hatched par/shot/hole block.
// Top-right (match only): running totals across holes.
// All pointer-events: none so the canvas swing input passes through.

import { ACTIVE_HOLE } from '../game/terrain';

type Props = {
    holeName?: string;
    strokes?: number;
    distance?: number;
    holeNum?: number;
    holeCount?: number;
    runningTotals?: { me: number; opp: number; opponentLabel?: string };
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
    holeCounter: {
        display: 'block' as const,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1.5,
        color: '#E8922A',
        textTransform: 'uppercase' as const,
        marginBottom: 2,
    },
    totalsCard: {
        position: 'fixed' as const,
        top: 16,
        right: 16,
        zIndex: 10,
        ...cardCommon,
        background: HATCHED,
        textAlign: 'center' as const,
        minWidth: 84,
    },
    totalsLabel: {
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1.5,
        color: '#E8922A',
        textTransform: 'uppercase' as const,
        marginBottom: 4,
    },
    totalsRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },
    totalsCell: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center' as const },
    totalsName: { fontSize: 9, fontWeight: 600, opacity: 0.75, textTransform: 'uppercase' as const, letterSpacing: 1 },
    totalsNum:  { fontSize: 20, fontWeight: 800, lineHeight: 1 },
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

export function HUD({ strokes = 0, distance = 0, holeNum, holeCount, runningTotals }: Props) {
    const showHoleCounter = typeof holeNum === 'number' && typeof holeCount === 'number';
    const showTotals = !!runningTotals && (runningTotals.me > 0 || runningTotals.opp > 0);
    const oppLabel = runningTotals?.opponentLabel ?? 'them';
    return (
        <>
            <div style={styles.topLeftStack}>
                <div style={styles.cardBtn}>card</div>
                <div style={styles.parCard}>
                    {showHoleCounter && (
                        <span style={styles.holeCounter}>hole {holeNum} of {holeCount}</span>
                    )}
                    <span style={styles.parLine}>{ACTIVE_HOLE.name}</span>
                    <span style={styles.parLine}>par {ACTIVE_HOLE.par} · shot {strokes + 1}</span>
                    <span style={styles.subLine}>after {ACTIVE_HOLE.inspiration}</span>
                </div>
            </div>
            {showTotals && (
                <div style={styles.totalsCard}>
                    <div style={styles.totalsLabel}>match</div>
                    <div style={styles.totalsRow}>
                        <div style={styles.totalsCell}>
                            <div style={styles.totalsName}>you</div>
                            <div style={styles.totalsNum}>{runningTotals!.me}</div>
                        </div>
                        <div style={styles.totalsCell}>
                            <div style={styles.totalsName}>{oppLabel}</div>
                            <div style={styles.totalsNum}>{runningTotals!.opp}</div>
                        </div>
                    </div>
                </div>
            )}
            <div style={styles.distance}>{distance} yds to pin</div>
        </>
    );
}
