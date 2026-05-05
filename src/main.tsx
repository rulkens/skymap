/**
 * Application entry point — mounts the React tree.
 *
 * This file is intentionally minimal: it finds the root DOM node and hands
 * control to `<App />`. All the interesting work happens in `App.tsx`
 * (engine lifecycle, state management) and the component tree beneath it.
 *
 * ### React 19 createRoot
 *
 * `createRoot` is the React 18+ API for rendering. It enables concurrent
 * features (automatic batching, transitions, Suspense for data fetching) and
 * replaces the legacy `ReactDOM.render`. The call:
 *
 *   createRoot(container).render(<App />)
 *
 * mounts the React tree into `container` and starts the first render. After
 * this point, React owns the DOM subtree inside `container` — do not modify
 * it imperatively.
 *
 * ### No React.StrictMode
 *
 * We deliberately do NOT wrap `<App />` in `<React.StrictMode>`. StrictMode
 * double-mounts components in development to surface cleanup bugs, but our
 * WebGPU engine is not designed for double-mounting (it creates GPU resources
 * and starts a render loop on mount). See the note in `App.tsx` for the full
 * reasoning. The cleanup in `App.tsx`'s `useEffect` is still correct — it just
 * runs on hot-reload, not on every development mount.
 *
 * ### The `!` non-null assertion
 *
 * `document.getElementById('root')` returns `HTMLElement | null`. We use `!`
 * to assert it is non-null. This is safe because `index.html` always contains
 * `<div id="root"></div>` — if that element is missing, the app is broken by
 * a build/deployment error, not a runtime condition we can gracefully handle.
 * In that scenario, throwing immediately (rather than silently rendering into
 * `null`) is the correct behaviour.
 */

import { createRoot } from 'react-dom/client';
import { App } from './components/App/App';
// Side-effect import — defines the design-token custom properties on
// `:root` and the page-level reset.  Loaded once at app boot so every
// CSS module can reference the variables via `var(--token-name)`.
import './styles/global.css';

// Mount the React app into the `#root` div declared in index.html.
createRoot(document.getElementById('root')!).render(<App />);
