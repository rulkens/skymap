# Unified Fade Architecture (1/5) -- Foundation Types + FadeController

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the leaf type declarations (`LabelLayerId`, `OverlayId`, `FadeHandle`, `FadeController` public type) and the pure-CPU `FadeController` factory plus its tests. Pure additive -- no GPU, no consumers yet; the registry and renderer wiring land in subsequent sub-plans.

**Architecture:** Five `src/@types/animation/*.d.ts` declarations plus one factory at `src/services/animation/fadeController.ts` that implements a smoothstep ramp with mid-flight retargeting and Promise-based completion driven by a per-frame `tick`. No imports outside the new files; the rest of the codebase is untouched.

**Tech Stack:** TypeScript, Vitest.

**Prerequisites:** Branch `worktree-unified-fade-architecture` rebased onto `origin/main`. Baseline: typecheck green, `npm test` passing.

**Followed by:** `2026-05-17-unified-fade-02-registry-and-bgls.md` -- adds `FadeRegistry`, wires it into `state.subsystems.fades`, and lands the canonical bind-group layouts and WESL libs that downstream renderers will bind against.

**Spec reference:** `docs/superpowers/specs/2026-05-17-unified-fade-architecture-design.md`

**Definition of done:** `npm run typecheck && npm test && npm run build` all pass.

---

## Name & layout reference (used throughout)

These names and layouts are repeated in many tasks. Treat this section as canonical — any later task referring to a symbol must match exactly.

### Constants

```ts
export const FADE_IN_DURATION_MS = 600;
export const FADE_OUT_DURATION_MS = 100;
```

### FadeHandle union

```ts
import type { Source } from '../../data/sources';
import type { ScalarFieldHandle } from '../rendering/ScalarFieldHandle';
import type { LabelLayerId } from './LabelLayerId';
import type { OverlayId } from './OverlayId';

export type FadeHandle =
  | { readonly kind: 'survey'; readonly source: Source }
  | { readonly kind: 'filaments' }
  | { readonly kind: 'scalarField'; readonly field: ScalarFieldHandle }
  | { readonly kind: 'labelLayer'; readonly layer: LabelLayerId }
  | { readonly kind: 'overlay'; readonly id: OverlayId };
```

### Label layer IDs and overlay IDs (string-literal unions)

```ts
export type LabelLayerId = 'youAreHere' | 'poi' | 'galaxyNames' | 'scaleBar';
export type OverlayId = 'milkyWay' | 'proceduralDisks' | 'texturedImpostors';
```

### Handle serialization

```ts
function serializeFadeHandle(h: FadeHandle): string {
  switch (h.kind) {
    case 'survey':       return `survey:${h.source}`;
    case 'filaments':    return 'filaments';
    case 'scalarField':  return `scalarField:${h.field}`;
    case 'labelLayer':   return `labelLayer:${h.layer}`;
    case 'overlay':      return `overlay:${h.id}`;
  }
}
```

### WESL fade-uniform struct + binding

```wgsl
struct FadeUniforms {
  opacity: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};
@group(1) @binding(0) var<uniform> fade: FadeUniforms;

fn applyFade(alpha: f32, opacity: f32) -> f32 {
  return alpha * opacity;
}
```

### WESL source-uniform struct + binding (points only)

```wgsl
struct SourceUniforms {
  sourceCode: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
};
@group(2) @binding(0) var<uniform> source: SourceUniforms;
```

---

## Phase 1: Foundation primitives (pure TS, no GPU)

### Task 1.1: Define LabelLayerId and OverlayId types

**Files:**
- Create: `src/@types/animation/LabelLayerId.d.ts`
- Create: `src/@types/animation/OverlayId.d.ts`

- [ ] **Step 1: Create `LabelLayerId.d.ts`**

```ts
/**
 * LabelLayerId — string-literal identifier for each label layer that
 * participates in the unified fade registry.
 *
 * Each layer fades independently. The registry keys
 * `{ kind: 'labelLayer', layer }` by the layer ID, so a future fifth
 * label layer is added by extending this union; nothing in the
 * registry itself needs to learn the new value.
 *
 * Current layers:
 *   - youAreHere — the "YOU ARE HERE" Milky Way pin (a single label +
 *                  marker line). Fades in when the camera reaches the
 *                  band where the marker is meaningful.
 *   - poi        — cluster + named-anchor labels emitted by PoiSubsystem.
 *   - galaxyNames — per-galaxy name labels (currently unused but
 *                   reserved; see future plans for hover-name overlay).
 *   - scaleBar   — the on-screen scale-bar HUD. Constructed by React,
 *                  not a GPU layer; reserved for tour integration.
 */
export type LabelLayerId = 'youAreHere' | 'poi' | 'galaxyNames' | 'scaleBar';
```

