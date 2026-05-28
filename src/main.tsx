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
 */

import { createRoot } from 'react-dom/client';
import { App } from './components/App/App';
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
  createRoot(root).render(<App />);
}
