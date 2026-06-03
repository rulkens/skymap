/**
 * Cosmic Flow — entry point.
 *
 * Imports the shared skymap design tokens (`src/styles/global.css`) so the tool
 * inherits the main app's palette/typography, then registers the visualization
 * layers (side-effect imports — so `listFactories()` sees them when the engine
 * enumerates the registry) and mounts the React <App> shell. App owns the store,
 * the Viewport boots the WebGPU engine, and the overlays render on top.
 */
import '../../../src/styles/global.css';
import './visualizations/flowField/register';
import './visualizations/densityVolume/register';
import { createRoot } from 'react-dom/client';
import App from './ui/App/App';

const root = document.getElementById('root');
if (!root) throw new Error('Cosmic Flow: #root element not found');

createRoot(root).render(<App />);