- [ ] **Step 2: Create `OverlayId.d.ts`**

```ts
/**
 * OverlayId — string-literal identifier for each always-on GPU overlay
 * that registers with the fade registry at opacity 1.0.
 *
 * These layers don't auto-fade on loading (they're either procedurally
 * generated or already in the bundle), but they register with the
 * registry so future tour playback can `fadeTo(handle, target, duration)`
 * them without per-renderer plumbing.
 *
 * Current overlays:
 *   - milkyWay         — single-quad procedural Milky Way impostor.
 *   - proceduralDisks  — LOD-1 procedural-disk pass (per-galaxy disk
 *                        impostor for the close-approach band).
 *   - texturedImpostors — LOD-2 textured-thumbnail quad pass.
 */
export type OverlayId = 'milkyWay' | 'proceduralDisks' | 'texturedImpostors';
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS (no other files reference these types yet).

- [ ] **Step 4: Commit**

```bash
git add src/@types/animation/LabelLayerId.d.ts src/@types/animation/OverlayId.d.ts
git commit -m "$(cat <<'EOF'
feat(animation): add LabelLayerId and OverlayId string-literal unions

Two leaf types used by the upcoming FadeHandle discriminated union.
Pure declarations — no consumers yet; the registry + renderer wiring
land in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.2: Define FadeHandle discriminated union

**Files:**
- Create: `src/@types/animation/FadeHandle.d.ts`

- [ ] **Step 1: Create `FadeHandle.d.ts`**

```ts
/**
 * FadeHandle — discriminated union identifying any fadeable layer.
 *
 * The fade registry stores one `FadeController` per handle, keyed by a
 * stable string serialization. The union is closed: every renderer or
 * subsystem that wants to participate in fade orchestration adds itself
 * by extending one of the existing kinds rather than minting an
 * ad-hoc string.
 *
 * Kinds:
 *   - survey       — one of SDSS, 2MRS, GLADE, Famous, Synthetic.
 *                    Fades in on first load; fades out → upload → in
 *                    on tier swap. Discriminator: `source: Source`.
 *   - filaments    — the single cosmic-web filament skeleton.
 *                    Fades in on first load. No discriminator.
 *   - scalarField  — one volumetric scalar field (CF-4, rhizome-small,
 *                    rhizome-medium, rhizome-large). Discriminator:
 *                    `field: ScalarFieldHandle` (the string key the
 *                    volume renderer uses internally).
 *   - labelLayer   — one logical label layer (you-are-here, POI,
 *                    galaxy names, scale bar). Discriminator:
 *                    `layer: LabelLayerId`.
 *   - overlay      — always-on GPU overlay (Milky Way, procedural
 *                    disks, textured impostors). Registered at
 *                    opacity 1.0 via setImmediate. Discriminator:
 *                    `id: OverlayId`.
 *
 * Future kinds (e.g. `surveyChunk` for chunked galaxy loading) extend
 * the union without breaking existing consumers because every consumer
 * matches on `kind` exhaustively.
 *
 * All fields are `readonly` because handles are values used as map keys
 * and must not be mutated after construction.
 */

import type { Source } from '../../data/sources';
import type { ScalarFieldHandle } from '../rendering/ScalarFieldHandle';
import type { LabelLayerId } from './LabelLayerId';
import type { OverlayId } from './OverlayId';

export type FadeHandle =
  | { readonly kind: 'survey'; readonly source: Source }
  | { readonly kind: 'filaments' }
  | { readonly kind: 'scalarField'; readonly field: ScalarFieldHandle }
  | { readonly kind: 'labelLayer'; readonly layer: LabelLayerId }
  | { readonly kind: 'overlay'; readonly id: OverlayId };
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/@types/animation/FadeHandle.d.ts
git commit -m "$(cat <<'EOF'
feat(animation): add FadeHandle discriminated union

Five-kind union covering every fadeable layer the new registry will
manage. Future kinds (chunked surveys) extend the union without
breaking existing consumers.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.3: Define FadeController public type

**Files:**
- Create: `src/@types/animation/FadeController.d.ts`

- [ ] **Step 1: Create `FadeController.d.ts`**

```ts
/**
 * FadeController — public surface of the pure-CPU per-handle opacity
 * ramp primitive.
 *
 * Owns one (sourceOpacity, targetOpacity, transitionStartMs,
 * transitionDurationMs) tuple. `currentOpacity(now)` returns a
 * smoothstep between source and target, clamped after start + duration.
 * No GPU resources; the controller is a pure value the registry holds
 * one of per FadeHandle.
 *
 * The factory + concrete implementation live in
 * `src/services/animation/fadeController.ts`.
 */

