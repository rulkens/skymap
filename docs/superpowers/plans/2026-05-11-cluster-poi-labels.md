# Cluster POI labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show named labels for well-known galaxy clusters (Virgo, Coma, Perseus, Norma/Great Attractor, Hercules, Shapley) in the 3D view behind a `?anchors=1` URL flag, so the operator can visually cross-reference whether the CF-4 DM density cube aligns with known large-scale structure.

**Architecture:** Introduce a general `LabelProducer` abstraction so multiple subsystems can contribute labels + marker lines to the renderers without stomping each other. A new `labelDirectorSubsystem` owns the `setLabels`/`setLines` calls and polls registered producers each frame; `youAreHereSubsystem` is refactored from a direct renderer-caller into one such producer, and a new `poiSubsystem` becomes a second producer that holds a typed list of points of interest (cluster, galaxy, void). Cluster anchor data lives in a new `src/data/clusterAnchors.ts` so the existing audit script can DRY against the same source.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, WebGPU label/marker-line renderers (already in place).

**Immutability convention:** Apply to *public API surfaces and type contracts*, relax for *per-frame hot paths*.

- **Always immutable:** type definitions (`readonly` fields, `readonly T[]` arrays), public helper functions (pure, no argument mutation), setter contracts (defensive copy of caller arrays). Caller-visible state replacement: `pois = newPois`, never `pois.push(...)`.
- **Pragmatic mutation allowed:** the director's per-frame merge loop uses a local mutable `Label[]` / `MarkerLine[]` accumulator — pushing into a freshly-allocated local array is the natural shape and avoids per-frame `concat` overhead. Same for the POI subsystem's per-frame label-and-line emission loop. These are internal to a single function call and never escape.
- The existing `Label` and `MarkerLine` types from the renderer don't use `readonly` — don't retrofit them, but treat them as immutable at producer boundaries.

---

## File Map

**Create:**

- `src/data/clusterAnchors.ts` — readonly anchor data + pure `raDecDistToEqCart` helper. Single source of truth for the 6 cluster anchors used by both the audit script and the runtime POI subsystem.
- `src/services/engine/subsystems/labelProducer.ts` — `LabelProducer` + `LabelProducerOutput` type definitions only. No runtime code.
- `src/services/engine/subsystems/labelDirectorSubsystem.ts` — closure factory that owns `labelRenderer` + `markerLineRenderer` references, accepts registered producers, polls them each frame, merges results, and calls `setLabels`/`setLines` once per frame with a skip-on-no-change optimisation.
- `src/services/engine/subsystems/poiSubsystem.ts` — closure factory that holds a readonly POI list keyed by id, exposes `setPois` / `clearPois` / `setCategoryVisible`, and implements `produceLabels` against per-category default styling.
- `tests/data/clusterAnchors.test.ts` — vitest covering the RA/Dec → equatorial-Cartesian helper at known cluster positions.
- `tests/services/engine/subsystems/labelDirectorSubsystem.test.ts` — vitest covering producer registration, merge behaviour, skip-on-no-change, and null-renderer guard.
- `tests/services/engine/subsystems/poiSubsystem.test.ts` — vitest covering `setPois` immutability, category visibility filtering, and label/crosshair generation.

**Modify:**

- `src/services/engine/subsystems/youAreHereSubsystem.ts` — replace `runFrame` / `attachRenderers` with `produceLabels`. The subsystem no longer holds renderer refs.
- `tests/services/engine/subsystems/youAreHereSubsystem.test.ts` — update assertions to read the `LabelProducerOutput` return value instead of mock-renderer call args.
- `src/@types/EngineState.d.ts` — register `labelDirector` and `pois` on `state.subsystems`.
- `src/services/engine/engine.ts` — instantiate `labelDirectorSubsystem` + `poiSubsystem` in the subsystems literal; register `youAreHere` and `pois` as producers with the director.
- `src/services/engine/phases/initGpu.ts` — call `labelDirector.attachRenderers(...)` instead of `youAreHere.attachRenderers(...)`.
- `src/services/engine/frame/runFrame.ts` — call `labelDirector.runFrame(state, ctx)` instead of `youAreHere.runFrame(state, ctx)`.
- `src/services/engine/phases/wireSlots.ts` — read `?anchors=1` URL flag and push the cluster anchor set into `poiSubsystem` at startup (alongside the existing `?volumes=1` gating).
- `tools/auditCf4Anchors.ts` — import `CLUSTER_ANCHORS` and `raDecDistToEqCart` from `src/data/clusterAnchors.ts` (DRY).

---

## Task 1: Cluster anchor data + RA/Dec helper

Pure data module + a single pure conversion function. No engine surface touched.

**Files:**
- Create: `src/data/clusterAnchors.ts`
- Test: `tests/data/clusterAnchors.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/data/clusterAnchors.test.ts
import { describe, expect, it } from 'vitest';
import {
  CLUSTER_ANCHORS,
  raDecDistToEqCart,
  type ClusterAnchor,
} from '../../src/data/clusterAnchors';

describe('raDecDistToEqCart', () => {
  it('places Virgo at the expected equatorial Cartesian position', () => {
    // Virgo (M87): RA 12h 30m 49s ≈ 12.5136 h → 187.704° → 3.276 rad.
    // Dec +12° 23′ ≈ 12.383°. Distance 16.5 Mpc.
    // Expected eq-Cart ≈ (-15.98, -2.13, 3.54) Mpc.
    const [x, y, z] = raDecDistToEqCart({
      raHours: 12 + 30 / 60 + 49 / 3600,
      decDeg: 12 + 23 / 60,
      distMpc: 16.5,
    });
    expect(x).toBeCloseTo(-15.98, 1);
    expect(y).toBeCloseTo(-2.13, 1);
    expect(z).toBeCloseTo(3.54, 1);
    // Round-trip distance check.
    expect(Math.hypot(x, y, z)).toBeCloseTo(16.5, 4);
  });

  it('places a north pole anchor at +Z', () => {
    const [x, y, z] = raDecDistToEqCart({ raHours: 0, decDeg: 90, distMpc: 10 });
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(10, 6);
  });
});

describe('CLUSTER_ANCHORS', () => {
  it('exposes exactly the 6 well-known clusters', () => {
    expect(CLUSTER_ANCHORS).toHaveLength(6);
    const names = CLUSTER_ANCHORS.map((a) => a.name);
    expect(names).toContain('Virgo (M87)');
    expect(names).toContain('Coma (A1656)');
    expect(names).toContain('Perseus (A426)');
    expect(names).toContain('Norma / Great Attractor');
    expect(names).toContain('Hercules (A2151)');
    expect(names).toContain('Shapley (A3558)');
  });

  it('every anchor has a positive distance', () => {
    for (const a of CLUSTER_ANCHORS) {
      expect(a.distMpc).toBeGreaterThan(0);
    }
  });

  it('is a readonly tuple at the type level', () => {
    // This compiles only if CLUSTER_ANCHORS is `readonly ClusterAnchor[]`.
    const _check: readonly ClusterAnchor[] = CLUSTER_ANCHORS;
    expect(_check).toBe(CLUSTER_ANCHORS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/data/clusterAnchors.test.ts
```
Expected: FAIL with `Cannot find module '../../src/data/clusterAnchors'`.

