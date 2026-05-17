# Famous Galaxy Curator — Plan C: UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Depends on:** Plan A merged. **Plan B is NOT a hard dependency** — the UI tests use injected fake API functions, so this plan can run in parallel with B. End-to-end manual smoke (Task 10) requires Plan B's endpoints to exist.

**Goal:** Build the React UI for the Famous Galaxy Curator: galaxy list (left), crop canvas (centre), param sliders (right), preview pane (right), metadata form, with the dirty-state tracking and process-flow wiring the spec describes. By the end of this plan the UI is usable end-to-end against the real API; visual styling is left to Plan D.

**Architecture:** **State management decision: `useReducer` + React Context.** The skymap codebase has no Zustand dependency (`grep -r zustand package.json` returns nothing) and all existing components use `useState`/`useReducer` directly. The curator's state graph is moderately deep (galaxy list + active id + tmpId + dirty flags + slider values + preview URLs + metadata + override map), but it's a single connected blob — adding Zustand for one tool would diverge from project conventions for marginal benefit. `useReducer` co-located in a `tools/famous-curator/ui/state.ts` module with action types is the chosen pattern.

A typed fetch wrapper module (`tools/famous-curator/ui/api.ts`) exposes one async function per endpoint and is injected into the App via React Context so component tests can substitute fake implementations. Crop-rectangle math lives in a pure helpers module (`tools/famous-curator/ui/cropMath.ts`) with unit tests — the React component just translates pointer events into calls to those pure functions.

**Tech Stack:** TypeScript, React 19, Vitest, @testing-library/react, jsdom. No new runtime deps.

**Branch + PR strategy:** Single feature branch `feature/curator-c-ui`; commit per task. Open PR against `main` after Task 10 lands.

---

### Task 1: Crop math pure helpers

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/cropMath.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/cropMath.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/cropMath.test.ts`:

```ts
/**
 * cropMath — pure helpers for the 1:1-locked crop rectangle.
 *
 * All helpers operate in source-image pixel space, NOT canvas-display
 * space (the React component handles the canvas↔image transform).
 *
 * Behaviour spec:
 *   - All crops are square (width === height).
 *   - Corner-drag resizes symmetrically around the opposite corner.
 *   - Edge-drag resizes along one axis, with the other axis growing in
 *     sync so the rectangle stays square (the OPPOSITE edge moves
 *     inward).  This matches Photoshop's "constrain proportions" UX.
 *   - Body-drag translates the crop, clamped to source bounds.
 *   - Reset-crop returns a centred square of 80% the min dimension.
 */
import { describe, expect, it } from 'vitest';
import {
  resetCrop,
  translateCrop,
  resizeCornerNE,
  resizeCornerNW,
  resizeCornerSE,
  resizeCornerSW,
  resizeEdgeN,
  resizeEdgeE,
  resizeEdgeS,
  resizeEdgeW,
  type Crop,
  type Bounds,
} from '../../../../tools/famous-curator/ui/cropMath';

const bounds: Bounds = { width: 1000, height: 800 };

describe('resetCrop', () => {
  it('returns a centred square at 80% of min dimension', () => {
    const c = resetCrop(bounds);
    expect(c.width).toBe(640);  // 800 * 0.8
    expect(c.height).toBe(640);
    expect(c.x).toBe((1000 - 640) / 2);
    expect(c.y).toBe((800 - 640) / 2);
  });
});

describe('translateCrop', () => {
  const start: Crop = { x: 100, y: 100, width: 400, height: 400 };

  it('moves by dx, dy when fully inside bounds', () => {
    expect(translateCrop(start, 50, 30, bounds)).toEqual({ x: 150, y: 130, width: 400, height: 400 });
  });

  it('clamps to the left edge', () => {
    expect(translateCrop(start, -200, 0, bounds)).toEqual({ x: 0, y: 100, width: 400, height: 400 });
  });

  it('clamps to the right edge', () => {
    expect(translateCrop(start, 800, 0, bounds)).toEqual({ x: 600, y: 100, width: 400, height: 400 });
  });

  it('clamps to the bottom edge', () => {
    expect(translateCrop(start, 0, 800, bounds)).toEqual({ x: 100, y: 400, width: 400, height: 400 });
  });
});

describe('corner resize (anchor at opposite corner)', () => {
  const c: Crop = { x: 200, y: 200, width: 400, height: 400 };

  it('SE corner drag: enlarging keeps NW anchor, stays square', () => {
    const out = resizeCornerSE(c, 100, 60, bounds);
    // dx=100, dy=60 → snap to the larger of the two so we stay square.
    expect(out.width).toBe(500);
    expect(out.height).toBe(500);
    expect(out.x).toBe(200); // NW anchor unchanged
    expect(out.y).toBe(200);
  });

  it('NW corner drag: enlarging keeps SE anchor, stays square', () => {
    const out = resizeCornerNW(c, -100, -100, bounds);
    expect(out.width).toBe(500);
    expect(out.height).toBe(500);
    // SE anchor at (600, 600) → new x = 600 - 500 = 100; new y = 100.
    expect(out.x).toBe(100);
    expect(out.y).toBe(100);
  });

  it('NE corner drag: keeps SW anchor', () => {
    const out = resizeCornerNE(c, 100, -100, bounds);
    expect(out.width).toBe(500);
    expect(out.height).toBe(500);
    expect(out.x).toBe(200); // SW anchor x = 200 unchanged
    expect(out.y).toBe(100); // SW anchor y = 600 unchanged → new y = 600 - 500
  });

  it('SW corner drag: keeps NE anchor', () => {
    const out = resizeCornerSW(c, -100, 100, bounds);
    expect(out.width).toBe(500);
    expect(out.height).toBe(500);
    // NE anchor at (600, 200) → new x = 600 - 500 = 100; new y = 200.
    expect(out.x).toBe(100);
    expect(out.y).toBe(200);
  });

  it('clamps so the rect cannot exceed bounds', () => {
    const out = resizeCornerSE(c, 5000, 5000, bounds);
    // Anchor NW at (200,200); max square fits in 600×600 remaining → 600.
    expect(out.width).toBe(600);
    expect(out.height).toBe(600);
  });
});