export type FadeController = {
  /**
   * Start a new fade. Reads `currentOpacity(now)` as the new
   * `sourceOpacity` (so mid-flight retargeting picks up smoothly from
   * wherever the previous fade reached), records the target + start.
   *
   * Returns a Promise that resolves when `tick(now)` first observes
   * `!isAnimating(now)` — i.e. when the smoothstep saturates. The slot
   * orchestration code awaits this to sequence fade-out → upload →
   * fade-in.
   *
   * Calling `fadeTo` while a previous Promise is unresolved leaves the
   * earlier promise pending; it resolves at its original resolveMs
   * deadline (even though the controller has retargeted to a new
   * destination in the meantime). If a caller wants strict
   * cancel-on-retarget semantics, they should await the previous
   * fadeTo before issuing a new one.
   */
  fadeTo(target: number, durationMs: number, nowMs?: number): Promise<void>;

  /**
   * Skip animation entirely. Sets sourceOpacity + targetOpacity to
   * `value` and zeros the transition so `currentOpacity()` returns
   * `value` immediately and `isAnimating()` returns false.
   *
   * Used at engine bootstrap to register always-on overlays at 1.0.
   */
  setImmediate(value: number): void;

  /**
   * The opacity at the given time. Returns the smoothstep-eased value
   * along the (sourceOpacity → targetOpacity) ramp, clamped after the
   * ramp completes.
   */
  currentOpacity(nowMs?: number): number;

  /**
   * Whether the smoothstep ramp is still in progress at the given time.
   * False once `nowMs >= transitionStartMs + transitionDurationMs`,
   * or when sourceOpacity === targetOpacity (no animation pending).
   */
  isAnimating(nowMs?: number): boolean;

  /**
   * Resolve any pending fadeTo promises whose resolveMs has elapsed.
   * Called once per frame from the registry's tick. The registry
   * passes a single `nowMs` to every controller in the same tick so
   * `currentOpacity` and `tick` observe the same timestamp.
   */
  tick(nowMs: number): void;
};
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/@types/animation/FadeController.d.ts
git commit -m "$(cat <<'EOF'
feat(animation): add FadeController public type

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.4: Write FadeController failing tests