- [ ] **Step 3: Create the data module**

```typescript
// src/data/clusterAnchors.ts
/**
 * clusterAnchors — fixed table of well-known galaxy-cluster centres,
 * with a pure RA/Dec/distance → equatorial-Cartesian helper.
 *
 * ### Why a separate module?
 *
 * Two consumers need the same numbers:
 *
 *   1.  `tools/auditCf4Anchors.ts` — the one-off CF-4 sanity-check
 *       diagnostic that samples the density cube at each cluster's
 *       expected position.
 *
 *   2.  `services/engine/subsystems/poiSubsystem.ts` — the runtime
 *       label/marker overlay (behind `?anchors=1`) that lets the
 *       operator visually cross-reference the rendered cube against
 *       these same anchors.
 *
 * Keeping the table here means a future addition (or a distance
 * revision based on better catalog data) updates both call sites
 * atomically.
 *
 * ### Coordinate convention
 *
 * RA in HOURS (not degrees), Dec in DEGREES, distance in Mpc.  The
 * helper converts to equatorial Cartesian Mpc with the standard
 * right-handed convention: +X toward RA=0/Dec=0 (vernal equinox),
 * +Y toward RA=6h/Dec=0, +Z toward Dec=+90° (north celestial pole).
 * This matches the frame used by every PointCloud and the filament
 * binary, so anchor positions drop directly into world-space.
 *
 * Distances are best-effort consensus values from NED + simbad; small
 * (±10%) discrepancies are common in the literature and don't affect
 * the audit's pass/fail percentile.
 */

/** Right-ascension hours, declination degrees, distance in Mpc. */
export type SkyCoord = {
  readonly raHours: number;
  readonly decDeg: number;
  readonly distMpc: number;
};

/** A named cluster anchor — sky coord + display label. */
export type ClusterAnchor = SkyCoord & {
  readonly name: string;
};

/**
 * Convert (RA hours, Dec degrees, distance Mpc) → equatorial-Cartesian
 * Mpc.  Pure; no dependencies on any other module.
 *
 * Standard astronomical right-handed convention:
 *
 *     x = d · cos(RA) · cos(Dec)
 *     y = d · sin(RA) · cos(Dec)
 *     z = d · sin(Dec)
 *
 * where RA is converted from hours to radians via × 15° × π/180.
 */
export function raDecDistToEqCart(c: SkyCoord): readonly [number, number, number] {
  const RAD = Math.PI / 180;
  const ra = c.raHours * 15 * RAD;
  const dec = c.decDeg * RAD;
  const cd = Math.cos(dec);
  return [c.distMpc * Math.cos(ra) * cd, c.distMpc * Math.sin(ra) * cd, c.distMpc * Math.sin(dec)];
}

/**
 * The six well-known clusters spanning the CF-4 reliable-reconstruction
 * volume.  Listed roughly in increasing distance.
 *
 * Distances are luminosity-distance consensus values; small variations
 * across the literature (Coma sometimes 99, sometimes 102; Shapley
 * 180–220) don't materially shift the audit's percentile ranking.
 */
export const CLUSTER_ANCHORS: readonly ClusterAnchor[] = [
  { name: 'Virgo (M87)',              raHours: 12 + 30 / 60 + 49 / 3600, decDeg:  12 + 23 / 60,    distMpc:  16.5 },
  { name: 'Norma / Great Attractor',  raHours: 16 + 15 / 60,             decDeg: -(60 + 54 / 60),  distMpc:  70   },
  { name: 'Perseus (A426)',           raHours:  3 + 19 / 60 + 48 / 3600, decDeg:  41 + 31 / 60,    distMpc:  75   },
  { name: 'Coma (A1656)',             raHours: 12 + 59 / 60 + 49 / 3600, decDeg:  27 + 59 / 60,    distMpc: 100   },
  { name: 'Hercules (A2151)',         raHours: 16 +  5 / 60 + 15 / 3600, decDeg:  17 + 45 / 60,    distMpc: 158   },
  { name: 'Shapley (A3558)',          raHours: 13 + 27 / 60 + 57 / 3600, decDeg: -(31 + 30 / 60),  distMpc: 200   },
];
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/data/clusterAnchors.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Update the audit script to DRY against the new module**

Edit `tools/auditCf4Anchors.ts` to import from the new module instead of holding a local copy. Replace the local `Anchor` type and `ANCHORS` constant with imports, and replace the local `anchorToEqCart` with `raDecDistToEqCart`. Keep the audit script otherwise unchanged.

```typescript
// At the top of tools/auditCf4Anchors.ts, replace the local Anchor type
// and ANCHORS array with:
import { CLUSTER_ANCHORS, raDecDistToEqCart, type ClusterAnchor } from '../src/data/clusterAnchors';

// Remove the local `anchorToEqCart` helper and the `ANCHORS` constant.
// In the main loop, change:
//   const eq = anchorToEqCart(a);
// to:
//   const eq = raDecDistToEqCart(a);
// And rename the type `Anchor` to `ClusterAnchor` at usage sites (or
// inline-alias if simpler).  The script's behaviour is unchanged; this
// is purely a DRY refactor that keeps the runtime overlay and the
// diagnostic on the same numbers.
```

- [ ] **Step 6: Verify the audit script still runs end-to-end**

```bash
npx tsx tools/auditCf4Anchors.ts | head -20
```
Expected: same output as before — `Loaded 128x128x128 <f8 cube` line followed by anchor percentile listings.

- [ ] **Step 7: Commit**

```bash
git checkout -b cluster-poi-labels
git add src/data/clusterAnchors.ts tests/data/clusterAnchors.test.ts tools/auditCf4Anchors.ts
git commit -m "$(cat <<'EOF'
feat(data): extract cluster anchors into reusable module

