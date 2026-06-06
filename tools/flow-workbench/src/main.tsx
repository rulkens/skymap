/**
 * Flow Workbench — entry point.
 *
 * Imports the shared skymap design tokens (`src/styles/global.css`) so the tool
 * inherits the main app's palette/typography, then mounts the React <App> shell.
 * App owns the store, the Viewport boots the WebGPU flow harness (which drives
 * the canonical runtime flow renderer), and the overlays render on top. There is
 * no visualization registry anymore — the harness consumes the one real renderer
 * directly, so there are no side-effect register imports.
 */
import '../../../src/styles/global.css';
import { createRoot } from 'react-dom/client';
import App from './ui/App/App';

const root = document.getElementById('root');
if (!root) throw new Error('Cosmic Flow: #root element not found');

createRoot(root).render(<App />);
