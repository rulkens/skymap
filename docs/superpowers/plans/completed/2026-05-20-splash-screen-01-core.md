# Splash Screen — Core Implementation Plan (Part 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Companion plan:** `2026-05-20-splash-screen-02-stub-tour.md` — implements the camera tour that the Tour button triggers. Plan 2 depends on this plan landing first. While this plan is in flight, Tour renders a no-op stub so the loading curtain ships standalone.

**Goal:** Add a first-paint splash that covers the WebGPU init + first-catalog-batch window with branded content, two CTAs (Explore + Tour), a reopener pill in the top-bar, and graceful failure handling. Pre-React WebGPU-unsupported gate ships alongside.

**Architecture:** A new `Splash` component is rendered conditionally above the existing `uiStack`, gated by a new `useSplash` hook that owns localStorage versioning, deep-link detection, readiness signaling (engine status + load progress + famous-meta), and the 8 s "Continue anyway" timer. An `AboutPill` component joins the existing `topBar` flex row. A synchronous WebGPU support check in `main.tsx` swaps the React root for a static page when `navigator.gpu` is missing — React never mounts on unsupported browsers.

**Tech Stack:** React 19, TypeScript, CSS modules, Vitest + @testing-library/react + jsdom. Reuses existing engine handle (`useEngine`'s `status`/`loadProgress`/`handleRef`) and `useFamousMeta` (with a new `ready` field added).

---

## Skymap conventions reminder (applies to every task below)

- Always `export type X = { ... }`. Never `interface`. (Project convention.)
- Every module gets a multi-paragraph didactic header comment explaining *why* it exists and what alternatives were considered — match the style of existing files like `LoadingBar.tsx`, `SearchTrigger.tsx`. (Project convention.)
- No barrel exports for components. Import directly from the `.tsx` file. (Project convention.)
- Tests live under `tests/` mirroring `src/`. Component tests use jsdom (`// @vitest-environment jsdom`) + `@testing-library/react`.
- The dev server is left running. Do not kill it; do not run `npm run dev`.
- Run tests with `npm test` (single pass, vitest run) or a focused `npx vitest run <path>`.

---

## Task 1: WebGPU-unsupported static page module

**Files:**
- Create: `src/unsupportedPage.ts`
- Test: `tests/unsupportedPage.test.ts`

**Why this is a task on its own:** the splash work assumes React mounts; on browsers without `navigator.gpu` we never want to mount React at all (instantiating useEngine / useFamousMeta on an unsupported browser would just produce errors). A tiny pure module that returns the static HTML string is cleanest — main.tsx (Task 2) just calls it.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unsupportedPage.test.ts
import { describe, it, expect } from 'vitest';
import { renderUnsupportedPageHtml } from '../src/unsupportedPage';

describe('renderUnsupportedPageHtml', () => {
  it('returns a non-empty HTML string', () => {
    const html = renderUnsupportedPageHtml();
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(50);
  });

  it('mentions WebGPU and a supported-browser recommendation', () => {
    const html = renderUnsupportedPageHtml();
    expect(html).toMatch(/WebGPU/i);
    expect(html.toLowerCase()).toMatch(/chrome|edge/);
  });

  it('links to the caniuse WebGPU page so users can self-diagnose', () => {
    const html = renderUnsupportedPageHtml();
    expect(html).toContain('https://caniuse.com/webgpu');
  });

  it('uses the skymap brand colors and is full-viewport', () => {
    const html = renderUnsupportedPageHtml();
    // Spot-check the structural markers; we don't lock the exact CSS.
    expect(html).toContain('100vh');
    expect(html.toLowerCase()).toContain('skymap');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unsupportedPage.test.ts`
Expected: FAIL with "Cannot find module '../src/unsupportedPage'".

- [ ] **Step 3: Write the module**

```ts
// src/unsupportedPage.ts
/**
 * renderUnsupportedPageHtml — produce the static HTML body shown to
 * visitors whose browser lacks `navigator.gpu`.
 *
 * ### Why a string-returning function rather than a JSX component
 *
 * On unsupported browsers we never want to mount React.  Doing so would
 * instantiate `useEngine` / `useFamousMeta` / the entire splash machinery
 * for a session that can't render a single frame — wasted code, wasted
 * error surfaces, and one more place where "did we forget to early-return?"
 * could bite us.  Instead, `main.tsx` checks `typeof navigator.gpu === 'undefined'`
 * synchronously *before* `createRoot`, swaps the body's innerHTML to the
 * string returned here, and bails.  React never enters the picture.
 *
 * ### Why static HTML and inline styles
 *
 * The only CSS the unsupported page needs is dark-on-light contrast and a
 * centered card.  Pulling in the design-token stylesheet would require
 * either an import-and-bundle (defeats the "React never mounts" point) or
 * a side-effect import in main.tsx that runs even on the happy path.
 * Inline styles keep the unsupported page self-contained: one function,
 * one return value, no external dependencies.
 *
 * ### Why we link to caniuse rather than enumerating support
 *
 * The WebGPU support matrix changes month to month — Safari Technology
 * Preview, Firefox Nightly, mobile Chrome rollout, etc.  Anything we
 * hard-code here ages worse than caniuse does.  The text says "use a
 * recent version of Chrome or Edge" (the safe always-true recommendation
 * today) and the link delegates the live matrix to the canonical source.
 */
export function renderUnsupportedPageHtml(): string {
  return `
<main style="
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #d8dde7;
  background: #05070d;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  margin: 0;
">
  <section style="
    max-width: 520px;
    background: rgba(8, 12, 28, 0.85);
    border: 1px solid rgba(120, 160, 240, 0.25);
    border-radius: 12px;
    padding: 32px;
    text-align: center;
  ">
    <h1 style="margin: 0 0 16px; font-size: 24px; color: #ffffff;">
      Skymap needs WebGPU
    </h1>
    <p style="margin: 0 0 16px; line-height: 1.5;">
      Your browser doesn't support WebGPU yet. Skymap renders millions of
      galaxies in 3D and needs the modern GPU API to do that smoothly.
    </p>
    <p style="margin: 0 0 24px; line-height: 1.5;">
      Try a recent version of <strong>Chrome</strong> or <strong>Edge</strong> on
      desktop, or check the live support matrix:
    </p>
    <p style="margin: 0;">
      <a
        href="https://caniuse.com/webgpu"
        style="color: #7fb5ff; text-decoration: underline;"
        rel="noopener"
      >caniuse.com/webgpu</a>
    </p>
  </section>
</main>
  `.trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unsupportedPage.test.ts`
Expected: PASS — all four assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/unsupportedPage.ts tests/unsupportedPage.test.ts
git commit -m "$(cat <<'EOF'
feat(splash): add WebGPU-unsupported static page renderer

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire the pre-React WebGPU gate into main.tsx

**Files:**
- Modify: `src/main.tsx` (replace the `createRoot` call)
- Test: covered by manual smoke (Vitest's node env can't simulate a real `navigator.gpu` missing condition cleanly; we keep the renderer pure-tested in Task 1).

- [ ] **Step 1: Replace `src/main.tsx`**

```tsx
// src/main.tsx
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
```

- [ ] **Step 2: Run typecheck to confirm no regressions**

Run: `npm run typecheck`
Expected: PASS — no new errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — all existing tests still green (no test depends on the old main.tsx body).

- [ ] **Step 4: Commit**

```bash
git add src/main.tsx
git commit -m "$(cat <<'EOF'
feat(splash): synchronous WebGPU support gate in main.tsx

Skips React mount on browsers without navigator.gpu and renders a
static "use Chrome or Edge" page instead.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Expose a `ready` signal from `useFamousMeta`

**Files:**
- Modify: `src/@types/engine/UseFamousMetaReturn.d.ts`
- Modify: `src/hooks/useFamousMeta.ts`
- Test: `tests/hooks/useFamousMeta.test.ts` (new)

**Why:** `useSplash` (Task 5) needs to know when the famous-meta JSON has loaded so the CTAs can activate. Today `useFamousMeta` returns `{ famousMeta, famousXrefs }` but provides no way to distinguish "still loading" from "loaded successfully" (both states have `famousMeta.length === 0` until the fetch resolves). We add a `ready: boolean` flag that flips true on success OR on the swallowed-error path (per the existing "absent file = feature off" UX, a 404 is still "we tried, the splash should activate").

- [ ] **Step 1: Update the type**

```ts
// src/@types/engine/UseFamousMetaReturn.d.ts
import type { FamousMetaEntry } from '../loading/FamousMetaEntry';
import type { FamousXrefMap } from '../loading/FamousXrefMap';

export type UseFamousMetaReturn = {
  famousMeta: readonly FamousMetaEntry[];
  famousXrefs: FamousXrefMap;
  /**
   * True once the famous-meta fetch has settled (success OR swallowed
   * error).  Splash gating reads this to know when the Tour CTA can
   * activate.  Mirrors the fail-soft UX: a missing famous_meta.json
   * still flips `ready` to true (with empty meta arrays) so the splash
   * doesn't deadlock on a deployment that hasn't shipped the sidecar.
   */
  ready: boolean;
};
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/hooks/useFamousMeta.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Mock the fetcher before importing the hook so the import binds to the mock.
vi.mock('../../src/services/loading/fetchers/famousMetaFetcher', () => ({
  famousMetaFetcher: vi.fn(),
}));

import { famousMetaFetcher } from '../../src/services/loading/fetchers/famousMetaFetcher';
import { useFamousMeta } from '../../src/hooks/useFamousMeta';

describe('useFamousMeta `ready` flag', () => {
  beforeEach(() => {
    vi.mocked(famousMetaFetcher).mockReset();
  });

  it('starts with ready=false', () => {
    vi.mocked(famousMetaFetcher).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useFamousMeta());
    expect(result.current.ready).toBe(false);
  });

  it('flips ready=true once the fetch resolves', async () => {
    vi.mocked(famousMetaFetcher).mockResolvedValue({ meta: [], xrefs: {} });
    const { result } = renderHook(() => useFamousMeta());
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('flips ready=true even when the fetch rejects (fail-soft)', async () => {
    vi.mocked(famousMetaFetcher).mockRejectedValue(new Error('404'));
    const { result } = renderHook(() => useFamousMeta());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.famousMeta).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/hooks/useFamousMeta.test.ts`
Expected: FAIL — `result.current.ready` is undefined.

- [ ] **Step 4: Update `useFamousMeta`**

Replace the existing body with:

```ts
// src/hooks/useFamousMeta.ts
/**
 * `useFamousMeta` — load the famous-galaxy sidecars (`famous_meta.json`
 * and `famous_xrefs.json`) once at mount.  The engine *also* loads them
 * internally (via its `famousMeta` AssetSlot), but exposing a parallel
 * copy here lets the React layer (CommandPalette, deep-link drain,
 * splash gating) read them without reaching into engine private state.
 * Double-loading is cheap because the browser caches the JSON fetch —
 * both readers hit the same response.
 *
 * ### Why we expose a `ready` flag
 *
 * The splash gating (`useSplash`) needs to know when the famous-meta
 * fetch has settled so it can activate the Tour CTA (which depends on
 * famous-meta lookups to anchor the tour beats).  `ready` flips true
 * on both success AND swallowed-error paths so a deployment without a
 * famous_meta.json doesn't deadlock the splash — same fail-soft
 * contract as the empty-state defaults below.
 *
 * ### Why call the fetcher directly (rather than the engine handle)?
 *
 * The engine's slot loads at boot, but its result lives inside engine
 * state.  Calling the pure fetcher here keeps the App's mental model
 * simple: the engine owns its copy for InfoCard text, App owns its copy
 * for palette / deep-link / splash work.  HTTP cache makes the
 * duplication free at the wire.
 *
 * ### Why catch on error rather than throw?
 *
 * The fetcher throws on network/HTTP errors so retry policy can branch
 * on status.  We catch here and fall through to empty state + `ready=true`,
 * matching the engine's own subscriber-side error handler in `engine.ts`.
 */

import { useEffect, useState } from 'react';
import { famousMetaFetcher } from '../services/loading/fetchers/famousMetaFetcher';
import type { FamousMetaEntry } from '../@types/loading/FamousMetaEntry';
import type { FamousXrefMap } from '../@types/loading/FamousXrefMap';
import type { UseFamousMetaReturn } from '../@types/engine/UseFamousMetaReturn';

export function useFamousMeta(): UseFamousMetaReturn {
  const [famousMeta, setFamousMeta] = useState<readonly FamousMetaEntry[]>([]);
  const [famousXrefs, setFamousXrefs] = useState<FamousXrefMap>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    famousMetaFetcher(undefined as void, ac.signal, () => {})
      .then((sc) => {
        setFamousMeta(sc.meta);
        setFamousXrefs(sc.xrefs);
        setReady(true);
      })
      .catch(() => {
        // Match the pre-rework "absent file = feature off" UX: a 404 or
        // network error leaves the empty defaults in place AND still flips
        // `ready` to true so the splash gate doesn't deadlock.
        setReady(true);
      });
    return () => ac.abort();
  }, []);

  return { famousMeta, famousXrefs, ready };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/hooks/useFamousMeta.test.ts`
Expected: PASS — all three assertions green.

- [ ] **Step 6: Verify no callers break**

Run: `npm run typecheck`
Expected: PASS — `App.tsx` destructures `{ famousMeta, famousXrefs }` which is still valid; the new `ready` field is additive.

- [ ] **Step 7: Commit**

```bash
git add src/@types/engine/UseFamousMetaReturn.d.ts src/hooks/useFamousMeta.ts tests/hooks/useFamousMeta.test.ts
git commit -m "$(cat <<'EOF'
feat(useFamousMeta): expose a `ready` flag for splash gating

Flips true on both success and swallowed-error paths so a missing
famous_meta.json doesn't deadlock downstream gates.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: SplashError type + deep-link detection helper

**Files:**
- Create: `src/@types/splash/SplashError.d.ts`
- Create: `src/@types/splash/UseSplashReturn.d.ts`
- Create: `src/@types/splash/UseSplashInput.d.ts`
- Create: `src/utils/url/hasDeepLink.ts`
- Test: `tests/utils/url/hasDeepLink.test.ts`

**Why split into types + a tiny pure helper:** the `useSplash` hook (Task 5) will be the largest piece in the plan; pulling out the pure deep-link predicate keeps the hook short, testable, and SSR-safe (the predicate guards `typeof window`). Putting types in `@types/splash/` follows the project's one-file-per-type convention.

- [ ] **Step 1: Write the type files**

```ts
// src/@types/splash/SplashError.d.ts
/**
 * SplashError — discriminated union of the three runtime failure modes
 * the splash can surface.  Each kind carries the minimum information
 * needed to render a specific recovery affordance.
 *
 * - `webgpu-init-failed`  → requestAdapter() returned null on a browser
 *                            that has `navigator.gpu`.  Show error +
 *                            reload button.  The synchronous "no
 *                            navigator.gpu at all" case is handled in
 *                            main.tsx before React mounts; it never
 *                            reaches the splash.
 * - `catalog-fetch-failed` → an essential galaxy catalog fetch failed.
 *                            Show error + reload button.
 * - `famous-meta-failed`   → the famous-meta sidecar failed.  Splash
 *                            stays usable: Explore live, Tour disabled
 *                            with a tooltip.  This kind is informational,
 *                            not blocking.
 */
export type SplashError =
  | { kind: 'webgpu-init-failed'; message: string }
  | { kind: 'catalog-fetch-failed'; message: string }
  | { kind: 'famous-meta-failed' };
```

```ts
// src/@types/splash/UseSplashInput.d.ts
import type { EngineStatus } from '../engine/EngineStatus';
import type { LoadProgressState } from '../loading/LoadProgressState';

/**
 * UseSplashInput — the signals the splash hook needs from upstream
 * hooks (useEngine, useFamousMeta).  Keeping these as a struct rather
 * than positional args means App.tsx can wire them in any order without
 * silently mis-binding two booleans.
 */
export type UseSplashInput = {
  /** Engine status from `useEngine`. */
  status: EngineStatus;
  /** Aggregated load progress from `useEngine`. `null` when no fetches in flight. */
  loadProgress: LoadProgressState | null;
  /** Famous-meta `ready` flag from `useFamousMeta`. */
  famousMetaReady: boolean;
};
```

```ts
// src/@types/splash/UseSplashReturn.d.ts
import type { SplashError } from './SplashError';

/**
 * UseSplashReturn — the splash hook's public surface.
 *
 * `splashVisible` is the render gate App reads.  `blocked` reports whether
 * CTAs should be disabled (loading not yet ready).  `canContinueAnyway`
 * exposes the 8 s timer's expiration so the splash can show the escape
 * link.  `error` is null on the happy path; `famous-meta-failed` leaves
 * the splash usable, the other kinds force the error layout.
 *
 * `dismissExplore` / `dismissTour` bump localStorage's `seenVersion` and
 * close the splash.  `reopen` (called by the AboutPill) shows the splash
 * again but does NOT touch localStorage — reopening is informational, not
 * a "first-time" event.
 */
export type UseSplashReturn = {
  splashVisible: boolean;
  blocked: boolean;
  canContinueAnyway: boolean;
  error: SplashError | null;
  dismissExplore: () => void;
  dismissTour: () => void;
  reopen: () => void;
};
```

- [ ] **Step 2: Write the failing test for the deep-link helper**

```ts
// tests/utils/url/hasDeepLink.test.ts
import { describe, it, expect } from 'vitest';
import { hasDeepLink } from '../../../src/utils/url/hasDeepLink';

describe('hasDeepLink', () => {
  it('returns false for empty hash and empty search', () => {
    expect(hasDeepLink({ hash: '', search: '' })).toBe(false);
  });

  it('detects #focus= in the hash', () => {
    expect(hasDeepLink({ hash: '#focus=ngc224', search: '' })).toBe(true);
  });

  it('detects #poi= in the hash', () => {
    expect(hasDeepLink({ hash: '#poi=virgo-cluster', search: '' })).toBe(true);
  });

  it('detects ?tour= in the search', () => {
    expect(hasDeepLink({ hash: '', search: '?tour=intro' })).toBe(true);
  });

  it('ignores power-user gates like ?debug, ?volumes, ?anchors', () => {
    expect(hasDeepLink({ hash: '', search: '?debug' })).toBe(false);
    expect(hasDeepLink({ hash: '', search: '?volumes' })).toBe(false);
    expect(hasDeepLink({ hash: '', search: '?anchors&gpuTimings' })).toBe(false);
  });

  it('returns true when both hash and search carry deep-link content', () => {
    expect(hasDeepLink({ hash: '#focus=ngc224', search: '?tour=intro' })).toBe(true);
  });

  it('handles leading-? and missing-? variants in the search string', () => {
    expect(hasDeepLink({ hash: '', search: 'tour=intro' })).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/utils/url/hasDeepLink.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 4: Write the helper**

```ts
// src/utils/url/hasDeepLink.ts
/**
 * hasDeepLink — does the URL express specific user intent that should
 * suppress the splash on first arrival?
 *
 * ### Rationale
 *
 * The splash UX (per the 2026-05-20 grill) treats deep-link arrivals as
 * "this user already knows what they want — get out of their way".  Three
 * URL shapes qualify:
 *
 *   - `#focus=<galaxyId>` — pin a specific galaxy (set by the InfoCard
 *     deep-link drain in useUrlSync).
 *   - `#poi=<poiId>` — focus a specific cluster / supercluster / void.
 *   - `?tour=<name>` — request the tour at a specific anchor.
 *
 * Power-user gates (`?debug`, `?volumes`, `?anchors`, `?gpuTimings`)
 * don't qualify — they change developer surfaces, not what the visitor
 * is looking at.  Bundling them into the deep-link predicate would
 * suppress the splash for every contributor running with `?debug` on,
 * which is the opposite of useful.
 *
 * ### Pure
 *
 * Takes hash + search as plain strings; the caller decides where to read
 * them from (typically `window.location.hash` / `window.location.search`,
 * but the splash hook also feeds in fixtures in tests).  No `typeof
 * window` guard needed here — that's the caller's job.
 *
 * ### Search-string normalisation
 *
 * `window.location.search` includes the leading `?`; query strings passed
 * by tests sometimes don't.  We normalise by stripping a leading `?` and
 * then parsing with `URLSearchParams` so callers can be sloppy about the
 * leading character.
 */

export type DeepLinkInput = {
  hash: string;
  search: string;
};

const DEEP_LINK_QUERY_KEYS = new Set(['tour']);

export function hasDeepLink({ hash, search }: DeepLinkInput): boolean {
  // Hash: look for the two deep-link prefixes anywhere in the body.
  // (The hash always starts with `#` if present, so a prefix check is safe.)
  if (hash.includes('#focus=') || hash.startsWith('#focus=')) return true;
  if (hash.includes('#poi=') || hash.startsWith('#poi=')) return true;

  // Search: parse and look for known deep-link keys.  We strip a leading
  // `?` so callers can pass either `?tour=foo` or `tour=foo`.
  const normalized = search.startsWith('?') ? search.slice(1) : search;
  if (normalized.length === 0) return false;
  const params = new URLSearchParams(normalized);
  for (const key of params.keys()) {
    if (DEEP_LINK_QUERY_KEYS.has(key)) return true;
  }
  return false;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/utils/url/hasDeepLink.test.ts`
Expected: PASS — all seven assertions green.

- [ ] **Step 6: Commit**

```bash
git add src/@types/splash src/utils/url/hasDeepLink.ts tests/utils/url/hasDeepLink.test.ts
git commit -m "$(cat <<'EOF'
feat(splash): add SplashError + UseSplash types + hasDeepLink helper

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `useSplash` hook — happy-path state machine

**Files:**
- Create: `src/hooks/useSplash.ts`
- Test: `tests/hooks/useSplash.test.ts`

**Scope:** ready-signal derivation, localStorage seenVersion, deep-link gating, dismiss/reopen, the 8 s `canContinueAnyway` timer. The error mapping (engine status → SplashError) is added in Task 6 so this task stays bite-sized.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/hooks/useSplash.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSplash, CURRENT_SPLASH_VERSION, SPLASH_STORAGE_KEY } from '../../src/hooks/useSplash';
import type { UseSplashInput } from '../../src/@types/splash/UseSplashInput';

function makeInput(overrides: Partial<UseSplashInput> = {}): UseSplashInput {
  return {
    status: { kind: 'initializing' },
    loadProgress: null,
    famousMetaReady: false,
    ...overrides,
  };
}

describe('useSplash', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts visible on a first-time visit with no deep link', () => {
    const { result } = renderHook(() => useSplash(makeInput()));
    expect(result.current.splashVisible).toBe(true);
    expect(result.current.blocked).toBe(true);
  });

  it('starts hidden on a deep-link arrival (#focus=)', () => {
    window.history.replaceState(null, '', '/#focus=ngc224');
    const { result } = renderHook(() => useSplash(makeInput()));
    expect(result.current.splashVisible).toBe(false);
  });

  it('starts hidden on a deep-link arrival (?tour=)', () => {
    window.history.replaceState(null, '', '/?tour=intro');
    const { result } = renderHook(() => useSplash(makeInput()));
    expect(result.current.splashVisible).toBe(false);
  });

  it('starts hidden when localStorage seenVersion >= current', () => {
    window.localStorage.setItem(SPLASH_STORAGE_KEY, String(CURRENT_SPLASH_VERSION));
    const { result } = renderHook(() => useSplash(makeInput()));
    expect(result.current.splashVisible).toBe(false);
  });

  it('shows splash when seenVersion is lower than current', () => {
    window.localStorage.setItem(SPLASH_STORAGE_KEY, String(CURRENT_SPLASH_VERSION - 1));
    const { result } = renderHook(() => useSplash(makeInput()));
    expect(result.current.splashVisible).toBe(true);
  });

  it('flips blocked=false when status=ready AND famousMetaReady AND loadProgress=null', () => {
    const { result, rerender } = renderHook(({ input }) => useSplash(input), {
      initialProps: { input: makeInput() },
    });
    expect(result.current.blocked).toBe(true);
    rerender({
      input: makeInput({
        status: { kind: 'ready', count: 100, source: 'sdss.bin' },
        loadProgress: null,
        famousMetaReady: true,
      }),
    });
    expect(result.current.blocked).toBe(false);
  });

  it('stays blocked while loadProgress is non-null even after status=ready', () => {
    const { result } = renderHook(() =>
      useSplash(
        makeInput({
          status: { kind: 'ready', count: 100, source: 'sdss.bin' },
          loadProgress: { loadedBytes: 1, totalBytes: 2, inFlightCount: 1 },
          famousMetaReady: true,
        }),
      ),
    );
    expect(result.current.blocked).toBe(true);
  });

  it('dismissExplore writes CURRENT_SPLASH_VERSION to localStorage and hides splash', () => {
    const { result } = renderHook(() => useSplash(makeInput()));
    act(() => result.current.dismissExplore());
    expect(result.current.splashVisible).toBe(false);
    expect(window.localStorage.getItem(SPLASH_STORAGE_KEY)).toBe(String(CURRENT_SPLASH_VERSION));
  });

  it('dismissTour writes seenVersion and hides splash', () => {
    const { result } = renderHook(() => useSplash(makeInput()));
    act(() => result.current.dismissTour());
    expect(result.current.splashVisible).toBe(false);
    expect(window.localStorage.getItem(SPLASH_STORAGE_KEY)).toBe(String(CURRENT_SPLASH_VERSION));
  });

  it('reopen shows splash again WITHOUT touching localStorage', () => {
    window.localStorage.setItem(SPLASH_STORAGE_KEY, String(CURRENT_SPLASH_VERSION));
    const { result } = renderHook(() => useSplash(makeInput()));
    expect(result.current.splashVisible).toBe(false);
    act(() => result.current.reopen());
    expect(result.current.splashVisible).toBe(true);
    expect(window.localStorage.getItem(SPLASH_STORAGE_KEY)).toBe(String(CURRENT_SPLASH_VERSION));
  });

  it('canContinueAnyway flips true after 8 s of being blocked', () => {
    const { result } = renderHook(() => useSplash(makeInput()));
    expect(result.current.canContinueAnyway).toBe(false);
    act(() => {
      vi.advanceTimersByTime(8001);
    });
    expect(result.current.canContinueAnyway).toBe(true);
  });

  it('does not start the 8 s timer when splash is not visible (deep-link path)', () => {
    window.history.replaceState(null, '', '/#focus=ngc224');
    const { result } = renderHook(() => useSplash(makeInput()));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.canContinueAnyway).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hooks/useSplash.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the hook (happy-path only; error mapping in Task 6)**

```ts
// src/hooks/useSplash.ts
/**
 * useSplash — orchestrates the splash visibility, the readiness gate, the
 * "Continue anyway" escape, dismiss + reopen, and version-busted re-show.
 *
 * ### Why a separate hook
 *
 * App.tsx already wires six hooks.  The splash has its own state shape
 * (visibility, blocked, error, canContinueAnyway), its own derived
 * predicates (deep-link detection, readiness signal), and its own side
 * effects (localStorage persistence, 8 s timer).  Bolting all of that
 * onto App.tsx would push the file past its already-substantial size
 * and would scatter "splash logic" across the file.  A dedicated hook
 * gives the splash a single home with a clean public contract.
 *
 * ### Readiness signal
 *
 * The grill (Q4) resolved to "medium gating": the CTAs activate when
 *   1.  the engine is in `ready` state (WebGPU init done + first frame),
 *   2.  no catalog fetch is currently in flight (`loadProgress === null`),
 *   3.  famous-meta has settled (`famousMetaReady`).
 * The hook does NOT differentiate between Explore and Tour readiness —
 * both buttons activate together so the user never sees "Tour disabled,
 * Explore enabled" intermediate UI.  Famous-meta failure is treated as
 * "ready" downstream (the hook's input plumbing receives `ready=true`
 * from useFamousMeta in both success and error cases), but the splash
 * does render a disabled Tour tooltip — that's wired in Task 6's error
 * mapping plus the Splash component's disabled-state CSS.
 *
 * ### localStorage versioning
 *
 * Key: `skymap.splash.seenVersion` — an integer.  Hook reads on first
 * mount; if missing or lower than `CURRENT_SPLASH_VERSION`, splash is
 * shown.  Dismiss (either CTA) writes the current version; bumping
 * `CURRENT_SPLASH_VERSION` re-shows the splash to all returning users.
 * `reopen()` (called by the AboutPill) shows the splash WITHOUT touching
 * storage — informational reopens shouldn't reset the version stamp.
 *
 * ### Deep-link bypass
 *
 * A URL with `#focus=`, `#poi=`, or `?tour=` (see `hasDeepLink`) skips
 * the splash on first arrival and never auto-shows it.  About pill
 * `reopen()` still works.  Power-user gates (`?debug`, etc.) do NOT
 * count as deep links.
 *
 * ### 8 s "Continue anyway" timer
 *
 * Starts when the splash becomes visible AND blocked.  Fires once,
 * flipping `canContinueAnyway` to true so the splash can show the
 * escape link.  Cleared on unmount and re-armed if the splash is
 * reopened.  Does NOT fire when the splash isn't visible (deep-link
 * path) — the timer is a UX affordance for slow loads, not a global
 * timeout.
 *
 * ### SSR-safety
 *
 * `typeof window` guards wrap localStorage and location reads so unit
 * tests that render `useSplash` without a jsdom env don't blow up.
 * The deep-link helper itself takes plain strings — no `window`
 * dependency.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasDeepLink } from '../utils/url/hasDeepLink';
import type { UseSplashInput } from '../@types/splash/UseSplashInput';
import type { UseSplashReturn } from '../@types/splash/UseSplashReturn';

/** Persisted storage key — never rename without a migration. */
export const SPLASH_STORAGE_KEY = 'skymap.splash.seenVersion';

/**
 * Version stamp written to localStorage on dismiss.  Bump when meaningful
 * splash content changes — increments re-show the splash to returning
 * users on their next visit.
 */
export const CURRENT_SPLASH_VERSION = 1;

/** Milliseconds before the "Continue anyway" escape appears. */
export const CONTINUE_ANYWAY_DELAY_MS = 8_000;

/**
 * Read seenVersion from localStorage.  SSR-safe and try/catch-guarded
 * against private-browsing modes that throw on storage access.
 */
function readSeenVersion(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(SPLASH_STORAGE_KEY);
    if (raw === null) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

/** Write seenVersion to localStorage.  Swallows storage errors silently. */
function writeSeenVersion(version: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SPLASH_STORAGE_KEY, String(version));
  } catch {
    // Private browsing or storage quota — best-effort; the splash will
    // re-show next time, which is acceptable degraded behaviour.
  }
}

/**
 * Read the current URL hash + search, returning empty strings under SSR.
 * Captured lazily inside the hook's initializer so it runs once at mount.
 */
function readUrlAtMount(): { hash: string; search: string } {
  if (typeof window === 'undefined') return { hash: '', search: '' };
  return { hash: window.location.hash, search: window.location.search };
}

export function useSplash(input: UseSplashInput): UseSplashReturn {
  const { status, loadProgress, famousMetaReady } = input;

  // ── Initial visibility (snapshot at mount) ───────────────────────────────
  //
  // Three gates compose:
  //   1. Deep link present → never auto-show.
  //   2. Stored seenVersion >= CURRENT_SPLASH_VERSION → don't re-show.
  //   3. Otherwise → show.
  //
  // We capture once via a lazy initializer so the splash decision doesn't
  // flip mid-session if the user manually edits the URL.  `reopen()`
  // overrides this snapshot via the `userOpened` slot below.
  const [splashVisible, setSplashVisible] = useState<boolean>(() => {
    const { hash, search } = readUrlAtMount();
    if (hasDeepLink({ hash, search })) return false;
    if (readSeenVersion() >= CURRENT_SPLASH_VERSION) return false;
    return true;
  });

  // ── Readiness signal ─────────────────────────────────────────────────────
  //
  // The CTAs activate when the engine reports `ready`, no catalog fetches
  // are in flight, and famous-meta has settled.  `blocked` is the
  // negation — true while we're still waiting.
  const ready = useMemo(
    () => status.kind === 'ready' && loadProgress === null && famousMetaReady,
    [status, loadProgress, famousMetaReady],
  );
  const blocked = !ready;

  // ── 8 s "Continue anyway" timer ──────────────────────────────────────────
  //
  // Starts when the splash is visible AND blocked.  Cleared on unmount and
  // re-armed if the splash is reopened.  Does not fire if the splash is
  // not visible (deep-link path).
  const [canContinueAnyway, setCanContinueAnyway] = useState(false);
  useEffect(() => {
    if (!splashVisible || !blocked) {
      // Re-arm when the splash becomes visible again (reopen flow).
      // We don't reset `canContinueAnyway` on the unblocked path because
      // the splash hides itself on dismiss anyway; whether the link was
      // ever visible doesn't matter after that.
      return;
    }
    const t = setTimeout(() => setCanContinueAnyway(true), CONTINUE_ANYWAY_DELAY_MS);
    return () => clearTimeout(t);
  }, [splashVisible, blocked]);

  // Reset canContinueAnyway when the splash is reopened so the link
  // appears again only after another 8 s if loading is somehow slow
  // again (rare — content is cached — but cheap to handle).
  useEffect(() => {
    if (!splashVisible) setCanContinueAnyway(false);
  }, [splashVisible]);

  // ── Dismiss + reopen ─────────────────────────────────────────────────────

  const dismissExplore = useCallback(() => {
    writeSeenVersion(CURRENT_SPLASH_VERSION);
    setSplashVisible(false);
  }, []);

  const dismissTour = useCallback(() => {
    writeSeenVersion(CURRENT_SPLASH_VERSION);
    setSplashVisible(false);
  }, []);

  const reopen = useCallback(() => {
    // Intentionally does NOT write seenVersion — reopening from the About
    // pill is informational, not a "first-time dismissal" event.
    setSplashVisible(true);
  }, []);

  return {
    splashVisible,
    blocked,
    canContinueAnyway,
    error: null, // populated in Task 6
    dismissExplore,
    dismissTour,
    reopen,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hooks/useSplash.test.ts`
Expected: PASS — all eleven assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSplash.ts tests/hooks/useSplash.test.ts
git commit -m "$(cat <<'EOF'
feat(splash): add useSplash hook (happy-path state machine)

Owns visibility, readiness gate, dismiss/reopen, localStorage versioning,
deep-link bypass, and the 8 s Continue-anyway timer.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `useSplash` — error mapping

**Files:**
- Modify: `src/hooks/useSplash.ts`
- Modify: `tests/hooks/useSplash.test.ts`

**Why a separate task:** keeps Task 5's diff small. The error mapping derives a `SplashError | null` from `status.kind === 'error'` plus a new `famousMetaFailed` input flag (added in this task because Task 3 collapsed success+failure into `ready=true`).

- [ ] **Step 1: Extend UseSplashInput with the failure signal**

```ts
// src/@types/splash/UseSplashInput.d.ts
import type { EngineStatus } from '../engine/EngineStatus';
import type { LoadProgressState } from '../loading/LoadProgressState';

export type UseSplashInput = {
  /** Engine status from `useEngine`. */
  status: EngineStatus;
  /** Aggregated load progress from `useEngine`. `null` when no fetches in flight. */
  loadProgress: LoadProgressState | null;
  /** Famous-meta `ready` flag from `useFamousMeta`. */
  famousMetaReady: boolean;
  /**
   * Optional flag set by App.tsx when famous-meta is known to have failed
   * (not just absent).  Drives the splash's `famous-meta-failed` informational
   * error — Explore stays live, Tour is disabled with a tooltip.  Defaults
   * to false; the famousMetaFetcher currently swallows errors silently, so
   * App can hook a tighter signal in later without breaking this hook.
   */
  famousMetaFailed?: boolean;
};
```

- [ ] **Step 2: Add failing tests to the existing splash test file**

Append to `tests/hooks/useSplash.test.ts`:

```ts
describe('useSplash error mapping', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('returns error.kind=webgpu-init-failed when status.kind=error with a webgpu message', () => {
    const { result } = renderHook(() =>
      useSplash(
        makeInput({
          status: { kind: 'error', message: 'WebGPU: requestAdapter returned null' },
        }),
      ),
    );
    expect(result.current.error).toEqual({
      kind: 'webgpu-init-failed',
      message: 'WebGPU: requestAdapter returned null',
    });
  });

  it('returns error.kind=catalog-fetch-failed for non-webgpu engine errors', () => {
    const { result } = renderHook(() =>
      useSplash(
        makeInput({
          status: { kind: 'error', message: 'Failed to fetch sdss.bin' },
        }),
      ),
    );
    expect(result.current.error).toEqual({
      kind: 'catalog-fetch-failed',
      message: 'Failed to fetch sdss.bin',
    });
  });

  it('returns error.kind=famous-meta-failed when famousMetaFailed=true and no engine error', () => {
    const { result } = renderHook(() =>
      useSplash(
        makeInput({
          status: { kind: 'ready', count: 100, source: 'sdss.bin' },
          loadProgress: null,
          famousMetaReady: true,
          famousMetaFailed: true,
        }),
      ),
    );
    expect(result.current.error).toEqual({ kind: 'famous-meta-failed' });
  });

  it('prefers engine error over famous-meta-failed (engine error blocks the whole app)', () => {
    const { result } = renderHook(() =>
      useSplash(
        makeInput({
          status: { kind: 'error', message: 'Failed to fetch sdss.bin' },
          famousMetaFailed: true,
        }),
      ),
    );
    expect(result.current.error?.kind).toBe('catalog-fetch-failed');
  });

  it('returns null on the happy path', () => {
    const { result } = renderHook(() =>
      useSplash(
        makeInput({
          status: { kind: 'ready', count: 100, source: 'sdss.bin' },
          loadProgress: null,
          famousMetaReady: true,
        }),
      ),
    );
    expect(result.current.error).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/hooks/useSplash.test.ts`
Expected: FAIL — the new tests expect non-null error payloads; the hook still returns `null`.

- [ ] **Step 4: Implement the mapping in `useSplash`**

Find the line `const { status, loadProgress, famousMetaReady } = input;` and replace with:

```ts
  const { status, loadProgress, famousMetaReady, famousMetaFailed = false } = input;
```

Then replace `error: null, // populated in Task 6` with a derived value computed before the return:

```ts
  // ── Error mapping ────────────────────────────────────────────────────────
  //
  // Engine errors (status.kind === 'error') take precedence over famous-meta
  // failures because an engine error blocks the whole app — the famous-meta
  // tooltip would be misleading next to a "catalog failed to load" headline.
  // We discriminate engine errors by inspecting the message: anything
  // mentioning "WebGPU" is reported as a webgpu-init failure (since the
  // synchronous "no navigator.gpu at all" case is handled in main.tsx, the
  // only thing left to surface here is the requestAdapter-returned-null
  // path).  Everything else is bucketed as a catalog fetch failure, which
  // is the dominant non-WebGPU error mode (a network blip on sdss.bin /
  // glade.bin / 2mrs.bin).
  const error = useMemo<SplashError | null>(() => {
    if (status.kind === 'error') {
      if (/webgpu/i.test(status.message)) {
        return { kind: 'webgpu-init-failed', message: status.message };
      }
      return { kind: 'catalog-fetch-failed', message: status.message };
    }
    if (famousMetaFailed) {
      return { kind: 'famous-meta-failed' };
    }
    return null;
  }, [status, famousMetaFailed]);
```

Add the import at the top of the file:

```ts
import type { SplashError } from '../@types/splash/SplashError';
```

And update the return value:

```ts
  return {
    splashVisible,
    blocked,
    canContinueAnyway,
    error,
    dismissExplore,
    dismissTour,
    reopen,
  };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/hooks/useSplash.test.ts`
Expected: PASS — all original + new tests green.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useSplash.ts src/@types/splash/UseSplashInput.d.ts tests/hooks/useSplash.test.ts
git commit -m "$(cat <<'EOF'
feat(splash): map engine + famous-meta errors to SplashError in useSplash

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `AboutPill` component

**Files:**
- Create: `src/components/Splash/AboutPill.tsx`
- Create: `src/components/Splash/AboutPill.module.css`
- Test: `tests/components/Splash/AboutPill.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/components/Splash/AboutPill.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import AboutPill from '../../../src/components/Splash/AboutPill';

describe('AboutPill', () => {
  it('renders a button with the aria-label "About skymap"', () => {
    render(createElement(AboutPill, { onClick: () => {} }));
    expect(screen.getByRole('button', { name: /about skymap/i })).toBeInTheDocument();
  });

  it('fires onClick when clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(createElement(AboutPill, { onClick }));
    await user.click(screen.getByRole('button', { name: /about skymap/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('fires onClick on Enter (keyboard accessibility)', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(createElement(AboutPill, { onClick }));
    screen.getByRole('button', { name: /about skymap/i }).focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('reflects hidden=true via aria-hidden (matches SearchTrigger / AutoRotateToggle)', () => {
    render(createElement(AboutPill, { onClick: () => {}, hidden: true }));
    const btn = screen.getByRole('button', { hidden: true });
    expect(btn).toHaveAttribute('aria-hidden', 'true');
  });

  it('omits aria-hidden when hidden=false (default)', () => {
    render(createElement(AboutPill, { onClick: () => {} }));
    const btn = screen.getByRole('button', { name: /about skymap/i });
    expect(btn).not.toHaveAttribute('aria-hidden');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/Splash/AboutPill.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the CSS module**

```css
/* src/components/Splash/AboutPill.module.css */
/*
 * AboutPill — 40 × 40 px frosted-glass button matching SearchTrigger
 * and AutoRotateToggle so the three pills feel like one cohesive
 * top-bar cluster (`.topBar` in App.module.css).
 *
 * Same surface vocabulary as the siblings: `--surface-card-soft`,
 * `--border-card`, `--blur-card`, `--shadow-card`.  Hover/focus shift
 * to `--surface-card-strong` + `--border-hover`; the icon tints to
 * `--color-accent`.
 */

.pill {
  background: var(--surface-card-soft);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-pill);
  backdrop-filter: var(--blur-card);
  -webkit-backdrop-filter: var(--blur-card);
  box-shadow: var(--shadow-card);
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--color-fg);
  transition: background 0.15s ease-out, border-color 0.15s ease-out,
              opacity 0.2s ease-out, transform 0.2s ease-out;
}

.pill:hover,
.pill:focus-visible {
  background: var(--surface-card-strong);
  border-color: var(--border-hover);
  color: var(--color-accent);
}

.pill:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.icon {
  display: block;
}

/* Hidden state — matches the SearchTrigger / AutoRotateToggle pattern.
 * Faded + slightly scaled + non-interactive so the splash modal can
 * sit cleanly on top during reopens. */
.hidden {
  opacity: 0;
  transform: scale(0.9);
  pointer-events: none;
}

/* Mobile — still 44 × 44 minimum touch target (WCAG 2.5.5). */
@media (max-width: 480px) {
  .pill {
    width: 44px;
    height: 44px;
  }
}
```

- [ ] **Step 4: Write the component**

```tsx
// src/components/Splash/AboutPill.tsx
/**
 * AboutPill — 40 × 40 frosted-glass pill that reopens the splash
 * dialog.  Sits in the top-bar flex row (`.topBar` in App.module.css)
 * alongside SearchTrigger and AutoRotateToggle.
 *
 * ### Why a dedicated pill rather than a SettingsPanel link
 *
 * Per the 2026-05-20 grill (Q10), the About affordance needs to be
 * discoverable to deep-link arrivals who skipped the splash and to
 * returning visitors who want to re-read the intro.  Burying it in
 * the Settings panel (the most-frequently-collapsed surface on
 * mobile) defeats both audiences.  A top-bar pill is canonical
 * "help / about" placement and matches the user's chosen layout
 * (Search · AutoRotate · About).
 *
 * ### Why React.memo
 *
 * Reads only `onClick`, `hidden` — neither changes per frame.  Without
 * memo, App's animation re-renders would re-render the inline SVG
 * every frame.  Same rationale as SearchTrigger / AutoRotateToggle.
 */

import { memo, type ReactNode } from 'react';
import cx from 'classnames';
import styles from './AboutPill.module.css';

export type AboutPillProps = {
  /** Called when the user clicks/activates the pill — reopens splash. */
  onClick: () => void;
  /**
   * When true, the pill fades out and stops accepting clicks — matches
   * SearchTrigger and AutoRotateToggle's `hidden` semantics so the
   * three pills coordinate during palette-open and splash-visible
   * transitions.
   */
  hidden?: boolean;
};

/** Inline circled-? glyph — nine lines of SVG we own end-to-end. */
function InfoIcon(): ReactNode {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.5 6 Q6.5 4.5 8 4.5 Q9.5 4.5 9.5 6 Q9.5 7 8 7.5 L8 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="11.25" r="0.85" fill="currentColor" />
    </svg>
  );
}

function AboutPill({ onClick, hidden = false }: AboutPillProps): ReactNode {
  return (
    <button
      type="button"
      className={cx(styles.pill, hidden && styles.hidden)}
      onClick={onClick}
      aria-label="About skymap"
      aria-hidden={hidden || undefined}
    >
      <InfoIcon />
    </button>
  );
}

export default memo(AboutPill);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/Splash/AboutPill.test.ts`
Expected: PASS — all five assertions green.

- [ ] **Step 6: Commit**

```bash
git add src/components/Splash/AboutPill.tsx src/components/Splash/AboutPill.module.css tests/components/Splash/AboutPill.test.ts
git commit -m "$(cat <<'EOF'
feat(splash): add AboutPill top-bar reopener component

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `Splash` component — markup, copy, and a11y

**Files:**
- Create: `src/components/Splash/Splash.tsx`
- Create: `src/components/Splash/Splash.module.css`
- Test: `tests/components/Splash/Splash.test.ts`

**Scope of this task:** the dialog markup, the CSS, the copy, the role/aria attributes, click handlers wired through props, the disabled-CTA states from `blocked`, the "Continue anyway" link, and the per-error rendering. Focus trap + initial focus + Esc handling come in Task 9 to keep this task focused on markup/CSS.

- [ ] **Step 1: Write the failing test**

```ts
// tests/components/Splash/Splash.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { Splash } from '../../../src/components/Splash/Splash';

function makeProps(overrides: Partial<React.ComponentProps<typeof Splash>> = {}) {
  return {
    blocked: false,
    canContinueAnyway: false,
    error: null,
    onExplore: vi.fn(),
    onTour: vi.fn(),
    onContinueAnyway: vi.fn(),
    onReload: vi.fn(),
    ...overrides,
  } as React.ComponentProps<typeof Splash>;
}

describe('Splash', () => {
  it('renders a dialog with the title "Explore millions of galaxies in 3D"', () => {
    render(createElement(Splash, makeProps()));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Explore millions of galaxies in 3D')).toBeInTheDocument();
  });

  it('mentions SDSS, GLADE, and 2MRS with new-tab links', () => {
    render(createElement(Splash, makeProps()));
    const sdss = screen.getByRole('link', { name: /sdss/i });
    const glade = screen.getByRole('link', { name: /glade/i });
    const mrs2 = screen.getByRole('link', { name: /2mrs/i });
    for (const link of [sdss, glade, mrs2]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });

  it('renders the author + github attribution in the footer', () => {
    render(createElement(Splash, makeProps()));
    expect(screen.getByText(/alexander rulkens/i)).toBeInTheDocument();
    const ghLink = screen.getByRole('link', { name: /github\.com\/rulkens\/skymap/i });
    expect(ghLink).toHaveAttribute('href', 'https://github.com/rulkens/skymap');
  });

  it('renders Explore (primary) and Tour (secondary) CTAs', () => {
    render(createElement(Splash, makeProps()));
    expect(screen.getByRole('button', { name: /^explore$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^tour$/i })).toBeInTheDocument();
  });

  it('disables CTAs when blocked=true', () => {
    render(createElement(Splash, makeProps({ blocked: true })));
    expect(screen.getByRole('button', { name: /^explore$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^tour$/i })).toBeDisabled();
  });

  it('fires onExplore when Explore is clicked', async () => {
    const onExplore = vi.fn();
    const user = userEvent.setup();
    render(createElement(Splash, makeProps({ onExplore })));
    await user.click(screen.getByRole('button', { name: /^explore$/i }));
    expect(onExplore).toHaveBeenCalledOnce();
  });

  it('fires onTour when Tour is clicked', async () => {
    const onTour = vi.fn();
    const user = userEvent.setup();
    render(createElement(Splash, makeProps({ onTour })));
    await user.click(screen.getByRole('button', { name: /^tour$/i }));
    expect(onTour).toHaveBeenCalledOnce();
  });

  it('shows the Continue anyway link only when canContinueAnyway=true and blocked=true', () => {
    const { rerender } = render(createElement(Splash, makeProps({ blocked: true, canContinueAnyway: false })));
    expect(screen.queryByRole('button', { name: /continue anyway/i })).not.toBeInTheDocument();
    rerender(createElement(Splash, makeProps({ blocked: true, canContinueAnyway: true })));
    expect(screen.getByRole('button', { name: /continue anyway/i })).toBeInTheDocument();
  });

  it('fires onContinueAnyway when the link is clicked', async () => {
    const onContinueAnyway = vi.fn();
    const user = userEvent.setup();
    render(createElement(Splash, makeProps({ blocked: true, canContinueAnyway: true, onContinueAnyway })));
    await user.click(screen.getByRole('button', { name: /continue anyway/i }));
    expect(onContinueAnyway).toHaveBeenCalledOnce();
  });

  it('disables Tour with a tooltip when error.kind=famous-meta-failed', () => {
    render(createElement(Splash, makeProps({ error: { kind: 'famous-meta-failed' } })));
    const tour = screen.getByRole('button', { name: /^tour$/i });
    expect(tour).toBeDisabled();
    expect(tour).toHaveAttribute('title', expect.stringMatching(/tour|unavailable/i));
    // Explore stays interactive in this case.
    expect(screen.getByRole('button', { name: /^explore$/i })).not.toBeDisabled();
  });

  it('shows a reload button when error.kind=catalog-fetch-failed', async () => {
    const onReload = vi.fn();
    const user = userEvent.setup();
    render(createElement(Splash, makeProps({ error: { kind: 'catalog-fetch-failed', message: 'fail' }, onReload })));
    const reload = screen.getByRole('button', { name: /reload/i });
    await user.click(reload);
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('shows the WebGPU-init error message when error.kind=webgpu-init-failed', () => {
    render(createElement(Splash, makeProps({ error: { kind: 'webgpu-init-failed', message: 'adapter null' } })));
    expect(screen.getByText(/webgpu/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/Splash/Splash.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the CSS module**

```css
/* src/components/Splash/Splash.module.css */
/*
 * Splash — first-paint loading curtain + onboarding card.
 *
 * Translucent rounded-rect card centered over a full-viewport dim
 * overlay.  Live canvas underneath stays visible through the card's
 * backdrop-filter blur so galaxies materialize softly behind the
 * splash as load progresses (per the 2026-05-20 grill, Q5).  Mobile
 * (≤768 px) drops the blur for a higher-opacity solid backdrop
 * because backdrop-filter is fragile on iOS Safari.
 */

.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  /* Fade-in on mount.  Skipped under prefers-reduced-motion (rule below). */
  animation: splashFadeIn 0.25s ease-out;
}

@keyframes splashFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.card {
  background: rgba(8, 12, 28, 0.65);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  color: var(--color-fg);
  max-width: 520px;
  width: 100%;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.title {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  color: #ffffff;
}

.body {
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
  color: var(--color-fg);
}

.body a {
  color: var(--color-accent);
  text-decoration: none;
  border-bottom: 1px dotted var(--color-accent);
}

.body a:hover,
.body a:focus-visible {
  text-decoration: underline;
}

.progressRow {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--color-fg-muted, #9aa3b3);
}

.progressTrack {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.progressFill {
  height: 100%;
  background: var(--color-accent);
  transition: width 0.2s ease-out;
}

.progressIndeterminate {
  height: 100%;
  width: 30%;
  background: linear-gradient(
    90deg,
    transparent,
    var(--color-accent),
    transparent
  );
  animation: splashIndeterminate 1.4s ease-in-out infinite;
}

@keyframes splashIndeterminate {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}

.ctas {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.cta {
  flex: 1;
  min-height: 44px;
  padding: 12px 20px;
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease-out, border-color 0.15s ease-out, opacity 0.15s;
}

.cta:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ctaPrimary {
  background: var(--color-accent);
  border: 1px solid var(--color-accent);
  color: #05070d;
}
.ctaPrimary:hover:not(:disabled),
.ctaPrimary:focus-visible:not(:disabled) {
  background: #a3c9ff;
  border-color: #a3c9ff;
}

.ctaSecondary {
  background: transparent;
  border: 1px solid var(--border-card);
  color: var(--color-fg);
}
.ctaSecondary:hover:not(:disabled),
.ctaSecondary:focus-visible:not(:disabled) {
  background: var(--surface-card-soft);
  border-color: var(--border-hover);
}

.cta:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.continueAnyway {
  margin-top: 4px;
  background: none;
  border: none;
  color: var(--color-fg-muted, #9aa3b3);
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
  padding: 8px;
  align-self: center;
}
.continueAnyway:hover,
.continueAnyway:focus-visible {
  color: var(--color-fg);
}

.footer {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--color-fg-muted, #9aa3b3);
  text-align: center;
}

.footer a {
  color: inherit;
  text-decoration: underline;
}

.errorBox {
  background: rgba(255, 80, 80, 0.08);
  border: 1px solid rgba(255, 120, 120, 0.4);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  color: #ffb3b3;
  font-size: 14px;
}

/* ── Mobile — stacked CTAs, smaller type, solid backdrop ────────────── */
@media (max-width: 480px) {
  .title { font-size: 22px; }
  .body  { font-size: 14px; }
  .ctas  { flex-direction: column; }
  .cta   { min-height: 48px; }
}

@media (max-width: 768px) {
  .backdrop {
    /* Skip the heavy blur on mobile — backdrop-filter is fragile on
     * iOS Safari and most phones have a darker viewing context anyway. */
    background: rgba(0, 0, 0, 0.82);
  }
  .card {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: rgba(8, 12, 28, 0.92);
  }
}

@media (prefers-reduced-motion: reduce) {
  .backdrop { animation: none; }
  .progressIndeterminate { animation: none; }
}
```

- [ ] **Step 4: Write the component**

```tsx
// src/components/Splash/Splash.tsx
/**
 * Splash — first-paint loading curtain + onboarding dialog.
 *
 * Renders a translucent card centered over a full-viewport dim overlay.
 * Two CTAs (Explore primary, Tour secondary), a progress indicator while
 * loading, a "Continue anyway" escape after 8 s of waiting, and per-error
 * rendering for the three runtime failure modes.
 *
 * ### Why presentational
 *
 * All state lives in `useSplash` (the hook).  This component takes only
 * the rendered state + handlers as props.  That split keeps the dialog
 * trivially testable (just feed it prop combinations) and lets the
 * hook be tested independently with renderHook.
 *
 * ### Accessibility
 *
 * `role="dialog"`, `aria-modal="true"`, `aria-labelledby` to the title,
 * `aria-describedby` to the body.  The background canvas is marked
 * `aria-hidden="true"` from App.tsx while the splash is up.  Focus trap
 * and Esc handling are added in Task 9 (this file keeps the markup +
 * presentation contract separate from the trap logic).
 *
 * ### Failure rendering
 *
 * - `webgpu-init-failed`  → swap CTAs for an error box explaining the
 *                            requestAdapter failure.  Reload button only.
 * - `catalog-fetch-failed` → CTAs hidden; error box + Reload.
 * - `famous-meta-failed`  → CTAs stay; Tour is disabled with a `title`
 *                            tooltip; Explore is unaffected.
 *
 * The synchronous "no navigator.gpu" path is handled in main.tsx before
 * React mounts; the splash never sees that case.
 */

import { type ReactNode } from 'react';
import cx from 'classnames';
import type { SplashError } from '../../@types/splash/SplashError';
import type { LoadProgressState } from '../../@types/loading/LoadProgressState';
import styles from './Splash.module.css';

export type SplashProps = {
  /** True while loading is incomplete; disables CTAs. */
  blocked: boolean;
  /** True after the 8 s "Continue anyway" timer has fired. */
  canContinueAnyway: boolean;
  /** Optional load progress to render below the body (null hides the row). */
  loadProgress?: LoadProgressState | null;
  /** Current error state; null on the happy path. */
  error: SplashError | null;
  /** Called when the user clicks Explore (or Esc — wired in Task 9). */
  onExplore: () => void;
  /** Called when the user clicks Tour. */
  onTour: () => void;
  /** Called when the user clicks the Continue anyway escape link. */
  onContinueAnyway: () => void;
  /** Called when the user clicks Reload (catalog-fetch-failed / webgpu-init-failed). */
  onReload: () => void;
};

const TITLE_ID = 'splash-title';
const BODY_ID = 'splash-body';

function ProgressRow({ progress }: { progress: LoadProgressState | null | undefined }): ReactNode {
  if (!progress) return null;
  const indeterminate = progress.totalBytes === 0;
  const fraction =
    progress.totalBytes > 0 ? Math.min(1, progress.loadedBytes / progress.totalBytes) : 0;
  return (
    <div
      className={styles.progressRow}
      role="progressbar"
      aria-label="Loading galaxy data"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(fraction * 100)}
    >
      <div className={styles.progressTrack}>
        {indeterminate ? (
          <div className={styles.progressIndeterminate} />
        ) : (
          <div className={styles.progressFill} style={{ width: `${fraction * 100}%` }} />
        )}
      </div>
      <span>{indeterminate ? 'Loading…' : `${Math.round(fraction * 100)}%`}</span>
    </div>
  );
}

export function Splash(props: SplashProps): ReactNode {
  const { blocked, canContinueAnyway, loadProgress, error, onExplore, onTour, onContinueAnyway, onReload } = props;

  const hardError = error?.kind === 'webgpu-init-failed' || error?.kind === 'catalog-fetch-failed';
  const tourDisabled = blocked || error?.kind === 'famous-meta-failed';
  const tourTooltip =
    error?.kind === 'famous-meta-failed'
      ? 'Tour is unavailable — failed to load the famous-galaxy index.'
      : undefined;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
    >
      <section className={styles.card}>
        <h1 id={TITLE_ID} className={styles.title}>
          Explore millions of galaxies in 3D
        </h1>
        <p id={BODY_ID} className={styles.body}>
          Drawn in your browser with WebGPU. Built from real cosmic data — the{' '}
          <a href="https://www.sdss.org/" target="_blank" rel="noopener noreferrer">
            SDSS
          </a>
          ,{' '}
          <a href="https://glade.elte.hu/" target="_blank" rel="noopener noreferrer">
            GLADE
          </a>
          , and{' '}
          <a href="https://lambda.gsfc.nasa.gov/product/2mass/" target="_blank" rel="noopener noreferrer">
            2MRS
          </a>{' '}
          galaxy surveys.
        </p>

        {hardError ? (
          <div className={styles.errorBox} aria-live="polite">
            {error?.kind === 'webgpu-init-failed'
              ? 'WebGPU failed to initialize on this device. Try reloading, or use a recent version of Chrome or Edge.'
              : 'Failed to load the galaxy data. Check your connection and try reloading.'}
          </div>
        ) : (
          <ProgressRow progress={loadProgress} />
        )}

        {hardError ? (
          <div className={styles.ctas}>
            <button
              type="button"
              className={cx(styles.cta, styles.ctaPrimary)}
              onClick={onReload}
            >
              Reload
            </button>
          </div>
        ) : (
          <div className={styles.ctas}>
            <button
              type="button"
              className={cx(styles.cta, styles.ctaPrimary)}
              onClick={onExplore}
              disabled={blocked}
              autoFocus
            >
              Explore
            </button>
            <button
              type="button"
              className={cx(styles.cta, styles.ctaSecondary)}
              onClick={onTour}
              disabled={tourDisabled}
              title={tourTooltip}
            >
              Tour
            </button>
          </div>
        )}

        {blocked && canContinueAnyway && !hardError ? (
          <button
            type="button"
            className={styles.continueAnyway}
            onClick={onContinueAnyway}
            aria-live="polite"
          >
            Continue anyway
          </button>
        ) : null}

        <p className={styles.footer}>
          by Alexander Rulkens ·{' '}
          <a href="https://github.com/rulkens/skymap" target="_blank" rel="noopener noreferrer">
            github.com/rulkens/skymap
          </a>
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/Splash/Splash.test.ts`
Expected: PASS — all twelve assertions green.

- [ ] **Step 6: Commit**

```bash
git add src/components/Splash/Splash.tsx src/components/Splash/Splash.module.css tests/components/Splash/Splash.test.ts
git commit -m "$(cat <<'EOF'
feat(splash): add Splash dialog component (markup, copy, error states)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Splash focus trap + Esc-dismiss

**Files:**
- Modify: `src/components/Splash/Splash.tsx`
- Modify: `tests/components/Splash/Splash.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/components/Splash/Splash.test.ts`:

```ts
describe('Splash focus trap + Esc', () => {
  it('fires onExplore when Esc is pressed', async () => {
    const onExplore = vi.fn();
    const user = userEvent.setup();
    render(createElement(Splash, makeProps({ onExplore })));
    await user.keyboard('{Escape}');
    expect(onExplore).toHaveBeenCalledOnce();
  });

  it('focuses Explore on mount (initial focus)', () => {
    render(createElement(Splash, makeProps()));
    const explore = screen.getByRole('button', { name: /^explore$/i });
    expect(document.activeElement).toBe(explore);
  });

  it('traps Tab: pressing Tab from Tour cycles back to the first focusable element', async () => {
    const user = userEvent.setup();
    render(createElement(Splash, makeProps()));
    const tour = screen.getByRole('button', { name: /^tour$/i });
    tour.focus();
    await user.tab();
    // The focused element after wrap should be inside the dialog — at minimum,
    // it should NOT be `document.body`.
    expect(document.activeElement).not.toBe(document.body);
    // And it should be one of the dialog's focusable items.
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify the new ones fail**

Run: `npx vitest run tests/components/Splash/Splash.test.ts`
Expected: the three new tests FAIL — Esc doesn't fire onExplore; autoFocus alone may not consistently focus Explore in jsdom; Tab cycles past the dialog.

- [ ] **Step 3: Add the focus trap + Esc handler**

Replace the body of `Splash` (the section returned from the component) by wrapping it with focus-management logic. Update the imports and add a ref + useEffect:

```tsx
// Top of file — add to existing imports
import { useEffect, useRef, type ReactNode } from 'react';
```

Inside the component body, before the `return`:

```tsx
  // ── Focus trap + initial focus + Esc dismiss ─────────────────────────────
  //
  // Rationale: standard a11y-dialog pattern.  Modal dialogs must:
  //   1. Move focus into themselves on mount.
  //   2. Trap focus inside while open (Tab from last → first, Shift+Tab from
  //      first → last).
  //   3. Dismiss on Esc, restoring focus on the way out (handled implicitly
  //      because the splash unmounts; the next interactive element receives
  //      focus naturally).
  //
  // We implement focus trap with a Tab keydown listener that queries the
  // dialog's focusable descendants and bounces the focused element back when
  // it would otherwise escape.  Smaller than pulling in `focus-trap-react`
  // and the splash has a tiny number of focusables (≤5).
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return;

    // Initial focus — find the autofocused Explore button (or the first
    // focusable if Explore is disabled / replaced by Reload).
    const FOCUSABLE_SELECTOR =
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    const initial =
      root.querySelector<HTMLElement>(`.${styles.ctaPrimary}:not([disabled])`) ??
      focusables()[0] ??
      null;
    initial?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // Esc is treated identically to Explore (per the 2026-05-20 grill, Q13b).
        onExplore();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onExplore]);
```

And attach the ref to the backdrop:

```tsx
    <div
      ref={dialogRef}
      className={styles.backdrop}
      role="dialog"
      ...
```

Also remove the `autoFocus` attribute from the Explore button — the useEffect handles initial focus now (jsdom doesn't reliably honour autoFocus on conditionally-mounted nodes).

- [ ] **Step 4: Run test to verify the new ones pass**

Run: `npx vitest run tests/components/Splash/Splash.test.ts`
Expected: PASS — all original + new tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/Splash/Splash.tsx tests/components/Splash/Splash.test.ts
git commit -m "$(cat <<'EOF'
feat(splash): focus trap + initial focus + Esc dismiss in Splash dialog

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Integrate Splash + AboutPill into App.tsx

**Files:**
- Modify: `src/components/App/App.tsx`

**Scope:** wire `useSplash`, render `<Splash>` conditionally, render `<AboutPill>` in `.topBar`, force `uiHidden` while splash is visible, pass deep-link signal in.

- [ ] **Step 1: Read and re-confirm the App.tsx imports + topBar block before editing**

Run: `grep -n "topBar\|uiStack\|useSplash\|AboutPill\|useFamousMeta" /Users/rulkens/Development/js/skymap/src/components/App/App.tsx`
Expected output to confirm: existing topBar div, useFamousMeta import, uiStack className usage.

- [ ] **Step 2: Add the new imports**

Insert near the existing hook imports:

```tsx
import { useSplash } from '../../hooks/useSplash';
import { Splash } from '../Splash/Splash';
import AboutPill from '../Splash/AboutPill';
```

- [ ] **Step 3: Destructure `ready` from useFamousMeta**

Locate `const { famousMeta, famousXrefs } = useFamousMeta();` and replace with:

```tsx
const { famousMeta, famousXrefs, ready: famousMetaReady } = useFamousMeta();
```

- [ ] **Step 4: Wire `useSplash` after the engine hook block**

Add after the `useEngine({ ... })` call (and after the `_onVolumeFieldsChangedTarget.current = ...` assignment):

```tsx
  // ── Splash dialog state ─────────────────────────────────────────────────
  //
  // The splash hook gates on engine readiness (status=ready + no fetches
  // in flight) + famous-meta loaded.  It owns localStorage versioning,
  // deep-link bypass, the 8 s Continue-anyway timer, and dismiss/reopen.
  // See `useSplash.ts` for the full design rationale.
  const splash = useSplash({
    status,
    loadProgress,
    famousMetaReady,
    // `famousMetaFailed` is not currently wired — useFamousMeta swallows
    // errors silently per the fail-soft contract.  A future iteration
    // could promote the catch-branch into a flag exposed alongside `ready`.
  });
```

- [ ] **Step 5: Force `uiHidden` while splash is visible**

Find the existing `<div className={cx(appStyles.uiStack, uiHidden && appStyles.uiStackHidden)}>` line and change the condition:

```tsx
      <div className={cx(appStyles.uiStack, (uiHidden || splash.splashVisible) && appStyles.uiStackHidden)}>
```

(This keeps the user's manual Tab toggle working as before AND adds splash-visible as a forced-hide trigger. When the splash dismisses, `splash.splashVisible` goes false and the existing fade-in transition plays.)

- [ ] **Step 6: Render AboutPill inside the topBar div**

Locate the `<div className={appStyles.topBar}>` block. Replace it with:

```tsx
        <div className={appStyles.topBar}>
          <SearchTrigger onClick={openPalette} hidden={paletteOpen || splash.splashVisible} />
          <AutoRotateToggle
            playing={autoRotate}
            onToggle={() => handleRef.current?.camera.setAutoRotate(!autoRotate)}
            hidden={paletteOpen || splash.splashVisible}
          />
          <AboutPill onClick={splash.reopen} hidden={paletteOpen || splash.splashVisible} />
        </div>
```

(All three pills participate in the splash UI-hidden fade — they're inside `.uiStack` so the wrapper class already fades them, but explicitly setting `hidden` on each keeps the per-pill scale/opacity transition consistent and means a future split of the wrapper doesn't silently regress.)

- [ ] **Step 7: Render the Splash dialog**

Add immediately after the closing `</div>` of the `uiStack` wrapper, but before the closing `</>` of the fragment:

```tsx
      {splash.splashVisible && (
        <Splash
          blocked={splash.blocked}
          canContinueAnyway={splash.canContinueAnyway}
          loadProgress={loadProgress}
          error={splash.error}
          onExplore={splash.dismissExplore}
          // Plan 2 (stub tour) replaces this with the real tour wiring.
          // For now Tour just dismisses like Explore — the splash work
          // ships independently of the tour itinerary.
          onTour={splash.dismissTour}
          onContinueAnyway={splash.dismissExplore}
          onReload={() => window.location.reload()}
        />
      )}
```

- [ ] **Step 8: Mark the canvas aria-hidden while splash is up**

Locate `<canvas ref={canvasRef} id="c" />` and replace with:

```tsx
      <canvas ref={canvasRef} id="c" aria-hidden={splash.splashVisible || undefined} />
```

- [ ] **Step 9: Typecheck + run full test suite**

Run: `npm run typecheck && npm test`
Expected: PASS — no type errors, no regressions in any existing test.

- [ ] **Step 10: Commit**

```bash
git add src/components/App/App.tsx
git commit -m "$(cat <<'EOF'
feat(splash): wire Splash + AboutPill + useSplash into App.tsx

Splash dialog covers the first-paint window with branded content and
two CTAs; AboutPill joins the top-bar pill row as the reopener.
Tour currently dismisses like Explore — wiring of the stub tour
lands in the companion plan.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Final smoke + plan handoff

**Files:** none modified; this is a verification + handoff task.

- [ ] **Step 1: Run the full check suite**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green. Build produces a `dist/` without warnings about the new modules.

- [ ] **Step 2: Manual smoke checklist (ask the user to verify in the dev server)**

Confirm with the user that:
1. First visit (localStorage cleared): splash appears, Explore + Tour disabled initially, enable when load completes.
2. Clicking Explore dismisses; refreshing the tab does NOT show splash again.
3. Visiting `/#focus=ngc224` directly does NOT show splash.
4. The About pill (now in the top-bar row) reopens splash; clicking Explore again dismisses.
5. The canvas behind is visible through the blur on desktop.
6. Mobile viewport (< 480 px) stacks CTAs vertically.
7. Pressing Esc dismisses the splash.
8. Tab cycles through links → Explore → Tour → loops back.

- [ ] **Step 3: Note the deferred items**

Per the 2026-05-20 grill's out-of-scope section, do NOT implement here:
- Real tour engine (plan 2 handles the stub).
- Post-dismiss controls tooltip.
- Tour-replay UI affordance.

- [ ] **Step 4: Commit any final tweaks discovered during smoke**

```bash
# If smoke testing surfaces a small CSS or copy nit, commit it as:
git add <file>
git commit -m "$(cat <<'EOF'
fix(splash): <smoke-test finding>

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes

- **Spec coverage check:** Q1 (loading curtain + intro hybrid) → Splash component renders both. Q2 (gated first-visit + auto-skip on deep-link + About reopener) → useSplash. Q3 (Tour as stub) → covered in plan 2; this plan ships Tour wired to dismiss only. Q4 (medium gating + 8 s escape) → useSplash readiness signal + CONTINUE_ANYWAY_DELAY_MS. Q5 (translucent over live canvas + mobile fallback) → Splash.module.css. Q6 (localStorage seenVersion + version-bust) → useSplash. Q7 (B-lite failure split: WebGPU pre-React, others in splash) → main.tsx + SplashError. Q8 (tour itinerary) → plan 2. Q9 (UI hide + cancel-on-input + end state) → plan 2. Q10 (About pill in top-bar cluster) → AboutPill in Task 7 + 10. Q11 (copy) → Splash component body. Q12 (single responsive layout + mobile blur fallback) → CSS. Q13a (Explore = just dismiss) → useSplash.dismissExplore. Q13b (a11y) → Tasks 8 + 9. Q13c (visual styling defaults) → CSS. Q13d (architectural placement) → file layout matches the grill spec.
- **Type consistency:** `UseSplashInput.famousMetaFailed` is optional with a default of false in the hook (Task 6). `SplashError` discriminated union used identically in hook (Task 6) and Splash component (Task 8). `LoadProgressState` is imported from the existing types — no duplication.
- **Placeholder scan:** No "TBD" / "implement appropriately" / "fill in details" steps. All code blocks are concrete.
