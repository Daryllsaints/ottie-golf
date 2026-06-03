import { useEffect, useRef, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import { HUD } from './ui/HUD';
import { EventBus } from './game/EventBus';

function App() {
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [strokes, setStrokes] = useState(0);

    useEffect(() => {
        const handler = (next: number) => setStrokes(next);
        EventBus.on('strokes-changed', handler);
        return () => {
            EventBus.removeListener('strokes-changed', handler);
        };
    }, []);

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} />
            <HUD holeName="Hole 1" strokes={strokes} />
        </div>
    );
}

export default App;
