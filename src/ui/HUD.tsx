// Day 1 HUD: hole name + stroke counter. Absolutely positioned in
// the top-left, pointer-events: none so it does not block canvas
// input (the swing gesture from Day 2 will need this).

type Props = {
    holeName?: string;
    strokes?: number;
};

const styles = {
    container: {
        position: 'fixed' as const,
        top: 16,
        left: 16,
        padding: '12px 16px',
        background: '#FFF8E7',
        color: '#E8922A',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        pointerEvents: 'none' as const,
        userSelect: 'none' as const,
        zIndex: 10,
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
};

export function HUD({ holeName = 'Hole 1', strokes = 0 }: Props) {
    return (
        <div style={styles.container}>
            <div style={styles.heading}>{holeName}</div>
            <div style={styles.stat}>Strokes: {strokes}</div>
        </div>
    );
}