The CF-4 audit script and the upcoming POI label subsystem both need
the same 6 cluster positions. Put them behind a single readonly
source with a pure RA/Dec → equatorial-Cartesian helper, and DRY the
audit script against it.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: LabelProducer type contract

Pure type definitions — no runtime code. This task defines the interface that Task 3 (refactored youAreHere) and Task 5 (poi) both implement, and that Task 4 (director) consumes. No test file; types are exercised by Tasks 3-5's tests.

**Files:**
- Create: `src/services/engine/subsystems/labelProducer.ts`

- [ ] **Step 1: Create the type module**

```typescript
// src/services/engine/subsystems/labelProducer.ts
/**
 * labelProducer — type contract for any subsystem that contributes
 * labels and marker lines to the shared label/marker-line renderers.
 *
 * ### Why a shared contract?
 *
 * `LabelRenderer.setLabels` and `MarkerLineRenderer.setLines` both
 * REPLACE the full set on each call; two subsystems calling them
 * directly would stomp each other.  The director pattern
 * (`labelDirectorSubsystem`) merges contributions from multiple
 * producers and flushes once per frame.  Producers don't hold renderer
 * references — they just return what they want to show on the next
 * frame.
 *
 * ### Why `awake`?
 *
 * Render-on-demand is the project's policy.  Some producers
 * (`youAreHereSubsystem`) want the render loop to stay awake while an
 * internal animation is mid-transition.  The director ORs the `awake`
 * flag across producers and calls `scheduler.requestRender()` once if
 * any want a continuation.
 *
 * ### Immutability
 *
 * Outputs are `readonly` arrays; the director MAY shallow-copy them
 * into the renderer's mutable array slot, but the producer treats
 * the returned arrays as frozen.  Each call to `produceLabels` returns
 * a fresh object — no caching, no shared references between frames.
 */

import type { Label } from '../../gpu/renderers/labelRenderer';
import type { MarkerLine } from '../../gpu/renderers/markerLineRenderer';
import type { ReadyFrameContext } from '../frame/frameContext';
import type { EngineState } from '../../../@types';

/** What a single producer wants to render on the next frame. */
export type LabelProducerOutput = {
  readonly labels: readonly Label[];
  readonly lines: readonly MarkerLine[];
  /**
   * If true, the director should request a continuation render this frame
   * (mid-transition animation needs the loop to stay awake).  Defaults
   * to false; producers only opt in when their state is genuinely
   * evolving frame-to-frame.
   */
  readonly awake: boolean;
};

/** A subsystem that contributes label + marker-line content. */
export type LabelProducer = {
  /** Stable identifier — used for debugging and de-duplication. */
  readonly id: string;
  /** Per-frame entry point.  Pure of state; reads `state`, returns fresh output. */
  produceLabels(state: EngineState, ctx: ReadyFrameContext): LabelProducerOutput;
};
```

- [ ] **Step 2: Verify the type module compiles**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep labelProducer || echo "OK — no errors in labelProducer.ts"
```
Expected: `OK — no errors in labelProducer.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/services/engine/subsystems/labelProducer.ts
git commit -m "$(cat <<'EOF'
feat(subsystems): add LabelProducer type contract

Defines the interface that youAreHere + poi subsystems will both
implement, so a future director can merge their outputs into a
single setLabels/setLines call per frame.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Refactor youAreHereSubsystem to a producer

Convert the existing subsystem from "owns renderers + calls setLabels directly" to "implements `LabelProducer`". Renderer ownership moves to the director (Task 4). The subsystem keeps its internal `prevAlpha` mutable cell — this is genuinely per-frame derived state and reflects the existing "minimize state to a thin shell" memory — but loses the `attachRenderers` method entirely.

**Files:**
- Modify: `src/services/engine/subsystems/youAreHereSubsystem.ts`
- Modify: `tests/services/engine/subsystems/youAreHereSubsystem.test.ts`

- [ ] **Step 1: Rewrite the test to assert on the producer output**

Replace the existing test file with:

```typescript
// tests/services/engine/subsystems/youAreHereSubsystem.test.ts
import { describe, expect, it } from 'vitest';
import { createYouAreHereSubsystem } from '../../../../src/services/engine/subsystems/youAreHereSubsystem';
import type { ReadyFrameContext } from '../../../../src/services/engine/frame/frameContext';
import type { EngineState } from '../../../../src/@types';

// A skeletal state with just the scheduler stub — the subsystem only
// touches state.subsystems.scheduler.requestRender when alpha is
// mid-transition.
function makeState(): EngineState {
  return {
    subsystems: {
      scheduler: { requestRender: () => {} },
    },
  } as unknown as EngineState;
}

function makeCtx(x: number, y: number, z: number): ReadyFrameContext {
  return { drawCamPos: [x, y, z] } as unknown as ReadyFrameContext;
}

describe('youAreHereSubsystem (producer form)', () => {
  it('returns empty output when camera is far from origin', () => {
    const sub = createYouAreHereSubsystem();
    const out = sub.produceLabels(makeState(), makeCtx(1000, 0, 0));
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
    expect(out.awake).toBe(false);
  });

  it('returns one label and one line at the origin', () => {
    const sub = createYouAreHereSubsystem();
    const out = sub.produceLabels(makeState(), makeCtx(0, 0, 0));
    expect(out.labels).toHaveLength(1);
    expect(out.lines).toHaveLength(1);
    expect(out.labels[0]!.text).toBe('You are here');
  });

  it('exposes an "awake" flag during the alpha mid-transition', () => {
    const sub = createYouAreHereSubsystem();
    // A position inside the fade band — `youAreHereAlpha` should return
    // a value in (0, 1).  Exact distance depends on the fade band's
    // tuning; this test only asserts that SOME mid-transition position
    // exists.  If the helper returns only 0 or 1 across the band,
    // refine the input.
    let sawAwake = false;
    for (const r of [0.1, 0.3, 0.5, 0.8, 1.1, 1.5, 2.0]) {
      const out = sub.produceLabels(makeState(), makeCtx(r, 0, 0));
      if (out.awake) {
        sawAwake = true;
        break;
      }
    }
    expect(sawAwake).toBe(true);
  });

  it('has stable id "you-are-here"', () => {
    const sub = createYouAreHereSubsystem();
    expect(sub.id).toBe('you-are-here');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/services/engine/subsystems/youAreHereSubsystem.test.ts
```
Expected: FAIL — `produceLabels` doesn't exist; `id` doesn't exist; `attachRenderers` may still be expected.

