import { useEffect, useMemo, useRef, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import { HUD } from './ui/HUD';
import { MenuScreen } from './ui/MenuScreen';
import { ShareCard } from './ui/ShareCard';
import { EventBus } from './game/EventBus';
import { joinOrLoadMatch, loadShots, saveShot, type Match, type Shot } from './lib/match';
import { ACTIVE_HOLE } from './game/terrain';

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

    // Subscribe to scene events for HUD + sink detection
    useEffect(() => {
        const strokesHandler = (n: number) => setStrokes(n);
        const distanceHandler = (n: number) => setDistance(n);
        const sunkHandler = async (n: number) => {
            setFinalStrokes(n);
            if (route.kind === 'match' && match) {
                await saveShot(match.id, ACTIVE_HOLE.par, me, n, true, 0);
                const fresh = await loadShots(match.id);
                setShots(fresh);
            }
            setShowShareCard(route.kind === 'match');
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
            if (!cancelled) setShots(fresh);
        })();
        return () => { cancelled = true; };
    }, [route]);

    const myShots       = useMemo(() => shots.filter(s => s.player === me), [shots, me]);
    const opponentShots = useMemo(() => shots.filter(s => s.player !== me), [shots, me]);

    if (route.kind === 'menu') {
        return <MenuScreen onPlaySolo={() => setRoute({ kind: 'solo' })} />;
    }

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} />
            <HUD holeName={ACTIVE_HOLE.name} strokes={strokes} distance={distance} />
            {showShareCard && match && (
                <ShareCard
                    matchId={match.id}
                    me={me}
                    myShots={myShots}
                    opponentShots={opponentShots}
                    par={ACTIVE_HOLE.par}
                    onDismiss={() => setShowShareCard(false)}
                />
            )}
        </div>
    );
}

export default App;