**Files:**
- Create: `tests/services/animation/fadeController.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  createFadeController,
  FADE_IN_DURATION_MS,
  FADE_OUT_DURATION_MS,
} from '../../../src/services/animation/fadeController';

describe('createFadeController', () => {
  it('exports the asymmetric duration constants', () => {
    expect(FADE_IN_DURATION_MS).toBe(600);
    expect(FADE_OUT_DURATION_MS).toBe(100);
  });

  it('reports the initial opacity before any fade is started', () => {
    const c = createFadeController(0.25, 1000);
    expect(c.currentOpacity(1000)).toBe(0.25);
    expect(c.isAnimating(1000)).toBe(false);
  });

  it('defaults initial opacity to 0', () => {
    const c = createFadeController(undefined, 1000);
    expect(c.currentOpacity(1000)).toBe(0);
  });

  it('smoothstep-eases from sourceOpacity to targetOpacity over duration', () => {
    const c = createFadeController(0, 1000);
    c.fadeTo(1, 600, 1000);
    // Smoothstep at t=0: 0; t=0.5: 0.5; t=1: 1.
    expect(c.currentOpacity(1000)).toBeCloseTo(0, 5);
    expect(c.currentOpacity(1300)).toBeCloseTo(0.5, 5);
    expect(c.currentOpacity(1600)).toBeCloseTo(1, 5);
  });

  it('clamps to targetOpacity after start + duration', () => {
    const c = createFadeController(0, 1000);
    c.fadeTo(1, 600, 1000);
    expect(c.currentOpacity(2000)).toBe(1);
    expect(c.isAnimating(2000)).toBe(false);
  });

  it('isAnimating returns false exactly at start + duration boundary', () => {
    const c = createFadeController(0, 1000);
    c.fadeTo(1, 600, 1000);
    expect(c.isAnimating(1599)).toBe(true);
    expect(c.isAnimating(1600)).toBe(false);
  });

  it('mid-flight retarget picks up from the current value', () => {
    const c = createFadeController(0, 1000);
    c.fadeTo(1, 600, 1000); // start fade-in
    // At t=1300, opacity is 0.5 (mid-smoothstep).
    const mid = c.currentOpacity(1300);
    expect(mid).toBeCloseTo(0.5, 5);
    // Retarget to 0 over 100 ms.
    c.fadeTo(0, 100, 1300);
    // Source is now `mid` (0.5), target 0. At t=1300, opacity ≈ mid.
    expect(c.currentOpacity(1300)).toBeCloseTo(mid, 5);
    // At t=1350 (halfway through the 100 ms fade-out), smoothstep(0.5) = 0.5.
    // Source 0.5 → target 0, eased value = 0.5 + (0 - 0.5) * 0.5 = 0.25.
    expect(c.currentOpacity(1350)).toBeCloseTo(0.25, 5);
    // At t=1400, fully at 0.
    expect(c.currentOpacity(1400)).toBeCloseTo(0, 5);
  });

  it('setImmediate skips animation and sets opacity instantly', () => {
    const c = createFadeController(0, 1000);
    c.setImmediate(1);
    expect(c.currentOpacity(1000)).toBe(1);
    expect(c.isAnimating(1000)).toBe(false);
  });

  it('fadeTo Promise resolves only after tick observes !isAnimating', async () => {
    const c = createFadeController(0, 1000);
    let resolved = false;
    c.fadeTo(1, 600, 1000).then(() => { resolved = true; });
    // Tick before the ramp ends — should NOT resolve.
    c.tick(1300);
    await Promise.resolve();
    expect(resolved).toBe(false);
    // Tick after the ramp ends — should resolve.
    c.tick(1600);
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it('Promise also resolves when fade target is reached via setImmediate', async () => {
    const c = createFadeController(0, 1000);
    let resolved = false;
    c.fadeTo(1, 600, 1000).then(() => { resolved = true; });
    c.setImmediate(1);
    c.tick(1000);
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it('multiple concurrent fadeTo Promises each resolve at their own deadline', async () => {
    const c = createFadeController(0, 1000);
    let a = false, b = false;
    c.fadeTo(1, 600, 1000).then(() => { a = true; });
    c.fadeTo(0.5, 200, 1100).then(() => { b = true; });
    c.tick(1200);
    await Promise.resolve();
    expect(a).toBe(false);
    expect(b).toBe(false);
    c.tick(1300); // second fade ends at 1100 + 200 = 1300
    await Promise.resolve();
    expect(b).toBe(true);
    expect(a).toBe(false);
    c.tick(1600); // first would have ended at 1600 but was retargeted; resolves when no longer animating
    await Promise.resolve();
    expect(a).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test -- tests/services/animation/fadeController.test.ts`
