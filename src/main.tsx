import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)

// Register the PWA service worker. Lets the game open offline on
// repeat visits and earns the install-to-home-screen prompt on iOS
// and Android. Production-only so the dev experience stays uncached.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
            console.warn('[sw] registration failed', err);
        });
    });
}
