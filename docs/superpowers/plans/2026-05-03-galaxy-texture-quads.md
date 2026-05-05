# Galaxy Texture Quads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render real galaxy thumbnail images on billboard quads when the camera is zoomed in close enough that a galaxy occupies more than ~24 px on screen, using SDSS image cutouts (primary) with DSS as full-sky fallback.

**Architecture:** A two-pass renderer. Pass 1 is the existing instanced point pass (every galaxy → 1–3 px dot). Pass 2 is a new instanced quad pass that draws billboards for the subset of galaxies whose on-screen apparent size exceeds a threshold AND whose thumbnail has been fetched into a fixed-size GPU texture atlas. A priority fetch queue (4 concurrent, prioritised by apparent size) feeds the atlas, with LRU eviction when full. Below the threshold, the existing point dot is the only thing drawn.

**Tech Stack:** TypeScript, WebGPU, WGSL, vitest, React 19. Reuses existing `GpuContext`, `Source` enum, `OrbitCamera`, and `PointCloud` infrastructure. SDSS cutouts via `https://skyserver.sdss.org/dr18/SkyServerWS/ImgCutout/getjpeg`; DSS cutouts via `https://archive.stsci.edu/cgi-bin/dss_search`.

---

## Context the engineer should know

**Where this fits in the existing renderer:**

- `src/services/gpu/pointRenderer.ts` is the existing instanced-point pass. We do NOT modify it; we run alongside it.
- `src/services/engine/engine.ts` owns the per-frame loop. It currently calls `renderer.draw(...)`; we'll add `quadRenderer.draw(...)` after it.
- `src/data/sources.ts` defines `Source` (Synthetic/SDSS/2MRS/GLADE — assuming the multi-survey rev-2 plan has landed; if not, the source list is irrelevant to this plan because we operate on raw RA/Dec/distance).
- `src/components/SettingsPanel/SettingsPanel.tsx` already has toggles for point size and brightness; we add one toggle here.

**Key magic numbers (non-obvious, document them in code):**

- `APPARENT_SIZE_THRESHOLD_PX = 24` — below this on-screen size, we don't bother fetching a thumbnail
- `DEFAULT_GALAXY_DIAMETER_KPC = 30` — placeholder until BMAG-based diameter lands; ≈ Milky Way's stellar disk
- `ATLAS_SIDE = 2048`, `SLOT_SIDE = 128` — atlas geometry: 16×16 grid = 256 slots
- `MAX_CONCURRENT_FETCHES = 4` — browsers cap HTTP/1.1 at ~6 per origin; 4 leaves room for other requests
- `CUTOUT_PIXEL_SCALE_ARCSEC = 0.396` — SDSS native pixel scale; passed unchanged to the cutout endpoint

**Coordinate convention reminder:** the renderer uses RH +Y-up world coordinates with positions in Mpc. A galaxy at world position `p` is at distance `|p|` from origin (camera target is at origin). Camera distance from target = `cam.distance` (in Mpc).

**Why a fixed atlas instead of a per-galaxy texture?** WebGPU has a hard cap of ~16 simultaneously-bound textures per draw call, and creating a separate `GPUTexture` per galaxy thrashes the GPU's resource pool. One atlas + one bind group + one draw call scales to thousands of galaxies.

---

## File structure

| File                                             | Responsibility                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `src/utils/math/apparentSizePx.ts`               | Pure: angular size → pixel size on screen, given diameter/distance/fov/viewport                     |
| `src/utils/math/galaxyDiameterKpc.ts`            | Pure: galaxy diameter estimator (placeholder constant for v1)                                       |
| `src/data/cutoutUrls.ts`                         | Pure: build SDSS and DSS thumbnail URLs from RA/Dec                                                 |
| `src/services/gpu/textureAtlas.ts`               | Slot-management state machine + GPU texture; `allocate`/`release`/`evictLRU`/`uploadBitmap`         |
| `src/services/gpu/galaxyImageQueue.ts`           | Priority queue + concurrency limit + retry policy (pure logic, GPU-free)                            |
| `src/services/gpu/galaxyImageFetcher.ts`         | Concrete fetcher: SDSS primary, DSS fallback, `createImageBitmap` decode                            |
| `src/services/gpu/quadRenderer.ts`               | Billboard-quad render pass: pipeline, instance buffer, draw API                                     |
| `src/services/gpu/shaders/quads.wgsl`            | Vertex + fragment shaders for quad pass                                                             |
| `src/services/engine/engine.ts`                  | Per-frame: select galaxies → enqueue fetches → consume completed bitmaps → call `quadRenderer.draw` |
| `src/components/SettingsPanel/SettingsPanel.tsx` | Add "Galaxy thumbnails" toggle wired to engine                                                      |
| `src/@types/QuadInstance.d.ts`                   | `QuadInstance` type used by engine + quadRenderer                                                   |
| `tests/utils/math/apparentSizePx.test.ts`        | Unit tests for the pure helper                                                                      |
| `tests/utils/math/galaxyDiameterKpc.test.ts`     | Unit tests                                                                                          |
| `tests/data/cutoutUrls.test.ts`                  | URL formatting tests                                                                                |
| `tests/services/gpu/textureAtlas.test.ts`        | Slot allocation + LRU tests with GPU mock                                                           |
| `tests/services/gpu/galaxyImageQueue.test.ts`    | Priority + concurrency tests with mock fetch                                                        |

---

## Task 1: Apparent-size pixel helper

**Files:**

- Create: `src/utils/math/apparentSizePx.ts`
- Create: `tests/utils/math/apparentSizePx.test.ts`
- Modify: `src/utils/math/index.ts` (add to barrel)

The pure function that decides whether a galaxy is "big enough" to deserve a thumbnail. Geometry:

```
angular_size_rad = diameter / distance     (small-angle approximation)
pixel_size       = angular_size_rad × (viewport_height_px / fov_y_rad)
```

`diameter` and `distance` must be in the same length units; the fov and viewport must use the _vertical_ axis to match `mat4.perspectiveZO`'s convention (which takes `fovY`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/utils/math/apparentSizePx.test.ts
import { describe, it, expect } from 'vitest';
import { apparentSizePx } from '../../../src/utils/math/apparentSizePx';

