import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)

// Service worker temporarily disabled while we investigate a black
// screen on the solo route. Unregister any previously-installed SW
// on this device so users with a stale cached app shell self-heal
// on next visit.
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then((unregistered) => {
            if (unregistered.some(Boolean)) {
                // Once the old SW is gone, drop its caches too.
                if ('caches' in window) {
                    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
                }
            }
        })
        .catch((err) => console.warn('[sw] cleanup failed', err));
}
