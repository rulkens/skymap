/**
 * Curator React entry.  Mirrors the main app's `src/main.tsx` shape
 * (createRoot + StrictMode) so any contributor familiar with the
 * skymap shell can navigate the curator without surprises.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
