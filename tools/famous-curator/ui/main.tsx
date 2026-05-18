/**
 * Curator React entry.  Wraps App in <ApiProvider> with the default
 * (real-fetch) API.  Tests render <ApiProvider value={fakeApi}><App />
 * </ApiProvider> directly without touching this file.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ApiProvider } from './apiContext';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');
createRoot(rootEl).render(
  <StrictMode>
    <ApiProvider>
      <App />
    </ApiProvider>
  </StrictMode>,
);
