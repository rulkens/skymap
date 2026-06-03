/**
 * Cosmic Flow — entry point.
 *
 * TEMP — replaced by <App> in Phase 8. This is a minimal plain-DOM bootstrap
 * that boots the WebGPU engine against a full-viewport canvas so the flow layer
 * is viewable at the Phase 6 gate, before the React UI shell exists. The real
 * App (Viewport, controls, labels overlay) lands in Phase 8.
 *
 * We import the shared skymap design tokens (`src/styles/global.css`) so the
 * tool inherits the same palette/typography as the main app. We import the flow
 * layer's `register` module for its side effect, so `listFactories()` sees it
 * when `createEngine` enumerates the registry.
 */
import '../../../src/styles/global.css';
import './visualizations/flowField/register';
import { createStore } from './state/createStore';
import { defaultAppState } from './state/defaultAppState';
import { createEngine } from './engine/createEngine';

const root = document.getElementById('root');
if (!root) throw new Error('Cosmic Flow: #root element not found');

const canvas = document.createElement('canvas');
canvas.style.width = '100vw';
canvas.style.height = '100vh';
canvas.style.display = 'block';
root.appendChild(canvas);

const store = createStore(defaultAppState);
createEngine(canvas, store).then((engine) => engine.start());