describe('edge resize (square locked by opposite edge moving in sync)', () => {
  const c: Crop = { x: 200, y: 200, width: 400, height: 400 };

  it('E edge: dx widens, opposite (N+S) edges contract by dx/2 each? — no: spec says square via opposite-edge sync. dx=100 → width 500, height 500, centred on the original mid-Y', () => {
    const out = resizeEdgeE(c, 100, bounds);
    expect(out.width).toBe(500);
    expect(out.height).toBe(500);
    expect(out.x).toBe(200); // W edge unchanged
    // Y centred on the original mid-Y (400) → y = 400 - 250 = 150.
    expect(out.y).toBe(150);
  });

  it('W edge: dx negative widens', () => {
    const out = resizeEdgeW(c, -100, bounds);
    expect(out.width).toBe(500);
    expect(out.x).toBe(100);
    expect(out.y).toBe(150);
  });

  it('N edge: dy negative widens upward', () => {
    const out = resizeEdgeN(c, -100, bounds);
    expect(out.height).toBe(500);
    expect(out.y).toBe(100);
    expect(out.x).toBe(150);
  });

  it('S edge: dy positive widens downward', () => {
    const out = resizeEdgeS(c, 100, bounds);
    expect(out.height).toBe(500);
    expect(out.y).toBe(200);
    expect(out.x).toBe(150);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/ui/cropMath.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/cropMath.ts`:

```ts
/**
 * cropMath — pure helpers for the 1:1-locked crop rectangle.
 *
 * Everything in source-image pixel space.  The React component
 * translates mouse events to pixel deltas via the canvas↔image
 * transform and calls these helpers.
 *
 * The "stay square" invariant is enforced by every operation:
 *   - Reset: width = height = 0.8 * min(bounds).
 *   - Translate: preserves width/height; clamps x,y.
 *   - Corner resize: snaps to max(|dx|, |dy|) so dragging diagonally
 *     follows the dominant axis; the opposite corner is the anchor.
 *   - Edge resize: drags one edge; the perpendicular axis grows in
 *     sync and is recentred so the rect stays square.
 *
 * All helpers clamp the output to `bounds`.
 */

export type Crop = { x: number; y: number; width: number; height: number };
export type Bounds = { width: number; height: number };

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function resetCrop(b: Bounds): Crop {
  const size = Math.floor(Math.min(b.width, b.height) * 0.8);
  return {
    x: Math.floor((b.width - size) / 2),
    y: Math.floor((b.height - size) / 2),
    width: size,
    height: size,
  };
}

export function translateCrop(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  return {
    x: clamp(c.x + dx, 0, b.width - c.width),
    y: clamp(c.y + dy, 0, b.height - c.height),
    width: c.width,
    height: c.height,
  };
}

/**
 * Snap (dx, dy) → a single magnitude that keeps the rect square.
 * The sign comes from `sign` (the direction the side actually moves
 * outward in this corner's frame of reference).
 */
function squareDelta(dx: number, dy: number): number {
  // Average the two axes so the user can drag diagonally without
  // one axis dominating from rounding.  Magnitude only; sign decided
  // by caller.
  return Math.round((Math.abs(dx) + Math.abs(dy)) / 2);
}

export function resizeCornerSE(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  // Anchor NW = (c.x, c.y).  Side grows when dx > 0 OR dy > 0.
  const sign = dx + dy >= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const desired = c.width + sign * mag;
  // Clamp size by the remaining room from NW anchor to far edges.
  const maxSize = Math.min(b.width - c.x, b.height - c.y);
  const size = clamp(desired, 1, maxSize);
  return { x: c.x, y: c.y, width: size, height: size };
}

export function resizeCornerNW(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  // Anchor SE = (c.x + c.width, c.y + c.height).  Side grows when dx<0 or dy<0.
  const seX = c.x + c.width;
  const seY = c.y + c.height;
  const sign = dx + dy <= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const desired = c.width + sign * mag;
  const maxSize = Math.min(seX, seY);
  const size = clamp(desired, 1, maxSize);
  return { x: seX - size, y: seY - size, width: size, height: size };
}

export function resizeCornerNE(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  // Anchor SW = (c.x, c.y + c.height).  Side grows when dx>0 or dy<0.
  const swX = c.x;
  const swY = c.y + c.height;
  const sign = dx - dy >= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const desired = c.width + sign * mag;
  const maxSize = Math.min(b.width - swX, swY);
  const size = clamp(desired, 1, maxSize);
  return { x: swX, y: swY - size, width: size, height: size };
}

export function resizeCornerSW(c: Crop, dx: number, dy: number, b: Bounds): Crop {
  // Anchor NE = (c.x + c.width, c.y).  Side grows when dx<0 or dy>0.
  const neX = c.x + c.width;
  const neY = c.y;
  const sign = -dx + dy >= 0 ? 1 : -1;
  const mag = squareDelta(dx, dy);
  const desired = c.width + sign * mag;
  const maxSize = Math.min(neX, b.height - neY);
  const size = clamp(desired, 1, maxSize);
  return { x: neX - size, y: neY, width: size, height: size };
}

/**
 * Edge resize: the dragged edge moves by the delta; the perpendicular
 * axis grows by the same amount but is recentred (split half above /
 * half below the original mid-axis) so the rect stays square.
 *
 * Helper that takes (newSize, anchorX, anchorY of the edge that DID NOT
 * move) and recentres the perpendicular axis on the original midpoint.
 */
function edgeResult(
  newSize: number,
  fixedEdgeAxis: 'x' | 'y',
  fixedEdgeStart: number,
  originalMidPerp: number,
  b: Bounds,
): Crop {
  const size = clamp(newSize, 1, fixedEdgeAxis === 'x' ? b.width : b.height);
  if (fixedEdgeAxis === 'x') {
    // Fixed edge is at x = fixedEdgeStart; width grows along x; height
    // also = size, recentred on originalMidPerp (the original mid-Y).
    const x = clamp(fixedEdgeStart, 0, b.width - size);
    const y = clamp(originalMidPerp - size / 2, 0, b.height - size);
    return { x, y, width: size, height: size };
  }
  const y = clamp(fixedEdgeStart, 0, b.height - size);
  const x = clamp(originalMidPerp - size / 2, 0, b.width - size);
  return { x, y, width: size, height: size };
}

export function resizeEdgeE(c: Crop, dx: number, b: Bounds): Crop {
  const newSize = c.width + dx;
  const fixedEdgeX = c.x; // W edge stays put
  const midY = c.y + c.height / 2;
  return edgeResult(newSize, 'x', fixedEdgeX, midY, b);
}

export function resizeEdgeW(c: Crop, dx: number, b: Bounds): Crop {
  // dx < 0 widens.  W edge moves; E edge stays put.
  const newSize = c.width - dx;
  const fixedEdgeX = (c.x + c.width) - clamp(newSize, 1, b.width);
  const midY = c.y + c.height / 2;
  return edgeResult(newSize, 'x', fixedEdgeX, midY, b);
}

export function resizeEdgeN(c: Crop, dy: number, b: Bounds): Crop {
  // dy < 0 widens.  N edge moves; S edge stays put.
  const newSize = c.height - dy;
  const fixedEdgeY = (c.y + c.height) - clamp(newSize, 1, b.height);
  const midX = c.x + c.width / 2;
  return edgeResult(newSize, 'y', fixedEdgeY, midX, b);
}

export function resizeEdgeS(c: Crop, dy: number, b: Bounds): Crop {
  const newSize = c.height + dy;
  const fixedEdgeY = c.y;
  const midX = c.x + c.width / 2;
  return edgeResult(newSize, 'y', fixedEdgeY, midX, b);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/ui/cropMath.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/ui/cropMath.ts tests/tools/famous-curator/ui/cropMath.test.ts
git commit -m "$(cat <<'EOF'
feat(curator): cropMath pure helpers for 1:1-locked crop rectangle

reset / translate / corner-resize × 4 / edge-resize × 4.  Square
invariant enforced by every op; clamps to source bounds.  React
component (next task) translates pointer events into delta calls.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Typed API client + Context wrapper

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/api.ts`
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/apiContext.tsx`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/api.test.ts`:

```ts
/**
 * api — typed fetch wrappers around /api/*.
 *
 * Tests use a stubbed `fetch` implementation injected via the factory.
 * No real network.
 */
import { describe, expect, it, vi } from 'vitest';
import { makeApi } from '../../../../tools/famous-curator/ui/api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('makeApi', () => {
  it('getGalaxies fetches /api/galaxies and returns the parsed body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ galaxies: [{ id: 'm31', curated: false }] }));
    const api = makeApi({ fetch: fetchFn as never });
    const result = await api.getGalaxies();
    expect(fetchFn).toHaveBeenCalledWith('/api/galaxies');
    expect(result.galaxies[0]!.id).toBe('m31');
  });

  it('postFetchUrl POSTs JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ tmpId: 'x', width: 100, height: 80, previewUrl: '/p', mediaType: 'image/png' }));
    const api = makeApi({ fetch: fetchFn as never });
    await api.postFetchUrl('https://e.com/i.png');
    const call = fetchFn.mock.calls[0]!;
    expect(call[0]).toBe('/api/fetch');
    expect(call[1].method).toBe('POST');
    expect(call[1].headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(call[1].body)).toEqual({ url: 'https://e.com/i.png' });
  });

  it('postFetchBytes POSTs the binary body with the given Content-Type', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ tmpId: 'x', width: 1, height: 1, previewUrl: '/p', mediaType: 'image/jpeg' }));
    const api = makeApi({ fetch: fetchFn as never });
    const bytes = new Uint8Array([1, 2, 3]);
    await api.postFetchBytes(bytes, 'image/jpeg');
    const call = fetchFn.mock.calls[0]!;
    expect(call[1].headers['Content-Type']).toBe('image/jpeg');
    expect(call[1].body).toBe(bytes);
  });

  it('throws on non-OK responses with the body error message', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: 'too big' }, 413));
    const api = makeApi({ fetch: fetchFn as never });
    await expect(api.postFetchUrl('https://e.com/big.png')).rejects.toThrow(/too big/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/ui/api.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/api.ts`:

```ts
/**
 * api — typed fetch wrappers for the curator's /api/* routes.
 *
 * Built via a factory (`makeApi`) so component tests can inject a
 * stubbed `fetch`.  Production callers use `defaultApi`, which closes
 * over the real `window.fetch`.
 */

export type GalaxyListEntry = {
  id: string;
  names: string[];
  ra: number;
  dec: number;
  distanceMpc: number;
  diameterKpc: number;
  type: string;
  description: string;
  curated: boolean;
};

export type FetchResult = {
  tmpId: string;
  width: number;
  height: number;
  previewUrl: string;
  mediaType: string;
};

export type ProcessParams = {
  tmpId: string;
  crop: { x: number; y: number; width: number; height: number };
  starnet: { stride: number; upsample: boolean };
  alpha: { blackPoint: number; whitePoint: number; gamma: number };
};

export type ProcessResult = {
  starlessPreviewUrl: string;
  alphaPreviewUrl: string;
};

export type AlphaOnlyParams = {
  tmpId: string;
  alpha: { blackPoint: number; whitePoint: number; gamma: number };
};

export type AlphaOnlyResult = {
  alphaPreviewUrl: string;
};

export type ExportParams = ProcessParams & {
  id: string;
  metadata: { sourceUrl: string; license: string; author: string };
};

export type ExportResult = {
  paths: {
    source: string;
    starless: string;
    full: string;
    atlas: string;
    recipe: string;
  };
};

export type Api = {
  getGalaxies: () => Promise<{ galaxies: GalaxyListEntry[] }>;
  postFetchUrl: (url: string) => Promise<FetchResult>;
  postFetchBytes: (bytes: BodyInit, mediaType: string) => Promise<FetchResult>;
  postProcess: (params: ProcessParams) => Promise<ProcessResult>;
  postAlphaOnly: (params: AlphaOnlyParams) => Promise<AlphaOnlyResult>;
  postExport: (params: ExportParams) => Promise<ExportResult>;
};

async function readOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (typeof body.error === 'string') msg = body.error;
    } catch {
      // ignore — keep generic message
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export function makeApi(deps: { fetch: typeof fetch }): Api {
  const f = deps.fetch;
  return {
    async getGalaxies() {
      return readOrThrow(await f('/api/galaxies'));
    },
    async postFetchUrl(url) {
      return readOrThrow(await f('/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      }));
    },
    async postFetchBytes(bytes, mediaType) {
      return readOrThrow(await f('/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': mediaType },
        body: bytes,
      }));
    },
    async postProcess(params) {
      return readOrThrow(await f('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      }));
    },
    async postAlphaOnly(params) {
      return readOrThrow(await f('/api/process/alpha-only', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      }));
    },
    async postExport(params) {
      return readOrThrow(await f('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      }));
    },
  };
}

export const defaultApi: Api = makeApi({ fetch: globalThis.fetch });
```

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/apiContext.tsx`:

```tsx
/**
 * apiContext — React Context wrapper for the Api object.
 *
 * Lets the App root inject the production `defaultApi`, while
 * component tests render with `<ApiProvider value={fakeApi}>` and
 * assert against the spy calls.  All UI components consume the API
 * via `useApi()` rather than importing `defaultApi` directly — that
 * keeps the test surface clean.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { defaultApi, type Api } from './api';

const ApiContext = createContext<Api>(defaultApi);

export function ApiProvider(props: { value?: Api; children: ReactNode }): JSX.Element {
  return <ApiContext.Provider value={props.value ?? defaultApi}>{props.children}</ApiContext.Provider>;
}

export function useApi(): Api {
  return useContext(ApiContext);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/ui/api.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/ui/api.ts tools/famous-curator/ui/apiContext.tsx tests/tools/famous-curator/ui/api.test.ts
git commit -m "$(cat <<'EOF'
feat(curator/ui): typed API client + React Context provider

makeApi factory takes an injected fetch (production: globalThis.fetch;
tests: vi.fn).  ApiProvider lets the App root pass either through to
useApi() consumers without importing defaultApi directly.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: useReducer state module

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/state.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/state.test.ts`:

```ts
/**
 * state — reducer for the curator UI.
 *
 * State shape:
 *   - galaxies: GalaxyListEntry[]  (from /api/galaxies)
 *   - activeId: string | undefined (selected galaxy)
 *   - tmpId: string | undefined    (current /api/fetch session)
 *   - source: { width, height, previewUrl } | undefined
 *   - crop: Crop | undefined       (resetCrop'd when source loads)
 *   - starnet: { stride, upsample }
 *   - alpha: { blackPoint, whitePoint, gamma }
 *   - metadata: { sourceUrl, license, author }
 *   - previews: { starless?, alpha? }
 *   - dirty: { crop, starnet, alpha }  (which subsystem needs re-Process /
 *                                       alpha-only re-render)
 *   - processedOnce: boolean       (Export gate)
 *
 * The reducer enforces the dirty-state transitions documented in the
 * spec's "Process flow + preview behaviour" section.
 */
import { describe, expect, it } from 'vitest';
import { reducer, initialState, type Action } from '../../../../tools/famous-curator/ui/state';

function apply(actions: Action[]) {
  return actions.reduce(reducer, initialState);
}

describe('state reducer', () => {
  it('initial state has nothing selected, default sliders', () => {
    expect(initialState.activeId).toBeUndefined();
    expect(initialState.starnet.stride).toBe(256);
    expect(initialState.alpha.blackPoint).toBe(8);
    expect(initialState.alpha.whitePoint).toBe(255);
    expect(initialState.alpha.gamma).toBeCloseTo(0.7);
  });

  it('setGalaxies populates the list', () => {
    const s = reducer(initialState, { type: 'setGalaxies', galaxies: [
      { id: 'm31', names: ['M31'], ra: 0, dec: 0, distanceMpc: 0, diameterKpc: 0, type: '', description: '', curated: false },
    ]});
    expect(s.galaxies).toHaveLength(1);
  });

  it('selectGalaxy clears tmpId, source, crop, previews, processedOnce', () => {
    const s = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 80, previewUrl: '/p' },
      { type: 'setPreviews', starless: '/s', alpha: '/a' },
      { type: 'markProcessed' },
      { type: 'selectGalaxy', id: 'm31' },
    ]);
    expect(s.activeId).toBe('m31');
    expect(s.tmpId).toBeUndefined();
    expect(s.source).toBeUndefined();
    expect(s.crop).toBeUndefined();
    expect(s.previews).toEqual({});
    expect(s.processedOnce).toBe(false);
  });

  it('setSource initialises crop via resetCrop and marks crop dirty', () => {
    const s = reducer(initialState, { type: 'setSource', tmpId: 't', width: 1000, height: 800, previewUrl: '/p' });
    expect(s.crop?.width).toBe(640);
    expect(s.dirty.crop).toBe(true);
  });

  it('setCrop marks crop dirty', () => {
    const s = apply([
      { type: 'setSource', tmpId: 't', width: 1000, height: 800, previewUrl: '/p' },
      { type: 'markProcessed' },
      { type: 'setCrop', crop: { x: 0, y: 0, width: 100, height: 100 } },
    ]);
    expect(s.dirty.crop).toBe(true);
    expect(s.processedOnce).toBe(true); // crop dirty does NOT reset processedOnce
  });

  it('setStarnet marks starnet dirty', () => {
    const s = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 100, previewUrl: '/p' },
      { type: 'setStarnet', starnet: { stride: 512, upsample: true } },
    ]);
    expect(s.dirty.starnet).toBe(true);
  });

  it('setAlpha marks alpha dirty but NOT crop/starnet', () => {
    const s = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 100, previewUrl: '/p' },
      { type: 'markProcessed' },
      { type: 'setAlpha', alpha: { blackPoint: 10, whitePoint: 240, gamma: 0.5 } },
    ]);
    expect(s.dirty.alpha).toBe(true);
    expect(s.dirty.crop).toBe(false); // setSource cleared it; nothing dirtied since
  });

  it('markProcessed clears crop+starnet dirty, sets processedOnce, leaves alpha dirty alone', () => {
    const s = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 100, previewUrl: '/p' },
      { type: 'setStarnet', starnet: { stride: 512, upsample: false } },
      { type: 'setAlpha', alpha: { blackPoint: 10, whitePoint: 240, gamma: 0.5 } },
      { type: 'markProcessed' },
    ]);
    expect(s.dirty.crop).toBe(false);
    expect(s.dirty.starnet).toBe(false);
    expect(s.dirty.alpha).toBe(true);
    expect(s.processedOnce).toBe(true);
  });

  it('canExport requires processedOnce + valid metadata + crop not dirty + starnet not dirty', () => {
    // Helper exports a derived selector from the same module.
    const { canExport } = require('../../../../tools/famous-curator/ui/state');
    const ok = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 100, previewUrl: '/p' },
      { type: 'markProcessed' },
      { type: 'setMetadata', metadata: { sourceUrl: 'https://a', license: 'CC-BY', author: 'A' } },
    ]);
    expect(canExport(ok)).toBe(true);
    const noMeta = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 100, previewUrl: '/p' },
      { type: 'markProcessed' },
    ]);
    expect(canExport(noMeta)).toBe(false);
    const cropDirty = apply([
      { type: 'setSource', tmpId: 't', width: 100, height: 100, previewUrl: '/p' },
      { type: 'markProcessed' },
      { type: 'setMetadata', metadata: { sourceUrl: 'https://a', license: 'CC-BY', author: 'A' } },
      { type: 'setCrop', crop: { x: 0, y: 0, width: 50, height: 50 } },
    ]);
    expect(canExport(cropDirty)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/ui/state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/state.ts`:

```ts
/**
 * Curator UI state — useReducer pattern.
 *
 * Single connected state blob, action-typed reducer.  See state.test.ts
 * for the spec the reducer implements (especially the dirty-state
 * transitions, which mirror the spec's "Process flow + preview
 * behaviour" section).
 */
import { resetCrop, type Crop } from './cropMath';
import type { GalaxyListEntry } from './api';

export type StarnetParams = { stride: number; upsample: boolean };
export type AlphaParams = { blackPoint: number; whitePoint: number; gamma: number };
export type MetadataParams = { sourceUrl: string; license: string; author: string };

export type DirtyFlags = {
  crop: boolean;
  starnet: boolean;
  alpha: boolean;
};

export type State = {
  galaxies: GalaxyListEntry[];
  activeId: string | undefined;
  tmpId: string | undefined;
  source: { width: number; height: number; previewUrl: string } | undefined;
  crop: Crop | undefined;
  starnet: StarnetParams;
  alpha: AlphaParams;
  metadata: MetadataParams;
  previews: { starless?: string; alpha?: string };
  dirty: DirtyFlags;
  processedOnce: boolean;
};

export const initialState: State = {
  galaxies: [],
  activeId: undefined,
  tmpId: undefined,
  source: undefined,
  crop: undefined,
  starnet: { stride: 256, upsample: false },
  alpha: { blackPoint: 8, whitePoint: 255, gamma: 0.7 },
  metadata: { sourceUrl: '', license: '', author: '' },
  previews: {},
  dirty: { crop: false, starnet: false, alpha: false },
  processedOnce: false,
};

export type Action =
  | { type: 'setGalaxies'; galaxies: GalaxyListEntry[] }
  | { type: 'selectGalaxy'; id: string }
  | { type: 'setSource'; tmpId: string; width: number; height: number; previewUrl: string }
  | { type: 'setCrop'; crop: Crop }
  | { type: 'setStarnet'; starnet: StarnetParams }
  | { type: 'setAlpha'; alpha: AlphaParams }
  | { type: 'setMetadata'; metadata: MetadataParams }
  | { type: 'setPreviews'; starless?: string; alpha?: string }
  | { type: 'markProcessed' }
  | { type: 'markCuratedById'; id: string };

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'setGalaxies':
      return { ...s, galaxies: a.galaxies };
    case 'selectGalaxy':
      return {
        ...s,
        activeId: a.id,
        tmpId: undefined,
        source: undefined,
        crop: undefined,
        previews: {},
        processedOnce: false,
        dirty: { crop: false, starnet: false, alpha: false },
      };
    case 'setSource': {
      const crop = resetCrop({ width: a.width, height: a.height });
      return {
        ...s,
        tmpId: a.tmpId,
        source: { width: a.width, height: a.height, previewUrl: a.previewUrl },
        crop,
        dirty: { crop: true, starnet: false, alpha: false },
        previews: {},
        processedOnce: false,
      };
    }
    case 'setCrop':
      return { ...s, crop: a.crop, dirty: { ...s.dirty, crop: true } };
    case 'setStarnet':
      return { ...s, starnet: a.starnet, dirty: { ...s.dirty, starnet: true } };
    case 'setAlpha':
      return { ...s, alpha: a.alpha, dirty: { ...s.dirty, alpha: true } };
    case 'setMetadata':
      return { ...s, metadata: a.metadata };
    case 'setPreviews':
      return {
        ...s,
        previews: {
          starless: a.starless ?? s.previews.starless,
          alpha: a.alpha ?? s.previews.alpha,
        },
      };
    case 'markProcessed':
      return {
        ...s,
        processedOnce: true,
        dirty: { crop: false, starnet: false, alpha: s.dirty.alpha },
      };
    case 'markCuratedById':
      return {
        ...s,
        galaxies: s.galaxies.map((g) => (g.id === a.id ? { ...g, curated: true } : g)),
      };
  }
}

/**
 * Derived: can the user click Export right now?  Requires all three
 * pre-conditions:
 *  - at least one Process has succeeded with the current crop+starnet
 *  - crop is not dirty (would require re-Process)
 *  - starnet is not dirty (would require re-Process)
 *  - all three metadata fields are non-empty
 *
 * Alpha being dirty is fine — the alpha-only path keeps the cached
 * starless valid; export re-runs alpha at full resolution.
 */
export function canExport(s: State): boolean {
  if (!s.processedOnce) return false;
  if (s.dirty.crop || s.dirty.starnet) return false;
  if (s.metadata.sourceUrl.length === 0) return false;
  if (s.metadata.license.length === 0) return false;
  if (s.metadata.author.length === 0) return false;
  if (s.activeId === undefined) return false;
  if (s.tmpId === undefined) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/ui/state.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/ui/state.ts tests/tools/famous-curator/ui/state.test.ts
git commit -m "$(cat <<'EOF'
feat(curator/ui): useReducer state module + canExport selector

Single connected state blob with action-typed reducer.  Dirty-state
transitions per spec: setCrop/setStarnet dirty their slot;
markProcessed clears crop+starnet but leaves alpha; setSource resets
everything.  canExport gate requires processedOnce + clean
crop/starnet + complete metadata.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: GalaxyList component

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/components/GalaxyList.tsx`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/components/GalaxyList.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/components/GalaxyList.test.tsx`:

```tsx
/**
 * GalaxyList — left-panel scrollable list of seed entries.
 *
 * Props: galaxies, activeId, onSelect.  Done galaxies show a checkmark.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GalaxyList } from '../../../../../tools/famous-curator/ui/components/GalaxyList';

const ENTRY = (id: string, curated = false) => ({
  id, names: [id.toUpperCase()], ra: 0, dec: 0, distanceMpc: 0, diameterKpc: 0,
  type: '', description: '', curated,
});

describe('GalaxyList', () => {
  it('renders every entry with its primary name', () => {
    render(
      <GalaxyList
        galaxies={[ENTRY('m31'), ENTRY('m33'), ENTRY('m51')]}
        activeId={undefined}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('M31')).toBeInTheDocument();
    expect(screen.getByText('M33')).toBeInTheDocument();
    expect(screen.getByText('M51')).toBeInTheDocument();
  });

  it('marks curated entries with the data-curated attribute', () => {
    render(
      <GalaxyList
        galaxies={[ENTRY('m31', true), ENTRY('m33', false)]}
        activeId={undefined}
        onSelect={vi.fn()}
      />,
    );
    const m31 = screen.getByText('M31').closest('[data-galaxy-id]');
    const m33 = screen.getByText('M33').closest('[data-galaxy-id]');
    expect(m31?.getAttribute('data-curated')).toBe('true');
    expect(m33?.getAttribute('data-curated')).toBe('false');
  });

  it('marks the active entry with aria-current', () => {
    render(
      <GalaxyList galaxies={[ENTRY('m31'), ENTRY('m33')]} activeId="m33" onSelect={vi.fn()} />,
    );
    const m33 = screen.getByText('M33').closest('[data-galaxy-id]');
    expect(m33?.getAttribute('aria-current')).toBe('true');
  });

  it('calls onSelect(id) on click', () => {
    const onSelect = vi.fn();
    render(
      <GalaxyList galaxies={[ENTRY('m31')]} activeId={undefined} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText('M31'));
    expect(onSelect).toHaveBeenCalledWith('m31');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/ui/components/GalaxyList.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/components/GalaxyList.tsx`:

```tsx
/**
 * GalaxyList — left-panel scrollable list.  Each row shows the
 * galaxy's primary display name + a curated-done indicator.  Click to
 * select.
 *
 * Plan D styles this; Plan C ships functional markup with semantic
 * attributes (data-curated, aria-current) the stylist can hook into.
 */
import type { GalaxyListEntry } from '../api';

export type GalaxyListProps = {
  galaxies: ReadonlyArray<GalaxyListEntry>;
  activeId: string | undefined;
  onSelect: (id: string) => void;
};

export function GalaxyList(props: GalaxyListProps): JSX.Element {
  return (
    <ul className="curator-galaxy-list" role="list">
      {props.galaxies.map((g) => {
        const primary = g.names[0] ?? g.id;
        const isActive = g.id === props.activeId;
        return (
          <li
            key={g.id}
            data-galaxy-id={g.id}
            data-curated={String(g.curated)}
            aria-current={isActive ? 'true' : undefined}
            onClick={() => props.onSelect(g.id)}
          >
            <span className="curator-galaxy-list__name">{primary}</span>
            {g.curated && <span className="curator-galaxy-list__check" aria-label="curated">✓</span>}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/ui/components/GalaxyList.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/ui/components/GalaxyList.tsx tests/tools/famous-curator/ui/components/GalaxyList.test.tsx
git commit -m "$(cat <<'EOF'
feat(curator/ui): GalaxyList component

Left-panel list with data-curated + aria-current attributes for the
Plan D stylist to hook into.  Click → onSelect(id).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: CropCanvas component

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/components/CropCanvas.tsx`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/components/CropCanvas.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/components/CropCanvas.test.tsx`:

```tsx
/**
 * CropCanvas — renders the source preview + an overlay 1:1 crop rect.
 *
 * Pointer interaction is hard to drive precisely in jsdom (no real
 * layout).  This test covers the deterministic surface: rendering, the
 * Reset button, the readout, drag-drop file handling, and the zoom
 * slider.  Pointer-drag behaviour is implicitly covered by Task 1's
 * cropMath tests + the manual smoke in Task 10.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CropCanvas } from '../../../../../tools/famous-curator/ui/components/CropCanvas';

describe('CropCanvas', () => {
  it('renders the source preview at the given URL', () => {
    render(
      <CropCanvas
        source={{ width: 1000, height: 800, previewUrl: '/p.webp' }}
        crop={{ x: 100, y: 100, width: 400, height: 400 }}
        onCropChange={vi.fn()}
        onFileDrop={vi.fn()}
      />,
    );
    const img = screen.getByAltText('source') as HTMLImageElement;
    expect(img.src.endsWith('/p.webp')).toBe(true);
  });

  it('shows the live coord readout', () => {
    render(
      <CropCanvas
        source={{ width: 1000, height: 800, previewUrl: '/p.webp' }}
        crop={{ x: 100, y: 100, width: 400, height: 400 }}
        onCropChange={vi.fn()}
        onFileDrop={vi.fn()}
      />,
    );
    expect(screen.getByText(/400 × 400 of 1000 × 800/)).toBeInTheDocument();
  });

  it('Reset crop button calls onCropChange with a centred 80% square', () => {
    const onCropChange = vi.fn();
    render(
      <CropCanvas
        source={{ width: 1000, height: 800, previewUrl: '/p.webp' }}
        crop={{ x: 0, y: 0, width: 100, height: 100 }}
        onCropChange={onCropChange}
        onFileDrop={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Reset crop'));
    expect(onCropChange).toHaveBeenCalledWith({ x: 180, y: 80, width: 640, height: 640 });
  });

  it('drop event with a File calls onFileDrop with the file', () => {
    const onFileDrop = vi.fn();
    render(
      <CropCanvas
        source={undefined}
        crop={undefined}
        onCropChange={vi.fn()}
        onFileDrop={onFileDrop}
      />,
    );
    const dz = screen.getByTestId('curator-crop-dropzone');
    const file = new File([new Uint8Array([1, 2, 3])], 'galaxy.jpg', { type: 'image/jpeg' });
    fireEvent.drop(dz, { dataTransfer: { files: [file] } });
    expect(onFileDrop).toHaveBeenCalledWith(file);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/ui/components/CropCanvas.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/components/CropCanvas.tsx`:

```tsx
/**
 * CropCanvas — source preview + 1:1 crop overlay.
 *
 * Layout:
 *   - When `source` is undefined, renders a drop-zone placeholder.
 *   - When `source` is set, renders an <img> at the preview URL plus
 *     an absolutely-positioned crop rectangle with corner + edge
 *     handles and a body-drag region.
 *
 * Pointer math: every pointermove on a handle translates into a delta
 * in source-pixel space (canvasDeltaPx ÷ canvasScale) and calls the
 * matching `cropMath` helper.  The component just owns the
 * pointer-event plumbing — the geometry is all in cropMath.ts.
 *
 * `onFileDrop(file)` fires when the user drag-drops a local file onto
 * the canvas.  The parent calls /api/fetch with { bytes, mediaType }.
 */
import { useCallback, useRef, useState, type PointerEvent, type DragEvent } from 'react';
import {
  resetCrop,
  translateCrop,
  resizeCornerNE, resizeCornerNW, resizeCornerSE, resizeCornerSW,
  resizeEdgeN, resizeEdgeE, resizeEdgeS, resizeEdgeW,
  type Crop, type Bounds,
} from '../cropMath';

type Handle =
  | 'body'
  | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export type CropCanvasProps = {
  source: { width: number; height: number; previewUrl: string } | undefined;
  crop: Crop | undefined;
  onCropChange: (c: Crop) => void;
  onFileDrop: (file: File) => void;
};

export function CropCanvas(props: CropCanvasProps): JSX.Element {
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handle: Handle; startX: number; startY: number; startCrop: Crop; canvasScale: number } | null>(null);

  const startDrag = useCallback((handle: Handle) => (e: PointerEvent<HTMLDivElement>) => {
    if (!props.source || !props.crop) return;
    const img = containerRef.current?.querySelector('img.curator-crop-source') as HTMLImageElement | null;
    if (!img) return;
    // canvasScale = on-screen-px-per-source-px in the preview <img>.
    // The img is rendered at intrinsic preview size × zoom; the source
    // dimensions are the *true* source size (e.g. 4000²) — so the
    // ratio between drag delta in screen px and source px is
    // (img.clientWidth * zoom) / source.width.
    const canvasScale = (img.clientWidth) / props.source.width;
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: props.crop,
      canvasScale,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [props.source, props.crop]);

  const moveDrag = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || !props.source) return;
    const dx = (e.clientX - d.startX) / d.canvasScale;
    const dy = (e.clientY - d.startY) / d.canvasScale;
    const b: Bounds = { width: props.source.width, height: props.source.height };
    let next: Crop;
    switch (d.handle) {
      case 'body': next = translateCrop(d.startCrop, dx, dy, b); break;
      case 'nw':   next = resizeCornerNW(d.startCrop, dx, dy, b); break;
      case 'n':    next = resizeEdgeN(d.startCrop, dy, b); break;
      case 'ne':   next = resizeCornerNE(d.startCrop, dx, dy, b); break;
      case 'e':    next = resizeEdgeE(d.startCrop, dx, b); break;
      case 'se':   next = resizeCornerSE(d.startCrop, dx, dy, b); break;
      case 's':    next = resizeEdgeS(d.startCrop, dy, b); break;
      case 'sw':   next = resizeCornerSW(d.startCrop, dx, dy, b); break;
      case 'w':    next = resizeEdgeW(d.startCrop, dx, b); break;
    }
    props.onCropChange(next);
  }, [props]);

  const endDrag = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  }, []);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) props.onFileDrop(file);
  }, [props]);

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  if (!props.source || !props.crop) {
    return (
      <div
        className="curator-crop-canvas curator-crop-canvas--empty"
        data-testid="curator-crop-dropzone"
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <p>Paste a URL above or drop an image file here.</p>
      </div>
    );
  }

  const cropPctX = (props.crop.x / props.source.width) * 100;
  const cropPctY = (props.crop.y / props.source.height) * 100;
  const cropPctW = (props.crop.width / props.source.width) * 100;
  const cropPctH = (props.crop.height / props.source.height) * 100;

  return (
    <div className="curator-crop-canvas" ref={containerRef} data-testid="curator-crop-dropzone" onDrop={onDrop} onDragOver={onDragOver}>
      <div className="curator-crop-controls">
        <label>Zoom <input type="range" min="0.5" max="3" step="0.1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
        <button onClick={() => props.onCropChange(resetCrop({ width: props.source!.width, height: props.source!.height }))}>Reset crop</button>
        <span className="curator-crop-readout">crop {props.crop.width} × {props.crop.height} of {props.source.width} × {props.source.height} source</span>
      </div>
      <div className="curator-crop-stage" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
        <img className="curator-crop-source" src={props.source.previewUrl} alt="source" />
        <div
          className="curator-crop-rect"
          style={{
            position: 'absolute',
            left: `${cropPctX}%`, top: `${cropPctY}%`,
            width: `${cropPctW}%`, height: `${cropPctH}%`,
          }}
          onPointerDown={startDrag('body')}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
        >
          {(['nw','n','ne','e','se','s','sw','w'] as const).map((h) => (
            <span
              key={h}
              className={`curator-crop-handle curator-crop-handle--${h}`}
              data-handle={h}
              onPointerDown={startDrag(h)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/ui/components/CropCanvas.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/ui/components/CropCanvas.tsx tests/tools/famous-curator/ui/components/CropCanvas.test.tsx
git commit -m "$(cat <<'EOF'
feat(curator/ui): CropCanvas — image + 1:1 crop overlay + drop-zone

8 handles + body drag delegate to cropMath helpers via pointer-event
captures.  Drag-drop fires onFileDrop(file).  Reset button calls
resetCrop centred 80% square.  Zoom slider scales the stage.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: ParamSliders component

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/components/ParamSliders.tsx`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/components/ParamSliders.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/components/ParamSliders.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ParamSliders } from '../../../../../tools/famous-curator/ui/components/ParamSliders';

describe('ParamSliders', () => {
  const defaults = {
    starnet: { stride: 256, upsample: false },
    alpha: { blackPoint: 8, whitePoint: 255, gamma: 0.7 },
    dirty: { crop: false, starnet: false, alpha: false },
    processedOnce: false,
    canExport: false,
  };

  it('renders all 5 controls + 2 action buttons', () => {
    render(
      <ParamSliders
        {...defaults}
        onStarnet={vi.fn()}
        onAlpha={vi.fn()}
        onProcess={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/stride/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/upsample/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/black point/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/white point/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/gamma/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /process/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('marks Process with data-dirty=true when crop or starnet is dirty', () => {
    render(
      <ParamSliders
        {...defaults}
        dirty={{ crop: true, starnet: false, alpha: false }}
        onStarnet={vi.fn()} onAlpha={vi.fn()} onProcess={vi.fn()} onExport={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: /process/i });
    expect(btn.getAttribute('data-dirty')).toBe('true');
  });

  it('disables Export when canExport=false', () => {
    render(
      <ParamSliders
        {...defaults}
        onStarnet={vi.fn()} onAlpha={vi.fn()} onProcess={vi.fn()} onExport={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
  });

  it('enables Export when canExport=true', () => {
    render(
      <ParamSliders
        {...defaults} canExport
        onStarnet={vi.fn()} onAlpha={vi.fn()} onProcess={vi.fn()} onExport={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /export/i })).not.toBeDisabled();
  });

  it('changing the gamma slider calls onAlpha with the new value', () => {
    const onAlpha = vi.fn();
    render(
      <ParamSliders
        {...defaults}
        onStarnet={vi.fn()} onAlpha={onAlpha} onProcess={vi.fn()} onExport={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/gamma/i), { target: { value: '1.2' } });
    expect(onAlpha).toHaveBeenCalledWith({ blackPoint: 8, whitePoint: 255, gamma: 1.2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/ui/components/ParamSliders.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/components/ParamSliders.tsx`:

```tsx
/**
 * ParamSliders — StarNet + Alpha controls + Process/Export buttons.
 *
 * Slider ranges per spec:
 *   stride       16..512  (snap to power-of-2 — UI snaps, server accepts any int)
 *   upsample     bool
 *   blackPoint   0..50
 *   whitePoint   180..255
 *   gamma        0.3..2.0 (log-scaled track via input[type=range] step=0.05)
 *
 * Process button marks data-dirty=true when crop OR starnet is dirty
 * — Plan D's stylist will show the orange-dot affordance.
 * Export is disabled unless canExport.
 */
import type { StarnetParams, AlphaParams, DirtyFlags } from '../state';

const SNAP_STRIDES = [16, 32, 64, 128, 256, 512] as const;
function snapStride(v: number): number {
  let best = SNAP_STRIDES[0]!;
  let bestDist = Math.abs(v - best);
  for (const s of SNAP_STRIDES) {
    const d = Math.abs(v - s);
    if (d < bestDist) { best = s; bestDist = d; }
  }
  return best;
}

export type ParamSlidersProps = {
  starnet: StarnetParams;
  alpha: AlphaParams;
  dirty: DirtyFlags;
  processedOnce: boolean;
  canExport: boolean;
  onStarnet: (p: StarnetParams) => void;
  onAlpha: (p: AlphaParams) => void;
  onProcess: () => void;
  onExport: () => void;
};

export function ParamSliders(props: ParamSlidersProps): JSX.Element {
  const processDirty = props.dirty.crop || props.dirty.starnet;
  return (
    <section className="curator-param-sliders">
      <fieldset>
        <legend>StarNet</legend>
        <label>
          stride <span>{props.starnet.stride}</span>
          <input
            type="range" min="16" max="512" step="1" value={props.starnet.stride}
            onChange={(e) => props.onStarnet({ ...props.starnet, stride: snapStride(Number(e.target.value)) })}
          />
        </label>
        <label>
          <input
            type="checkbox" checked={props.starnet.upsample}
            onChange={(e) => props.onStarnet({ ...props.starnet, upsample: e.target.checked })}
          />
          upsample
        </label>
      </fieldset>
      <fieldset>
        <legend>Alpha</legend>
        <label>
          black point <span>{props.alpha.blackPoint}</span>
          <input
            type="range" min="0" max="50" step="1" value={props.alpha.blackPoint}
            onChange={(e) => props.onAlpha({ ...props.alpha, blackPoint: Number(e.target.value) })}
          />
        </label>
        <label>
          white point <span>{props.alpha.whitePoint}</span>
          <input
            type="range" min="180" max="255" step="1" value={props.alpha.whitePoint}
            onChange={(e) => props.onAlpha({ ...props.alpha, whitePoint: Number(e.target.value) })}
          />
        </label>
        <label>
          gamma <span>{props.alpha.gamma.toFixed(2)}</span>
          <input
            type="range" min="0.3" max="2.0" step="0.05" value={props.alpha.gamma}
            onChange={(e) => props.onAlpha({ ...props.alpha, gamma: Number(e.target.value) })}
          />
        </label>
      </fieldset>
      <div className="curator-param-actions">
        <button onClick={props.onProcess} data-dirty={String(processDirty)}>Process</button>
        <button onClick={props.onExport} disabled={!props.canExport}>Export</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/ui/components/ParamSliders.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/ui/components/ParamSliders.tsx tests/tools/famous-curator/ui/components/ParamSliders.test.tsx
git commit -m "$(cat <<'EOF'
feat(curator/ui): ParamSliders — StarNet + Alpha + Process/Export buttons

stride snaps to power-of-2; gamma uses 0.05-step linear slider (log
visualisation is a Plan D stylist concern).  Process gets
data-dirty=true when crop or starnet is dirty; Export disabled until
canExport.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: MetadataForm + PreviewPane components

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/components/MetadataForm.tsx`
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/components/PreviewPane.tsx`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/components/MetadataForm.test.tsx`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/components/PreviewPane.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/components/MetadataForm.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MetadataForm } from '../../../../../tools/famous-curator/ui/components/MetadataForm';

describe('MetadataForm', () => {
  it('renders the three fields prefilled', () => {
    render(
      <MetadataForm
        metadata={{ sourceUrl: 'https://a', license: 'CC-BY', author: 'Alice' }}
        onChange={vi.fn()}
      />,
    );
    expect((screen.getByLabelText(/source url/i) as HTMLInputElement).value).toBe('https://a');
    expect((screen.getByLabelText(/license/i) as HTMLInputElement).value).toBe('CC-BY');
    expect((screen.getByLabelText(/author/i) as HTMLInputElement).value).toBe('Alice');
  });

  it('typing into license calls onChange with the merged metadata', () => {
    const onChange = vi.fn();
    render(
      <MetadataForm
        metadata={{ sourceUrl: 'https://a', license: '', author: 'Alice' }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/license/i), { target: { value: 'CC-BY-SA' } });
    expect(onChange).toHaveBeenCalledWith({ sourceUrl: 'https://a', license: 'CC-BY-SA', author: 'Alice' });
  });
});
```

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/components/PreviewPane.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviewPane } from '../../../../../tools/famous-curator/ui/components/PreviewPane';

describe('PreviewPane', () => {
  it('renders placeholders when no previews exist', () => {
    render(<PreviewPane previews={{}} />);
    expect(screen.getByText(/no starless preview yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no alpha preview yet/i)).toBeInTheDocument();
  });

  it('renders starless + alpha images when both URLs are set', () => {
    render(<PreviewPane previews={{ starless: '/s.webp', alpha: '/a.webp' }} />);
    const starless = screen.getByAltText('starless') as HTMLImageElement;
    const alpha = screen.getByAltText('alpha') as HTMLImageElement;
    expect(starless.src.endsWith('/s.webp')).toBe(true);
    expect(alpha.src.endsWith('/a.webp')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/tools/famous-curator/ui/components/MetadataForm.test.tsx tests/tools/famous-curator/ui/components/PreviewPane.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/components/MetadataForm.tsx`:

```tsx
/**
 * MetadataForm — sourceUrl / license / author inputs.  All three are
 * required for Export; the form just reports values upward, the
 * canExport selector in state.ts enforces the validity gate.
 */
import type { MetadataParams } from '../state';

export type MetadataFormProps = {
  metadata: MetadataParams;
  onChange: (m: MetadataParams) => void;
};

export function MetadataForm(props: MetadataFormProps): JSX.Element {
  const set = (patch: Partial<MetadataParams>) => props.onChange({ ...props.metadata, ...patch });
  return (
    <fieldset className="curator-metadata-form">
      <legend>Attribution</legend>
      <label>
        source url
        <input
          type="url" value={props.metadata.sourceUrl}
          onChange={(e) => set({ sourceUrl: e.target.value })}
        />
      </label>
      <label>
        license
        <input
          type="text" value={props.metadata.license}
          onChange={(e) => set({ license: e.target.value })}
        />
      </label>
      <label>
        author
        <input
          type="text" value={props.metadata.author}
          onChange={(e) => set({ author: e.target.value })}
        />
      </label>
    </fieldset>
  );
}
```

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/components/PreviewPane.tsx`:

```tsx
/**
 * PreviewPane — right-column thumbnails for the starless intermediate
 * and the alpha output.  Both update with the responses from
 * /api/process and /api/process/alpha-only respectively.
 */
export type PreviewPaneProps = {
  previews: { starless?: string; alpha?: string };
};

export function PreviewPane(props: PreviewPaneProps): JSX.Element {
  return (
    <section className="curator-preview-pane">
      <figure>
        <figcaption>Starless</figcaption>
        {props.previews.starless
          ? <img src={props.previews.starless} alt="starless" />
          : <p>No starless preview yet — click Process.</p>}
      </figure>
      <figure>
        <figcaption>Alpha</figcaption>
        {props.previews.alpha
          ? <img src={props.previews.alpha} alt="alpha" />
          : <p>No alpha preview yet — click Process.</p>}
      </figure>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/tools/famous-curator/ui/components/MetadataForm.test.tsx tests/tools/famous-curator/ui/components/PreviewPane.test.tsx`
Expected: PASS (4 tests total).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/ui/components/MetadataForm.tsx \
        tools/famous-curator/ui/components/PreviewPane.tsx \
        tests/tools/famous-curator/ui/components/MetadataForm.test.tsx \
        tests/tools/famous-curator/ui/components/PreviewPane.test.tsx
git commit -m "$(cat <<'EOF'
feat(curator/ui): MetadataForm + PreviewPane components

MetadataForm: three required text inputs (sourceUrl, license, author).
PreviewPane: starless + alpha figures with placeholder text until URLs
arrive.  Both purely props-driven.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: App composition + source-URL bar

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/App.tsx`
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/components/SourceBar.tsx`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/App.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/App.test.tsx`:

```tsx
/**
 * App — integration test for the curator shell.
 *
 * Injects a fake API via ApiProvider, drives the full
 * select-galaxy → paste-URL → fetch → process → alpha-only → export
 * flow, and asserts the corresponding api calls.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../../../tools/famous-curator/ui/App';
import { ApiProvider } from '../../../../tools/famous-curator/ui/apiContext';
import type { Api } from '../../../../tools/famous-curator/ui/api';

function makeFakeApi(): Api {
  return {
    getGalaxies: vi.fn().mockResolvedValue({
      galaxies: [
        { id: 'm31', names: ['M31'], ra: 0, dec: 0, distanceMpc: 0, diameterKpc: 0, type: '', description: '', curated: false },
        { id: 'm33', names: ['M33'], ra: 0, dec: 0, distanceMpc: 0, diameterKpc: 0, type: '', description: '', curated: false },
      ],
    }),
    postFetchUrl: vi.fn().mockResolvedValue({
      tmpId: 't1', width: 1000, height: 800, previewUrl: '/preview.webp', mediaType: 'image/jpeg',
    }),
    postFetchBytes: vi.fn(),
    postProcess: vi.fn().mockResolvedValue({ starlessPreviewUrl: '/s.webp', alphaPreviewUrl: '/a.webp' }),
    postAlphaOnly: vi.fn().mockResolvedValue({ alphaPreviewUrl: '/a2.webp' }),
    postExport: vi.fn().mockResolvedValue({
      paths: { source: '', starless: '', full: '', atlas: '', recipe: '' },
    }),
  };
}

describe('App', () => {
  it('loads the galaxy list on mount', async () => {
    const api = makeFakeApi();
    render(<ApiProvider value={api}><App /></ApiProvider>);
    await waitFor(() => expect(screen.getByText('M31')).toBeInTheDocument());
  });

  it('full happy-path flow', async () => {
    const api = makeFakeApi();
    render(<ApiProvider value={api}><App /></ApiProvider>);
    await waitFor(() => expect(screen.getByText('M31')).toBeInTheDocument());

    // 1. Click M31 in the list.
    fireEvent.click(screen.getByText('M31'));

    // 2. Paste URL + click Fetch.
    fireEvent.change(screen.getByLabelText(/source url to fetch/i), { target: { value: 'https://e.com/img.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }));
    await waitFor(() => expect(api.postFetchUrl).toHaveBeenCalledWith('https://e.com/img.jpg'));

    // 3. Wait for crop to initialise + click Process.
    await waitFor(() => expect(screen.getByText(/640 × 640 of 1000 × 800/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^process$/i }));
    await waitFor(() => expect(api.postProcess).toHaveBeenCalled());

    // 4. Fill metadata.
    fireEvent.change(screen.getByLabelText(/^source url$/i), { target: { value: 'https://e.com/img.jpg' } });
    fireEvent.change(screen.getByLabelText(/license/i), { target: { value: 'CC-BY' } });
    fireEvent.change(screen.getByLabelText(/author/i), { target: { value: 'Alice' } });

    // 5. Click Export.
    await waitFor(() => expect(screen.getByRole('button', { name: /^export$/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /^export$/i }));
    await waitFor(() => expect(api.postExport).toHaveBeenCalled());

    const exportCall = (api.postExport as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(exportCall.id).toBe('m31');
    expect(exportCall.metadata.author).toBe('Alice');
  });

  it('alpha slider change triggers alpha-only re-render after Process', async () => {
    const api = makeFakeApi();
    render(<ApiProvider value={api}><App /></ApiProvider>);
    await waitFor(() => expect(screen.getByText('M31')).toBeInTheDocument());
    fireEvent.click(screen.getByText('M31'));
    fireEvent.change(screen.getByLabelText(/source url to fetch/i), { target: { value: 'https://e.com/img.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }));
    await waitFor(() => expect(api.postFetchUrl).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /^process$/i }));
    await waitFor(() => expect(api.postProcess).toHaveBeenCalled());

    // Move gamma slider — should fire postAlphaOnly, NOT postProcess again.
    fireEvent.change(screen.getByLabelText(/gamma/i), { target: { value: '1.2' } });
    await waitFor(() => expect(api.postAlphaOnly).toHaveBeenCalled());
    expect((api.postProcess as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/ui/App.test.tsx`
Expected: FAIL — App still renders the placeholder from Plan A.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/components/SourceBar.tsx`:

```tsx
/**
 * SourceBar — URL input + Fetch button shown above the crop canvas.
 * Drag-drop happens on the CropCanvas itself; this bar is the URL
 * path.
 */
import { useState } from 'react';

export type SourceBarProps = {
  disabled?: boolean;
  onFetch: (url: string) => void;
};

export function SourceBar(props: SourceBarProps): JSX.Element {
  const [url, setUrl] = useState('');
  return (
    <div className="curator-source-bar">
      <label>
        source url to fetch
        <input
          type="url" value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          disabled={props.disabled}
        />
      </label>
      <button onClick={() => props.onFetch(url)} disabled={props.disabled || url.length === 0}>Fetch</button>
    </div>
  );
}
```

Replace `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/App.tsx`:

```tsx
/**
 * Curator App — composes GalaxyList + SourceBar + CropCanvas +
 * ParamSliders + PreviewPane + MetadataForm and wires the
 * action callbacks to the reducer + API client.
 *
 * Layout: simple two-column flex.  Plan D styles this.
 *
 * Process-flow wiring:
 *   - Selecting a galaxy resets the workspace.
 *   - Fetch → setSource (resets crop + clears previews).
 *   - Crop / StarNet changes mark dirty → Process gets an orange dot.
 *   - Process → /api/process → previews + markProcessed.
 *   - Alpha changes → /api/process/alpha-only (only after processedOnce).
 *   - Export → /api/export, then markCuratedById to update the list.
 */
import { useEffect, useReducer } from 'react';
import { ApiProvider, useApi } from './apiContext';
import { reducer, initialState, canExport } from './state';
import { GalaxyList } from './components/GalaxyList';
import { SourceBar } from './components/SourceBar';
import { CropCanvas } from './components/CropCanvas';
import { ParamSliders } from './components/ParamSliders';
import { PreviewPane } from './components/PreviewPane';
import { MetadataForm } from './components/MetadataForm';

function AppInner(): JSX.Element {
  const api = useApi();
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let cancelled = false;
    api.getGalaxies().then((r) => {
      if (!cancelled) dispatch({ type: 'setGalaxies', galaxies: r.galaxies });
    }).catch((err) => {
      // Surface to the user via a toast in Plan D; log for now.
      console.error('getGalaxies failed', err);
    });
    return () => { cancelled = true; };
  }, [api]);

  // Auto-trigger alpha-only re-render when alpha dirty + we've processed
  // at least once.  Debounce to avoid flooding the server on slider drag.
  useEffect(() => {
    if (!state.dirty.alpha || !state.processedOnce || !state.tmpId) return;
    const tmpId = state.tmpId;
    const alpha = state.alpha;
    const handle = setTimeout(() => {
      api.postAlphaOnly({ tmpId, alpha })
        .then((r) => dispatch({ type: 'setPreviews', alpha: r.alphaPreviewUrl }))
        .catch((err) => console.error('alpha-only failed', err));
    }, 150);
    return () => clearTimeout(handle);
  }, [api, state.alpha, state.dirty.alpha, state.processedOnce, state.tmpId]);

  async function onFetch(url: string): Promise<void> {
    try {
      const r = await api.postFetchUrl(url);
      dispatch({ type: 'setSource', tmpId: r.tmpId, width: r.width, height: r.height, previewUrl: r.previewUrl });
    } catch (err) {
      console.error('fetch failed', err);
    }
  }
  async function onFileDrop(file: File): Promise<void> {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const r = await api.postFetchBytes(bytes, file.type || 'application/octet-stream');
      dispatch({ type: 'setSource', tmpId: r.tmpId, width: r.width, height: r.height, previewUrl: r.previewUrl });
    } catch (err) {
      console.error('file drop failed', err);
    }
  }
  async function onProcess(): Promise<void> {
    if (!state.tmpId || !state.crop) return;
    try {
      const r = await api.postProcess({
        tmpId: state.tmpId,
        crop: state.crop,
        starnet: state.starnet,
        alpha: state.alpha,
      });
      dispatch({ type: 'setPreviews', starless: r.starlessPreviewUrl, alpha: r.alphaPreviewUrl });
      dispatch({ type: 'markProcessed' });
    } catch (err) {
      console.error('process failed', err);
    }
  }
  async function onExport(): Promise<void> {
    if (!state.activeId || !state.tmpId || !state.crop) return;
    try {
      await api.postExport({
        id: state.activeId,
        tmpId: state.tmpId,
        crop: state.crop,
        starnet: state.starnet,
        alpha: state.alpha,
        metadata: state.metadata,
      });
      dispatch({ type: 'markCuratedById', id: state.activeId });
    } catch (err) {
      console.error('export failed', err);
    }
  }

  return (
    <div className="curator-app">
      <aside>
        <GalaxyList
          galaxies={state.galaxies}
          activeId={state.activeId}
          onSelect={(id) => dispatch({ type: 'selectGalaxy', id })}
        />
      </aside>
      <main>
        <SourceBar disabled={state.activeId === undefined} onFetch={onFetch} />
        <CropCanvas
          source={state.source}
          crop={state.crop}
          onCropChange={(c) => dispatch({ type: 'setCrop', crop: c })}
          onFileDrop={onFileDrop}
        />
        <MetadataForm
          metadata={state.metadata}
          onChange={(m) => dispatch({ type: 'setMetadata', metadata: m })}
        />
      </main>
      <aside>
        <ParamSliders
          starnet={state.starnet}
          alpha={state.alpha}
          dirty={state.dirty}
          processedOnce={state.processedOnce}
          canExport={canExport(state)}
          onStarnet={(p) => dispatch({ type: 'setStarnet', starnet: p })}
          onAlpha={(p) => dispatch({ type: 'setAlpha', alpha: p })}
          onProcess={onProcess}
          onExport={onExport}
        />
        <PreviewPane previews={state.previews} />
      </aside>
    </div>
  );
}

export function App(): JSX.Element {
  // When used outside an ApiProvider (e.g. ReactDOM.render directly),
  // fall back to the default API.  When tests wrap us in ApiProvider,
  // useApi() picks up the override.
  return <AppInner />;
}
```

Now update `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/main.tsx` to wrap the App in ApiProvider (so the production build wires the real API).  Replace its contents:

```tsx
/**
 * Curator React entry.  Wraps App in <ApiProvider> with the default
 * (real-fetch) API.  Tests render <ApiProvider value={fakeApi}><App />
 * </ApiProvider> directly without touching this file.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ApiProvider } from './apiContext';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');
createRoot(rootEl).render(
  <StrictMode>
    <ApiProvider>
      <App />
    </ApiProvider>
  </StrictMode>,
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/ui/App.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/ui/App.tsx \
        tools/famous-curator/ui/main.tsx \
        tools/famous-curator/ui/components/SourceBar.tsx \
        tests/tools/famous-curator/ui/App.test.tsx
git commit -m "$(cat <<'EOF'
feat(curator/ui): App composition — full process flow wired

GalaxyList + SourceBar + CropCanvas + ParamSliders + PreviewPane +
MetadataForm composed in a useReducer shell.  Alpha sliders trigger
debounced alpha-only re-render after Process; Export gated on
canExport selector; success marks the galaxy curated in the list.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Resumable: load existing recipe on galaxy select

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/App.tsx`
- Modify: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/api.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/App.resumable.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/ui/App.resumable.test.tsx`:

```tsx
/**
 * When the user clicks an already-curated galaxy, the App fetches the
 * existing recipe.json + re-fetches the source URL so the sliders +
 * crop box reconstruct the prior state.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../../../tools/famous-curator/ui/App';
import { ApiProvider } from '../../../../tools/famous-curator/ui/apiContext';
import type { Api } from '../../../../tools/famous-curator/ui/api';

describe('App resumable', () => {
  it('clicking a curated galaxy fetches its recipe + restores sliders + crop', async () => {
    const api: Api = {
      getGalaxies: vi.fn().mockResolvedValue({
        galaxies: [
          { id: 'm31', names: ['M31'], ra: 0, dec: 0, distanceMpc: 0, diameterKpc: 0, type: '', description: '', curated: true },
        ],
      }),
      getRecipe: vi.fn().mockResolvedValue({
        recipe: {
          version: 1, id: 'm31',
          crop: { x: 50, y: 60, width: 700, height: 700 },
          starnet: { stride: 512, upsample: true },
          alpha: { blackPoint: 12, whitePoint: 240, gamma: 0.55 },
          metadata: { sourceUrl: 'https://a', license: 'CC-BY', author: 'Alice' },
          processedAt: '2026-05-18T00:00:00Z',
        },
      }),
      postFetchUrl: vi.fn().mockResolvedValue({
        tmpId: 't1', width: 1000, height: 800, previewUrl: '/p.webp', mediaType: 'image/jpeg',
      }),
      postFetchBytes: vi.fn(),
      postProcess: vi.fn(),
      postAlphaOnly: vi.fn(),
      postExport: vi.fn(),
    } as Api & { getRecipe: ReturnType<typeof vi.fn> };

    render(<ApiProvider value={api}><App /></ApiProvider>);
    await waitFor(() => expect(screen.getByText('M31')).toBeInTheDocument());

    fireEvent.click(screen.getByText('M31'));

    // Recipe fetch happens; then source URL is re-fetched.
    await waitFor(() => expect((api as { getRecipe: ReturnType<typeof vi.fn> }).getRecipe).toHaveBeenCalledWith('m31'));
    await waitFor(() => expect(api.postFetchUrl).toHaveBeenCalledWith('https://a'));

    // Sliders are restored.
    await waitFor(() => {
      const gammaInput = screen.getByLabelText(/gamma/i) as HTMLInputElement;
      expect(gammaInput.value).toBe('0.55');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/ui/App.resumable.test.tsx`
Expected: FAIL — `api.getRecipe is not a function`.

- [ ] **Step 3: Implement minimal code to pass**

Add a new server route + API method.  Edit `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/api.ts`. In the `Api` type, add:

```ts
  getRecipe: (id: string) => Promise<{ recipe: import('../plugin/recipe').Recipe }>;
```

In `makeApi`'s returned object, add (after `getGalaxies`):

```ts
    async getRecipe(id) {
      return readOrThrow(await f(`/api/recipe/${id}`));
    },
```

Add a new route to `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/routes/recipe.ts`:

```ts
/**
 * GET /api/recipe/:id — return the recipe.json for a curated galaxy.
 * Used by the UI to restore sliders + crop when the user re-clicks an
 * already-exported galaxy.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { curatedGalaxyDir } from '../paths';
import { parseRecipe, type Recipe } from '../recipe';

export async function handleRecipe(opts: {
  repoRoot: string;
  id: string;
}): Promise<{ recipe: Recipe }> {
  const path = resolve(curatedGalaxyDir(opts.repoRoot, opts.id), 'recipe.json');
  if (!existsSync(path)) {
    throw new Error(`recipe not found for id=${opts.id}`);
  }
  const recipe = parseRecipe(readFileSync(path, 'utf8'));
  return { recipe };
}
```

Wire it into `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/apiPlugin.ts`. Add the import:

```ts
import { handleRecipe } from './routes/recipe';
```

Add a route match before the 404 fallback inside the `try` block:

```ts
          const recipeMatch = /^\/api\/recipe\/([\w-]+)$/.exec(path);
          if (method === 'GET' && recipeMatch) {
            const out = await handleRecipe({ repoRoot, id: recipeMatch[1]! });
            sendJson(res, 200, out);
            return;
          }
```

Now in `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/App.tsx`, replace the `dispatch({ type: 'selectGalaxy', id })` callback with one that ALSO checks for a recipe + re-fetches the source. Find the `<GalaxyList ... onSelect={(id) => dispatch({ type: 'selectGalaxy', id })}` line, and replace with:

```tsx
        <GalaxyList
          galaxies={state.galaxies}
          activeId={state.activeId}
          onSelect={async (id) => {
            dispatch({ type: 'selectGalaxy', id });
            const entry = state.galaxies.find((g) => g.id === id);
            if (!entry?.curated) return;
            try {
              const r = await api.getRecipe(id);
              const fetched = await api.postFetchUrl(r.recipe.metadata.sourceUrl);
              dispatch({ type: 'setSource', tmpId: fetched.tmpId, width: fetched.width, height: fetched.height, previewUrl: fetched.previewUrl });
              dispatch({ type: 'setCrop', crop: r.recipe.crop });
              dispatch({ type: 'setStarnet', starnet: r.recipe.starnet });
              dispatch({ type: 'setAlpha', alpha: r.recipe.alpha });
              dispatch({ type: 'setMetadata', metadata: r.recipe.metadata });
            } catch (err) {
              console.error('resume failed', err);
            }
          }}
        />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/ui/App.resumable.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/ui/api.ts \
        tools/famous-curator/ui/App.tsx \
        tools/famous-curator/plugin/routes/recipe.ts \
        tools/famous-curator/plugin/apiPlugin.ts \
        tests/tools/famous-curator/ui/App.resumable.test.tsx
git commit -m "$(cat <<'EOF'
feat(curator/ui): resumable — load recipe + refetch source on re-click

When the user clicks a curated galaxy, GET /api/recipe/:id returns the
prior recipe; the UI then re-fetches its sourceUrl and reconstructs
crop / starnet / alpha / metadata.  Original source bytes aren't
cached between sessions per spec.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Manual smoke + PR

- [ ] **Step 1: Full test + typecheck**

Run:
```bash
npm test
npm run typecheck
```
Expected: PASS.

- [ ] **Step 2: Manual smoke**

In one terminal: `MOCK_STARNET=1 npm run curate-famous`.

In a browser at http://localhost:5200:
- Verify the galaxy list populates on the left with all seed entries.
- Click an entry — the workspace clears.
- Paste a URL into the source bar (use the same Wikipedia M31 URL as Plan B's smoke).
- Click Fetch — the image appears in the canvas with a centred 1:1 crop overlay.
- Drag a corner — the crop resizes squarely.
- Adjust the gamma slider — the readout updates.
- Click Process — wait, then the previews appear in the right pane.
- Drag the gamma slider again — the alpha preview updates within ~200 ms (alpha-only path).
- Fill in license + author.
- Click Export — the button was disabled until metadata was complete; clicking should succeed (check `public/images/famous-curated/<id>/` exists).
- The list entry gets a green check / data-curated="true".
- Click a different entry, then click the just-exported one — verify the recipe restores the sliders.

Clean up: `rm -rf public/images/famous-curated/<id> data/famous_curated_overrides.json`.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feature/curator-c-ui
gh pr create --title "feat(curator): React UI — list, crop, sliders, previews, export" --body "$(cat <<'EOF'
## Summary
- Adds the full curator UI: GalaxyList, SourceBar, CropCanvas (8 handles + body + drop-zone), ParamSliders, PreviewPane, MetadataForm.
- State via useReducer + React Context for the typed API client.  Crop math factored into pure helpers with thorough unit tests.
- Process-flow wiring per spec: dirty-state on crop/starnet → Process; alpha → debounced /api/process/alpha-only.
- Resumable: clicking an exported galaxy fetches `/api/recipe/:id` + re-fetches source.
- Visual styling deferred to Plan D.

## Test plan
- [x] `npm test` — all tests pass (~25 new across 9 files)
- [x] `npm run typecheck` — clean
- [x] Manual end-to-end smoke in http://localhost:5200 with MOCK_STARNET=1: select → fetch → crop → process → alpha → export → resume

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened; return URL.

---

## Subagent-driven-development footer

Each task above sized for one fresh implementer subagent. After landing, dispatch a `requesting-code-review` subagent against the PR before merging.

Total tasks: **10** (cropMath, api+context, state reducer, GalaxyList, CropCanvas, ParamSliders, MetadataForm+PreviewPane, App composition, resumable, verify+PR).
