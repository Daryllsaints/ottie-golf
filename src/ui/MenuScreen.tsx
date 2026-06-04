// Pre-match menu. "Play Solo" boots the existing GolfScene with no
// multiplayer wiring. "Start Match" creates a match record and
// navigates to /m/:code so the player can share the URL.

import { useEffect, useState } from 'react';
import { createMatch, displayName, loadMatchHistory, matchUrl, setDisplayName, type MatchHistoryEntry } from '../lib/match';
import { HOLES } from '../game/terrain';

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
    nameBlock: {
        display: 'flex' as const, flexDirection: 'column' as const,
        alignItems: 'center' as const, gap: 6,
        marginBottom: 6, marginTop: -8,
    },
    nameLabel: {
        fontSize: 10, fontWeight: 700, letterSpacing: 2,
        opacity: 0.75, textTransform: 'uppercase' as const,
    },
    nameInput: {
        background: 'rgba(0,0,0,0.25)', color: '#FFF8E7',
        border: '1px solid rgba(255,248,231,0.3)', borderRadius: 8,
        padding: '8px 14px', fontSize: 15, fontWeight: 600,
        textAlign: 'center' as const,
        fontFamily: 'system-ui, sans-serif',
        width: 220, outline: 'none',
    },
    historyBlock: {
        display: 'flex' as const, flexDirection: 'column' as const,
        gap: 6, marginTop: 20, width: 260,
    },
    historyLabel: {
        fontSize: 10, fontWeight: 700, letterSpacing: 2,
        opacity: 0.75, textTransform: 'uppercase' as const,
        textAlign: 'center' as const, marginBottom: 4,
    },
    historyRow: {
        background: 'rgba(0,0,0,0.25)', color: '#FFF8E7',
        border: '1px solid rgba(255,248,231,0.2)', borderRadius: 8,
        padding: '8px 12px', fontSize: 13, fontWeight: 600,
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: 8, cursor: 'pointer',
        fontFamily: 'system-ui, sans-serif',
    },
    historyOpp: {
        fontWeight: 700, color: '#FFF8E7',
        whiteSpace: 'nowrap' as const, overflow: 'hidden' as const,
        textOverflow: 'ellipsis' as const, maxWidth: 100,
    },
    historyMeta: {
        fontSize: 10, opacity: 0.7, fontWeight: 500,
    },
    historyScore: {
        fontWeight: 800, fontSize: 14,
    },
};

export function MenuScreen({ onPlaySolo }: Props) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState(() => displayName() ?? '');
    const [history, setHistory] = useState<MatchHistoryEntry[]>([]);
    const firstHole = HOLES[0];

    useEffect(() => {
        let cancelled = false;
        loadMatchHistory(HOLES.length, 5).then((rows) => {
            if (!cancelled) setHistory(rows);
        });
        return () => { cancelled = true; };
    }, []);

    function handleNameChange(value: string) {
        setName(value);
        setDisplayName(value);
    }

    async function handleStartMatch() {
        if (busy) return;
        setBusy(true); setError(null);
        const match = await createMatch();
        if (!match) {
            setError('could not start match. solo still works.');
            setBusy(false);
            return;
        }
        window.location.href = matchUrl(match.id);
    }

    return (
        <div style={styles.backdrop}>
            <div style={styles.title}>OTTIE GOLF</div>
            <div style={styles.subtitle}>{firstHole.name} · {firstHole.inspiration}</div>
            <div style={styles.nameBlock}>
                <div style={styles.nameLabel}>your name (optional)</div>
                <input
                    style={styles.nameInput}
                    type="text"
                    placeholder="e.g. dee"
                    value={name}
                    maxLength={24}
                    onChange={(e) => handleNameChange(e.target.value)}
                />
            </div>
            <button style={styles.btnPrimary} onClick={handleStartMatch} disabled={busy}>
                {busy ? 'starting...' : 'start match with a friend'}
            </button>
            <button style={styles.btnSecondary} onClick={onPlaySolo} disabled={busy}>
                play solo
            </button>
            {error && <div style={styles.error}>{error}</div>}
            {history.length > 0 && (
                <div style={styles.historyBlock}>
                    <div style={styles.historyLabel}>recent matches</div>
                    {history.map((row) => (
                        <div
                            key={row.matchId}
                            style={styles.historyRow}
                            onClick={() => { window.location.href = matchUrl(row.matchId); }}
                        >
                            <div>
                                <div style={styles.historyOpp}>
                                    vs {row.opponentName ?? 'unknown'}
                                </div>
                                <div style={styles.historyMeta}>
                                    {row.status === 'complete' ? 'final' : `hole ${row.holesPlayed + 1} of ${row.totalHoles}`}
                                </div>
                            </div>
                            <div style={styles.historyScore}>
                                {row.myTotal} <span style={{ opacity: 0.6 }}>vs</span> {row.opponentTotal}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <div style={styles.footer}>v0.5 · async play via iMessage</div>
        </div>
    );
}
