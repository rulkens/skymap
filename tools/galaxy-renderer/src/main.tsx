/**
 * Galaxy Renderer — entry point.
 *
 * Mounts `App` inside a fresh `createGalaxyStore()` — the tool's whole UI
 * shell (Viewport, Hud, ComparePanel, ControlsPanel) reads and writes that
 * one store; `connectEngineBridge` is the sole place any of it touches the
 * live engine handle (see `App.tsx`).
 */
// The tool and the app must share one palette so a look tuned here
// transfers directly to skymap's own UI — this pulls in the app's design
// tokens (and page reset) as the tool's sole token vocabulary.
import '../../../src/styles/global.css';

import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import App from './ui/App/App';
import { createGalaxyStore } from './state/createStore';

const root = document.getElementById('root');
if (!root) throw new Error('Galaxy Renderer: #root element not found');

const store = createGalaxyStore();

createRoot(root).render(
  <Provider store={store}>
    <App />
  </Provider>,
);
