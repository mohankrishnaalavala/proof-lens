import { createRoot } from 'react-dom/client';
import { App } from './App';
import '../styles/globals.css';
import { factCheckAdapter } from '@/lib/adapters/factcheck';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(<App />);

// Listen for API key updates from Options page and update adapter live
try {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'TL_FACTCHECK_KEY_UPDATED') {
      const apiKey = message?.payload?.apiKey as string | undefined;
      if (typeof apiKey === 'string') {
        void factCheckAdapter.setApiKey(apiKey);
      }
    }
  });
} catch (err) {
  console.debug('[TruthLens Panel] onMessage listener failed:', err);
}
