// Pre-match menu. "Play Solo" boots the existing GolfScene with no
// multiplayer wiring. "Start Match" creates a match record and
// navigates to /m/:code so the player can share the URL.

import { useState } from 'react';
import { createMatch, matchUrl } from '../lib/match';

type Props = { onPlaySolo: () => void };

const styles = {
    backdrop: {
        position: 'fixed' as const, inset: 0, zIndex: 100,
        background: 'radial-gradient(circle at 50% 30%, #6b9b3d 0%, #3d5e2a 100%)',
        display: 'flex', flexDirection: 'column' as const,
        alignItems: 'center', justifyContent: 'center',
        gap: 24,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#FFF8E7', padding: 32,
    },
    title: {
        fontSize: 42, fontWeight: 800, letterSpacing: 1,
        textShadow: '0 2px 0 rgba(0,0,0,0.25)',
        marginBottom: 8,
    },
    subtitle: { fontSize: 14, opacity: 0.85, marginBottom: 32 },
    btnPrimary: {
        background: '#E8922A', color: '#FFF8E7',
        padding: '16px 32px', borderRadius: 12, border: 'none',
        fontSize: 18, fontWeight: 700, cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        minWidth: 220,
    },
    btnSecondary: {
        background: 'rgba(0,0,0,0.25)', color: '#FFF8E7',
        padding: '14px 28px', borderRadius: 12, border: '1px solid rgba(255,248,231,0.4)',
        fontSize: 16, fontWeight: 600, cursor: 'pointer',
        minWidth: 220,
    },
    error: {
        color: '#FFC8B8', fontSize: 13, marginTop: 12,
        background: 'rgba(0,0,0,0.25)', padding: '8px 14px', borderRadius: 6,
    },
    footer: {
        position: 'absolute' as const, bottom: 24,
        fontSize: 11, opacity: 0.6, textAlign: 'center' as const,
    },
};

export function MenuScreen({ onPlaySolo }: Props) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleStartMatch() {
        if (busy) return;
        setBusy(true); setError(null);
        const match = await createMatch();
        if (!match) {
            setError('could not start match. solo still works.');
            setBusy(false);
            return;
        }
        // Navigate to the match URL — main.tsx routes to MatchScreen.
        window.location.href = matchUrl(match.id);
    }

    return (
        <div style={styles.backdrop}>
            <div style={styles.title}>OTTIE GOLF</div>
            <div style={styles.subtitle}>The Island · TPC Sawgrass #17</div>
            <button style={styles.btnPrimary} onClick={handleStartMatch} disabled={busy}>
                {busy ? 'starting...' : 'start match with a friend'}
            </button>
            <button style={styles.btnSecondary} onClick={onPlaySolo} disabled={busy}>
                play solo
            </button>
            {error && <div style={styles.error}>{error}</div>}
            <div style={styles.footer}>v0.5 · async play via iMessage</div>
        </div>
    );
}
