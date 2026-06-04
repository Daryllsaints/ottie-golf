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
    const pendingHeckleCommitRef = useRef(0);

    function restartSceneForHole(nextIdx: number) {
        setHoleIndex(nextIdx);
        setHoleIdx(nextIdx);
        const scene = phaserRef.current?.scene;
        if (scene) scene.scene.restart();
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
                setTimeout(() => setShowHeckleToast(false), 3500);
            }
        })();
        return () => { cancelled = true; };
    }, [route]);

    const myShots       = useMemo(() => shots.filter(s => s.player === me), [shots, me]);
    const opponentShots = useMemo(() => shots.filter(s => s.player !== me), [shots, me]);

    if (route.kind === 'menu') {
        return <MenuScreen onPlaySolo={() => setRoute({ kind: 'solo' })} />;
    }

    const myTotal       = useMemo(() => myShots.reduce((s, x) => s + x.strokes, 0), [myShots]);
    const opponentTotal = useMemo(() => opponentShots.reduce((s, x) => s + x.strokes, 0), [opponentShots]);
    const totalPar      = useMemo(() => HOLES.reduce((s, h) => s + h.par, 0), []);

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} />
            <HUD
                holeName={ACTIVE_HOLE.name}
                strokes={strokes}
                distance={distance}
                holeNum={holeIdx + 1}
                holeCount={HOLES.length}
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
                            restartSceneForHole(holeIdx + 1);
                        }
                    }}
                    onHeckleCommit={(level) => { pendingHeckleCommitRef.current = level; }}
                    matchComplete={matchComplete}
                    myTotal={myTotal}
                    opponentTotal={opponentTotal}
                    totalPar={totalPar}
                    nextLabel={matchComplete ? 'match complete' : `next hole (${holeIdx + 2})`}
                />
            )}
            {showHeckleToast && (
                <div style={heckleToastStyle}>
                    your friend heckled you {pendingHeckleLevel}%
                </div>
            )}
        </div>
    );
}

const heckleToastStyle: React.CSSProperties = {
    position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
    background: '#2A1810', color: '#E8922A',
    padding: '12px 18px', borderRadius: 12,
    fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: 800,
    letterSpacing: 1, textTransform: 'uppercase',
    border: '2px solid #C8543A',
    zIndex: 300, boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
};

export default App;
