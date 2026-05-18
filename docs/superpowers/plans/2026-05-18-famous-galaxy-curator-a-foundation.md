# Famous Galaxy Curator — Plan A: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the foundation for the Famous Galaxy Curator: extract the `applyLuminanceAsAlpha` helper into the existing image-processor module with unit tests, allowlist the override JSON in `.gitignore`, scaffold the `tools/famous-curator/` tree, register an `npm run curate-famous` script that boots Vite on port 5200, and stand up the `configureServer` plugin with a single `/api/health` route and a pure recipe-JSON serialiser. By the end of this plan you can run the curator dev server, hit `/api/health`, and the alpha helper + recipe serialiser are unit-tested.

**Architecture:** A new sibling tools subtree at `tools/famous-curator/` with its own `vite.config.ts` so the curator dev server runs independently of the main skymap dev server. The Vite plugin attaches `/api/*` middleware via `configureServer`; all routes are pure async functions over `(req, res, ctx)` where `ctx` carries injected helpers (path resolver, fs adapter, child_process spawner) so vitest can drive them without touching the real network or filesystem. The `applyLuminanceAsAlpha` helper lives in `tools/famous/famousImageProcessor.ts` alongside `applyTransparency`/`applyRadialFade` — it's the same shape of pure-buffer mutation. The recipe-JSON serialiser is a pure function in `tools/famous-curator/plugin/recipe.ts`, shared by the export route (Plan B) and consumed in the UI's "load existing recipe" path (Plan C).

**Tech Stack:** TypeScript, Vitest, Vite (separate config from main app), Node's built-in http types. No new runtime dependencies — `sharp` and `react` are already in `package.json`.

**Branch + PR strategy:** Single feature branch `feature/curator-a-foundation`; each task ends with its own commit. Open one PR against `main` after Task 7 lands. Plans B, C, D depend on this PR being merged before they can branch.

---

### Task 1: Extract `applyLuminanceAsAlpha` into the image processor

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/tools/famous/famousImageProcessor.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous/famousImageProcessor.luminanceAlpha.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous/famousImageProcessor.luminanceAlpha.test.ts`:

```ts
/**
 * applyLuminanceAsAlpha — unit tests.
 *
 * Computes Rec 709 luma per pixel, maps it through a (blackPoint,
 * whitePoint, gamma) curve, and MULTIPLIES the result into the existing
 * alpha channel.  The "multiply, don't overwrite" detail matters: callers
 * may have already applied a radial fade or a sky-cut, and the luminance
 * pass should refine that mask, not erase it.
 */

import { describe, expect, it } from 'vitest';
import { applyLuminanceAsAlpha } from '../../../tools/famous/famousImageProcessor';

/** Build a 2×2 RGBA buffer with explicit per-pixel values. */
function buf2x2(pixels: ReadonlyArray<[number, number, number, number]>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach((p, i) => {
    out[i * 4 + 0] = p[0];
    out[i * 4 + 1] = p[1];
    out[i * 4 + 2] = p[2];
    out[i * 4 + 3] = p[3];
  });
  return out;
}

