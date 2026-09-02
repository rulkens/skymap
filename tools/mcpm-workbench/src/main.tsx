/**
 * MCPM Workbench — entry point. Imports the shared skymap design tokens
 * (`src/styles/global.css`) so the tool inherits the main app's
 * palette/typography, then mounts the React <App> shell. `?probe`
 * (probeGpuErrors.ts, the headless GPU-error gate) needs no wiring here: it
 * is read live off `window.location.search` wherever it matters —
 * `watchCatalogSaga` (synthetic catalog, no network) and defaultAppState.ts
 * (100k-agent, small-grid overrides).
 */
import '../../../src/styles/global.css';
import { createRoot } from 'react-dom/client';
import App from './ui/App/App';

const root = document.getElementById('root');
if (!root) throw new Error('MCPM Workbench: #root element not found');

createRoot(root).render(<App />);
