// Bottom-center club chip. Tap to cycle through clubs, tap the
// info dot to open a tooltip card describing each club's purpose.
// Triggers a 'club-changed' EventBus emit so the scene picks up
// the new swing parameters on the next shot.

import { useState } from 'react';
import { CLUB_ORDER, CLUBS, type ClubKey } from '../game/constants';

type Props = {
    current: ClubKey;
    onChange: (key: ClubKey) => void;
};

const styles = {
    wrap: {
        position: 'fixed' as const,
        bottom: 24, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 8,
        zIndex: 30, pointerEvents: 'auto' as const,
        fontFamily: 'system-ui, -apple-system, sans-serif',
    },
    chip: {
        background: '#FFF8E7', color: '#3A2814',
        padding: '10px 18px', borderRadius: 999, border: 'none',
        fontSize: 14, fontWeight: 800, cursor: 'pointer',
        letterSpacing: 1, textTransform: 'uppercase' as const,
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
        minWidth: 110, textAlign: 'center' as const,
        userSelect: 'none' as const, touchAction: 'manipulation' as const,
    },
    chipShort: { fontSize: 11, fontWeight: 700, opacity: 0.65, marginRight: 6 },
    info: {
        background: '#E8922A', color: '#FFF8E7',
        width: 28, height: 28, borderRadius: 14, border: 'none',
        fontSize: 14, fontWeight: 900, cursor: 'pointer',
        boxShadow: '0 3px 10px rgba(0,0,0,0.3)',
        display: 'flex' as const, alignItems: 'center' as const,
        justifyContent: 'center' as const,
        userSelect: 'none' as const, touchAction: 'manipulation' as const,
    },
    tooltipBackdrop: {
        position: 'fixed' as const, inset: 0, zIndex: 280,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex' as const, alignItems: 'center' as const,
        justifyContent: 'center' as const, padding: 24,
    },
    tooltipCard: {
        background: '#FFF8E7', color: '#3A2814',
        padding: 22, borderRadius: 18, maxWidth: 340, width: '100%',
        border: '2px solid #E8922A',
        boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
    },
    tooltipTitle: {
        fontSize: 12, fontWeight: 800, letterSpacing: 2,
        color: '#A68B6D', textTransform: 'uppercase' as const,
        marginBottom: 14, textAlign: 'center' as const,
    },
    clubRow: {
        display: 'flex' as const, gap: 12, padding: '12px 0',
        borderBottom: '1px solid rgba(168,139,109,0.25)',
    },
    clubRowLast: {
        display: 'flex' as const, gap: 12, padding: '12px 0',
    },
    clubBadge: {
        background: '#FFE9C0', color: '#3A2814',
        borderRadius: 8, padding: '6px 10px',
        fontSize: 11, fontWeight: 800, letterSpacing: 1,
        height: 'fit-content' as const, minWidth: 36,
        textAlign: 'center' as const,
    },
    clubName: { fontSize: 14, fontWeight: 800, marginBottom: 4 },
    clubBody: { fontSize: 12, color: '#857060', lineHeight: 1.45 },
    closeBtn: {
        background: '#E8922A', color: '#FFF8E7',
        padding: '10px 22px', borderRadius: 10, border: 'none',
        fontSize: 14, fontWeight: 700, cursor: 'pointer',
        width: '100%', marginTop: 16,
    },
};

export function ClubPicker({ current, onChange }: Props) {
    const [showTooltip, setShowTooltip] = useState(false);
    const club = CLUBS[current];

    function cycleClub() {
        const i = CLUB_ORDER.indexOf(current);
        const next = CLUB_ORDER[(i + 1) % CLUB_ORDER.length];
        onChange(next);
    }

    return (
        <>
            <div style={styles.wrap}>
                <button style={styles.chip} onClick={cycleClub} aria-label="cycle club">
                    <span style={styles.chipShort}>{club.short}</span>
                    {club.name}
                </button>
                <button style={styles.info} onClick={() => setShowTooltip(true)} aria-label="club guide">
                    i
                </button>
            </div>
            {showTooltip && (
                <div style={styles.tooltipBackdrop} onClick={() => setShowTooltip(false)}>
                    <div style={styles.tooltipCard} onClick={(e) => e.stopPropagation()}>
                        <div style={styles.tooltipTitle}>club guide</div>
                        {CLUB_ORDER.map((key, i) => {
                            const c = CLUBS[key];
                            const isLast = i === CLUB_ORDER.length - 1;
                            return (
                                <div key={key} style={isLast ? styles.clubRowLast : styles.clubRow}>
                                    <div style={styles.clubBadge}>{c.short}</div>
                                    <div>
                                        <div style={styles.clubName}>{c.name}</div>
                                        <div style={styles.clubBody}>{c.tooltip}</div>
                                    </div>
                                </div>
                            );
                        })}
                        <button style={styles.closeBtn} onClick={() => setShowTooltip(false)}>got it</button>
                    </div>
                </div>
            )}
        </>
    );
}
