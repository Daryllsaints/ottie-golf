// Post-hole share card. Pops after the player sinks the ball,
// showing their score and a "share with friend" button that triggers
// the native iMessage / WhatsApp / system share sheet. Friend taps
// the link, joins the match, plays the same hole.

import { useEffect, useRef, useState } from 'react';
import { matchUrl, type Shot } from '../lib/match';

type Props = {
    matchId: string;
    me: 'A' | 'B';
    myShots: Shot[];
    opponentShots: Shot[];
    par: number;
    onDismiss: () => void;
    onHeckleCommit?: (level: number) => void;
};

const HECKLE_WINDOW_MS = 4000;
const HECKLE_TAP_VALUE = 8;

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
    heckleBlock: {
        background: '#2A1810', borderRadius: 12, padding: 14,
        marginBottom: 14, textAlign: 'center' as const,
    },
    heckleLabel: {
        fontSize: 11, fontWeight: 700, letterSpacing: 2,
        color: '#E8922A', marginBottom: 6,
    },
    heckleSub: { fontSize: 12, color: '#A68B6D', marginBottom: 10 },
    heckleBarOuter: {
        background: '#1A0F09', borderRadius: 999, height: 14,
        overflow: 'hidden' as const, marginBottom: 10,
        border: '1px solid #3A2814',
    },
    heckleBarInner: {
        background: 'linear-gradient(90deg, #E8922A, #C8543A)',
        height: '100%', borderRadius: 999,
        transition: 'width 0.08s ease-out',
    },
    heckleBtn: {
        background: '#C8543A', color: '#FFF8E7',
        padding: '14px 20px', borderRadius: 10, border: 'none',
        fontSize: 16, fontWeight: 800, cursor: 'pointer',
        width: '100%', textTransform: 'uppercase' as const,
        letterSpacing: 1,
        userSelect: 'none' as const,
        WebkitUserSelect: 'none' as const,
        touchAction: 'manipulation' as const,
    },
    heckleSkip: {
        background: 'transparent', color: '#857060',
        padding: '4px 8px', border: 'none',
        fontSize: 11, cursor: 'pointer', marginTop: 4,
    },
    heckleTimer: { fontSize: 11, color: '#857060', marginTop: 4 },
    heckleDone: {
        fontSize: 13, fontWeight: 700, color: '#73C47B',
        marginTop: 4,
    },
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

export function ShareCard({ matchId, me, myShots, opponentShots, par, onDismiss, onHeckleCommit }: Props) {
    const [copied, setCopied] = useState(false);
    const myStrokes = myShots[myShots.length - 1]?.strokes ?? 0;
    const oppStrokes = opponentShots[opponentShots.length - 1]?.strokes ?? null;

    // Heckle mash state: a 4-second tap window. Each tap adds
    // HECKLE_TAP_VALUE (capped at 100). Committed automatically when
    // the timer expires, or skipped via the "skip" button.
    const [heckleLevel, setHeckleLevel] = useState(0);
    const [heckleMs, setHeckleMs] = useState(HECKLE_WINDOW_MS);
    const [heckleDone, setHeckleDone] = useState(false);
    const committedRef = useRef(false);
    const startedRef = useRef(false);

    useEffect(() => {
        if (heckleDone) return;
        if (!startedRef.current) {
            startedRef.current = true;
        }
        const tick = setInterval(() => {
            setHeckleMs(ms => {
                if (ms <= 100) {
                    clearInterval(tick);
                    setHeckleDone(true);
                    return 0;
                }
                return ms - 100;
            });
        }, 100);
        return () => clearInterval(tick);
    }, [heckleDone]);

    useEffect(() => {
        if (!heckleDone || committedRef.current) return;
        committedRef.current = true;
        onHeckleCommit?.(heckleLevel);
    }, [heckleDone, heckleLevel, onHeckleCommit]);

    function handleMash() {
        if (heckleDone) return;
        setHeckleLevel(l => Math.min(100, l + HECKLE_TAP_VALUE));
    }

    function handleSkip() {
        if (heckleDone) return;
        setHeckleLevel(0);
        setHeckleDone(true);
    }

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
                <div style={styles.heckleBlock}>
                    <div style={styles.heckleLabel}>HECKLE THEM</div>
                    <div style={styles.heckleSub}>mash to wobble their next swing</div>
                    <div style={styles.heckleBarOuter}>
                        <div style={{ ...styles.heckleBarInner, width: `${heckleLevel}%` }} />
                    </div>
                    {heckleDone ? (
                        <div style={styles.heckleDone}>
                            {heckleLevel === 0 ? 'no heckle sent' : `heckle armed: ${heckleLevel}%`}
                        </div>
                    ) : (
                        <>
                            <button style={styles.heckleBtn} onClick={handleMash} onTouchStart={(e) => { e.preventDefault(); handleMash(); }}>
                                MASH ({heckleLevel}%)
                            </button>
                            <div style={styles.heckleTimer}>{(heckleMs / 1000).toFixed(1)}s left</div>
                            <button style={styles.heckleSkip} onClick={handleSkip}>skip heckle</button>
                        </>
                    )}
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
