import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (typeof window !== 'undefined') {
  const isIframe = (() => {
    try {
      return window.parent !== window;
    } catch (e) {
      return true;
    }
  })();

  const isSillyTavern = (
    (window as any).SillyTavern !== undefined ||
    (window as any).st !== undefined ||
    (window as any).APP_READY !== undefined ||
    isIframe
  );

  if (isSillyTavern) {
    try {
      try {
        Object.defineProperty(window, 'APP_READY', {
          value: true,
          writable: true,
          configurable: true,
        });
      } catch (e) {
        (window as any).APP_READY = true;
      }

      console.log('[SillyTavern] APP_READY set:', (window as any).APP_READY);

      try {
        if (window.parent !== window) {
          window.parent.postMessage({
            type: 'APP_READY',
            source: 'wenwan-game',
            ready: true,
          }, '*');

          window.parent.postMessage({
            type: 'SILLYTAVERN_GET_DATA',
            request: {
              character: true,
              preset: true,
              lorebook: true,
            },
          }, '*');
        }
      } catch (postError) {
        console.warn('[SillyTavern] Failed to send APP_READY via postMessage:', postError);
      }

      try {
        const urlParams = new URLSearchParams(window.location.search);
        const hash = window.location.hash;

        const charParam = urlParams.get('character') || urlParams.get('char');
        const presetParam = urlParams.get('preset');
        const lorebookParam = urlParams.get('lorebook');

        if (charParam || presetParam || lorebookParam) {
          console.log('[SillyTavern] Detected bootstrap data in URL params.');
        }

        if (hash && hash.startsWith('#')) {
          try {
            const hashData = JSON.parse(decodeURIComponent(hash.substring(1)));
            if (hashData.character || hashData.preset || hashData.lorebook) {
              console.log('[SillyTavern] Detected bootstrap data in URL hash.');
            }
          } catch (e) {
            // Ignore malformed hash payloads.
          }
        }
      } catch (urlError) {
        console.warn('[SillyTavern] Failed to inspect URL bootstrap params:', urlError);
      }
    } catch (error) {
      console.warn('[SillyTavern] Failed to send APP_READY signal:', error);
    }
  } else {
    console.warn('[SillyTavern] Standalone mode detected. Not running inside SillyTavern, so bootstrap data requests are skipped.');
  }
}
