/**
 * Galaxy Renderer — entry point.
 *
 * Mounts `App` inside a fresh `createGalaxyStore()` — the tool's whole UI
 * shell (Viewport, Hud, ComparePanel, ControlsPanel) reads and writes that
 * one store; `connectEngineBridge` is the sole place any of it touches the
 * live engine handle (see `App.tsx`).
 */
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

// Dev-only GPU/CPU generation parity check, run from the browser console as
// `await window.__galaxyParity()`. Gated on `import.meta.env.DEV` and lazily
// imported so `runGpuParity` — which owns its own throwaway adapter/device,
// entirely separate from the live engine — never enters the production
// bundle (see `gpuParityHarness.ts`'s module header for why it's kept off to
// the side of the real engine at all).
if (import.meta.env.DEV) {
  void import('./dev/gpuParityHarness').then(({ runGpuParity }) => {
    (window as typeof window & { __galaxyParity: typeof runGpuParity }).__galaxyParity =
      runGpuParity;
  });
}
