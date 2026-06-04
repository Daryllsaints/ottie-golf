import { useEffect, useMemo, useRef, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import { HUD } from './ui/HUD';
import { MenuScreen } from './ui/MenuScreen';
import { ShareCard } from './ui/ShareCard';
import { EventBus } from './game/EventBus';
import { currentHoleForPlayer, joinOrLoadMatch, loadShots, markMatchCompleteIfDone, pendingHeckleFor, saveShot, type Match, type Shot } from './lib/match';
import { ACTIVE_HOLE, HOLES, setHoleIndex, activeHoleIndex } from './game/terrain';

type Route =
    | { kind: 'menu' }
    | { kind: 'solo' }
    | { kind: 'match'; code: string };

function parseRoute(): Route {
    if (typeof window === 'undefined') return { kind: 'menu' };
    const path = window.location.pathname;
    const m = path.match(/^\/m\/([a-z0-9]+)/i);
    if (m) return { kind: 'match', code: m[1].toLowerCase() };
    return { kind: 'menu' };
}

function App() {
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [route, setRoute] = useState<Route>(() => parseRoute());
    const [strokes, setStrokes] = useState(0);
    const [distance, setDistance] = useState(0);
    const [match, setMatch] = useState<Match | null>(null);
    const [me, setMe] = useState<'A' | 'B'>('A');
    const [shots, setShots] = useState<Shot[]>([]);
    const [showShareCard, setShowShareCard] = useState(false);
    const [finalStrokes, setFinalStrokes] = useState(0);
    const [pendingHeckleLevel, setPendingHeckleLevel] = useState(0);
    const [showHeckleToast, setShowHeckleToast] = useState(false);
    const [holeIdx, setHoleIdx] = useState(0);
    const [matchComplete, setMatchComplete] = useState(false);
    const [recap, setRecap] = useState<null | { prevName: string; nextName: string; nextPar: number; me: number; opp: number; nextNum: number }>(null);
    const pendingHeckleCommitRef = useRef(0);

    function restartSceneForHole(nextIdx: number) {
        setHoleIndex(nextIdx);
        setHoleIdx(nextIdx);
        const scene = phaserRef.current?.scene;
        if (scene) scene.scene.restart();
    }

    /** Shows a 2-second recap card between holes, then restarts the
     *  scene to the next hole. Frees players from carrying running
     *  scores in working memory. */
    function showRecapThenAdvance(nextIdx: number) {
        const prevHole = HOLES[nextIdx - 1];
        const nextHole = HOLES[nextIdx];
        if (!prevHole || !nextHole) {
            restartSceneForHole(nextIdx);
            return;
        }
        setRecap({
            prevName: prevHole.name,
            nextName: nextHole.name,
            nextPar: nextHole.par,
            me: myTotal,
            opp: opponentTotal,
            nextNum: nextIdx + 1,
        });
        setTimeout(() => {
            setRecap(null);
            restartSceneForHole(nextIdx);
        }, 2200);
    }

    // Subscribe to scene events for HUD + sink detection
    useEffect(() => {
        const strokesHandler = (n: number) => setStrokes(n);
        const distanceHandler = (n: number) => setDistance(n);
        const sunkHandler = async (n: number) => {
            setFinalStrokes(n);
            const playedHoleNum = activeHoleIndex() + 1;
            const isLastHole = activeHoleIndex() >= HOLES.length - 1;
            if (route.kind === 'match' && match) {
                await saveShot(match.id, playedHoleNum, me, n, true, 0, pendingHeckleCommitRef.current);
                pendingHeckleCommitRef.current = 0;
                const fresh = await loadShots(match.id);
                setShots(fresh);
                await markMatchCompleteIfDone(match.id, fresh, HOLES.length);
            }
            if (isLastHole) setMatchComplete(true);
            setShowShareCard(route.kind === 'match' || route.kind === 'solo');
        };
        EventBus.on('strokes-changed', strokesHandler);
        EventBus.on('distance-to-pin', distanceHandler);
        EventBus.on('ball-sunk', sunkHandler);
        return () => {
            EventBus.removeListener('strokes-changed', strokesHandler);
            EventBus.removeListener('distance-to-pin', distanceHandler);
            EventBus.removeListener('ball-sunk', sunkHandler);
        };
    }, [route, match, me]);

    // Load match data when entering a match route
    useEffect(() => {
        if (route.kind !== 'match') return;
        let cancelled = false;
        (async () => {
            const result = await joinOrLoadMatch(route.code);
            if (cancelled || !result) return;
            setMatch(result.match);
            setMe(result.me);
            const fresh = await loadShots(result.match.id);
            if (cancelled) return;
            setShots(fresh);
            // Per-player hole tracking: each player resumes at their next
            // unfinished hole, regardless of where the opponent is.
            const myHole1Indexed = currentHoleForPlayer(result.me, fresh);
            const idx = Math.max(0, Math.min(HOLES.length - 1, myHole1Indexed - 1));
            setHoleIndex(idx);
            setHoleIdx(idx);
            if (myHole1Indexed > HOLES.length) setMatchComplete(true);
            // Check for a pending heckle from the opponent. If found,
            // arm it for the next swing and surface the toast.
            const pending = pendingHeckleFor(result.me, fresh);
            if (pending) {
                setPendingHeckleLevel(pending.level);
                setShowHeckleToast(true);
                EventBus.emit('heckle-armed', pending.level);
                // Rumble-tap haptic where supported.
                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                    navigator.vibrate([60, 40, 60, 40, 120]);
                }
                setTimeout(() => setShowHeckleToast(false), 2400);
            }
        })();
        return () => { cancelled = true; };
    }, [route]);

    const myShots       = useMemo(() => shots.filter(s => s.player === me), [shots, me]);
    const opponentShots = useMemo(() => shots.filter(s => s.player !== me), [shots, me]);
    const myTotal       = useMemo(() => myShots.reduce((s, x) => s + x.strokes, 0), [myShots]);
    const opponentTotal = useMemo(() => opponentShots.reduce((s, x) => s + x.strokes, 0), [opponentShots]);
    const totalPar      = useMemo(() => HOLES.reduce((s, h) => s + h.par, 0), []);
    const opponentName  = useMemo(() => {
        if (!match) return null;
        const raw = me === 'A' ? match.player_b_name : match.player_a_name;
        return raw && raw.trim().length > 0 ? raw.trim() : null;
    }, [match, me]);

    if (route.kind === 'menu') {
        return <MenuScreen onPlaySolo={() => setRoute({ kind: 'solo' })} />;
    }

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} />
            <HUD
                holeName={ACTIVE_HOLE.name}
                strokes={strokes}
                distance={distance}
                holeNum={holeIdx + 1}
                holeCount={HOLES.length}
                runningTotals={route.kind === 'match' ? { me: myTotal, opp: opponentTotal, opponentLabel: opponentName ?? 'them' } : undefined}
            />
            {showShareCard && match && (
                <ShareCard
                    matchId={match.id}
                    me={me}
                    myShots={myShots}
                    opponentShots={opponentShots}
                    par={ACTIVE_HOLE.par}
                    onDismiss={() => {
                        setShowShareCard(false);
                        if (!matchComplete) {
                            showRecapThenAdvance(holeIdx + 1);
                        }
                    }}
                    onHeckleCommit={(level) => { pendingHeckleCommitRef.current = level; }}
                    matchComplete={matchComplete}
                    myTotal={myTotal}
                    opponentTotal={opponentTotal}
                    totalPar={totalPar}
                    nextLabel={matchComplete ? 'match complete' : `next hole (${holeIdx + 2})`}
                    opponentName={opponentName}
                />
            )}
            {showHeckleToast && (
                <div style={heckleBackdropStyle}>
                    <div style={{ ...heckleCardStyle, animation: 'ottieHecklePop 280ms ease-out' }}>
                        <div style={heckleEyebrowStyle}>
                            {opponentName ? `${opponentName.toUpperCase()} HECKLED YOU` : 'HECKLE INCOMING'}
                        </div>
                        <div style={heckleNumberStyle}>{pendingHeckleLevel}%</div>
                        <div style={heckleFooterStyle}>your next swing is going to wobble</div>
                    </div>
                </div>
            )}
            {recap && (
                <div style={recapBackdropStyle}>
                    <div style={{ ...recapCardStyle, animation: 'ottieHecklePop 240ms ease-out' }}>
                        <div style={recapEyebrowStyle}>{recap.prevName} done</div>
                        <div style={recapScoreRow}>
                            <div style={recapScoreCell}>
                                <div style={recapScoreLabel}>you</div>
                                <div style={recapScoreNum}>{recap.me}</div>
                            </div>
                            <div style={recapScoreCell}>
                                <div style={recapScoreLabel}>{opponentName ?? 'them'}</div>
                                <div style={recapScoreNum}>{recap.opp}</div>
                            </div>
                        </div>
                        <div style={recapNextStyle}>
                            now: hole {recap.nextNum} · {recap.nextName} · par {recap.nextPar}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const heckleBackdropStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 300,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.55)', pointerEvents: 'none',
};
const heckleCardStyle: React.CSSProperties = {
    background: '#2A1810', color: '#FFF8E7',
    padding: '22px 28px', borderRadius: 16,
    fontFamily: 'system-ui, sans-serif',
    textAlign: 'center',
    border: '3px solid #C8543A',
    boxShadow: '0 10px 40px rgba(200,84,58,0.4)',
    minWidth: 240,
};
const heckleEyebrowStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 800, letterSpacing: 3,
    color: '#E8922A', marginBottom: 6,
};
const heckleNumberStyle: React.CSSProperties = {
    fontSize: 48, fontWeight: 900, color: '#FFF8E7',
    lineHeight: 1, marginBottom: 8,
};
const heckleFooterStyle: React.CSSProperties = {
    fontSize: 12, color: '#A68B6D', fontStyle: 'italic',
};

const recapBackdropStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 250,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.6)', pointerEvents: 'none',
};
const recapCardStyle: React.CSSProperties = {
    background: '#FFF8E7', color: '#3A2814',
    padding: '22px 28px', borderRadius: 16,
    fontFamily: 'system-ui, sans-serif',
    textAlign: 'center',
    border: '2px solid #E8922A',
    boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
    minWidth: 260,
};
const recapEyebrowStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 800, letterSpacing: 2,
    color: '#A68B6D', marginBottom: 14, textTransform: 'uppercase',
};
const recapScoreRow: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-around',
    background: '#FFE9C0', borderRadius: 10, padding: 12,
    marginBottom: 12,
};
const recapScoreCell: React.CSSProperties = { textAlign: 'center' };
const recapScoreLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: '#A68B6D',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3,
};
const recapScoreNum: React.CSSProperties = {
    fontSize: 26, fontWeight: 900, color: '#3A2814', lineHeight: 1,
};
const recapNextStyle: React.CSSProperties = {
    fontSize: 13, color: '#857060', fontStyle: 'italic',
};

export default App;
