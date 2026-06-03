/**
 * Cosmic Flow — React entry point.
 *
 * This is the stub bootstrap: it mounts a placeholder into `#root` so the
 * Vite app boots end-to-end before any real UI exists. The actual App
 * component — Viewport, controls, the WebGPU flow renderer — lands in a
 * later task.
 *
 * We import the shared skymap design tokens (`src/styles/global.css`) so the
 * tool inherits the same `var(--token)` palette and typography as the main
 * app and the curator, keeping a single source of truth for the look.
 * From `tools/cosmic-flow/src/`, three `..` segments reach the repo root,
 * then `src/styles/global.css`.
 */

import { createRoot } from 'react-dom/client';
import '../../../src/styles/global.css';

// Real App lands in a later task
const container = document.getElementById('root');
if (!container) throw new Error('Cosmic Flow: #root element not found');
createRoot(container).render(<div>CosmicFlow</div>);