- [ ] **Step 3: Rewrite the subsystem**

Replace `src/services/engine/subsystems/youAreHereSubsystem.ts` with the producer form. Key changes from the existing file: drop `attachRenderers`, drop the labelRenderer/lineRenderer closure variables, drop the `prevAlpha === alpha` skip (the director handles change detection now), expose `produceLabels` returning `LabelProducerOutput`, and add the `id` field. Replace `runFrame`/`attachRenderers` exports with the new shape.

```typescript
/**
 * youAreHereSubsystem — produces the "YOU ARE HERE" marker label + line
 * for the current frame.  Implements LabelProducer; renderer ownership
 * has moved to labelDirectorSubsystem (which calls produceLabels each
 * frame, merges results from all producers, and flushes once).
 *
 * ### Why the producer pattern?
 *
 * `LabelRenderer.setLabels` and `MarkerLineRenderer.setLines` both REPLACE
 * the full set; for the renderers to host multiple independent overlays
 * (the "you are here" pin, cluster anchors, future void/galaxy labels),
 * someone has to merge the per-frame contributions.  That responsibility
 * lives in `labelDirectorSubsystem`; this file is now just a pure-ish
 * function of camera distance.
 *
 * ### Why the prev-alpha skip is gone
 *
 * The previous implementation cached `prevAlpha` and short-circuited the
 * setLabels/setLines calls when alpha hadn't changed.  The director
 * handles change detection across the merged label set (hashing or
 * deep-compare), so per-producer caching here would be redundant and
 * couple the producer to assumptions about the director's strategy.
 * `produceLabels` is now cheap enough to call every frame.
 */

import type { Label } from '../../gpu/renderers/labelRenderer';
import type { MarkerLine } from '../../gpu/renderers/markerLineRenderer';
import type { ReadyFrameContext } from '../frame/frameContext';
import type { EngineState } from '../../../@types';
import type { LabelProducer, LabelProducerOutput } from './labelProducer';
import { youAreHereAlpha } from '../../gpu/labels/youAreHereVisibility';

const LABEL_TEXT = 'You are here';
const LABEL_ANCHOR_MPC = 0.05;
const LINE_TOP_MPC = LABEL_ANCHOR_MPC * 0.75;
const LABEL_COLOR: readonly [number, number, number, number] = [1, 1, 1, 1];
const LINE_COLOR: readonly [number, number, number, number] = [0.85, 0.85, 0.85, 1];

export type YouAreHereSubsystem = LabelProducer;

export function createYouAreHereSubsystem(): YouAreHereSubsystem {
  function produceLabels(_state: EngineState, ctx: ReadyFrameContext): LabelProducerOutput {
    const camDist = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    const alpha = youAreHereAlpha(camDist);
    if (alpha <= 0) return { labels: [], lines: [], awake: false };

    const labels: readonly Label[] = [
      {
        id: 'you-are-here',
        worldPos: [0, LABEL_ANCHOR_MPC, 0],
        text: LABEL_TEXT,
        pixelSize: 18,
        color: [...LABEL_COLOR],
        worldEmMpc: 0.005,
        fadeAlpha: alpha,
        alignX: 'center',
      },
    ];
    const lines: readonly MarkerLine[] = [
      {
        id: 'you-are-here',
        fromWorld: [0, 0, 0],
        toWorld: [0, LINE_TOP_MPC, 0],
        pixelWidth: 3,
        color: [...LINE_COLOR],
        fadeAlpha: alpha,
      },
    ];
    return { labels, lines, awake: alpha > 0 && alpha < 1 };
  }

  return { id: 'you-are-here', produceLabels };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/services/engine/subsystems/youAreHereSubsystem.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify no other call sites are broken yet (they will be in Task 6)**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "youAreHere|attachRenderers" | head -10
```
Expected: errors at `engine.ts`, `initGpu.ts`, `runFrame.ts` — these are the sites Task 6 fixes. Note them and proceed.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/subsystems/youAreHereSubsystem.ts tests/services/engine/subsystems/youAreHereSubsystem.test.ts
git commit -m "$(cat <<'EOF'
refactor(youAreHere): convert to LabelProducer

Drops the direct setLabels/setLines path; produceLabels returns a
fresh LabelProducerOutput each frame instead.  Renderer ownership
moves to labelDirectorSubsystem in the next commit.

Call sites in engine/initGpu/runFrame intentionally break here — the
follow-up commit re-wires them through the director.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: labelDirectorSubsystem

The aggregator. Owns the renderer refs, accepts registered producers, polls them each frame, merges, flushes, requests render-continuation if any producer was awake.