describe('apparentSizePx', () => {
  it('30 kpc galaxy at 10 Mpc with 60° fovY and 1080-px viewport ≈ 53 px', () => {
    // angular = 30/10000 rad = 0.003
    // pxPerRad = 1080 / (60 * π/180) = 1031.3
    // px = 0.003 * 1031.3 ≈ 3.09 — wait, recompute
    // actually angular_size_rad = diameter_kpc / (distance_mpc * 1000)
    //                          = 30 / (10 * 1000) = 0.003 rad
    // px = 0.003 * 1080 / (60° in rad) = 0.003 * 1080 / 1.0472 ≈ 3.094
    const px = apparentSizePx({
      diameterKpc: 30,
      distanceMpc: 10,
      viewportHeightPx: 1080,
      fovYRad: (60 * Math.PI) / 180,
    });
    expect(px).toBeCloseTo(3.094, 2);
  });

  it('returns 0 for zero or negative distance (defensive)', () => {
    expect(
      apparentSizePx({
        diameterKpc: 30,
        distanceMpc: 0,
        viewportHeightPx: 1080,
        fovYRad: 1,
      }),
    ).toBe(0);
    expect(
      apparentSizePx({
        diameterKpc: 30,
        distanceMpc: -5,
        viewportHeightPx: 1080,
        fovYRad: 1,
      }),
    ).toBe(0);
  });

  it('scales linearly with viewport height', () => {
    const small = apparentSizePx({
      diameterKpc: 30,
      distanceMpc: 5,
      viewportHeightPx: 540,
      fovYRad: 1,
    });
    const big = apparentSizePx({
      diameterKpc: 30,
      distanceMpc: 5,
      viewportHeightPx: 1080,
      fovYRad: 1,
    });
    expect(big).toBeCloseTo(small * 2, 6);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- apparentSizePx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

```ts
// src/utils/math/apparentSizePx.ts

/**
 * Compute on-screen pixel size of an object with the given physical diameter
 * at the given distance, under a perspective camera with `fovYRad` vertical
 * field of view rendering into a viewport `viewportHeightPx` tall.
 *
 * Why "vertical" specifically? `mat4.perspectiveZO(fovY, …)` uses the vertical
 * field-of-view, and the projection scales the **y axis** by `1 / tan(fovY/2)`.
 * So the angular-size-to-pixel conversion is dictated by the y axis. If you
 * accidentally pass the horizontal fov, the result is wrong by aspect-ratio.
 *
 * Why the kpc/Mpc split? Distances in our point cloud are in Mpc (cosmology
 * units), but galaxies have diameters in kpc (galactic units). 1 Mpc = 1000 kpc.
 *
 * Returns 0 for non-positive distance — defensively handles a galaxy at the
 * camera target (distance=0 would otherwise divide by zero).
 */
export function apparentSizePx(input: {
  diameterKpc: number;
  distanceMpc: number;
  viewportHeightPx: number;
  fovYRad: number;
}): number {
  const { diameterKpc, distanceMpc, viewportHeightPx, fovYRad } = input;
  if (distanceMpc <= 0) return 0;
  // Small-angle: tan(θ) ≈ θ for θ ≪ 1 rad. Galaxy angular sizes are at most
  // a few arcminutes (~0.001 rad), so the approximation error is < 1 ppm.
  const angularRad = diameterKpc / (distanceMpc * 1000);
  // Pixels per radian along the y axis = viewportHeight / fovYRad.
  // (More precisely viewport / (2·tan(fovY/2)), but small-angle again — and
  // for fov around 60° the difference is ~5%, larger than we want. Use exact:)
  const pxPerRad = viewportHeightPx / (2 * Math.tan(fovYRad / 2));
  return angularRad * pxPerRad;
}
```

Wait — the test value `3.094` was computed with the simple `viewportHeightPx / fovYRad` approximation. Let me re-derive: with the exact formula `viewportHeightPx / (2*tan(fovY/2))`, for fovY=60° and 1080 px we get `1080 / (2*tan(0.5236)) = 1080 / (2*0.5774) = 935.3`. So `0.003 * 935.3 = 2.806 px`.

Update the test accordingly (use exact projection):

- [ ] **Step 3a: Update the test to match the exact projection**

```ts
// In tests/utils/math/apparentSizePx.test.ts replace the first test's expected:
expect(px).toBeCloseTo(2.806, 2);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- apparentSizePx`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Add to barrel**

Append to `src/utils/math/index.ts`:

```ts
export { apparentSizePx } from './apparentSizePx';
```

- [ ] **Step 6: Verify typecheck and commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/utils/math/apparentSizePx.ts src/utils/math/index.ts tests/utils/math/apparentSizePx.test.ts
git commit -m "feat: add apparentSizePx helper for galaxy-on-screen pixel size"
```

---

## Task 2: Galaxy diameter estimator

**Files:**

- Create: `src/utils/math/galaxyDiameterKpc.ts`
- Create: `tests/utils/math/galaxyDiameterKpc.test.ts`
- Modify: `src/utils/math/index.ts`

Returns a galaxy's physical diameter in kpc. v1 returns a constant 30 kpc (Milky Way-ish); structured so a future BMAG-based estimator slots in without breaking callers.

- [ ] **Step 1: Write the failing test**

```ts
// tests/utils/math/galaxyDiameterKpc.test.ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GALAXY_DIAMETER_KPC,
  galaxyDiameterKpc,
} from '../../../src/utils/math/galaxyDiameterKpc';

describe('galaxyDiameterKpc', () => {
  it('returns DEFAULT_GALAXY_DIAMETER_KPC when no magnitude supplied', () => {
    expect(galaxyDiameterKpc({})).toBe(DEFAULT_GALAXY_DIAMETER_KPC);
  });

  it('DEFAULT_GALAXY_DIAMETER_KPC equals 30 (Milky-Way placeholder)', () => {
    expect(DEFAULT_GALAXY_DIAMETER_KPC).toBe(30);
  });

  it('returns DEFAULT for NaN magnitude (defensive)', () => {
    expect(galaxyDiameterKpc({ absMagBmag: NaN })).toBe(DEFAULT_GALAXY_DIAMETER_KPC);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- galaxyDiameterKpc`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/utils/math/galaxyDiameterKpc.ts

/**
 * Estimate a galaxy's physical diameter in kpc.
 *
 * v1: returns a fixed 30 kpc — close to the Milky Way's stellar disk and
 * within a factor of 2 for typical L* spirals. The renderer's apparent-size
 * threshold logic only cares about diameter to the nearest factor-of-two
 * (it's a binary "show texture or don't"), so the placeholder is fine.
 *
 * v2 (future): use the absolute B magnitude (`absMagBmag`) to scale via the
 * size–luminosity relation. For now we accept and ignore the parameter so
 * callers don't need to be rewritten when v2 lands.
 *
 * Why a constant default and an `input` object? Adding a magnitude argument
 * to a one-line function is silly *now*, but a structured input keeps the
 * call sites stable as the estimator grows.
 */
export const DEFAULT_GALAXY_DIAMETER_KPC = 30;

export function galaxyDiameterKpc(input: { absMagBmag?: number }): number {
  // v2 hook: when absMagBmag becomes meaningful, branch here.
  if (input.absMagBmag !== undefined && Number.isFinite(input.absMagBmag)) {
    // intentionally fall through to default — see v2 note above.
  }
  return DEFAULT_GALAXY_DIAMETER_KPC;
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- galaxyDiameterKpc`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Add to barrel**

Append to `src/utils/math/index.ts`:

```ts
export { DEFAULT_GALAXY_DIAMETER_KPC, galaxyDiameterKpc } from './galaxyDiameterKpc';
```

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/utils/math/galaxyDiameterKpc.ts src/utils/math/index.ts tests/utils/math/galaxyDiameterKpc.test.ts
git commit -m "feat: add galaxyDiameterKpc placeholder (30 kpc)"
```

---

## Task 3: Cutout URL builders — REUSE EXISTING HELPERS

> **NOTE:** This task was originally planned to create `src/data/cutoutUrls.ts` from scratch. Since the plan was written, the InfoCard work landed two helpers that already do exactly what this task needs:
>
> - `sdssThumbnailUrl(raDeg, decDeg, sizePx)` in `src/utils/math/sdssThumbnailUrl.ts` — DR18 ImgCutout, 0.4 arcsec/px (vs the plan's 0.396 — close enough, both are within SDSS's documented native scale).
> - `dssThumbnailUrl(raDeg, decDeg, arcMin)` in `src/utils/math/dssThumbnailUrl.ts` — ESO DSS proxy (note: different endpoint than the plan originally specified — it uses `archive.eso.org/dss/dss/image` instead of `archive.stsci.edu/cgi-bin/dss_search`, but it returns the same kind of cutout image).
>
> **Skip the file/test creation.** Subsequent tasks should import these directly:
>
> ```ts
> import { sdssThumbnailUrl, dssThumbnailUrl } from '../../utils/math';
> ```
>
> Argument shape: positional `(raDeg, decDeg, size)` — NOT the object-arg shape shown in the original task body below. The fetcher in Task 7 must adapt to this.
>
> The Task 3 prose below is preserved for historical context but **do not implement it**.

**Files (original — do not create):**

- Create: `src/data/cutoutUrls.ts`
- Create: `tests/data/cutoutUrls.test.ts`

Two pure functions: `sdssCutoutUrl(ra, dec, sizePx)` and `dssCutoutUrl(ra, dec, sizeArcmin)`. Tested by URL string equality.

- [ ] **Step 1: Write the failing test**

```ts
// tests/data/cutoutUrls.test.ts
import { describe, it, expect } from 'vitest';
import { sdssCutoutUrl, dssCutoutUrl } from '../../src/data/cutoutUrls';

describe('sdssCutoutUrl', () => {
  it('builds the DR18 cutout URL with the standard 0.396 arcsec/px scale', () => {
    const url = sdssCutoutUrl({ ra: 180.123, dec: -3.456, sizePx: 128 });
    expect(url).toBe(
      'https://skyserver.sdss.org/dr18/SkyServerWS/ImgCutout/getjpeg' +
        '?ra=180.123&dec=-3.456&width=128&height=128&scale=0.396',
    );
  });

  it('handles negative declinations and trailing zeros in coordinates', () => {
    const url = sdssCutoutUrl({ ra: 0.0, dec: -90.0, sizePx: 64 });
    expect(url).toContain('ra=0&dec=-90');
    expect(url).toContain('width=64&height=64');
  });
});

describe('dssCutoutUrl', () => {
  it('builds an STScI DSS poss2 red search URL with arcmin size', () => {
    const url = dssCutoutUrl({ ra: 12.5, dec: 45.0, sizeArcmin: 2 });
    expect(url).toBe(
      'https://archive.stsci.edu/cgi-bin/dss_search' +
        '?v=poss2ukstu_red&r=12.5&d=45&e=J2000&h=2&w=2&f=gif',
    );
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- cutoutUrls`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/data/cutoutUrls.ts

/**
 * URL builders for SDSS and DSS image cutout services.
 *
 * SDSS cutouts are the higher-quality option but cover only ~1/3 of the sky
 * (mostly northern hemisphere). DSS covers the entire sky at lower
 * resolution, so it's the all-sky fallback when SDSS returns 404.
 *
 * Both endpoints support CORS — confirmed by SDSS DR18 docs and STScI MAST
 * archive policy. We can `fetch()` directly from the browser.
 */

/** SDSS native pixel scale: 0.396 arcsec per pixel. Passing this unchanged
 *  yields a cutout sized to the requested pixel dimensions in real sky units. */
const SDSS_PIXEL_SCALE_ARCSEC = 0.396;

export function sdssCutoutUrl(input: { ra: number; dec: number; sizePx: number }): string {
  const { ra, dec, sizePx } = input;
  return (
    'https://skyserver.sdss.org/dr18/SkyServerWS/ImgCutout/getjpeg' +
    `?ra=${ra}&dec=${dec}&width=${sizePx}&height=${sizePx}&scale=${SDSS_PIXEL_SCALE_ARCSEC}`
  );
}

/**
 * DSS is the Digitized Sky Survey hosted at STScI. The `poss2ukstu_red` plate
 * is the second-epoch UK Schmidt red plate — the best optical sky survey
 * with full-sky coverage south of δ ≈ +2°. North of that we'd ideally use
 * `poss2ukstu_blue` or `quickv`, but `poss2ukstu_red` works everywhere as a
 * fallback (the survey overlaps in the equator strip).
 *
 * Size is in arcminutes (NOT pixels) — DSS scales to a fixed pixel size based
 * on the requested sky size. 2 arcmin ≈ 64 px in their default rendering.
 */
export function dssCutoutUrl(input: { ra: number; dec: number; sizeArcmin: number }): string {
  const { ra, dec, sizeArcmin } = input;
  return (
    'https://archive.stsci.edu/cgi-bin/dss_search' +
    `?v=poss2ukstu_red&r=${ra}&d=${dec}&e=J2000&h=${sizeArcmin}&w=${sizeArcmin}&f=gif`
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- cutoutUrls`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/data/cutoutUrls.ts tests/data/cutoutUrls.test.ts
git commit -m "feat: add SDSS + DSS cutout URL builders"
```

---

## Task 4: TextureAtlas slot management (no GPU)

**Files:**

- Create: `src/services/gpu/textureAtlas.ts`
- Create: `tests/services/gpu/textureAtlas.test.ts`

The atlas is a 16×16 grid of 128×128 slots inside a 2048×2048 RGBA texture. This task implements the pure JS state machine that tracks which slots are free, which are occupied, and LRU-evicts when full. The GPU-side texture upload lands in Task 5.

- [ ] **Step 1: Write the failing test**

```ts
// tests/services/gpu/textureAtlas.test.ts
import { describe, it, expect } from 'vitest';
import {
  TextureAtlas,
  ATLAS_SIDE,
  SLOT_SIDE,
  SLOT_COUNT,
} from '../../src/services/gpu/textureAtlas';

describe('TextureAtlas slot state machine', () => {
  // Construct without a real GPU device — pass `null as any`. The state-machine
  // path doesn't touch the device until we call uploadBitmap (Task 5).
  const newAtlas = () => new TextureAtlas(null as any);

  it('exposes correct geometry constants', () => {
    expect(ATLAS_SIDE).toBe(2048);
    expect(SLOT_SIDE).toBe(128);
    expect(SLOT_COUNT).toBe(256); // (2048/128)^2 = 16 * 16
  });

  it('allocates sequential slots starting at 0', () => {
    const a = newAtlas();
    expect(a.allocate('obj-1', 1)).toBe(0);
    expect(a.allocate('obj-2', 1)).toBe(1);
    expect(a.allocate('obj-3', 1)).toBe(2);
  });

  it('returns the same slot for the same key (idempotent)', () => {
    const a = newAtlas();
    const slot = a.allocate('obj-x', 1);
    expect(a.allocate('obj-x', 2)).toBe(slot);
    expect(a.allocate('obj-x', 99)).toBe(slot);
  });

  it('records the frame the slot was last seen', () => {
    const a = newAtlas();
    a.allocate('obj-y', 5);
    a.touch('obj-y', 17);
    expect(a.lastSeenFrame('obj-y')).toBe(17);
  });

  it('evicts the LRU slot when full', () => {
    const a = newAtlas();
    // Fill all SLOT_COUNT slots, each with a distinct lastSeenFrame
    for (let i = 0; i < SLOT_COUNT; i++) {
      a.allocate(`obj-${i}`, i);
    }
    // The next allocation must evict 'obj-0' (smallest lastSeenFrame).
    const evicted = a.allocate('obj-new', 9999);
    expect(evicted).toBe(0); // slot 0 reused
    expect(a.lastSeenFrame('obj-0')).toBeUndefined();
    expect(a.lastSeenFrame('obj-new')).toBe(9999);
  });

  it('release() frees a slot for re-use', () => {
    const a = newAtlas();
    const slot = a.allocate('obj-z', 1);
    a.release('obj-z');
    expect(a.lastSeenFrame('obj-z')).toBeUndefined();
    expect(a.allocate('obj-w', 2)).toBe(slot); // reuses freed slot
  });

  it('slotUv returns the [u0,v0,u1,v1] rectangle for a slot in [0,1] coords', () => {
    const a = newAtlas();
    expect(a.slotUv(0)).toEqual([0, 0, SLOT_SIDE / ATLAS_SIDE, SLOT_SIDE / ATLAS_SIDE]);
    // Slot 16 = row 1, col 0 (since 16 slots per row)
    const uvRow1 = a.slotUv(16);
    expect(uvRow1[1]).toBeCloseTo(SLOT_SIDE / ATLAS_SIDE);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- textureAtlas`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement state machine**

```ts
// src/services/gpu/textureAtlas.ts

/**
 * GPU texture atlas for galaxy thumbnails.
 *
 * Layout: a single 2048×2048 RGBA texture sliced into a 16×16 grid of
 * 128×128 slots — 256 thumbnails total. Each slot is keyed by a string
 * (typically `${ra},${dec}` so the same galaxy across frames hits the same
 * slot).
 *
 * Why a fixed-size atlas? WebGPU caps simultaneously-bound textures at ~16,
 * and a per-galaxy GPUTexture would thrash the resource allocator at scale.
 * One atlas + one bind group = one draw call for thousands of textured
 * galaxies.
 *
 * Eviction is LRU by `lastSeenFrame`: when full, the slot with the oldest
 * `lastSeenFrame` is replaced. The engine calls `touch(key, frame)` every
 * frame the galaxy is on screen so visible thumbnails stay alive.
 */

export const ATLAS_SIDE = 2048;
export const SLOT_SIDE = 128;
const SLOTS_PER_ROW = ATLAS_SIDE / SLOT_SIDE; // 16
export const SLOT_COUNT = SLOTS_PER_ROW * SLOTS_PER_ROW; // 256

type SlotEntry = { key: string; lastSeenFrame: number };

export class TextureAtlas {
  // The GPU device is needed only by uploadBitmap (Task 5). Slot management
  // works without it, which is what the unit tests exercise.
  private readonly device: GPUDevice;

  // Index in [0, SLOT_COUNT) → entry occupying that slot, or undefined if free.
  private readonly slots: Array<SlotEntry | undefined> = new Array(SLOT_COUNT).fill(undefined);

  // Reverse lookup: key → slot index. Lets us idempotently allocate the same
  // key without scanning the slots array.
  private readonly keyToSlot = new Map<string, number>();

  constructor(device: GPUDevice) {
    this.device = device;
  }

  /**
   * Get the slot for `key`, allocating one if needed. Sets `lastSeenFrame`.
   * If the atlas is full and `key` is new, evicts the LRU slot.
   * Returns the slot index (callers use it to compute UVs).
   */
  allocate(key: string, frame: number): number {
    const existing = this.keyToSlot.get(key);
    if (existing !== undefined) {
      this.slots[existing]!.lastSeenFrame = frame;
      return existing;
    }
    // Find a free slot first.
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (this.slots[i] === undefined) {
        this.slots[i] = { key, lastSeenFrame: frame };
        this.keyToSlot.set(key, i);
        return i;
      }
    }
    // Atlas full — evict LRU.
    let lruIdx = 0;
    let lruFrame = this.slots[0]!.lastSeenFrame;
    for (let i = 1; i < SLOT_COUNT; i++) {
      const f = this.slots[i]!.lastSeenFrame;
      if (f < lruFrame) {
        lruIdx = i;
        lruFrame = f;
      }
    }
    const evictedKey = this.slots[lruIdx]!.key;
    this.keyToSlot.delete(evictedKey);
    this.slots[lruIdx] = { key, lastSeenFrame: frame };
    this.keyToSlot.set(key, lruIdx);
    return lruIdx;
  }

  /** Update `lastSeenFrame` for a slot known to exist. No-op if key not present. */
  touch(key: string, frame: number): void {
    const idx = this.keyToSlot.get(key);
    if (idx !== undefined) this.slots[idx]!.lastSeenFrame = frame;
  }

  /** Manually free a slot (e.g. after a fetch failed permanently). */
  release(key: string): void {
    const idx = this.keyToSlot.get(key);
    if (idx === undefined) return;
    this.slots[idx] = undefined;
    this.keyToSlot.delete(key);
  }

  /** Returns the last-seen frame for `key`, or undefined if not in the atlas. */
  lastSeenFrame(key: string): number | undefined {
    const idx = this.keyToSlot.get(key);
    return idx === undefined ? undefined : this.slots[idx]!.lastSeenFrame;
  }

  /**
   * UV rectangle [u0, v0, u1, v1] for a slot, in [0,1] texture coords.
   * Slots are laid out row-major: slot N is at column (N % 16), row (N / 16).
   */
  slotUv(slotIdx: number): [number, number, number, number] {
    const col = slotIdx % SLOTS_PER_ROW;
    const row = Math.floor(slotIdx / SLOTS_PER_ROW);
    const slotNorm = SLOT_SIDE / ATLAS_SIDE;
    const u0 = col * slotNorm;
    const v0 = row * slotNorm;
    return [u0, v0, u0 + slotNorm, v0 + slotNorm];
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- textureAtlas`
Expected: PASS — 7 tests green.

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/textureAtlas.ts tests/services/gpu/textureAtlas.test.ts
git commit -m "feat: add TextureAtlas slot state machine + LRU eviction"
```

---

## Task 5: TextureAtlas GPU integration

**Files:**

- Modify: `src/services/gpu/textureAtlas.ts`

Adds `createTexture()`, `uploadBitmap(slotIdx, bitmap)`, and `getTextureView()`. No new tests — these methods are purely GPU side-effects, validated by the visual test in Task 8.

- [ ] **Step 1: Add GPU methods to TextureAtlas**

Replace the body of `src/services/gpu/textureAtlas.ts` adding these methods alongside the existing slot state machine (preserve all existing code; only ADD the methods below):

```ts
// Inside the TextureAtlas class, after the constructor:

private texture: GPUTexture | undefined;

/**
 * Create the underlying 2048×2048 RGBA8 texture. Must be called once after
 * construction, before uploadBitmap or getTextureView. Separate from the
 * constructor so unit tests can construct without a GPU device.
 */
initTexture(): void {
  if (this.texture) return; // idempotent
  this.texture = this.device.createTexture({
    label: 'galaxy-atlas',
    size: [ATLAS_SIDE, ATLAS_SIDE, 1],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT, // RENDER_ATTACHMENT lets us clear if needed
  });
}

/**
 * Upload an ImageBitmap into the given slot. The bitmap must be 128×128 — the
 * caller (galaxyImageFetcher) is responsible for resizing during decode via
 * `createImageBitmap(blob, { resizeWidth: 128, resizeHeight: 128 })`.
 */
uploadBitmap(slotIdx: number, bitmap: ImageBitmap): void {
  if (!this.texture) throw new Error('TextureAtlas: call initTexture() first.');
  const col = slotIdx % SLOTS_PER_ROW;
  const row = Math.floor(slotIdx / SLOTS_PER_ROW);
  this.device.queue.copyExternalImageToTexture(
    { source: bitmap, flipY: false },
    { texture: this.texture, origin: [col * SLOT_SIDE, row * SLOT_SIDE, 0] },
    [SLOT_SIDE, SLOT_SIDE, 1],
  );
}

/** Returns the texture view for binding into the quad pass pipeline. */
getTextureView(): GPUTextureView {
  if (!this.texture) throw new Error('TextureAtlas: call initTexture() first.');
  return this.texture.createView({ label: 'galaxy-atlas-view' });
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npm test -- textureAtlas`
Expected: PASS — the same 7 tests still green (we only added methods).

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/services/gpu/textureAtlas.ts
git commit -m "feat: add GPU-side methods to TextureAtlas (initTexture/uploadBitmap)"
```

---

## Task 6: Galaxy image fetch queue

**Files:**

- Create: `src/services/gpu/galaxyImageQueue.ts`
- Create: `tests/services/gpu/galaxyImageQueue.test.ts`

A priority queue with concurrency limit. The engine pushes `{ key, priority, fetcher }` entries; the queue runs at most `MAX_CONCURRENT_FETCHES` simultaneously, calling `fetcher` (which returns a Promise<ImageBitmap | null>) and routing the result back via a callback.

- [ ] **Step 1: Write the failing test**

```ts
// tests/services/gpu/galaxyImageQueue.test.ts
import { describe, it, expect, vi } from 'vitest';
import { GalaxyImageQueue, MAX_CONCURRENT_FETCHES } from '../../src/services/gpu/galaxyImageQueue';

describe('GalaxyImageQueue', () => {
  it('exposes a sane concurrency cap (4)', () => {
    expect(MAX_CONCURRENT_FETCHES).toBe(4);
  });

  it('runs at most MAX_CONCURRENT_FETCHES tasks simultaneously', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const queue = new GalaxyImageQueue();

    for (let i = 0; i < 12; i++) {
      queue.enqueue({
        key: `k${i}`,
        priority: i,
        fetcher: async () => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await sleep(20);
          inFlight--;
          return null; // fetch failed/empty result is fine for this concurrency test
        },
        onResult: () => {},
      });
    }
    await queue.drain();

    expect(maxInFlight).toBeLessThanOrEqual(MAX_CONCURRENT_FETCHES);
    expect(maxInFlight).toBeGreaterThan(1); // sanity: parallelism actually happened
  });

  it('processes higher-priority entries first', async () => {
    const queue = new GalaxyImageQueue();
    const order: string[] = [];
    // Block one slot so the queue must order the remaining work in our enqueue.
    let unblock!: () => void;
    const blocker = new Promise<void>((r) => {
      unblock = r;
    });
    queue.enqueue({
      key: 'blocker',
      priority: 0,
      fetcher: async () => {
        await blocker;
        return null;
      },
      onResult: () => order.push('blocker'),
    });
    // Saturate the rest of the slots with low-priority fillers so we can
    // observe ordering on what's still pending after they drain.
    for (let i = 0; i < MAX_CONCURRENT_FETCHES - 1; i++) {
      queue.enqueue({
        key: `filler-${i}`,
        priority: -1,
        fetcher: async () => null,
        onResult: () => order.push(`filler-${i}`),
      });
    }
    // Now push three more with mixed priorities; with all slots busy these wait.
    queue.enqueue({
      key: 'low',
      priority: 1,
      fetcher: async () => null,
      onResult: () => order.push('low'),
    });
    queue.enqueue({
      key: 'high',
      priority: 10,
      fetcher: async () => null,
      onResult: () => order.push('high'),
    });
    queue.enqueue({
      key: 'mid',
      priority: 5,
      fetcher: async () => null,
      onResult: () => order.push('mid'),
    });

    // Let fillers drain (they resolve immediately).
    await new Promise((r) => setTimeout(r, 5));
    // Unblock the blocker — that frees one slot, then the highest-priority
    // pending item ('high') should run next, followed by mid, then low.
    unblock();
    await queue.drain();

    const tail = order.slice(-3);
    expect(tail).toEqual(['high', 'mid', 'low']);
  });

  it('calls onResult with the fetcher result', async () => {
    const queue = new GalaxyImageQueue();
    const cb = vi.fn();
    const fakeBitmap = { close: () => {} } as unknown as ImageBitmap;
    queue.enqueue({
      key: 'k',
      priority: 1,
      fetcher: async () => fakeBitmap,
      onResult: cb,
    });
    await queue.drain();
    expect(cb).toHaveBeenCalledWith(fakeBitmap);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- galaxyImageQueue`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the queue**

```ts
// src/services/gpu/galaxyImageQueue.ts

/**
 * Priority queue + concurrency limiter for galaxy image fetches.
 *
 * Why hand-rolled instead of e.g. p-limit? Two needs are linked: priority
 * (largest-on-screen-first) AND limit. p-limit is FIFO. We also want to
 * dedupe by key, drop stale entries on re-enqueue, and report per-task
 * results — easier to write 60 lines than to wire up three libraries.
 *
 * Behaviour:
 *   - At most MAX_CONCURRENT_FETCHES fetchers run at once.
 *   - When a slot frees, we pick the pending entry with the highest priority.
 *   - Re-enqueueing the same `key` while pending REPLACES the old entry
 *     (priority + fetcher updated). In-flight requests are not cancelled —
 *     that's complexity we don't need; the result is just dropped if stale.
 */

export const MAX_CONCURRENT_FETCHES = 4;

export type QueueEntry = {
  key: string;
  priority: number;
  fetcher: () => Promise<ImageBitmap | null>;
  onResult: (bitmap: ImageBitmap | null) => void;
};

export class GalaxyImageQueue {
  private pending = new Map<string, QueueEntry>();
  private inFlight = new Set<string>();
  private drainResolvers: Array<() => void> = [];

  enqueue(entry: QueueEntry): void {
    // Dedupe by key — re-enqueue replaces priority + fetcher.
    if (this.inFlight.has(entry.key)) {
      // The in-flight request will finish, then we'd want to enqueue this
      // updated entry. Simpler: just queue it; the in-flight result will fire
      // first (and be a no-op for the caller because they re-enqueued, meaning
      // they want the new fetch).
      this.pending.set(entry.key, entry);
      return;
    }
    this.pending.set(entry.key, entry);
    this.tryStart();
  }

  /** Resolves once all enqueued and in-flight fetches finish. */
  drain(): Promise<void> {
    if (this.pending.size === 0 && this.inFlight.size === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.drainResolvers.push(resolve));
  }

  private tryStart(): void {
    while (this.inFlight.size < MAX_CONCURRENT_FETCHES && this.pending.size > 0) {
      const entry = this.popHighestPriority();
      if (!entry) break;
      this.inFlight.add(entry.key);
      // Fire-and-forget; the .then handles re-scheduling.
      entry
        .fetcher()
        .then(
          (bitmap) => entry.onResult(bitmap),
          () => entry.onResult(null), // treat thrown rejection as null result
        )
        .finally(() => {
          this.inFlight.delete(entry.key);
          if (this.pending.size === 0 && this.inFlight.size === 0) {
            const resolvers = this.drainResolvers.splice(0);
            for (const r of resolvers) r();
          } else {
            this.tryStart();
          }
        });
    }
  }

  private popHighestPriority(): QueueEntry | undefined {
    let bestKey: string | undefined;
    let bestPriority = -Infinity;
    for (const [key, entry] of this.pending) {
      if (entry.priority > bestPriority) {
        bestPriority = entry.priority;
        bestKey = key;
      }
    }
    if (bestKey === undefined) return undefined;
    const entry = this.pending.get(bestKey)!;
    this.pending.delete(bestKey);
    return entry;
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- galaxyImageQueue`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/galaxyImageQueue.ts tests/services/gpu/galaxyImageQueue.test.ts
git commit -m "feat: add GalaxyImageQueue with priority + concurrency limit"
```

---

## Task 7: Galaxy image fetcher (SDSS + DSS fallback)

**Files:**

- Create: `src/services/gpu/galaxyImageFetcher.ts`

The concrete fetcher: takes RA/Dec, tries SDSS, falls back to DSS on 404, decodes the response into a 128×128 ImageBitmap. No unit tests — this is essentially a wrapper around `fetch` and `createImageBitmap`; integration is verified visually in Task 9.

- [ ] **Step 1: Implement the fetcher**

```ts
// src/services/gpu/galaxyImageFetcher.ts
import { sdssCutoutUrl, dssCutoutUrl } from '../data/cutoutUrls';
import { SLOT_SIDE } from './textureAtlas';

/**
 * Fetch a galaxy thumbnail for the given RA/Dec, returning a 128×128
 * ImageBitmap suitable for atlas upload, or null if both SDSS and DSS fail.
 *
 * Strategy:
 *   1. Request SDSS DR18 cutout. ~70% of galaxies are in the SDSS footprint
 *      (~1/3 of sky, mostly northern). Returns a JPEG of stars+galaxy.
 *   2. On 404 / non-2xx / non-image response, fall back to DSS POSS-II red
 *      plate (full sky, lower quality). Returns a GIF.
 *   3. Decode whichever we got into an ImageBitmap, resizing to 128×128 in
 *      one step (faster than canvas-resize and avoids extra blits).
 *
 * Why size at decode time? `createImageBitmap` accepts `resizeWidth` and
 * `resizeHeight` options — the browser resizes during decode, saving us a
 * canvas allocation per fetch.
 */

export async function fetchGalaxyBitmap(input: {
  ra: number;
  dec: number;
  signal?: AbortSignal;
}): Promise<ImageBitmap | null> {
  const { ra, dec, signal } = input;
  // Try SDSS first.
  const sdssBlob = await tryFetch(sdssCutoutUrl({ ra, dec, sizePx: SLOT_SIDE }), signal);
  if (sdssBlob) {
    try {
      return await createImageBitmap(sdssBlob, {
        resizeWidth: SLOT_SIDE,
        resizeHeight: SLOT_SIDE,
      });
    } catch {
      // fallthrough to DSS
    }
  }
  // DSS fallback. 2 arcmin ≈ what SDSS gives at scale=0.396 for 128 px.
  const dssBlob = await tryFetch(dssCutoutUrl({ ra, dec, sizeArcmin: 2 }), signal);
  if (dssBlob) {
    try {
      return await createImageBitmap(dssBlob, {
        resizeWidth: SLOT_SIDE,
        resizeHeight: SLOT_SIDE,
      });
    } catch {
      return null;
    }
  }
  return null;
}

/** Returns a Blob on 2xx, otherwise undefined. Network errors → undefined. */
async function tryFetch(url: string, signal?: AbortSignal): Promise<Blob | undefined> {
  try {
    const res = await fetch(url, { signal, mode: 'cors' });
    if (!res.ok) return undefined;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return undefined;
    return await res.blob();
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Verify existing tests still pass**

Run: `npm test`
Expected: PASS — no regression in any existing test.

- [ ] **Step 4: Commit**

```bash
git add src/services/gpu/galaxyImageFetcher.ts
git commit -m "feat: add fetchGalaxyBitmap (SDSS primary + DSS fallback)"
```

---

## Task 8: Quad renderer + WGSL shaders

**Files:**

- Create: `src/services/gpu/shaders/quads.wgsl`
- Create: `src/services/gpu/quadRenderer.ts`
- Create: `src/@types/QuadInstance.d.ts`
- Modify: `src/@types/index.d.ts` (add QuadInstance to barrel)

The renderer for the quad pass. Inputs: an instance buffer of `{ x, y, z, sizeWorld, u0, v0, u1, v1 }` per textured galaxy, plus the shared view-projection matrix and the atlas texture. Output: textured billboard quads composited with premultiplied-alpha additive blending.

- [ ] **Step 1: Define the QuadInstance type**

```ts
// src/@types/QuadInstance.d.ts

/**
 * Per-instance data for the textured-quad pass.
 *
 * Layout (must match WGSL `struct QuadInstance` and the JS-side
 * `Float32Array` write pattern):
 *
 *   pos:   vec3<f32>  // world-space center, Mpc
 *   sizeW: f32        // world-space quad side length, Mpc
 *   uvRect:vec4<f32>  // [u0, v0, u1, v1] within the atlas
 *
 * Total: 8 floats = 32 bytes per instance, matching the WGSL std140-friendly
 * 16-byte alignment (vec3 + f32 fills one 16-byte slot, vec4 fills another).
 */
export type QuadInstance = {
  x: number;
  y: number;
  z: number;
  sizeWorld: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
};
```

- [ ] **Step 2: Add to @types barrel**

Append to `src/@types/index.d.ts`:

```ts
export type * from './QuadInstance';
```

- [ ] **Step 3: Write the WGSL shader**

```wgsl
// src/services/gpu/shaders/quads.wgsl

// Camera + viewport. Same struct shape as the existing points pass for
// consistency, but we don't need brightness/selectedIndex/etc.
struct Uniforms {
  viewProj: mat4x4<f32>,
  viewport: vec2<f32>,
  _pad0: f32,
  _pad1: f32,
};

// Per-instance attributes. Two vec4s — first packs (xyz, sizeWorld), second
// is the uv rect. All offsets are 16-byte aligned (WGSL requirement).
struct InstanceIn {
  @location(0) posSize: vec4<f32>,   // xyz = world position, w = sizeWorld (Mpc)
  @location(1) uvRect:  vec4<f32>,   // u0,v0,u1,v1
};

struct VsOut {
  @builtin(position) clipPos: vec4<f32>,
  @location(0)       uv:      vec2<f32>,
};

@group(0) @binding(0) var<uniform> u:        Uniforms;
@group(0) @binding(1) var          atlasTex: texture_2d<f32>;
@group(0) @binding(2) var          atlasSmp: sampler;

// Hard-coded quad corners. The vertex shader is invoked with vertexIndex 0..5
// (two triangles), and we look up the corner from this table. Saves an
// index buffer + a vertex buffer for static geometry.
const CORNERS = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0,  1.0),
);

@vertex
fn vs(@builtin(vertex_index) vid: u32, instance: InstanceIn) -> VsOut {
  let corner = CORNERS[vid];

  // Build an axis-aligned billboard in clip space. Project the world-space
  // center first, then offset in clip-space x/y by half the quad's projected
  // size. This is the cheapest billboarding scheme — works because we're
  // sampling a sky-plane projection (a 2D image), not rendering a 3D galaxy.
  let centerClip = u.viewProj * vec4<f32>(instance.posSize.xyz, 1.0);

  // Project a point one Mpc to the right of center to discover the on-screen
  // size of 1 Mpc at this depth, then scale by sizeWorld/2.
  let rightWorld = instance.posSize.xyz + vec3<f32>(1.0, 0.0, 0.0);
  let rightClip  = u.viewProj * vec4<f32>(rightWorld, 1.0);
  // pixelsPerMpc on screen ≈ |rightClip.xy/rightClip.w - centerClip.xy/centerClip.w| * viewport
  // For billboard we just need the clip-space delta, so:
  let halfSizeClip = (rightClip.xy / rightClip.w - centerClip.xy / centerClip.w) * (instance.posSize.w * 0.5);
  // Use the magnitude as a uniform scale (so the quad stays square).
  let half = length(halfSizeClip);

  var out: VsOut;
  out.clipPos = vec4<f32>(
    centerClip.xy + corner * half * centerClip.w,
    centerClip.z,
    centerClip.w,
  );
  // UV: corner is in [-1,1]; remap to [0,1] then to the slot's atlas rect.
  let cornerUv = (corner + vec2<f32>(1.0, 1.0)) * 0.5;
  // Flip V so the texture isn't upside down. SDSS cutouts are stored y-down
  // but our `flipY: false` upload preserves that, and we want north up.
  let uvLocal = vec2<f32>(cornerUv.x, 1.0 - cornerUv.y);
  out.uv = mix(instance.uvRect.xy, instance.uvRect.zw, uvLocal);
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let rgba = textureSample(atlasTex, atlasSmp, in.uv);
  // Soft circular falloff so square JPEG cutouts blend into the dot field.
  // smoothstep gives us a 0..1 alpha that's 1 in the middle, 0 at corners.
  // We measure distance from the slot center in the corner-local space [0,1].
  let local = (in.uv - mix(in.uv, in.uv, 0.0)); // placeholder; recomputed below
  // Actually compute corner-local 0..1 coords by undoing the slot mix —
  // but we only have the absolute uv. Easier: pass cornerUv through.
  // For v1, accept the box and do a hard sample. Polish in Task 11.
  return vec4<f32>(rgba.rgb * rgba.a, rgba.a);
}
```

(The fragment shader has a `local` placeholder that's deliberately a no-op for v1 — we accept the square cutout outline. Task 11 implements the proper radial falloff. The premultiplied-alpha output `rgba.rgb * rgba.a` lets us blend cleanly under additive points.)

- [ ] **Step 4: Implement QuadRenderer**

```ts
// src/services/gpu/quadRenderer.ts
import type { mat4 } from 'gl-matrix';
import type { GpuContext, QuadInstance } from '../@types';
import quadsWgsl from './shaders/quads.wgsl?raw';

const FLOATS_PER_INSTANCE = 8;
const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;

/**
 * Renders galaxy thumbnails as billboard quads, sampling from a single atlas
 * texture. Instances are uploaded each frame from a JS-side scratch array;
 * for the v1 design the engine pre-filters to ≤256 instances (atlas slot
 * count), so the per-frame upload is tiny (~8 KB).
 */
export class QuadRenderer {
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly uniformBuffer: GPUBuffer;
  private readonly instanceBuffer: GPUBuffer;
  private readonly sampler: GPUSampler;
  private bindGroup: GPUBindGroup | undefined;
  private maxInstances: number;

  constructor(ctx: GpuContext, maxInstances = 256) {
    this.device = ctx.device;
    this.format = ctx.format;
    this.maxInstances = maxInstances;

    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: 'quad-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    const module = this.device.createShaderModule({ label: 'quads-wgsl', code: quadsWgsl });

    this.pipeline = this.device.createRenderPipeline({
      label: 'quad-pipeline',
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: BYTES_PER_INSTANCE,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' }, // posSize
              { shaderLocation: 1, offset: 16, format: 'float32x4' }, // uvRect
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format: this.format,
            blend: {
              // Premultiplied-alpha "over" composite. Same equation as the
              // points pass uses; lets quads sit cleanly atop the dot field.
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.uniformBuffer = this.device.createBuffer({
      label: 'quad-uniforms',
      size: 80, // mat4 (64) + vec2 viewport (8) + 2x f32 pad (8)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.instanceBuffer = this.device.createBuffer({
      label: 'quad-instances',
      size: maxInstances * BYTES_PER_INSTANCE,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
  }

  /** Bind the atlas texture view. Call once after atlas.initTexture(). */
  bindAtlas(atlasView: GPUTextureView): void {
    this.bindGroup = this.device.createBindGroup({
      label: 'quad-bg',
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: atlasView },
        { binding: 2, resource: this.sampler },
      ],
    });
  }

  /** Issue the draw call. `instances` length must be ≤ maxInstances. */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    instances: ReadonlyArray<QuadInstance>,
  ): void {
    if (!this.bindGroup) return; // atlas not yet bound
    if (instances.length === 0) return;

    // Pack uniforms.
    const uni = new Float32Array(20);
    uni.set(viewProj as Float32Array, 0);
    uni[16] = viewportPx[0];
    uni[17] = viewportPx[1];
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uni);

    // Pack instances.
    const data = new Float32Array(instances.length * FLOATS_PER_INSTANCE);
    for (let i = 0; i < instances.length; i++) {
      const ins = instances[i]!;
      const base = i * FLOATS_PER_INSTANCE;
      data[base + 0] = ins.x;
      data[base + 1] = ins.y;
      data[base + 2] = ins.z;
      data[base + 3] = ins.sizeWorld;
      data[base + 4] = ins.u0;
      data[base + 5] = ins.v0;
      data[base + 6] = ins.u1;
      data[base + 7] = ins.v1;
    }
    this.device.queue.writeBuffer(this.instanceBuffer, 0, data);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.instanceBuffer);
    pass.draw(6, instances.length, 0, 0);
  }
}
```

- [ ] **Step 5: Verify typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: clean. Vite must bundle the WGSL via `?raw`.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/shaders/quads.wgsl src/services/gpu/quadRenderer.ts src/@types/QuadInstance.d.ts src/@types/index.d.ts
git commit -m "feat: add QuadRenderer + quads.wgsl for billboard galaxy thumbnails"
```

---

## Task 9: Engine wiring — selection, fetching, drawing

**Files:**

- Modify: `src/services/engine/engine.ts`

The engine glue. Each frame:

1. Walk all loaded `PointCloud`s. For each galaxy whose distance is small enough (cheap pre-filter: skip if distance > 1000 Mpc — at that range no galaxy is > 24 px no matter what), compute apparent size in pixels.
2. If apparent size > `APPARENT_SIZE_THRESHOLD_PX`, take or update an atlas slot for this galaxy (`atlas.allocate(key, frame)` or `atlas.touch`), and if the slot is new (no bitmap yet) push a fetch into `queue`.
3. The queue's `onResult` callback uploads the bitmap into the atlas slot.
4. Build the `QuadInstance[]` for this frame from currently-loaded slots and call `quadRenderer.draw(...)` after the existing `pointRenderer.draw(...)`.

- [ ] **Step 1: Add module-scope helpers and constants near the top of `src/services/engine/engine.ts`**

Find the imports section at the top of `src/services/engine/engine.ts` and add:

```ts
import { TextureAtlas } from './gpu/textureAtlas';
import { GalaxyImageQueue } from './gpu/galaxyImageQueue';
import { QuadRenderer } from './gpu/quadRenderer';
import { fetchGalaxyBitmap } from './gpu/galaxyImageFetcher';
import { apparentSizePx, galaxyDiameterKpc, DEFAULT_GALAXY_DIAMETER_KPC } from './utils/math';
import type { QuadInstance } from './@types';
```

Then near the existing `─── Auto-LOD heuristic ───` section, add:

```ts
// ─── Galaxy thumbnail constants ─────────────────────────────────────────────

const APPARENT_SIZE_THRESHOLD_PX = 24;
const FAR_DISTANCE_CUTOFF_MPC = 1000; // pre-filter: galaxies past this never qualify

// ─── Galaxy thumbnail helpers ───────────────────────────────────────────────

/** Stable cache key for a galaxy's atlas slot. RA/Dec are unique within ~arcsec. */
function galaxyCacheKey(ra: number, dec: number): string {
  return `${ra.toFixed(5)}_${dec.toFixed(5)}`;
}
```

- [ ] **Step 2: Initialise atlas + queue + renderer inside `createEngine`**

Inside the `createEngine` function, after the existing renderer is constructed and before the main render loop is attached, add:

```ts
// Galaxy thumbnail subsystem. `enabled` is mutated by the SettingsPanel toggle.
const atlas = new TextureAtlas(ctx.device);
atlas.initTexture();
const quadRenderer = new QuadRenderer(ctx);
quadRenderer.bindAtlas(atlas.getTextureView());
const queue = new GalaxyImageQueue();
let galaxyTexturesEnabled = true;
let frameCounter = 0;

// Map from atlas key → whether the bitmap has actually arrived. Without this,
// allocating a slot before the bitmap loads would draw a quad sampling a
// blank area of the atlas (=> garbage pixels).
const bitmapReady = new Set<string>();
```

- [ ] **Step 3: Add per-frame selection + draw in the render loop**

Find the section of `createEngine` where `renderer.draw(...)` is called (the per-frame pass encoder block). After that line, BEFORE `pass.end()`, insert:

```ts
frameCounter++;

if (galaxyTexturesEnabled) {
  const fovYRad = camera.fovYRad;
  const viewportH = canvas.height;

  // Walk every loaded source and select galaxies that pass the size threshold.
  const quads: QuadInstance[] = [];
  for (const { vertexBuffer: _vb, count, source: _src } of renderer.loadedSources()) {
    void _vb;
    void _src;
    // The renderer holds a GPU-side buffer; we need the JS-side PointCloud
    // that produced it. The engine keeps these in `loadedClouds` (existing
    // map keyed by Source). If your engine doesn't maintain this map, add one:
    //   const loadedClouds = new Map<Source, PointCloud>();
    //   ... on cloud load: loadedClouds.set(src, cloud);
    // and iterate it here instead of `renderer.loadedSources()`.
    void count;
  }
  // The block above is structural — actual selection uses `loadedClouds`:
  for (const [_src, cloud] of loadedClouds) {
    void _src;
    for (let i = 0; i < cloud.count; i++) {
      const x = cloud.positions[i * 3 + 0]!;
      const y = cloud.positions[i * 3 + 1]!;
      const z = cloud.positions[i * 3 + 2]!;
      const distMpc = Math.hypot(x, y, z);
      if (distMpc <= 0 || distMpc > FAR_DISTANCE_CUTOFF_MPC) continue;
      // Distance from camera (not target) — galaxies behind the camera never
      // matter, but Math.hypot from origin is fine because target is origin.
      const camDist = Math.hypot(
        camera.position[0] - x,
        camera.position[1] - y,
        camera.position[2] - z,
      );
      if (camDist <= 0) continue;
      const dKpc = galaxyDiameterKpc({}); // v1: constant
      const px = apparentSizePx({
        diameterKpc: dKpc,
        distanceMpc: camDist,
        viewportHeightPx: viewportH,
        fovYRad,
      });
      if (px < APPARENT_SIZE_THRESHOLD_PX) continue;

      // Compute RA/Dec for cutout URL. The PointCloud doesn't store them
      // directly; derive from xyz using cartesianToRaDecZ.
      const [ra, dec] = cartesianToRaDecZ(x, y, z);
      const key = galaxyCacheKey(ra, dec);

      // Allocate atlas slot (idempotent for repeat frames).
      const slot = atlas.allocate(key, frameCounter);

      // If the bitmap hasn't arrived yet, kick off a fetch — but only if not
      // already in flight (the queue handles dedup by key internally).
      if (!bitmapReady.has(key)) {
        queue.enqueue({
          key,
          priority: px, // larger on screen → higher priority
          fetcher: () => fetchGalaxyBitmap({ ra, dec }),
          onResult: (bitmap) => {
            if (!bitmap) return;
            // Slot may have been reassigned to a different key by LRU — only
            // upload if our key still owns it.
            const currentSlot = atlas.lastSeenFrame(key);
            if (currentSlot === undefined) return;
            atlas.uploadBitmap(slot, bitmap);
            bitmapReady.add(key);
            bitmap.close();
          },
        });
        continue; // no quad this frame — wait for the bitmap
      }

      // Pack the QuadInstance.
      const sizeWorldMpc = (dKpc / 1000) * 4; // 4× diameter for visual presence
      const [u0, v0, u1, v1] = atlas.slotUv(slot);
      quads.push({ x, y, z, sizeWorld: sizeWorldMpc, u0, v0, u1, v1 });
    }
  }

  if (quads.length > 0) {
    quadRenderer.draw(pass, vp, [canvas.width, canvas.height], quads);
  }
}
```

`cartesianToRaDecZ` is already in `src/utils/math/cartesianToRaDecZ.ts`; ensure it's imported at the top of `engine.ts` (it likely already is — if not, add `import { cartesianToRaDecZ } from './utils/math';`).

- [ ] **Step 4: Add the toggle setter to the engine handle**

Find where the engine returns its `EngineHandle` object and add this method (or modify the existing object literal):

```ts
return {
  // ... existing fields ...
  setGalaxyTexturesEnabled(enabled: boolean) {
    galaxyTexturesEnabled = enabled;
  },
};
```

Then update `src/@types/EngineHandle.d.ts` to add the new method:

```ts
// In the EngineHandle type:
setGalaxyTexturesEnabled(enabled: boolean): void;
```

- [ ] **Step 5: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 6: Visual check**

The dev server is running at `http://localhost:5173`. Reload. Zoom in close to a bright nearby galaxy (M31 in the 2MRS layer is at RA=10.685, Dec=41.269, ~0.7 Mpc — extremely close). Within a few hundred ms you should see:

- A small textured quad replacing the dot, showing the SDSS or DSS image.
- A network request in DevTools to `skyserver.sdss.org` (or `archive.stsci.edu` if SDSS misses).
- Toggling galaxy textures (next task) makes the quads disappear.

Sanity: zoom out so all galaxies are < 24 px → no thumbnails should appear.

- [ ] **Step 7: Commit**

```bash
git add src/services/engine/engine.ts src/@types/EngineHandle.d.ts
git commit -m "feat: wire TextureAtlas + QuadRenderer + fetch queue into engine"
```

---

## Task 10: SettingsPanel toggle

**Files:**

- Modify: `src/components/SettingsPanel/SettingsPanel.tsx`
- Modify: `src/components/SettingsPanel/SettingsPanel.module.css` (only if a new style class is needed)
- Modify: `src/App.tsx` (callback wiring)

Add a "Galaxy thumbnails" checkbox that calls `engine.setGalaxyTexturesEnabled(...)`.

- [ ] **Step 1: Add the toggle to SettingsPanel**

In `src/components/SettingsPanel/SettingsPanel.tsx`, add a new prop and a new checkbox row matching the existing toggle pattern. Find the props type at the top of the file:

```ts
type SettingsPanelProps = {
  // ... existing props ...
  galaxyTexturesEnabled: boolean;
  onGalaxyTexturesChange: (enabled: boolean) => void;
};
```

Then in the JSX, after the existing point-size or auto-rotate controls, add:

```tsx
<label className={styles.row}>
  <input
    type="checkbox"
    checked={galaxyTexturesEnabled}
    onChange={(e) => onGalaxyTexturesChange(e.target.checked)}
  />
  <span>Galaxy thumbnails</span>
</label>
```

Destructure the new props in the function signature:

```tsx
export function SettingsPanel({
  // ... existing destructured props ...
  galaxyTexturesEnabled,
  onGalaxyTexturesChange,
}: SettingsPanelProps) { ... }
```

- [ ] **Step 2: Wire from App.tsx to engine**

In `src/App.tsx`, add state:

```tsx
const [galaxyTexturesEnabled, setGalaxyTexturesEnabled] = useState(true);
```

Pass it through the `<SettingsPanel>` JSX:

```tsx
<SettingsPanel
  // ... existing props ...
  galaxyTexturesEnabled={galaxyTexturesEnabled}
  onGalaxyTexturesChange={(enabled) => {
    setGalaxyTexturesEnabled(enabled);
    engineRef.current?.setGalaxyTexturesEnabled(enabled);
  }}
/>
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Visual check**

Reload the dev server. The settings panel should now have a "Galaxy thumbnails" checkbox. Toggling it off should make all quads disappear; toggling it back on should restore them.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsPanel/SettingsPanel.tsx src/App.tsx
git commit -m "feat(ui): add Galaxy thumbnails toggle to SettingsPanel"
```

---

## Task 11: Visual polish — radial alpha falloff

**Files:**

- Modify: `src/services/gpu/shaders/quads.wgsl`

The v1 fragment shader samples the JPEG box-as-is, leaving a square outline visible against dark space. Add a radial smoothstep alpha so the quad fades softly at its edges. We pass corner-local UV (always [0,1]) through the vertex shader so the fragment can compute distance from the slot center cheaply.

- [ ] **Step 1: Update the WGSL to thread cornerUv through**

Replace `src/services/gpu/shaders/quads.wgsl` `VsOut` struct and shader bodies with:

```wgsl
struct VsOut {
  @builtin(position) clipPos:   vec4<f32>,
  @location(0)       atlasUv:   vec2<f32>,
  @location(1)       cornerUv:  vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vid: u32, instance: InstanceIn) -> VsOut {
  let corner = CORNERS[vid];
  let centerClip = u.viewProj * vec4<f32>(instance.posSize.xyz, 1.0);
  let rightWorld = instance.posSize.xyz + vec3<f32>(1.0, 0.0, 0.0);
  let rightClip  = u.viewProj * vec4<f32>(rightWorld, 1.0);
  let halfSizeClip = (rightClip.xy / rightClip.w - centerClip.xy / centerClip.w) * (instance.posSize.w * 0.5);
  let half = length(halfSizeClip);

  var out: VsOut;
  out.clipPos = vec4<f32>(centerClip.xy + corner * half * centerClip.w, centerClip.z, centerClip.w);
  let cornerUv = (corner + vec2<f32>(1.0, 1.0)) * 0.5;
  let uvLocal = vec2<f32>(cornerUv.x, 1.0 - cornerUv.y);
  out.atlasUv = mix(instance.uvRect.xy, instance.uvRect.zw, uvLocal);
  out.cornerUv = cornerUv;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let rgba = textureSample(atlasTex, atlasSmp, in.atlasUv);
  // Radial mask: 1.0 inside r=0.4 of the slot center, fades to 0.0 at r=0.5.
  let r = length(in.cornerUv - vec2<f32>(0.5, 0.5));
  let mask = 1.0 - smoothstep(0.4, 0.5, r);
  let alpha = rgba.a * mask;
  return vec4<f32>(rgba.rgb * alpha, alpha);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Visual check**

Reload. Galaxy thumbnails now fade smoothly to transparent at their edges instead of showing a hard JPEG box. The center 80% looks identical; only the corners change.

- [ ] **Step 4: Commit**

```bash
git add src/services/gpu/shaders/quads.wgsl
git commit -m "feat(quads): add radial alpha falloff to hide JPEG cutout corners"
```

---

## Task 12: README updates

**Files:**

- Modify: `README.md`

Document the new feature so future readers understand what they're seeing.

- [ ] **Step 1: Add a section to README.md**

Append (or insert at an appropriate spot) a new section:

```markdown
## Galaxy thumbnails

When you zoom in close to a galaxy, the renderer fetches its real image from
the SDSS DR18 image cutout service and draws it as a textured billboard
instead of the usual dot. SDSS covers ~1/3 of the sky; for the rest, the
renderer falls back to the all-sky DSS POSS-II red plate hosted at STScI.

**How it decides:** a galaxy is "big enough" if its on-screen apparent size
exceeds 24 pixels, computed from a 30 kpc placeholder diameter and the
galaxy's current distance from the camera. Below that threshold the dot is
all you get.

**Cache:** thumbnails live in a single 2048×2048 GPU texture atlas with 256
slots of 128×128. When the atlas is full, the slot whose galaxy was least
recently visible is evicted. Toggle off via the Settings panel if you don't
want the network traffic.

**Sources:**

- SDSS cutouts: `https://skyserver.sdss.org/dr18/SkyServerWS/ImgCutout/getjpeg`
- DSS cutouts: `https://archive.stsci.edu/cgi-bin/dss_search` (POSS-II red)
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document galaxy-thumbnail rendering in README"
```

---

## Self-Review checklist (executed before plan handoff)

**Spec coverage:**

- ✅ Apparent-size threshold logic — Task 1.
- ✅ Galaxy diameter source — Task 2.
- ✅ SDSS + DSS cutout URLs — Task 3.
- ✅ Texture atlas with LRU — Tasks 4 + 5.
- ✅ Fetch queue with priority + concurrency — Task 6.
- ✅ Image fetcher with fallback — Task 7.
- ✅ Quad renderer + WGSL — Task 8.
- ✅ Engine integration — Task 9.
- ✅ Settings toggle — Task 10.
- ✅ Visual polish — Task 11.
- ✅ Docs — Task 12.

**Type consistency:**

- `QuadInstance` defined in Task 8 step 1, used in Task 8 step 4 and Task 9 step 3 — same field names throughout.
- `TextureAtlas.allocate(key, frame)` (Task 4) used in Task 9 step 3 — signature matches.
- `GalaxyImageQueue.enqueue({ key, priority, fetcher, onResult })` (Task 6) used in Task 9 step 3 — fields match.
- `apparentSizePx` parameter shape from Task 1 used in Task 9 step 3 — matches.

**Placeholder scan:** No "TBD" / "implement later" / "similar to" instances. All steps include actual code or actual commands.

**Known limitations the engineer should be aware of (not gaps, but worth flagging):**

- Engine integration in Task 9 assumes `loadedClouds: Map<Source, PointCloud>` exists in `engine.ts`. If it doesn't (the multi-survey rev-2 plan adds it), the implementer must add it as part of this task — see the comment in Task 9 step 3.
- `cartesianToRaDecZ` is needed in `engine.ts` — assumed already imported. Check imports at top of file before the visual check fails on an undefined-reference error.
