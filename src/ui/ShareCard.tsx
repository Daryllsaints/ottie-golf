// Post-hole share card. Pops after the player sinks the ball,
// showing their score and a "share with friend" button that triggers
// the native iMessage / WhatsApp / system share sheet. Friend taps
// the link, joins the match, plays the same hole.

import { useState } from 'react';
import { matchUrl, type Shot } from '../lib/match';

type Props = {
    matchId: string;
    me: 'A' | 'B';
    myShots: Shot[];
    opponentShots: Shot[];
    par: number;
    onDismiss: () => void;
};

const styles = {
    backdrop: {
        position: 'fixed' as const, inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif',
    },
    card: {
        background: '#FFF8E7', borderRadius: 18,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        padding: 28, maxWidth: 380, width: '100%',
        textAlign: 'center' as const,
        border: '2px solid #E8922A',
    },
    eyebrow: {
        fontSize: 11, fontWeight: 700, letterSpacing: 2,
        color: '#A68B6D', marginBottom: 8,
    },
    title: { fontSize: 28, fontWeight: 800, color: '#3A2814', marginBottom: 4 },
    sub: { fontSize: 13, color: '#857060', marginBottom: 20 },
    scoreboard: {
        display: 'flex', justifyContent: 'space-around',
        marginBottom: 20,
        background: '#FFE9C0', borderRadius: 12, padding: 16,
    },
    scoreCell: { textAlign: 'center' as const },
    scoreLabel: { fontSize: 11, fontWeight: 700, color: '#A68B6D', marginBottom: 4 },
    scoreNum: { fontSize: 32, fontWeight: 800, color: '#3A2814', lineHeight: 1 },
    shareBtn: {
        background: '#E8922A', color: '#FFF8E7',
        padding: '14px 28px', borderRadius: 10, border: 'none',
        fontSize: 16, fontWeight: 700, cursor: 'pointer',
        width: '100%', marginBottom: 10,
    },
    closeBtn: {
        background: 'transparent', color: '#857060',
        padding: '8px 16px', borderRadius: 8, border: 'none',
        fontSize: 13, cursor: 'pointer',
    },
    copied: { color: '#4A9D5D', fontSize: 13, fontWeight: 600, marginTop: 8 },
};

function totalStrokes(shots: Shot[]): number {
    return shots.reduce((s, x) => s + x.strokes, 0);
}

function verdict(strokes: number, par: number): string {
    const d = strokes - par;
    if (d <= -2) return 'eagle!';
    if (d === -1) return 'birdie';
    if (d === 0) return 'par';
    if (d === 1) return 'bogey';
    return `+${d}`;
}

export function ShareCard({ matchId, me, myShots, opponentShots, par, onDismiss }: Props) {
    const [copied, setCopied] = useState(false);
    const myStrokes = myShots[myShots.length - 1]?.strokes ?? 0;
    const oppStrokes = opponentShots[opponentShots.length - 1]?.strokes ?? null;

    async function handleShare() {
        const url = matchUrl(matchId);
        const text = oppStrokes === null
            ? `your turn on hole 1 (the island) — i shot ${myStrokes}. beat me: ${url}`
            : `i shot ${myStrokes} — ${verdict(myStrokes, par)}. ${url}`;

        const navAny = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
        if (navAny.share) {
            try {
                await navAny.share({ text, url });
                return;
            } catch {
                // user cancelled — fall through to clipboard
            }
        }
        // Clipboard fallback
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Final fallback: show the URL inline
            window.prompt('Copy this URL:', url);
        }
    }

    return (
        <div style={styles.backdrop} onClick={onDismiss}>
            <div style={styles.card} onClick={(e) => e.stopPropagation()}>
                <div style={styles.eyebrow}>SUNK</div>
                <div style={styles.title}>{verdict(myStrokes, par)}</div>
                <div style={styles.sub}>{myStrokes} stroke{myStrokes === 1 ? '' : 's'} · par {par}</div>
                <div style={styles.scoreboard}>
                    <div style={styles.scoreCell}>
                        <div style={styles.scoreLabel}>YOU</div>
                        <div style={styles.scoreNum}>{myStrokes}</div>
                    </div>
                    <div style={styles.scoreCell}>
                        <div style={styles.scoreLabel}>{me === 'A' ? 'PLAYER B' : 'PLAYER A'}</div>
                        <div style={styles.scoreNum}>{oppStrokes ?? '—'}</div>
                    </div>
                </div>
                <button style={styles.shareBtn} onClick={handleShare}>
                    {oppStrokes === null ? 'send the link · their turn' : 'send your score'}
                </button>
                {copied && <div style={styles.copied}>link copied — paste into iMessage</div>}
                <button style={styles.closeBtn} onClick={onDismiss}>play again</button>
            </div>
        </div>
    );
}