**Files:**
- Create: `src/services/engine/subsystems/labelDirectorSubsystem.ts`
- Test: `tests/services/engine/subsystems/labelDirectorSubsystem.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/services/engine/subsystems/labelDirectorSubsystem.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createLabelDirectorSubsystem } from '../../../../src/services/engine/subsystems/labelDirectorSubsystem';
import type { LabelProducer } from '../../../../src/services/engine/subsystems/labelProducer';
import type { Label } from '../../../../src/services/gpu/renderers/labelRenderer';
import type { MarkerLine } from '../../../../src/services/gpu/renderers/markerLineRenderer';
import type { ReadyFrameContext } from '../../../../src/services/engine/frame/frameContext';
import type { EngineState } from '../../../../src/@types';

function makeState(requestRender: () => void = () => {}): EngineState {
  return { subsystems: { scheduler: { requestRender } } } as unknown as EngineState;
}

function makeCtx(): ReadyFrameContext {
  return { drawCamPos: [0, 0, 0] } as unknown as ReadyFrameContext;
}

function makeProducer(id: string, labels: Label[], lines: MarkerLine[], awake = false): LabelProducer {
  return { id, produceLabels: () => ({ labels, lines, awake }) };
}

function makeLabelStub() {
  return { setLabels: vi.fn(), render: vi.fn(), glyphCount: () => 0, labelCount: () => 0, destroy: vi.fn() };
}
function makeLineStub() {
  return { setLines: vi.fn(), render: vi.fn(), lineCount: () => 0, destroy: vi.fn() };
}

const SAMPLE_LABEL: Label = {
  id: 'sample-label',
  worldPos: [0, 0, 0],
  text: 'x',
  pixelSize: 10,
};
const SAMPLE_LINE: MarkerLine = {
  id: 'sample-line',
  fromWorld: [0, 0, 0],
  toWorld: [1, 0, 0],
  pixelWidth: 1,
  color: [1, 1, 1, 1],
};

describe('labelDirectorSubsystem', () => {
  it('no-ops when renderers are not attached', () => {
    const dir = createLabelDirectorSubsystem();
    dir.registerProducer(makeProducer('p', [SAMPLE_LABEL], [SAMPLE_LINE]));
    expect(() => dir.runFrame(makeState(), makeCtx())).not.toThrow();
  });

  it('merges labels and lines from multiple producers', () => {
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    const a: Label = { ...SAMPLE_LABEL, id: 'a' };
    const b: Label = { ...SAMPLE_LABEL, id: 'b' };
    const la: MarkerLine = { ...SAMPLE_LINE, id: 'la' };
    const lb: MarkerLine = { ...SAMPLE_LINE, id: 'lb' };
    dir.registerProducer(makeProducer('pa', [a], [la]));
    dir.registerProducer(makeProducer('pb', [b], [lb]));

    dir.runFrame(makeState(), makeCtx());
    expect(labelStub.setLabels).toHaveBeenCalledTimes(1);
    expect(labelStub.setLabels).toHaveBeenCalledWith([a, b]);
    expect(lineStub.setLines).toHaveBeenCalledTimes(1);
    expect(lineStub.setLines).toHaveBeenCalledWith([la, lb]);
  });

  it('skips re-uploading the same merged set across frames', () => {
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);
    dir.registerProducer(makeProducer('p', [SAMPLE_LABEL], [SAMPLE_LINE]));

    dir.runFrame(makeState(), makeCtx());
    dir.runFrame(makeState(), makeCtx());
    expect(labelStub.setLabels).toHaveBeenCalledTimes(1);
    expect(lineStub.setLines).toHaveBeenCalledTimes(1);
  });

  it('calls scheduler.requestRender when any producer is awake', () => {
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);
    dir.registerProducer(makeProducer('p', [], [], true));

    const requestRender = vi.fn();
    dir.runFrame(makeState(requestRender), makeCtx());
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('flushes empty when no producers contribute, then skips subsequent empties', () => {
    const dir = createLabelDirectorSubsystem();
    const labelStub = makeLabelStub();
    const lineStub = makeLineStub();
    dir.attachRenderers(labelStub as never, lineStub as never);

    dir.runFrame(makeState(), makeCtx());
    dir.runFrame(makeState(), makeCtx());
    // First call writes []; second call's signature matches, skip.
    expect(labelStub.setLabels).toHaveBeenCalledTimes(1);
    expect(labelStub.setLabels).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/services/engine/subsystems/labelDirectorSubsystem.test.ts
```
Expected: FAIL with `Cannot find module '.../labelDirectorSubsystem'`.

- [ ] **Step 3: Implement the director**

```typescript
// src/services/engine/subsystems/labelDirectorSubsystem.ts
/**
 * labelDirectorSubsystem — owns the labelRenderer + markerLineRenderer
 * setLabels/setLines calls, polling registered LabelProducers each frame
 * and flushing the merged result once.
 *
 * ### Why a director?
 *
 * Both renderers' set-methods REPLACE the full set; if two producers
 * each call setLabels with their own slice, the second wins and the
 * first vanishes.  The director merges first, flushes once.
 *
 * ### Change detection
 *
 * The merged label/line arrays are signature-hashed (id-based string
 * concatenation) and the GPU upload is skipped when the signature
 * matches the previous frame.  Hashing costs ~O(N labels), much cheaper
 * than the GPU buffer write that would otherwise happen every frame.
 *
 * ### Awake aggregation
 *
 * If any producer returns `awake: true`, the director calls
 * `state.subsystems.scheduler.requestRender()` once.  This is the only
 * loop-wake mechanism for animations driven by label state (e.g. the
 * you-are-here fade band crossing); other systems wake the loop on
 * their own.
 *
 * ### Null-renderer guard
 *
 * Renderers attach asynchronously (after the font atlas fetch); the
 * director silently no-ops until both are present.  This mirrors the
 * existing pattern at point-of-use in `filamentsPass` and the prior
 * `youAreHereSubsystem`.
 */

import type { LabelRenderer, Label } from '../../gpu/renderers/labelRenderer';
import type { MarkerLineRenderer, MarkerLine } from '../../gpu/renderers/markerLineRenderer';
import type { ReadyFrameContext } from '../frame/frameContext';
import type { EngineState } from '../../../@types';
import type { LabelProducer } from './labelProducer';

export type LabelDirectorSubsystem = {
  /** Wire in the renderers once initGpu has constructed them. Idempotent. */
  attachRenderers(label: LabelRenderer, line: MarkerLineRenderer): void;
  /** Register a producer.  Order of registration = order of merging. */
  registerProducer(producer: LabelProducer): void;
  /** Per-frame entry point — poll producers, merge, flush. */
  runFrame(state: EngineState, ctx: ReadyFrameContext): void;
};

export function createLabelDirectorSubsystem(): LabelDirectorSubsystem {
  let labelRenderer: LabelRenderer | null = null;
  let lineRenderer: MarkerLineRenderer | null = null;
  let producers: readonly LabelProducer[] = [];
  // Signature of the last flushed (labels, lines) tuple, or null on the
  // first frame.  Empty string is a valid signature (no labels, no lines)
  // and is distinct from null.
  let prevSignature: string | null = null;

  function attachRenderers(label: LabelRenderer, line: MarkerLineRenderer): void {
    labelRenderer = label;
    lineRenderer = line;
    prevSignature = null; // force the next frame to re-flush
  }

  function registerProducer(producer: LabelProducer): void {
    // Copy-on-write append — keeps the producers array immutable from
    // any caller's perspective.
    producers = [...producers, producer];
  }

  function signatureOf(labels: readonly Label[], lines: readonly MarkerLine[]): string {
    // Cheap stable signature: id-list + length.  Producers are expected
    // to emit stable ids when their contribution is unchanged; the
    // signature only flips when ids change or the count changes, which
    // is exactly when we need a GPU re-upload.  Edge case: a producer
    // changing a label's *text* but keeping the same id will NOT trigger
    // re-upload — accept this; the only current producer with mutable
    // text is youAreHere (text is constant) and poiSubsystem (text is
    // derived from POI name, which is included via setPois replacement
    // → new ids if names change in practice).
    const lIds = labels.map((l) => l.id).join('|');
    const mIds = lines.map((m) => m.id).join('|');
    return `L:${labels.length}:${lIds};M:${lines.length}:${mIds}`;
  }

  function runFrame(state: EngineState, ctx: ReadyFrameContext): void {
    if (!labelRenderer || !lineRenderer) return;

    // Collect outputs.  Producers are pure of state, so we just call
    // each and concatenate.  The director does NOT cache per-producer
    // output between frames — change detection happens on the merged
    // arrays via signature.
    const mergedLabels: Label[] = [];
    const mergedLines: MarkerLine[] = [];
    let anyAwake = false;
    for (const p of producers) {
      const out = p.produceLabels(state, ctx);
      for (const l of out.labels) mergedLabels.push(l);
      for (const m of out.lines) mergedLines.push(m);
      if (out.awake) anyAwake = true;
    }

    const sig = signatureOf(mergedLabels, mergedLines);
    if (sig !== prevSignature) {
      labelRenderer.setLabels(mergedLabels);
      lineRenderer.setLines(mergedLines);
      prevSignature = sig;
    }

    if (anyAwake) {
      state.subsystems.scheduler.requestRender();
    }
  }

  return { attachRenderers, registerProducer, runFrame };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/services/engine/subsystems/labelDirectorSubsystem.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/subsystems/labelDirectorSubsystem.ts tests/services/engine/subsystems/labelDirectorSubsystem.test.ts
git commit -m "$(cat <<'EOF'
feat(subsystems): add labelDirectorSubsystem

The director owns the labelRenderer/markerLineRenderer setLabels
and setLines calls, accepts producer registrations, merges per-frame
outputs, and flushes once.  Signature-based change detection skips
redundant GPU uploads.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: poiSubsystem

The second producer — holds a typed list of points of interest and emits labels + crosshair lines for visible categories. Per-category styling lives here.

**Files:**
- Create: `src/services/engine/subsystems/poiSubsystem.ts`
- Test: `tests/services/engine/subsystems/poiSubsystem.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/services/engine/subsystems/poiSubsystem.test.ts
import { describe, expect, it } from 'vitest';
import {
  createPoiSubsystem,
  type PointOfInterest,
} from '../../../../src/services/engine/subsystems/poiSubsystem';
import type { ReadyFrameContext } from '../../../../src/services/engine/frame/frameContext';
import type { EngineState } from '../../../../src/@types';

