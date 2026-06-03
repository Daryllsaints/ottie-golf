import { useEffect, useRef, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import { HUD } from './ui/HUD';
import { EventBus } from './game/EventBus';

function App() {
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [strokes, setStrokes] = useState(0);
    const [distance, setDistance] = useState(0);

    useEffect(() => {
        const strokesHandler = (next: number) => setStrokes(next);
        const distanceHandler = (next: number) => setDistance(next);
        EventBus.on('strokes-changed', strokesHandler);
        EventBus.on('distance-to-pin', distanceHandler);
        return () => {
            EventBus.removeListener('strokes-changed', strokesHandler);
            EventBus.removeListener('distance-to-pin', distanceHandler);
        };
    }, []);

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} />
            <HUD holeName="Hole 1" strokes={strokes} distance={distance} />
        </div>
    );
}

export default App;
