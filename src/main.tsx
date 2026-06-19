/**
 * Application entry point — synchronous WebGPU support gate, then mount React.
 *
 * ### Why the synchronous gate runs before createRoot
 *
 * On a browser without `navigator.gpu` (older Safari, Firefox stable, most
 * mobile browsers as of 2026), every downstream module in our React tree
 * either fails immediately (createEngine throws) or runs a no-op render
 * loop and shows the user a black canvas with no explanation.  We want a
 * deliberate "your browser can't do this, here's why" surface, and we want
 * it WITHOUT the cost of instantiating React + useEngine + useFamousMeta
 * just to render one error.  A synchronous `typeof navigator.gpu` check at
 * the top of main.tsx accomplishes that: on unsupported browsers we swap
 * the body's innerHTML to the static page (`renderUnsupportedPageHtml()`)
 * and bail before `createRoot` is ever called.
 *
 * The check is intentionally permissive — it fires only on "definitely no
 * WebGPU" (the property is `undefined`).  If `navigator.gpu` exists but
 * `requestAdapter()` returns `null` (the GPU is present but the driver
 * refuses), that's a runtime failure surfaced via the splash's error state
 * (handled inside `useSplash`).  Two different failure modes, two different
 * surfaces — the gate here covers only the synchronously-detectable one.
 *
 * ### React 19 createRoot
 *
 * Standard React 18+ entry pattern.  Concurrent features, automatic batching,
 * Suspense — see the legacy header comment for the full rationale.  We do
 * NOT wrap `<App />` in `<React.StrictMode>` because StrictMode double-mounts
 * components and our WebGPU engine is not designed for that pattern (it
 * creates GPU resources and starts a render loop on mount).
 *
 * The app is wrapped in the redux `<Provider>` whose store is constructed here,
 * once, from `createAppStore` seeded with the viewport-derived boot tier. That
 * single store instance is the one settings store the app owns: React reads it
 * through the `<Provider>`, and the engine reads it through `useEngine` →
 * `createEngine`, so there is no second store to drift.
 */

import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './components/App/App';
import { createAppStore } from './store/createAppStore';
import { SagaContextProvider } from './store/SagaContextProvider';
import { settingsRoute } from './store/constants';
import { buildInitialSettings } from './state/settings/initialState';
import { initialTierFromViewport } from './utils/initialTierFromViewport';
import { renderUnsupportedPageHtml } from './unsupportedPage';
// Side-effect import — defines design-token custom properties on `:root`
// and the page-level reset.  Loaded once at app boot so every CSS module
// can reference `var(--token-name)`.
import './styles/global.css';

const root = document.getElementById('root');
if (!root) {
  // index.html always contains `<div id="root"></div>`.  If it's missing
  // we're catastrophically broken — throw rather than silently render
  // into nothing.
  throw new Error('main.tsx: #root element not found in index.html');
}

if (typeof navigator === 'undefined' || typeof navigator.gpu === 'undefined') {
  // No WebGPU — swap the entire document body for the static unsupported
  // page and bail.  React never mounts; no engine objects are constructed.
  document.body.innerHTML = renderUnsupportedPageHtml();
} else {
  // Seed the settings store with the viewport-derived boot tier — the ONE home
  // for that derivation. The same store instance is injected into the engine
  // (via useEngine → createEngine) and read by React through <Provider>, so
  // there is no second settings store to drift.
  const initialTier = initialTierFromViewport(window.innerWidth);
  const { store, setSagaContext } = createAppStore({
    [settingsRoute]: buildInitialSettings({ initialTier }),
  });
  createRoot(root).render(
    <Provider store={store}>
      <SagaContextProvider value={setSagaContext}>
        <App />
      </SagaContextProvider>
    </Provider>,
  );
}