function makeState(): EngineState {
  return { subsystems: { scheduler: { requestRender: () => {} } } } as unknown as EngineState;
}
function makeCtx(): ReadyFrameContext {
  return { drawCamPos: [0, 0, 0] } as unknown as ReadyFrameContext;
}

const VIRGO: PointOfInterest = {
  id: 'virgo',
  name: 'Virgo',
  category: 'cluster',
  worldPos: [-15.98, -2.13, 3.54],
  crosshairSizeMpc: 5,
};
const M31: PointOfInterest = {
  id: 'm31',
  name: 'M31',
  category: 'galaxy',
  worldPos: [0.5, 0.1, 0.0],
};
const BOOTES_VOID: PointOfInterest = {
  id: 'bootes',
  name: 'Boötes Void',
  category: 'void',
  worldPos: [200, 100, 50],
  crosshairSizeMpc: 20,
};

describe('poiSubsystem', () => {
  it('returns empty output when no POIs are set', () => {
    const sub = createPoiSubsystem();
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
    expect(out.awake).toBe(false);
  });

  it('emits one label per visible POI', () => {
    const sub = createPoiSubsystem();
    sub.setPois([VIRGO, M31]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toHaveLength(2);
    expect(out.labels.map((l) => l.text)).toEqual(['Virgo', 'M31']);
  });

  it('emits 3 perpendicular crosshair lines for POIs with crosshairSizeMpc', () => {
    const sub = createPoiSubsystem();
    sub.setPois([VIRGO]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.lines).toHaveLength(3);
  });

  it('omits crosshair lines for POIs without crosshairSizeMpc', () => {
    const sub = createPoiSubsystem();
    sub.setPois([M31]);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.lines).toHaveLength(0);
  });

  it('filters by category visibility', () => {
    const sub = createPoiSubsystem();
    sub.setPois([VIRGO, M31, BOOTES_VOID]);
    sub.setCategoryVisible('galaxy', false);
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels.map((l) => l.text)).toEqual(['Virgo', 'Boötes Void']);
  });

  it('setPois replaces the list immutably (does not mutate input)', () => {
    const sub = createPoiSubsystem();
    const initial = [VIRGO];
    sub.setPois(initial);
    sub.setPois([M31]);
    // The caller's array is untouched.
    expect(initial).toEqual([VIRGO]);
    // The subsystem now reports only M31.
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels.map((l) => l.text)).toEqual(['M31']);
  });

  it('has stable id "pois"', () => {
    expect(createPoiSubsystem().id).toBe('pois');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/services/engine/subsystems/poiSubsystem.test.ts
```
Expected: FAIL with `Cannot find module '.../poiSubsystem'`.

- [ ] **Step 3: Implement the subsystem**

```typescript
// src/services/engine/subsystems/poiSubsystem.ts
/**
 * poiSubsystem — typed list of named points of interest (clusters,
 * galaxies, voids) rendered as text labels + optional crosshairs.
 *
 * ### Why one subsystem for three kinds?
 *
 * Clusters, individual famous galaxies, and voids all share the same
 * physical surface: anchor a label at a world position, optionally draw
 * a small visual marker so the user can see the precise centre.  The
 * differences (label colour, default pixel size, crosshair size) are
 * data — `category` + a per-category default table.  Splitting into
 * three subsystems would triplicate the producer plumbing without
 * adding any clarity.
 *
 * ### Crosshair shape
 *
 * Three perpendicular line segments, each `crosshairSizeMpc` long,
 * centred on `worldPos`.  Cheap to render (3 lines per POI), reads
 * clearly at any zoom, and indicates the precise centre regardless
 * of the label's text bounds.  POIs without `crosshairSizeMpc` (e.g.
 * individual galaxies the user clicked on once) get a label only.
 *
 * ### Immutability
 *
 * `setPois` takes a readonly array and stores a defensive copy via
 * spread so external mutation can't bleed in.  `setCategoryVisible`
 * replaces the per-category visibility record wholesale.  Each call
 * to `produceLabels` returns a fresh output object.
 */

import type { Label } from '../../gpu/renderers/labelRenderer';
import type { MarkerLine } from '../../gpu/renderers/markerLineRenderer';
import type { ReadyFrameContext } from '../frame/frameContext';
import type { EngineState } from '../../../@types';
import type { LabelProducer, LabelProducerOutput } from './labelProducer';

export type PoiCategory = 'cluster' | 'galaxy' | 'void';

export type PointOfInterest = {
  readonly id: string;
  readonly name: string;
  readonly category: PoiCategory;
  readonly worldPos: readonly [number, number, number];
  /** Crosshair half-length in Mpc.  Omit to draw label only. */
  readonly crosshairSizeMpc?: number;
};

export type PoiSubsystem = LabelProducer & {
  setPois(pois: readonly PointOfInterest[]): void;
  clearPois(): void;
  setCategoryVisible(category: PoiCategory, visible: boolean): void;
};

type CategoryStyle = {
  readonly labelColor: readonly [number, number, number, number];
  readonly lineColor: readonly [number, number, number, number];
  readonly pixelSize: number;
  readonly worldEmMpc: number;
  readonly pixelWidth: number;
};

const STYLES: Readonly<Record<PoiCategory, CategoryStyle>> = {
  cluster: {
    labelColor: [1.0, 0.85, 0.4, 1],   // warm yellow — clusters
    lineColor:  [0.9, 0.75, 0.3, 1],
    pixelSize: 16,
    worldEmMpc: 0.5,                   // legible at tens-of-Mpc zoom
    pixelWidth: 2,
  },
  galaxy: {
    labelColor: [0.85, 0.9, 1.0, 1],   // cool white — individual galaxies
    lineColor:  [0.7, 0.75, 0.85, 1],
    pixelSize: 14,
    worldEmMpc: 0.02,                  // legible at sub-Mpc zoom
    pixelWidth: 1.5,
  },
  void: {
    labelColor: [0.6, 0.85, 0.95, 1],  // soft cyan — voids
    lineColor:  [0.45, 0.7, 0.85, 1],
    pixelSize: 16,
    worldEmMpc: 1.0,
    pixelWidth: 2,
  },
};

const ALL_CATEGORIES_VISIBLE: Readonly<Record<PoiCategory, boolean>> = {
  cluster: true,
  galaxy: true,
  void: true,
};

export function createPoiSubsystem(): PoiSubsystem {
  let pois: readonly PointOfInterest[] = [];
  let visibility: Readonly<Record<PoiCategory, boolean>> = ALL_CATEGORIES_VISIBLE;

  function setPois(next: readonly PointOfInterest[]): void {
    pois = [...next]; // defensive copy — caller can mutate their array freely
  }

  function clearPois(): void {
    pois = [];
  }

  function setCategoryVisible(category: PoiCategory, visible: boolean): void {
    visibility = { ...visibility, [category]: visible };
  }

  function makeCrosshairLines(p: PointOfInterest, style: CategoryStyle): readonly MarkerLine[] {
    if (p.crosshairSizeMpc === undefined) return [];
    const half = p.crosshairSizeMpc;
    const [cx, cy, cz] = p.worldPos;
    const color: [number, number, number, number] = [...style.lineColor];
    const mk = (id: string, from: [number, number, number], to: [number, number, number]): MarkerLine => ({
      id,
      fromWorld: from,
      toWorld: to,
      pixelWidth: style.pixelWidth,
      color,
    });
    return [
      mk(`${p.id}-x`, [cx - half, cy, cz], [cx + half, cy, cz]),
      mk(`${p.id}-y`, [cx, cy - half, cz], [cx, cy + half, cz]),
      mk(`${p.id}-z`, [cx, cy, cz - half], [cx, cy, cz + half]),
    ];
  }

  function produceLabels(_state: EngineState, _ctx: ReadyFrameContext): LabelProducerOutput {
    const labels: Label[] = [];
    const lines: MarkerLine[] = [];
    for (const p of pois) {
      if (!visibility[p.category]) continue;
      const style = STYLES[p.category];
      labels.push({
        id: p.id,
        worldPos: [p.worldPos[0], p.worldPos[1], p.worldPos[2]],
        text: p.name,
        pixelSize: style.pixelSize,
        color: [...style.labelColor],
        worldEmMpc: style.worldEmMpc,
        fadeAlpha: 1,
        alignX: 'left',
      });
      for (const line of makeCrosshairLines(p, style)) lines.push(line);
    }
    return { labels, lines, awake: false };
  }

  return { id: 'pois', produceLabels, setPois, clearPois, setCategoryVisible };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/services/engine/subsystems/poiSubsystem.test.ts
```
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/subsystems/poiSubsystem.ts tests/services/engine/subsystems/poiSubsystem.test.ts
git commit -m "$(cat <<'EOF'
feat(subsystems): add poiSubsystem for named points of interest

Holds a typed list of clusters / galaxies / voids and produces labels
+ optional 3-line crosshairs per visible POI.  Per-category styling
lives in a const table; category visibility is toggleable.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Engine wiring + URL flag

Final wiring: instantiate the new subsystems on `state.subsystems`, register the two producers with the director, route `runFrame` and `attachRenderers` through the director instead of youAreHere directly, and push cluster anchors into `poiSubsystem` when `?anchors=1` is in the URL.

**Files:**
- Modify: `src/@types/EngineState.d.ts`
- Modify: `src/services/engine/engine.ts`
- Modify: `src/services/engine/phases/initGpu.ts`
- Modify: `src/services/engine/frame/runFrame.ts`
- Modify: `src/services/engine/phases/wireSlots.ts`

- [ ] **Step 1: Add the two new subsystems to the EngineState type**

Find the `subsystems` block in `src/@types/EngineState.d.ts` and add two entries alongside `youAreHere`:

```typescript
// In src/@types/EngineState.d.ts, inside the `subsystems` type:
labelDirector: LabelDirectorSubsystem;
pois: PoiSubsystem;
```

Add the imports near the top of the same file:

```typescript
import type { LabelDirectorSubsystem } from '../services/engine/subsystems/labelDirectorSubsystem';
import type { PoiSubsystem } from '../services/engine/subsystems/poiSubsystem';
```

- [ ] **Step 2: Instantiate the new subsystems in engine.ts and register producers**

In `src/services/engine/engine.ts` near the existing `youAreHere: createYouAreHereSubsystem(),` line, add the imports at the top of the file:

```typescript
import { createLabelDirectorSubsystem } from './subsystems/labelDirectorSubsystem';
import { createPoiSubsystem } from './subsystems/poiSubsystem';
```

In the subsystems literal, add the two new subsystems right after `youAreHere`:

```typescript
youAreHere: createYouAreHereSubsystem(),

// ── Label director + POI subsystem ──────────────────────────────
// The director owns the actual setLabels/setLines calls; youAreHere
// and pois are both LabelProducers registered below in the IIFE.
labelDirector: createLabelDirectorSubsystem(),
pois: createPoiSubsystem(),
```

After the state literal is assigned, in the bootstrap IIFE that already wires other late dependencies, register the two producers with the director (search for "remaining three subsystems land later" in engine.ts to find the right region):

```typescript
// Register label producers with the director.  Order = z-order in the
// merged label list (youAreHere first, POIs after).
state.subsystems.labelDirector.registerProducer(state.subsystems.youAreHere);
state.subsystems.labelDirector.registerProducer(state.subsystems.pois);
```

- [ ] **Step 3: Update initGpu.ts to attach renderers to the director**

In `src/services/engine/phases/initGpu.ts:241`, find the existing line:

```typescript
state.subsystems.youAreHere.attachRenderers(
```

Replace it with:

```typescript
state.subsystems.labelDirector.attachRenderers(
```

The argument list stays identical (labelRenderer + markerLineRenderer).

- [ ] **Step 4: Update runFrame.ts to call the director**

In `src/services/engine/frame/runFrame.ts:302`, find the existing line:

```typescript
state.subsystems.youAreHere.runFrame(state, ctx);
```

Replace it with:

```typescript
state.subsystems.labelDirector.runFrame(state, ctx);
```

- [ ] **Step 5: Read `?anchors=1` URL flag in wireSlots and push cluster POIs**

In `src/services/engine/phases/wireSlots.ts`, near the existing `?volumes=1` URL check around line 179, add a parallel anchors check and a single-shot push into `poiSubsystem`. Find a suitable spot inside `wireSlots` (after the state and subsystems are accessible) and add:

```typescript
// ── Cluster anchor POIs (dev tool, gated on ?anchors=1) ──────────
// Pushes the 6 well-known cluster anchors into the POI subsystem at
// startup so the operator can visually cross-reference the CF-4 DM
// cube alignment against known large-scale structure.  Not enabled by
// default — the labels would clutter the production view.
const showClusterAnchors = (() => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('anchors');
})();
if (showClusterAnchors) {
  const pois = CLUSTER_ANCHORS.map((a) => ({
    id: `cluster-${a.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: a.name,
    category: 'cluster' as const,
    worldPos: raDecDistToEqCart(a),
    // Crosshair scaled to ~5% of the anchor distance so it reads from
    // a comfortable viewing distance without dominating the cluster
    // glyph at extreme close zoom.
    crosshairSizeMpc: Math.max(2, a.distMpc * 0.05),
  }));
  state.subsystems.pois.setPois(pois);
}
```

Add the import at the top of wireSlots.ts:

```typescript
import { CLUSTER_ANCHORS, raDecDistToEqCart } from '../../../data/clusterAnchors';
```

- [ ] **Step 6: Verify the full typecheck + test suite**

```bash
npm run typecheck && npm test
```
Expected: all green. Note the failing-then-passing pattern across Tasks 3–5 should now reconcile because Task 6's wiring fixes the broken call sites left by Task 3.

- [ ] **Step 7: Manual visual check**

```bash
# (Dev server is already running per CLAUDE.md convention.)
# Open in browser: http://localhost:5173/?anchors=1
```
Expected: 6 yellow labels visible in the 3D view at the cluster positions, each with a 3-axis crosshair. Without `?anchors=1`, no cluster labels appear. The "You are here" marker at the origin still works.

- [ ] **Step 8: Commit**

```bash
git add src/@types/EngineState.d.ts src/services/engine/engine.ts src/services/engine/phases/initGpu.ts src/services/engine/frame/runFrame.ts src/services/engine/phases/wireSlots.ts
git commit -m "$(cat <<'EOF'
feat(engine): wire labelDirector + pois subsystems

The director owns the renderer set-calls; youAreHere and pois both
register as producers and contribute their labels each frame.
The ?anchors=1 URL flag pushes the 6 well-known cluster anchors into
the POI subsystem at startup for visual CF-4 alignment checks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Open the PR**

```bash
git push -u origin cluster-poi-labels
gh pr create --title "feat: cluster POI labels for visual CF-4 alignment check" --body "$(cat <<'EOF'
## Summary

- Introduces a generic \`LabelProducer\` abstraction; \`youAreHereSubsystem\` refactored into a producer; renderer ownership moves to a new \`labelDirectorSubsystem\`.
- New \`poiSubsystem\` holds typed Points of Interest (clusters, galaxies, voids) and emits labels + optional crosshairs with per-category styling.
- \`?anchors=1\` URL flag pushes 6 well-known cluster anchors (Virgo, Coma, Perseus, Norma/GA, Hercules, Shapley) into the POI subsystem so the operator can visually cross-reference the CF-4 DM cube against known large-scale structure.
- Audit script \`tools/auditCf4Anchors.ts\` now DRYs against the same \`src/data/clusterAnchors.ts\` source.

## Test plan

- [ ] \`npm test\` — all unit tests green (new tests cover clusterAnchors helper, director merge/skip, POI filtering)
- [ ] \`npm run typecheck\` — clean
- [ ] Open \`http://localhost:5173/?anchors=1\` — 6 yellow cluster labels visible at expected positions with crosshairs
- [ ] Open \`http://localhost:5173/\` (no flag) — no cluster labels; "You are here" still works at origin
- [ ] Open \`http://localhost:5173/?anchors=1&volumes=1\` — labels overlay the CF-4 cube; visually compare alignment

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** All 6 brainstorm bullets are covered: (1) generic label producer ✔ Task 2; (2) refactored youAreHere ✔ Task 3; (3) labelDirector ✔ Task 4; (4) poiSubsystem ✔ Task 5; (5) cluster anchor data + RA/Dec helper ✔ Task 1; (6) `?anchors=1` URL flag wiring ✔ Task 6. Cross-cutting immutability convention is stated up front and applied in every typed surface.
- **Type consistency:** `LabelProducer.id` referenced in Tasks 2/3/5 matches. `produceLabels(state, ctx) → LabelProducerOutput` signature matches across Tasks 2/3/5/4. `PointOfInterest` shape used identically in Tasks 5 and 6 (the URL-flag wiring constructs the same object literal). `attachRenderers` signature matches between the old `youAreHere` and new `labelDirector` (Tasks 4 + 6).
- **Out of scope, deliberately:** settings-panel toggle for category visibility (the API is there, no UI wiring yet); famous-galaxy and void data sources (poi accepts them, just no data file yet); picking / click-to-fly-to on POI labels.