describe('applyLuminanceAsAlpha', () => {
  it('drives alpha to 0 for pixels at or below blackPoint', () => {
    // Pure black + a near-black pixel (luma 5).  Both should clamp to alpha 0.
    const buf = buf2x2([
      [0, 0, 0, 255],
      [5, 5, 5, 255],
      [0, 0, 0, 255],
      [5, 5, 5, 255],
    ]);
    applyLuminanceAsAlpha(buf, 2, 2, { blackPoint: 8, whitePoint: 255, gamma: 1 });
    expect(buf[3]).toBe(0);
    expect(buf[7]).toBe(0);
    expect(buf[11]).toBe(0);
    expect(buf[15]).toBe(0);
  });

  it('drives alpha to 255 for pixels at or above whitePoint', () => {
    // Pure white at whitePoint 200 → alpha stays at the incoming 255.
    const buf = buf2x2([
      [255, 255, 255, 255],
      [200, 200, 200, 255],
      [220, 220, 220, 255],
      [255, 255, 255, 255],
    ]);
    applyLuminanceAsAlpha(buf, 2, 2, { blackPoint: 0, whitePoint: 200, gamma: 1 });
    expect(buf[3]).toBe(255);
    expect(buf[7]).toBe(255);
    expect(buf[11]).toBe(255);
    expect(buf[15]).toBe(255);
  });

  it('uses Rec 709 luma weights (green dominates)', () => {
    // Equal-magnitude single-channel pixels: red, green, blue at value 200.
    // Rec 709: Y = 0.2126*R + 0.7152*G + 0.0722*B.
    // So green should produce the highest alpha, blue the lowest.
    const buf = buf2x2([
      [200, 0, 0, 255], // red
      [0, 200, 0, 255], // green
      [0, 0, 200, 255], // blue
      [0, 0, 0, 255],   // black control
    ]);
    applyLuminanceAsAlpha(buf, 2, 2, { blackPoint: 0, whitePoint: 255, gamma: 1 });
    const alphaRed = buf[3]!;
    const alphaGreen = buf[7]!;
    const alphaBlue = buf[11]!;
    expect(alphaGreen).toBeGreaterThan(alphaRed);
    expect(alphaRed).toBeGreaterThan(alphaBlue);
  });

  it('multiplies into the existing alpha (does not overwrite)', () => {
    // Existing alpha 128 (half-transparent), pixel luma well above
    // whitePoint → alpha-curve produces 1.0 → 1.0 * 128 = 128.
    const buf = buf2x2([
      [255, 255, 255, 128],
      [255, 255, 255, 128],
      [255, 255, 255, 128],
      [255, 255, 255, 128],
    ]);
    applyLuminanceAsAlpha(buf, 2, 2, { blackPoint: 0, whitePoint: 200, gamma: 1 });
    expect(buf[3]).toBe(128);
    expect(buf[7]).toBe(128);
    expect(buf[11]).toBe(128);
    expect(buf[15]).toBe(128);
  });

  it('applies gamma after the black/white remap (gamma < 1 brightens)', () => {
    // Mid-grey 128, blackPoint 0, whitePoint 255 → normalised t = 128/255 ≈ 0.502.
    // gamma 0.5 → pow(0.502, 0.5) ≈ 0.708 → alpha ≈ 180.
    // gamma 1.0 → ≈ 128.
    const bufG05 = buf2x2([[128, 128, 128, 255]]);
    const bufG10 = buf2x2([[128, 128, 128, 255]]);
    applyLuminanceAsAlpha(bufG05, 1, 1, { blackPoint: 0, whitePoint: 255, gamma: 0.5 });
    applyLuminanceAsAlpha(bufG10, 1, 1, { blackPoint: 0, whitePoint: 255, gamma: 1 });
    expect(bufG05[3]!).toBeGreaterThan(bufG10[3]!);
    expect(bufG05[3]!).toBeGreaterThan(170);
    expect(bufG05[3]!).toBeLessThan(190);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous/famousImageProcessor.luminanceAlpha.test.ts`
Expected: FAIL — `applyLuminanceAsAlpha is not exported from '.../famousImageProcessor'` (the symbol doesn't exist yet).

- [ ] **Step 3: Implement minimal code to pass**

Edit `/Users/rulkens/Development/js/skymap/tools/famous/famousImageProcessor.ts`. Append at the end of the file:

```ts
/**
 * Options for `applyLuminanceAsAlpha`.
 *
 * The curator pipeline runs StarNet upstream of this pass to remove
 * point sources, then uses luminance-as-alpha to derive a soft mask
 * from the residual extended structure (galaxy disk, halo, dust).
 * The three knobs reproduce the equivalent of Photoshop's Curves
 * + Levels on a luminance channel:
 *
 *  - `blackPoint`: luma at or below this clamps to alpha 0.  Tune to
 *    just above the residual sky noise floor.
 *  - `whitePoint`: luma at or above this clamps to alpha 1.  Tune to
 *    the brightest extended structure you want fully opaque.
 *  - `gamma`: post-remap power curve.  < 1 brightens midtones (alpha
 *    grows faster), > 1 darkens.  ESO/Hubble press-kit + StarNet
 *    output tends to want 0.5..0.8 — extended halos are dim relative
 *    to the core, and a linear ramp leaves them nearly invisible.
 */
export type LuminanceAlphaOptions = {
  blackPoint: number;
  whitePoint: number;
  gamma: number;
};

/**
 * Mutate `buf` in place: compute Rec 709 luma per pixel, remap through
 * a (blackPoint, whitePoint, gamma) curve, MULTIPLY the result into the
 * existing alpha channel.
 *
 * Rec 709 luma weights (0.2126 / 0.7152 / 0.0722) match what sRGB
 * monitors actually display as perceived brightness — using straight RGB
 * average instead would over-weight blue (cool tones falsely "popping"
 * as bright) and under-weight green (galaxy disks losing the bright-
 * green H-alpha-tinted star-forming regions).
 *
 * Multiplying — rather than overwriting — preserves any prior alpha
 * work (radial fade, sky-cut).  The curator pipeline currently runs no
 * prior mask, but the contract is identical to `applyRadialFade` for
 * consistency and so callers can chain passes safely.
 */
export function applyLuminanceAsAlpha(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  opts: LuminanceAlphaOptions,
): void {
  const { blackPoint, whitePoint, gamma } = opts;
  const range = Math.max(1e-6, whitePoint - blackPoint);
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    const r = buf[idx + 0]!;
    const g = buf[idx + 1]!;
    const b = buf[idx + 2]!;
    // Rec 709 luma.  Result in [0, 255].
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Levels: saturate((y - bp) / (wp - bp)) ∈ [0, 1].
    let t = (y - blackPoint) / range;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    // Gamma curve.  pow(0, anything > 0) = 0; pow(1, anything) = 1 —
    // both clamp ends are stable.
    const curved = Math.pow(t, gamma);
    // Multiply into existing alpha; round to nearest 0..255 byte.
    buf[idx + 3] = Math.round(buf[idx + 3]! * curved);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous/famousImageProcessor.luminanceAlpha.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous/famousImageProcessor.ts tests/tools/famous/famousImageProcessor.luminanceAlpha.test.ts
git commit -m "$(cat <<'EOF'
feat(famous): add applyLuminanceAsAlpha helper

Pure pixel-buffer pass that derives alpha from Rec 709 luma through a
(blackPoint, whitePoint, gamma) curve, multiplied into existing alpha.
Curator pipeline (separate plan) will chain this after StarNet to
produce soft galaxy masks from press-kit sources.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Allowlist the override JSON in `.gitignore`

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/.gitignore`

- [ ] **Step 1: Edit .gitignore**

Open `/Users/rulkens/Development/js/skymap/.gitignore` and find the existing exception block under `/data/`. Immediately after the line `!/data/famous_galaxies.seed.json`, add:

```
# Exception: hand-curated override index produced by the famous-galaxy
# curator (tools/famous-curator).  Small JSON (~75 entries × ~150 B) that
# overrides the auto-fetched Wikipedia/DESI thumbnails per-galaxy; must
# ship in git so a fresh clone + `npm run fetch-famous-images` honours
# the curated picks.  See docs/superpowers/specs/2026-05-18-famous-galaxy-
# curator-design.md "Override index" for the schema.
!/data/famous_curated_overrides.json
```

- [ ] **Step 2: Verify by creating + checking the file**

Run:
```bash
mkdir -p data
echo '{"version":1,"entries":{}}' > data/famous_curated_overrides.json
git check-ignore data/famous_curated_overrides.json
```
Expected: exit code 1 with NO output — `git check-ignore` exits 1 when the file is NOT ignored, which is what we want. Then `rm data/famous_curated_overrides.json` so the file isn't carried into the commit (it'll be created for real by Plan B's export route).

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "$(cat <<'EOF'
chore(gitignore): allowlist data/famous_curated_overrides.json

Hand-curated override index for the famous-galaxy curator pipeline.
Small enough to render in a PR diff; same allowlist pattern as
famous_galaxies.seed.json above.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Scaffold the `tools/famous-curator/` directory + npm script

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/vite.config.ts`
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/index.html`
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/main.tsx`
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/App.tsx`
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/README.md`
- Modify: `/Users/rulkens/Development/js/skymap/package.json`

- [ ] **Step 1: Write the smoke test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/viteConfig.smoke.test.ts`:

```ts
/**
 * Smoke test: the curator's Vite config loads without throwing and
 * exposes the expected port + plugin list.  The actual server bootstrap
 * is exercised by Playwright in Plan D; this just guards against a
 * typo in the config that would make `npm run curate-famous` fail at
 * import time.
 */
import { describe, expect, it } from 'vitest';

describe('tools/famous-curator/vite.config.ts', () => {
  it('exports a config with port 5200 and a react plugin', async () => {
    const mod = await import('../../../tools/famous-curator/vite.config');
    const config = mod.default;
    // Vite's defineConfig returns either the config object or a function.
    const resolved = typeof config === 'function'
      ? await config({ command: 'serve', mode: 'development' })
      : config;
    expect(resolved.server?.port).toBe(5200);
    expect(Array.isArray(resolved.plugins)).toBe(true);
    // At least one plugin should be the react plugin (sniff for the name).
    const names = (resolved.plugins as Array<{ name?: string }>).map((p) => p?.name);
    expect(names.some((n) => typeof n === 'string' && n.includes('react'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/viteConfig.smoke.test.ts`
Expected: FAIL — the import resolves to a non-existent file.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/vite.config.ts`:

```ts
/**
 * Famous Galaxy Curator — Vite dev server config.
 *
 * Separate from the root `vite.config.ts` because the curator is a
 * sibling tool, not part of the skymap runtime bundle: it has its own
 * port (5200, deliberately well away from 5173 so both can run side-by-
 * side), its own root (this `tools/famous-curator/` directory rather
 * than the repo root), and its own React entry (`ui/main.tsx`).
 *
 * The `configureServer`-based API plugin lives in `./plugin/apiPlugin.ts`
 * (added in Task 4).  We import + register it here so the API and the
 * dev server share a single process — no separate Express + proxy setup.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { apiPlugin } from './plugin/apiPlugin';

export default defineConfig({
  root: resolve(__dirname, 'ui'),
  // Vite resolves `index.html` from `root`; explicit publicDir keeps
  // the curator from pulling in the main app's `public/` (we don't
  // want the runtime atlas + bins served from the curator).
  publicDir: false,
  server: { port: 5200 },
  plugins: [react(), apiPlugin()],
});
```

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Famous Galaxy Curator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/main.tsx`:

```tsx
/**
 * Curator React entry.  Mirrors the main app's `src/main.tsx` shape
 * (createRoot + StrictMode) so any contributor familiar with the
 * skymap shell can navigate the curator without surprises.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/App.tsx`:

```tsx
/**
 * Curator app shell.  Plan A leaves this as a minimal placeholder so
 * the dev server boots cleanly; Plan C replaces the body with the real
 * panel layout (GalaxyList + CropCanvas + ParamSliders + PreviewPane +
 * MetadataForm).
 */
export function App(): JSX.Element {
  return (
    <main>
      <h1>Famous Galaxy Curator</h1>
      <p>UI scaffold — see Plan C for the real panels.</p>
    </main>
  );
}
```

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/README.md`:

```markdown
# Famous Galaxy Curator

Local-only Vite dev tool for hand-curating thumbnails for the ~75-entry
Famous catalog.  Run with `npm run curate-famous` from the repo root;
opens on http://localhost:5200.

Spec: `docs/superpowers/specs/2026-05-18-famous-galaxy-curator-design.md`.

## Installing StarNet2 (macOS)

1. Download `StarNet2T_MacOS.zip` from the StarNet++ project page.
2. Unpack somewhere outside the repo (e.g. `~/Downloads/StarNet2T_MacOS/`).
3. Copy the `starnet2` binary to `/usr/local/bin/starnet2` and the
   bundled `.dylib` files to `/usr/local/lib/`.
4. Note the path to `StarNet2_weights.pt` — the curator finds it via
   the `STARNET_WEIGHTS` environment variable.
5. Verify: `STARNET_WEIGHTS=~/Downloads/StarNet2T_MacOS/StarNet2_weights.pt starnet2 -i test.png -o out.png -s 256 -e`

The curator's `/api/process` route shells out to `starnet2` and reads
`STARNET_BIN` (default `starnet2`) and `STARNET_WEIGHTS` (no default;
required) from the environment.  Set them in the shell that runs
`npm run curate-famous`.

## Mock mode (no StarNet binary)

Set `MOCK_STARNET=1` to make `/api/process` skip the spawn and copy the
input directly to the starless slot.  Used by the API integration tests.
```

Edit `/Users/rulkens/Development/js/skymap/package.json`. In the `scripts` block, add the line (alphabetised between `build-tiers` and `deploy`):

```json
"curate-famous": "vite --config tools/famous-curator/vite.config.ts",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/viteConfig.smoke.test.ts`
Expected: PASS (1 test).

The import will pull in `./plugin/apiPlugin` which doesn't exist yet — so the smoke test will still fail with an import error. **Stub the plugin file just enough for the import to resolve.** Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/apiPlugin.ts`:

```ts
/**
 * Curator API plugin — placeholder.  Task 4 fills in the route handlers
 * and the configureServer wiring.  Stubbed here so vite.config.ts can
 * import it without exploding.
 */
import type { Plugin } from 'vite';

export function apiPlugin(): Plugin {
  return {
    name: 'famous-curator-api',
  };
}
```

Re-run: `npm test -- tests/tools/famous-curator/viteConfig.smoke.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/vite.config.ts \
        tools/famous-curator/ui/index.html \
        tools/famous-curator/ui/main.tsx \
        tools/famous-curator/ui/App.tsx \
        tools/famous-curator/plugin/apiPlugin.ts \
        tools/famous-curator/README.md \
        tests/tools/famous-curator/viteConfig.smoke.test.ts \
        package.json
git commit -m "$(cat <<'EOF'
feat(curator): scaffold tools/famous-curator/ + npm run curate-famous

Separate Vite config on port 5200 with React entry, placeholder API
plugin, and README documenting StarNet2 install + MOCK_STARNET mode.
Smoke test guards against config import-time failures.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: API plugin with `/api/health` route

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/apiPlugin.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/apiPlugin.health.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/apiPlugin.health.test.ts`:

```ts
/**
 * apiPlugin — /api/health route test.
 *
 * Drives the plugin's configureServer middleware with a fake express-
 * style request/response pair instead of booting a real http.Server.
 * This keeps the test free of port allocation, async cleanup, and the
 * 50-100 ms startup tax of an actual Vite dev server.
 */
import { describe, expect, it } from 'vitest';
import { apiPlugin } from '../../../tools/famous-curator/plugin/apiPlugin';

type FakeRes = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  ended: boolean;
  setHeader: (k: string, v: string) => void;
  end: (chunk?: string) => void;
};

function fakeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    headers: {},
    body: '',
    ended: false,
    setHeader(k, v) { this.headers[k] = v; },
    end(chunk) {
      if (chunk !== undefined) this.body += chunk;
      this.ended = true;
    },
  };
  return res;
}

describe('apiPlugin /api/health', () => {
  it('returns { ok: true } as JSON with status 200', async () => {
    const plugin = apiPlugin();
    // configureServer is the hook Vite calls during server bootstrap.
    // We synthesise the bits of `ViteDevServer` the plugin actually uses.
    const middlewares: Array<(req: unknown, res: unknown, next: () => void) => unknown> = [];
    const fakeServer = {
      middlewares: {
        use(handler: (req: unknown, res: unknown, next: () => void) => unknown) {
          middlewares.push(handler);
        },
      },
    };
    // Call the lifecycle hook.  Plugin types allow `configureServer` to
    // be a fn or { handler: fn }; we handle the function form.
    const cfg = plugin.configureServer;
    if (typeof cfg !== 'function') throw new Error('configureServer must be a function');
    await cfg(fakeServer as never);

    expect(middlewares.length).toBeGreaterThanOrEqual(1);

    // Walk the middleware chain with a request for /api/health.
    const req = { url: '/api/health', method: 'GET' };
    const res = fakeRes();
    let nextCalled = false;
    for (const mw of middlewares) {
      // eslint-disable-next-line no-await-in-loop
      await mw(req, res, () => { nextCalled = true; });
      if (res.ended) break;
    }

    expect(res.ended).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(nextCalled).toBe(false);
  });

  it('passes non-/api requests through to next()', async () => {
    const plugin = apiPlugin();
    const middlewares: Array<(req: unknown, res: unknown, next: () => void) => unknown> = [];
    const fakeServer = {
      middlewares: { use(h: typeof middlewares[number]) { middlewares.push(h); } },
    };
    const cfg = plugin.configureServer;
    if (typeof cfg !== 'function') throw new Error('configureServer must be a function');
    await cfg(fakeServer as never);

    const req = { url: '/index.html', method: 'GET' };
    const res = fakeRes();
    let nextCalled = false;
    for (const mw of middlewares) {
      // eslint-disable-next-line no-await-in-loop
      await mw(req, res, () => { nextCalled = true; });
    }
    expect(nextCalled).toBe(true);
    expect(res.ended).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/apiPlugin.health.test.ts`
Expected: FAIL — `configureServer must be a function` (the placeholder plugin has no configureServer).

- [ ] **Step 3: Implement minimal code to pass**

Replace the contents of `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/apiPlugin.ts`:

```ts
/**
 * Famous-curator API plugin.
 *
 * Vite's `configureServer` hook lets us attach Express-style middleware
 * that runs alongside the dev server.  The middleware persists across
 * HMR (Vite re-uses the same connect instance across reloads), so the
 * API surface stays available even as the UI bundle is rebuilt.
 *
 * Plan A registers only `/api/health` so the dev server boots cleanly
 * and the rest of the harness (CORS, JSON parsing, the route-table
 * dispatch shape) is in place for Plan B's heavier routes (fetch,
 * process, export, galaxies).
 *
 * Route handlers follow the convention:
 *
 *   async (req, res) => void
 *
 * The middleware wrapper inspects `req.url` against a small route table,
 * calls the matched handler, and falls through to `next()` for anything
 * not starting with `/api/`.  Each handler is responsible for setting
 * its own status code + Content-Type + calling `res.end()`.
 */
import type { Plugin } from 'vite';

/**
 * Route table.  Currently a single entry; Plan B adds /api/fetch,
 * /api/process, /api/process/alpha-only, /api/export, /api/galaxies,
 * and /api/preview/:tmpId/:name.
 */
type RouteHandler = (
  req: { url?: string; method?: string },
  res: { statusCode: number; setHeader(k: string, v: string): void; end(chunk?: string): void },
) => Promise<void> | void;

const routes: ReadonlyArray<{ method: string; path: string; handler: RouteHandler }> = [
  {
    method: 'GET',
    path: '/api/health',
    handler: (_req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    },
  },
];

export function apiPlugin(): Plugin {
  return {
    name: 'famous-curator-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        const method = req.method ?? 'GET';
        // Only intercept /api/* — everything else (HTML, JS, HMR socket)
        // continues down the Vite middleware stack.
        if (!url.startsWith('/api/')) {
          next();
          return;
        }
        // Strip query string for matching purposes.
        const path = url.split('?')[0] ?? url;
        const match = routes.find((r) => r.method === method && r.path === path);
        if (!match) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'not found', path }));
          return;
        }
        try {
          await match.handler(req as never, res as never);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/apiPlugin.health.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/plugin/apiPlugin.ts tests/tools/famous-curator/apiPlugin.health.test.ts
git commit -m "$(cat <<'EOF'
feat(curator): apiPlugin with /api/health route + route-table dispatch

configureServer middleware that matches /api/* against a small route
table; non-API requests fall through to Vite's chain.  Plan B fills in
the remaining routes (fetch / process / export / galaxies).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Path-resolution helper for the curated dir

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/paths.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/paths.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/paths.test.ts`:

```ts
/**
 * paths — pure helpers for resolving curator file locations.
 *
 * All helpers take an explicit `repoRoot` argument so tests can drive
 * them with a fixture directory.  Production callers pass
 * `findRepoRoot()` (which walks up from a known marker like
 * package.json), keeping I/O at the edge.
 */
import { describe, expect, it } from 'vitest';
import {
  curatedDir,
  curatedGalaxyDir,
  curatedTmpDir,
  overrideIndexPath,
  atlasOutputPath,
} from '../../../tools/famous-curator/plugin/paths';

describe('curator paths', () => {
  const root = '/repo';

  it('curatedDir returns public/images/famous-curated under the repo root', () => {
    expect(curatedDir(root)).toBe('/repo/public/images/famous-curated');
  });

  it('curatedGalaxyDir nests the id under curatedDir', () => {
    expect(curatedGalaxyDir(root, 'm31')).toBe('/repo/public/images/famous-curated/m31');
  });

  it('curatedTmpDir nests .tmp under the galaxy dir', () => {
    expect(curatedTmpDir(root, 'm31')).toBe('/repo/public/images/famous-curated/m31/.tmp');
  });

  it('overrideIndexPath resolves to data/famous_curated_overrides.json', () => {
    expect(overrideIndexPath(root)).toBe('/repo/data/famous_curated_overrides.json');
  });

  it('atlasOutputPath returns the existing atlas slot path', () => {
    // This is the file fetchFamousImages.ts already writes to.  Plan D
    // uses this path to copy curated atlas.webp into place.
    expect(atlasOutputPath(root, 'm31')).toBe('/repo/public/images/famous/m31.webp');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/paths.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/paths.ts`:

```ts
/**
 * Pure path-resolution helpers for the curator.
 *
 * All exports are pure functions of the repo root + ids.  No filesystem
 * I/O happens here — callers compose these with `existsSync` / `mkdir`
 * as needed.  Keeping the resolver pure makes Plan B's API tests
 * trivially driveable with a tmpdir fixture root.
 *
 * The layout below mirrors the spec's "Output layout" section:
 *
 *   public/images/famous-curated/<id>/   — final, atomic-renamed
 *   public/images/famous-curated/<id>/.tmp/  — staging dir before rename
 *   data/famous_curated_overrides.json   — committed override index
 *   public/images/famous/<id>.webp       — existing atlas slot, owned
 *                                          by fetchFamousImages.ts but
 *                                          referenced here so Plan D
 *                                          can copy curated atlases in.
 */
import { resolve } from 'node:path';

export function curatedDir(repoRoot: string): string {
  return resolve(repoRoot, 'public/images/famous-curated');
}

export function curatedGalaxyDir(repoRoot: string, id: string): string {
  return resolve(curatedDir(repoRoot), id);
}

export function curatedTmpDir(repoRoot: string, id: string): string {
  return resolve(curatedGalaxyDir(repoRoot, id), '.tmp');
}

export function overrideIndexPath(repoRoot: string): string {
  return resolve(repoRoot, 'data/famous_curated_overrides.json');
}

export function atlasOutputPath(repoRoot: string, id: string): string {
  return resolve(repoRoot, 'public/images/famous', `${id}.webp`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/paths.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/plugin/paths.ts tests/tools/famous-curator/paths.test.ts
git commit -m "$(cat <<'EOF'
feat(curator): pure path-resolution helpers

curatedDir / curatedGalaxyDir / curatedTmpDir / overrideIndexPath /
atlasOutputPath all take an explicit repoRoot for testability.  Plan B
consumes these from the fetch/process/export route handlers.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Recipe-JSON serialiser (pure)

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/recipe.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/recipe.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/recipe.test.ts`:

```ts
/**
 * recipe — pure serialiser tests.
 *
 * The recipe is the per-galaxy file at
 * public/images/famous-curated/<id>/recipe.json.  It must round-trip
 * losslessly (parse → serialise → parse → deep-equal) and reject
 * malformed inputs at parse time.
 */
import { describe, expect, it } from 'vitest';
import {
  serialiseRecipe,
  parseRecipe,
  type Recipe,
} from '../../../tools/famous-curator/plugin/recipe';

function sample(): Recipe {
  return {
    version: 1,
    id: 'm31',
    crop: { x: 100, y: 200, width: 1820, height: 1820 },
    starnet: { stride: 256, upsample: false },
    alpha: { blackPoint: 8, whitePoint: 230, gamma: 0.7 },
    metadata: {
      sourceUrl: 'https://www.astrobin.com/abc',
      license: 'CC-BY-SA-4.0',
      author: 'Niall MacNeill',
    },
    processedAt: '2026-05-18T14:32:01Z',
  };
}

describe('recipe', () => {
  it('round-trips losslessly', () => {
    const r = sample();
    const json = serialiseRecipe(r);
    expect(parseRecipe(json)).toEqual(r);
  });

  it('emits stable two-space-indented JSON for diff-friendly commits', () => {
    const r = sample();
    const json = serialiseRecipe(r);
    expect(json.startsWith('{\n  "version": 1,')).toBe(true);
    expect(json.endsWith('}\n')).toBe(true);
  });

  it('rejects an object missing the crop block', () => {
    const r = sample() as unknown as Record<string, unknown>;
    delete r.crop;
    expect(() => parseRecipe(JSON.stringify(r))).toThrow(/crop/);
  });

  it('rejects an invalid alpha.gamma (non-finite)', () => {
    const r = sample();
    r.alpha.gamma = Number.NaN;
    expect(() => parseRecipe(JSON.stringify(r))).toThrow(/gamma/);
  });

  it('rejects a future version it does not know how to parse', () => {
    const r = sample();
    (r as unknown as { version: number }).version = 99;
    expect(() => parseRecipe(JSON.stringify(r))).toThrow(/version/);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseRecipe('not json {')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/recipe.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/recipe.ts`:

```ts
/**
 * recipe.json — per-galaxy provenance record.
 *
 * Persisted at public/images/famous-curated/<id>/recipe.json by the
 * /api/export route.  Lets the maintainer reload an exported galaxy
 * back into the curator UI (sliders restored, crop box reconstructed)
 * and, longer-term, lets us re-run the pipeline if StarNet/alpha
 * algorithms change without re-curating from scratch.
 *
 * Versioned to give future shape migrations a clear handle: bump
 * `version` and add a migration in `parseRecipe` when the schema changes.
 */

export type RecipeCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RecipeStarnet = {
  stride: number;
  upsample: boolean;
};

export type RecipeAlpha = {
  blackPoint: number;
  whitePoint: number;
  gamma: number;
};

export type RecipeMetadata = {
  sourceUrl: string;
  license: string;
  author: string;
};

export type Recipe = {
  version: 1;
  id: string;
  crop: RecipeCrop;
  starnet: RecipeStarnet;
  alpha: RecipeAlpha;
  metadata: RecipeMetadata;
  /** ISO 8601 timestamp.  Filled in by the export route at write time. */
  processedAt: string;
};

const KNOWN_VERSION = 1;

/**
 * Serialise a recipe to a diff-friendly JSON string with stable 2-space
 * indentation + a trailing newline (matches the project's prettier
 * config for `.json` files).
 */
export function serialiseRecipe(r: Recipe): string {
  return JSON.stringify(r, null, 2) + '\n';
}

/**
 * Parse + validate a recipe JSON string.  Throws on malformed JSON,
 * missing required fields, unknown versions, or non-finite numbers in
 * numeric fields.  Returns a fresh `Recipe` value (no aliasing to the
 * input object) so callers can mutate freely.
 */
export function parseRecipe(json: string): Recipe {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (raw.version !== KNOWN_VERSION) {
    throw new Error(`recipe: unknown version ${String(raw.version)} (expected ${KNOWN_VERSION})`);
  }
  if (typeof raw.id !== 'string' || raw.id.length === 0) {
    throw new Error('recipe: id must be a non-empty string');
  }
  const crop = raw.crop as Record<string, unknown> | undefined;
  if (!crop) throw new Error('recipe: missing crop block');
  for (const k of ['x', 'y', 'width', 'height'] as const) {
    if (typeof crop[k] !== 'number' || !Number.isFinite(crop[k])) {
      throw new Error(`recipe: crop.${k} must be a finite number`);
    }
  }
  const starnet = raw.starnet as Record<string, unknown> | undefined;
  if (!starnet) throw new Error('recipe: missing starnet block');
  if (typeof starnet.stride !== 'number' || !Number.isFinite(starnet.stride)) {
    throw new Error('recipe: starnet.stride must be a finite number');
  }
  if (typeof starnet.upsample !== 'boolean') {
    throw new Error('recipe: starnet.upsample must be a boolean');
  }
  const alpha = raw.alpha as Record<string, unknown> | undefined;
  if (!alpha) throw new Error('recipe: missing alpha block');
  for (const k of ['blackPoint', 'whitePoint', 'gamma'] as const) {
    if (typeof alpha[k] !== 'number' || !Number.isFinite(alpha[k])) {
      throw new Error(`recipe: alpha.${k} must be a finite number`);
    }
  }
  const meta = raw.metadata as Record<string, unknown> | undefined;
  if (!meta) throw new Error('recipe: missing metadata block');
  for (const k of ['sourceUrl', 'license', 'author'] as const) {
    if (typeof meta[k] !== 'string' || (meta[k] as string).length === 0) {
      throw new Error(`recipe: metadata.${k} must be a non-empty string`);
    }
  }
  if (typeof raw.processedAt !== 'string' || raw.processedAt.length === 0) {
    throw new Error('recipe: processedAt must be a non-empty string');
  }
  return {
    version: KNOWN_VERSION,
    id: raw.id,
    crop: {
      x: crop.x as number,
      y: crop.y as number,
      width: crop.width as number,
      height: crop.height as number,
    },
    starnet: {
      stride: starnet.stride,
      upsample: starnet.upsample,
    },
    alpha: {
      blackPoint: alpha.blackPoint as number,
      whitePoint: alpha.whitePoint as number,
      gamma: alpha.gamma as number,
    },
    metadata: {
      sourceUrl: meta.sourceUrl as string,
      license: meta.license as string,
      author: meta.author as string,
    },
    processedAt: raw.processedAt,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/recipe.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/plugin/recipe.ts tests/tools/famous-curator/recipe.test.ts
git commit -m "$(cat <<'EOF'
feat(curator): recipe.json serialiser + validating parser

Versioned Recipe type covers crop / starnet / alpha / metadata /
processedAt.  serialiseRecipe emits diff-friendly 2-space JSON;
parseRecipe throws on missing blocks, non-finite numbers, or
unknown versions.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Manual smoke + typecheck + open PR

**Files:**
- (No file changes — this task verifies and ships.)

- [ ] **Step 1: Run the full vitest suite**

Run: `npm test`
Expected: PASS — 590+ tests including the 4 new files from this plan (luminance alpha, vite config smoke, apiPlugin health, paths, recipe).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — both `src` and `tools` tsconfigs clean.

- [ ] **Step 3: Manual smoke test**

Run: `npm run curate-famous`
Expected: Vite boots on http://localhost:5200 within ~1 s, prints `Local: http://localhost:5200/`. In a second terminal: `curl http://localhost:5200/api/health` returns `{"ok":true}`. Open http://localhost:5200/ in a browser — the placeholder page renders "Famous Galaxy Curator" + the scaffold note.

Kill the server with Ctrl-C.

- [ ] **Step 4: Open the PR**

Run:
```bash
git push -u origin feature/curator-a-foundation
gh pr create --title "feat(curator): foundation — helpers, plugin scaffold, dev server" --body "$(cat <<'EOF'
## Summary
- Adds `applyLuminanceAsAlpha` to `tools/famous/famousImageProcessor.ts` with vitest coverage (Rec 709 luma, black/white/gamma curve, alpha-multiply contract).
- Scaffolds `tools/famous-curator/` with separate Vite config on port 5200, React entry, `apiPlugin` exposing `/api/health`, pure path resolver, and recipe.json serialiser/parser — all unit-tested.
- Allowlists `data/famous_curated_overrides.json` in `.gitignore`.
- Adds `npm run curate-famous` script.

Foundation for plans B (API endpoints), C (UI), D (integration + polish). See `docs/superpowers/plans/2026-05-18-famous-galaxy-curator-INDEX.md`.

## Test plan
- [x] `npm test` — all 590+ tests pass including 4 new files
- [x] `npm run typecheck` — clean
- [x] `npm run curate-famous` boots on :5200, `/api/health` returns `{ok:true}`, UI scaffold renders

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened; return URL to user.

---

## Subagent-driven-development footer

Each task above is sized for one fresh implementer subagent (write test → see fail → minimal impl → see pass → commit). After landing, dispatch a `requesting-code-review` subagent against the PR before merging.

Total tasks: **7** (1 alpha helper, 1 gitignore, 1 scaffold, 1 /api/health, 1 paths, 1 recipe, 1 verify+PR).