Expected: FAIL with "Cannot find module ... fadeController" (the implementation doesn't exist yet).

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/services/animation/fadeController.test.ts
git commit -m "$(cat <<'EOF'
test(animation): add failing FadeController tests

Covers smoothstep timing, mid-flight retargeting, setImmediate, and
Promise resolution via tick. Implementation lands in the next commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.5: Implement FadeController

**Files:**
- Create: `src/services/animation/fadeController.ts`

- [ ] **Step 1: Create the implementation**

```ts
/**
 * fadeController — pure-CPU opacity ramp primitive used by the unified
 * fade registry.
 *
 * ### Why a factory (not a class)
 *
 * Matches the codebase's broader factory-shape pattern (renderScheduler,
 * tweenManager, …). Closure-captured state means no `this` confusion
 * and consumers can destructure (`const { fadeTo } = createFadeController()`).
 *
 * ### Why smoothstep
 *
 * Cubic Hermite ease (3t² − 2t³) starts and ends with zero derivative —
 * the eye perceives the ramp as a single continuous motion rather than a
 * snap at either endpoint. WGSL's built-in `smoothstep` uses the same
 * curve; matching it CPU-side means the registry's per-frame opacity
 * write produces the same visual shape the shader would have if we'd
 * baked the smoothstep into the shader instead.
 *
 * ### Why Promise<void> from fadeTo
 *
 * The slot orchestration code does
 *
 *   await fades.fadeTo(handle, 0, FADE_OUT_DURATION_MS);
 *   renderer.upload(source, newCatalog);
 *   fades.fadeTo(handle, 1, FADE_IN_DURATION_MS);
 *
 * — naturally sequential, naturally readable. A callback API would
 * force the second and third lines into a `.then(...)` continuation
 * and the Source-typed local bindings would have to be re-captured.
 * The promise allocation per fade is negligible (a few per second at
 * most).
 *
 * ### Why tick(now), not setTimeout
 *
 * Promises resolve via the registry's per-frame tick rather than a
 * `setTimeout` scheduled at start-of-fade. Two reasons:
 *
 *   1. The render-on-demand scheduler already ticks the frame loop
 *      while any fade is in flight (the registry's `isAnyAnimating()`
 *      gate keeps it awake). Resolving promises in lockstep with the
 *      frame body means the slot's `await` chains complete in the same
 *      frame boundary the visual state advanced through — no off-by-one
 *      where a `setTimeout` fires before the GPU has drawn the final
 *      frame of the ramp.
 *   2. `setTimeout` precision is browser-throttled to 4 ms minimum
 *      (and worse under heavy load). `performance.now()` against the
 *      frame's rAF timestamp is sub-ms accurate.
 */

/**
 * Fade-in duration in milliseconds. 600 ms is sub-conscious — long
 * enough that the eye perceives "things flowing in" rather than a pop,
 * short enough that switching tiers doesn't feel sluggish. Used as the
 * default by every loading-slot fade-in and every UI-toggle "on" path.
 */
export const FADE_IN_DURATION_MS = 600;

/**
 * Fade-out duration in milliseconds. 100 ms is near-instant — long
 * enough to avoid a hard cut, short enough that the user perceives the
 * response as immediate. Used as the default by every loading-slot
 * fade-out (before a tier-swap upload) and every UI-toggle "off" path.
 */
export const FADE_OUT_DURATION_MS = 100;

import type { FadeController } from '../../@types/animation/FadeController';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

type PendingResolve = {
  readonly resolveMs: number;
  readonly resolve: () => void;
};

export function createFadeController(
  initialOpacity: number = 0,
  nowMs: number = performance.now(),
): FadeController {
  let sourceOpacity = initialOpacity;
  let targetOpacity = initialOpacity;
  let transitionStartMs = nowMs;
  let transitionDurationMs = 0;
  const pending: PendingResolve[] = [];

  function currentOpacity(now: number = performance.now()): number {
    if (transitionDurationMs <= 0) return targetOpacity;
    const t = smoothstep(
      transitionStartMs,
      transitionStartMs + transitionDurationMs,
      now,
    );
    return sourceOpacity + (targetOpacity - sourceOpacity) * t;
  }

  function isAnimating(now: number = performance.now()): boolean {
    if (transitionDurationMs <= 0) return false;
    return now < transitionStartMs + transitionDurationMs;
  }

  function fadeTo(
    target: number,
    durationMs: number,
    now: number = performance.now(),
  ): Promise<void> {
    // Capture the current opacity BEFORE updating the source, so mid-
    // flight retargeting picks up from wherever the previous ramp reached
    // rather than snapping back to the previous source.
    sourceOpacity = currentOpacity(now);
    targetOpacity = target;
    transitionStartMs = now;
    transitionDurationMs = Math.max(0, durationMs);
    return new Promise<void>((resolve) => {
      pending.push({
        resolveMs: now + transitionDurationMs,
        resolve,
      });
    });
  }

  function setImmediate(value: number): void {
    sourceOpacity = value;
    targetOpacity = value;
    transitionDurationMs = 0;
    // Any pending promises are now satisfied — the next tick will
    // resolve them. Don't resolve here directly to keep tick the
    // single resolution site (matches the per-frame contract).
  }

  function tick(now: number = performance.now()): void {
    // Resolve and remove every pending promise whose deadline has
    // elapsed. Iterate in place; the order doesn't matter because
    // each promise resolves independently.
    for (let i = pending.length - 1; i >= 0; i--) {
      if (now >= pending[i]!.resolveMs) {
        pending[i]!.resolve();
        pending.splice(i, 1);
      }
    }
  }

  return { fadeTo, setImmediate, currentOpacity, isAnimating, tick };
}
```

- [ ] **Step 2: Run tests to confirm they pass**

Run: `npm test -- tests/services/animation/fadeController.test.ts`
Expected: PASS — all 11 tests green.

- [ ] **Step 3: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/animation/fadeController.ts
git commit -m "$(cat <<'EOF'
feat(animation): implement FadeController

Smoothstep ramp with mid-flight retargeting, setImmediate, and
Promise-based fade completion driven by per-frame tick.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

