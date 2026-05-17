# Unified Fade Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-renderer `CloudFade` class with a single `FadeRegistry` engine subsystem that drives the opacity of every fadeable layer (point surveys, filaments, scalar volumes, labels, and always-on overlays), with canonical bind-group layouts shared across pipelines and sequential fade-out → upload → fade-in orchestration in the asset slot commit step.

**Architecture:** A pure-CPU `FadeController` owns a smoothstep ramp from `sourceOpacity` to `targetOpacity` over a caller-specified duration; `fadeTo` returns a `Promise<void>` that resolves the next time `tick(now)` observes the controller no longer animating. A `FadeRegistry` subsystem holds a `Map<string, FadeController>` keyed by a stable serialization of a discriminated-union `FadeHandle`. Two canonical (non-`'auto'`) bind-group layouts — `fadeUniformsBgl` (universal, 16-byte opacity uniform at `@group(1)`) and `sourceUniformsBgl` (points-only, 16-byte sourceCode uniform at `@group(2)`) — are constructed once at engine bootstrap and shared by every consumer pipeline, sidestepping the `layout: 'auto'` cross-pipeline trap. Each renderer owns its per-handle GPU fade buffer + bind group; per-frame it reads `registry.opacityOf(handle, now)` and writes 16 bytes via `device.queue.writeBuffer`. `runFrame.ts`'s render-on-demand predicate collapses to `state.subsystems.fades.isAnyAnimating(now)`.

**Tech Stack:** TypeScript, WebGPU, WESL (`wesl-plugin` Vite linker), Vitest, React.

**Pre-conditions:** Branch `worktree-unified-fade-architecture` rebased onto `origin/main` (which includes the `PointCloud → GalaxyCatalog` rename, PR #135). Baseline: typecheck green, `npm test` passing.

**Spec reference:** `docs/superpowers/specs/2026-05-17-unified-fade-architecture-design.md`

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
   * earlier promise pending until its resolveMs deadline elapses. If a
   * caller wants strict cancel-on-retarget semantics, they should await
   * the previous fadeTo before issuing a new one.
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
   * Called once per frame from the registry's tick.
   */
  tick(nowMs?: number): void;
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

### Task 1.6: Define FadeRegistry public type

**Files:**
- Create: `src/@types/animation/FadeRegistry.d.ts`

- [ ] **Step 1: Create `FadeRegistry.d.ts`**

```ts
/**
 * FadeRegistry — public surface of the engine subsystem owning every
 * layer's fade controller.
 *
 * Engine subsystem at `state.subsystems.fades`. Constructed eagerly at
 * engine bootstrap, BEFORE any renderer (so renderer construction can
 * call `register(...)` without a null-check). See
 * `src/services/animation/fadeRegistry.ts` for the concrete factory.
 *
 * Storage: `Map<string, FadeController>` keyed by `serializeFadeHandle(h)`.
 * Consumers don't see the serialization — they always pass handles.
 */

import type { FadeHandle } from './FadeHandle';
import type { Destroyable } from '../rendering/Destroyable';

export type FadeRegistry = Destroyable & {
  /**
   * Human-readable identifier (`'fadeRegistry'`). Part of the shared
   * `Destroyable` contract via `Renderer.label`-style discipline.
   */
  readonly label: string;

  /**
   * Register a handle with the given initial opacity. Idempotent — a
   * second `register` call with the same handle is a no-op (the
   * existing controller is preserved). Initial opacity defaults to 0
   * (the loading-fade-in case).
   */
  register(handle: FadeHandle, initialOpacity?: number): void;

  /** Drop a handle and its controller. */
  unregister(handle: FadeHandle): void;

  /**
   * Start (or retarget) the fade for a handle. Forwards to the
   * controller's `fadeTo`. Returns the controller's Promise.
   *
   * If the handle is not registered, throws — slots and renderers
   * MUST register before fading, and a quiet no-op would hide bugs
   * where a handle is fadeTo'd before its registration runs.
   *
   * `durationMs` defaults to `FADE_IN_DURATION_MS` when target > current,
   * `FADE_OUT_DURATION_MS` otherwise — but callers are expected to pass
   * the duration explicitly for clarity at the call site. The default
   * is a fallback for tests and edge cases.
   */
  fadeTo(handle: FadeHandle, target: number, durationMs?: number): Promise<void>;

  /** Forwards to the controller's `setImmediate`. Throws if unregistered. */
  setImmediate(handle: FadeHandle, value: number): void;

  /**
   * The opacity at the given time for the given handle. Returns 1.0 for
   * unregistered handles — fail-safe so a renderer asking for a handle
   * that hasn't finished registering draws at full opacity instead of
   * disappearing.
   */
  opacityOf(handle: FadeHandle, nowMs?: number): number;

  /**
   * True iff any registered controller is still animating at the given
   * time. Used by the render-on-demand predicate in `runFrame.ts`.
   */
  isAnyAnimating(nowMs?: number): boolean;

  /**
   * Called once per frame from `runFrame`. Walks the controllers and
   * fires any due Promise resolutions.
   */
  tick(nowMs?: number): void;
};
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/@types/animation/FadeRegistry.d.ts
git commit -m "$(cat <<'EOF'
feat(animation): add FadeRegistry public type

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.7: Write FadeRegistry failing tests

**Files:**
- Create: `tests/services/animation/fadeRegistry.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { createFadeRegistry } from '../../../src/services/animation/fadeRegistry';
import { Source } from '../../../src/data/sources';
import type { FadeHandle } from '../../../src/@types/animation/FadeHandle';

describe('createFadeRegistry', () => {
  it('exposes the conventional label property', () => {
    const r = createFadeRegistry();
    expect(r.label).toBe('fadeRegistry');
  });

  it('opacityOf returns 1.0 for unregistered handles (fail-safe)', () => {
    const r = createFadeRegistry();
    const h: FadeHandle = { kind: 'survey', source: Source.SDSS };
    expect(r.opacityOf(h, 1000)).toBe(1.0);
  });

  it('register defaults initial opacity to 0', () => {
    const r = createFadeRegistry();
    const h: FadeHandle = { kind: 'survey', source: Source.SDSS };
    r.register(h);
    expect(r.opacityOf(h, 1000)).toBe(0);
  });

  it('register honors a provided initial opacity', () => {
    const r = createFadeRegistry();
    const h: FadeHandle = { kind: 'overlay', id: 'milkyWay' };
    r.register(h, 0.75);
    expect(r.opacityOf(h, 1000)).toBe(0.75);
  });

  it('register is idempotent', () => {
    const r = createFadeRegistry();
    const h: FadeHandle = { kind: 'filaments' };
    r.register(h, 0.5);
    r.register(h, 0.0); // second call is a no-op; the existing controller is preserved.
    expect(r.opacityOf(h, 1000)).toBe(0.5);
  });

  it('unregister drops the controller; opacityOf reverts to fail-safe 1.0', () => {
    const r = createFadeRegistry();
    const h: FadeHandle = { kind: 'filaments' };
    r.register(h, 0);
    r.unregister(h);
    expect(r.opacityOf(h, 1000)).toBe(1.0);
  });

  it('serialization is stable across handle equality', () => {
    const r = createFadeRegistry();
    const h1: FadeHandle = { kind: 'survey', source: Source.SDSS };
    const h2: FadeHandle = { kind: 'survey', source: Source.SDSS };
    r.register(h1, 0.5);
    // Two structurally-equal handles map to the same controller.
    expect(r.opacityOf(h2, 1000)).toBe(0.5);
  });

  it('different discriminator values produce different keys', () => {
    const r = createFadeRegistry();
    const a: FadeHandle = { kind: 'survey', source: Source.SDSS };
    const b: FadeHandle = { kind: 'survey', source: Source.Glade };
    r.register(a, 0.25);
    r.register(b, 0.75);
    expect(r.opacityOf(a, 1000)).toBe(0.25);
    expect(r.opacityOf(b, 1000)).toBe(0.75);
  });

  it('fadeTo throws when the handle is not registered', () => {
    const r = createFadeRegistry();
    const h: FadeHandle = { kind: 'filaments' };
    expect(() => r.fadeTo(h, 1, 600)).toThrow();
  });

  it('fadeTo ramps opacity and resolves via tick', async () => {
    const r = createFadeRegistry();
    const h: FadeHandle = { kind: 'filaments' };
    r.register(h, 0);
    let done = false;
    r.fadeTo(h, 1, 600).then(() => { done = true; });
    expect(r.opacityOf(h, 0)).toBeCloseTo(0, 5);
    expect(r.opacityOf(h, 300)).toBeCloseTo(0.5, 5);
    expect(r.opacityOf(h, 600)).toBeCloseTo(1, 5);
    r.tick(600);
    await Promise.resolve();
    expect(done).toBe(true);
  });

  it('setImmediate skips animation', () => {
    const r = createFadeRegistry();
    const h: FadeHandle = { kind: 'overlay', id: 'milkyWay' };
    r.register(h, 0);
    r.setImmediate(h, 1);
    expect(r.opacityOf(h, 0)).toBe(1);
    expect(r.isAnyAnimating(0)).toBe(false);
  });

  it('isAnyAnimating aggregates across multiple controllers', () => {
    const r = createFadeRegistry();
    const a: FadeHandle = { kind: 'survey', source: Source.SDSS };
    const b: FadeHandle = { kind: 'filaments' };
    r.register(a, 0);
    r.register(b, 1);
    expect(r.isAnyAnimating(0)).toBe(false);
    r.fadeTo(a, 1, 600, /* nowMs */ undefined as never); // start fade-in (default now uses performance.now)
    // Use a deterministic now via tick + isAnimating manually:
    expect(r.isAnyAnimating(performance.now())).toBe(true);
  });

  it('destroy clears every controller', () => {
    const r = createFadeRegistry();
    const h: FadeHandle = { kind: 'filaments' };
    r.register(h, 0.5);
    r.destroy();
    expect(r.opacityOf(h, 0)).toBe(1.0);
    expect(r.isAnyAnimating(0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test -- tests/services/animation/fadeRegistry.test.ts`
Expected: FAIL with "Cannot find module ... fadeRegistry".

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/services/animation/fadeRegistry.test.ts
git commit -m "$(cat <<'EOF'
test(animation): add failing FadeRegistry tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.8: Implement FadeRegistry

**Files:**
- Create: `src/services/animation/fadeRegistry.ts`

- [ ] **Step 1: Create the implementation**

```ts
/**
 * fadeRegistry — engine subsystem at `state.subsystems.fades`.
 *
 * Owns a `Map<string, FadeController>` keyed by a stable serialization
 * of every registered FadeHandle. Renderers and slot commit steps drive
 * the registry; renderers read `opacityOf(handle, now)` per frame and
 * write the value into their per-handle GPU fade buffer.
 *
 * ### Why a string-keyed map (not WeakMap<FadeHandle, …>)
 *
 * Handles are value-typed records (`{ kind: 'survey', source: 1 }`),
 * not reference identities. Two `{ kind: 'survey', source: SDSS }`
 * literals constructed in different files must address the SAME
 * controller. A WeakMap keys on reference identity — that would mint
 * a new controller every time a caller built a fresh handle literal.
 * A string serialization gives us value equality at the cost of one
 * short string allocation per registry call (negligible).
 *
 * ### Why fail-safe opacityOf=1.0 for unregistered handles
 *
 * Renderers call `opacityOf` from their per-frame draw. The registry
 * is constructed BEFORE renderers, and renderers register their
 * handles at construction — but bootstrap order is subtle, and a
 * half-finished bootstrap (test fixtures, HMR reload races) can leave
 * a renderer drawing before its handle is registered. Returning 0
 * would black-screen the user; returning 1.0 (the steady-state value)
 * draws normally. The visible cost is one frame of unfaded content
 * during bootstrap — far less annoying than a black screen.
 *
 * ### Why fadeTo THROWS on unregistered handles (asymmetric)
 *
 * Slots and UI handlers reach for `fadeTo` only when they expect a
 * specific layer to exist. A fadeTo on an unregistered handle means
 * "the slot is trying to orchestrate a layer that was never set up" —
 * a programmer error worth surfacing. The fail-safe path is the
 * draw-loop read; the explicit-call paths get the strict check.
 */

import type { FadeController } from '../../@types/animation/FadeController';
import type { FadeHandle } from '../../@types/animation/FadeHandle';
import type { FadeRegistry } from '../../@types/animation/FadeRegistry';
import { createFadeController, FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from './fadeController';

function serializeFadeHandle(h: FadeHandle): string {
  switch (h.kind) {
    case 'survey':      return `survey:${h.source}`;
    case 'filaments':   return 'filaments';
    case 'scalarField': return `scalarField:${h.field}`;
    case 'labelLayer':  return `labelLayer:${h.layer}`;
    case 'overlay':     return `overlay:${h.id}`;
  }
}

export function createFadeRegistry(): FadeRegistry {
  const controllers = new Map<string, FadeController>();

  function register(handle: FadeHandle, initialOpacity: number = 0): void {
    const key = serializeFadeHandle(handle);
    if (controllers.has(key)) return; // idempotent
    controllers.set(key, createFadeController(initialOpacity));
  }

  function unregister(handle: FadeHandle): void {
    controllers.delete(serializeFadeHandle(handle));
  }

  function requireController(handle: FadeHandle): FadeController {
    const c = controllers.get(serializeFadeHandle(handle));
    if (!c) {
      throw new Error(
        `FadeRegistry: handle not registered: ${serializeFadeHandle(handle)}`,
      );
    }
    return c;
  }

  function fadeTo(
    handle: FadeHandle,
    target: number,
    durationMs?: number,
  ): Promise<void> {
    const c = requireController(handle);
    const now = performance.now();
    const dur = durationMs ?? (
      target > c.currentOpacity(now) ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS
    );
    return c.fadeTo(target, dur, now);
  }

  function setImmediate(handle: FadeHandle, value: number): void {
    requireController(handle).setImmediate(value);
  }

  function opacityOf(handle: FadeHandle, nowMs?: number): number {
    const c = controllers.get(serializeFadeHandle(handle));
    if (!c) return 1.0; // fail-safe — see module docblock
    return c.currentOpacity(nowMs);
  }

  function isAnyAnimating(nowMs?: number): boolean {
    for (const c of controllers.values()) {
      if (c.isAnimating(nowMs)) return true;
    }
    return false;
  }

  function tick(nowMs?: number): void {
    for (const c of controllers.values()) c.tick(nowMs);
  }

  function destroy(): void {
    controllers.clear();
  }

  return {
    label: 'fadeRegistry',
    register,
    unregister,
    fadeTo,
    setImmediate,
    opacityOf,
    isAnyAnimating,
    tick,
    destroy,
  };
}
```

- [ ] **Step 2: Run tests to confirm they pass**

Run: `npm test -- tests/services/animation/fadeRegistry.test.ts`
Expected: PASS — all 13 tests green.

- [ ] **Step 3: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/animation/fadeRegistry.ts
git commit -m "$(cat <<'EOF'
feat(animation): implement FadeRegistry

Engine subsystem owning one FadeController per registered FadeHandle.
Fail-safe opacityOf=1.0 for unregistered handles; strict fadeTo throws.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.9: Wire FadeRegistry into EngineSubsystemHandles

**Files:**
- Modify: `src/@types/engine/handles/EngineSubsystemHandles.d.ts`
- Modify: `src/services/engine/engine.ts` (subsystem literal around line 410)

- [ ] **Step 1: Add `fades` to `EngineSubsystemHandles`**

In `src/@types/engine/handles/EngineSubsystemHandles.d.ts`, add the import (alphabetically near the other subsystem imports) and the field.

Replace the import block (lines 40-54):

```ts
import type { GalaxyAtlasSubsystem } from '../subsystems/GalaxyAtlasSubsystem';
import type { ProceduralDiskSubsystem } from '../subsystems/ProceduralDiskSubsystem';
import type { TexturedImpostorSubsystem } from '../subsystems/TexturedImpostorSubsystem';
import type { SpaceMouseSubsystem } from '../subsystems/SpaceMouseSubsystem';
import type { SelectionSubsystem } from '../subsystems/SelectionSubsystem';
import type { BiasCorrectionSubsystem } from '../subsystems/BiasCorrectionSubsystem';
import type { YouAreHereSubsystem } from '../subsystems/YouAreHereSubsystem';
import type { LabelDirectorSubsystem } from '../subsystems/LabelDirectorSubsystem';
import type { PoiSubsystem } from '../subsystems/PoiSubsystem';
import type { TweenManager } from '../../camera/TweenManager';
import type { ClickResolver } from '../ClickResolver';
import type { InputBindings } from '../../input/InputBindings';
import type { RenderScheduler } from '../subsystems/RenderScheduler';
import type { LoadProgressEmitter } from '../../loading/LoadProgressEmitter';
import type { Destroyable } from '../../rendering/Destroyable';
import type { FadeRegistry } from '../../animation/FadeRegistry';
```

Inside `export type EngineSubsystemHandles = { ... }`, add the new field directly after `scheduler: RenderScheduler;` (line 64):

```ts
  /**
   * Unified fade registry — owns one FadeController per registered
   * FadeHandle. Constructed eagerly in the engine state literal
   * BEFORE any renderer, so renderer construction (in `initGpu`) can
   * call `state.subsystems.fades.register(...)` without a null-check.
   * Drives the render-on-demand predicate (replacing per-renderer
   * isFading() checks) and the slot orchestration's fade-out → upload
   * → fade-in sequence. See `src/services/animation/fadeRegistry.ts`.
   */
  fades: FadeRegistry;
```

- [ ] **Step 2: Construct the registry in `engine.ts`'s state literal**

In `src/services/engine/engine.ts`, add an import near the top of the imports block (close to `createRenderScheduler`):

```ts
import { createFadeRegistry } from '../animation/fadeRegistry';
```

In the `subsystems: { ... }` literal (starts ~line 410), insert the `fades` field directly after the `scheduler` field's `createRenderScheduler(...)` call (around line 518). The block reads, after the change:

```ts
      scheduler: createRenderScheduler({ onFrame: () => frameRef.current() }),

      // ── Fade registry ──────────────────────────────────────────
      //
      // Constructed eagerly so renderer construction in `initGpu`
      // can register handles without a null-check. The registry is
      // pure CPU — no GPU device needed at construction time.
      fades: createFadeRegistry(),

      // The remaining subsystems land later in the IIFE once their
      // dependencies (GPU device, pickRenderer, scheduler) exist.
      clickResolver: null,
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. The `_EnforceDestroyable` guard inside `EngineSubsystemHandles.d.ts` checks `FadeRegistry extends Destroyable` — our `FadeRegistry` extends `Destroyable` so the check passes.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — no existing tests reference `state.subsystems.fades` yet, and the new field is additive.

- [ ] **Step 5: Commit**

```bash
git add src/@types/engine/handles/EngineSubsystemHandles.d.ts src/services/engine/engine.ts
git commit -m "$(cat <<'EOF'
feat(engine): wire FadeRegistry into state.subsystems.fades

Constructed eagerly in the state literal — renderers in initGpu can
now register handles without a null-check. No consumers yet.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Canonical bind-group layouts and WESL libs

### Task 2.1: WESL library — fadeUniforms

**Files:**
- Create: `src/services/gpu/shaders/lib/fadeUniforms.wesl`

- [ ] **Step 1: Create the WESL lib**

```wgsl
// lib/fadeUniforms.wesl — shared per-handle opacity uniform.
//
// Every fadeable layer (point survey, filament, scalar volume, label
// layer, always-on overlay) has a tiny 16-byte uniform buffer at
// '@group(1) @binding(0)' carrying the per-frame opacity value the
// FadeRegistry computed. The CPU side that owns the buffer + bind
// group + per-frame 'writeBuffer' lives in each renderer; this lib is
// the GPU half of the contract.
//
// ## Why one canonical struct
//
// Every consumer's 16-byte buffer has the same layout — one f32
// opacity + 12 bytes of pad. Sharing the struct across renderers makes
// drift structurally impossible: changing the layout here means every
// consumer's buffer-write code is wrong at the same time, surfaced as
// a single compile error in the shader linker.
//
// ## Why a fn at all if it's a one-liner
//
// 'color * opacity' would mistakenly attenuate RGB; we only want to
// scale alpha. The helper is intentionally scalar — 'applyFade(alpha,
// opacity) -> f32' — to match how the call sites multiply opacity into
// the scalar alpha alongside other modulators. Localising the
// "never let opacity attenuate RGB" invariant in one named helper
// gives it a documented home.
//
// Call this BEFORE the premultiplied-alpha output step (i.e. before
// folding 'rgb * alpha' into the return value).

struct FadeUniforms {
  // 0 → fully transparent, 1 → fully opaque (steady state).
  // Smoothstep-shaped on the CPU side by FadeController.
  opacity: f32,

  // Pad to 16-byte WebGPU-minimum uniform-buffer alignment. Never
  // written from the CPU side; never read here. Named individually
  // (rather than `_pad: vec3<f32>`) so a future field replacing one
  // slot doesn't break alignment — each pad is a free 4-byte slot.
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

// The alpha-only variant of fade — never let opacity attenuate RGB.
// Trivially 'alpha * opacity', wrapped so the invariant has a single
// documented home.
fn applyFade(alpha: f32, opacity: f32) -> f32 {
  return alpha * opacity;
}
```

- [ ] **Step 2: Verify build still succeeds**

Run: `npm run typecheck`
Expected: PASS — the new lib has no consumers yet; it just sits in `lib/`.

- [ ] **Step 3: Commit**

```bash
git add src/services/gpu/shaders/lib/fadeUniforms.wesl
git commit -m "$(cat <<'EOF'
feat(shaders): add canonical FadeUniforms WESL lib

Shared 16-byte struct + applyFade helper. No consumers yet; the
renderer migrations land in subsequent phases.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.2: WESL library — sourceUniforms (points only)

**Files:**
- Create: `src/services/gpu/shaders/lib/sourceUniforms.wesl`

- [ ] **Step 1: Create the WESL lib**

```wgsl
// lib/sourceUniforms.wesl — per-source 5-bit pick-ID uniform for the
// points pipeline.
//
// Carries this draw's 5-bit Source enum value (SDSS=1, TwoMRS=2, …).
// The points vertex stage reads 'source.sourceCode' and composes each
// instance's packed identity as '(sourceCode << 27u) | instance_index'
// for the selection-halo + pick-output paths.
//
// ## Why separated from FadeUniforms
//
// Two uniforms with different update cadences:
//   - fade.opacity:   written every frame, every consumer.
//   - source.sourceCode: written once at upload, points only.
//
// Co-locating them in one 16-byte uniform would force every per-frame
// fade write to read-modify-write the sourceCode bytes (or use a
// 4-byte-offset writeBuffer, coupling the layouts), and would give
// every non-points renderer (volumes, filaments, labels, overlays) a
// sourceCode slot they never read. Separating keeps each renderer
// paying only for the uniforms it actually needs.
//
// ## Why @group(2)
//
// @group(0) is the per-frame uniform (viewProj, viewport, …).
// @group(1) is FadeUniforms (universal).
// @group(2) is points-only — SourceUniforms.
//
// Non-points pipelines don't declare @group(2); their pipeline layouts
// list only @group(0) and @group(1).

struct SourceUniforms {
  // 5-bit Source enum value (SDSS=1, TwoMRS=2, Glade=3, Famous=4,
  // Synthetic=0). Stored as u32 because WGSL uniforms have no smaller
  // integer types and the pack-into-pickbuffer uses u32 arithmetic
  // anyway.
  sourceCode: u32,

  // Pad to 16-byte WebGPU-minimum uniform-buffer alignment. Never
  // written from the CPU side; never read here.
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
};
```

- [ ] **Step 2: Verify build still succeeds**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/services/gpu/shaders/lib/sourceUniforms.wesl
git commit -m "$(cat <<'EOF'
feat(shaders): add canonical SourceUniforms WESL lib

Points-only 5-bit sourceCode uniform at @group(2). No consumers yet.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.3: Canonical bind-group layout — fadeUniformsBgl

**Files:**
- Create: `src/services/gpu/bindGroupLayouts/fadeUniforms.ts`
- Create: `src/@types/rendering/FadeUniformsBgl.d.ts`

- [ ] **Step 1: Create the BGL type**

`src/@types/rendering/FadeUniformsBgl.d.ts`:

```ts
/**
 * FadeUniformsBgl — opaque newtype for the canonical fade-uniforms
 * bind-group layout. Same identity used by every consumer pipeline.
 *
 * The newtype exists solely to make accidental swaps between the fade
 * BGL and the source BGL impossible at the type level — both happen to
 * be `GPUBindGroupLayout` at the GPU level, but mixing them up would
 * silently produce a wrong-binding pipeline that fails validation at
 * draw time with an unhelpful error.
 */

export type FadeUniformsBgl = GPUBindGroupLayout & { readonly __brand: 'FadeUniformsBgl' };
```

- [ ] **Step 2: Create the BGL factory**

`src/services/gpu/bindGroupLayouts/fadeUniforms.ts`:

```ts
/**
 * fadeUniforms — canonical bind-group layout for the universal
 * @group(1) FadeUniforms binding.
 *
 * Why canonical (not `layout: 'auto'`)?
 *
 * Per CLAUDE.md → "WebGPU layout:'auto' bind groups don't cross
 * pipelines": auto-derived layouts are pipeline-specific identities.
 * Sharing one bind group across two auto-layout pipelines fails the
 * "group-equivalent" compatibility check at draw time. By building one
 * canonical layout at engine bootstrap and threading it into every
 * pipeline's `device.createPipelineLayout({ bindGroupLayouts: [...] })`,
 * we get a single layout identity that every consumer's bind groups
 * are valid against. No per-pipeline bind-group reconstruction.
 *
 * The buffer is fragment-stage-visible because points, filaments,
 * volumes, and labels all multiply opacity into fragment alpha. Adding
 * `GPUShaderStage.VERTEX` would make the binding available for vertex-
 * stage reads too — but no current consumer reads opacity in the
 * vertex stage, so we keep it fragment-only. (Volumes' raymarch is
 * fragment-stage; points compute the smoothstep in the fragment; etc.)
 */

import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';

export function createFadeUniformsBgl(device: GPUDevice): FadeUniformsBgl {
  return device.createBindGroupLayout({
    label: 'fadeUniforms-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  }) as FadeUniformsBgl;
}
```

- [ ] **Step 3: Write a smoke test**

Create `tests/services/gpu/bindGroupLayouts/fadeUniforms.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createFadeUniformsBgl } from '../../../../src/services/gpu/bindGroupLayouts/fadeUniforms';

describe('createFadeUniformsBgl', () => {
  it('builds a uniform-buffer bind-group layout at binding 0, fragment-visible', () => {
    const createBindGroupLayout = vi.fn().mockReturnValue({ __mock: 'bgl' });
    const fakeDevice = { createBindGroupLayout } as unknown as GPUDevice;
    const bgl = createFadeUniformsBgl(fakeDevice);
    expect(bgl).toBeDefined();
    expect(createBindGroupLayout).toHaveBeenCalledTimes(1);
    const arg = createBindGroupLayout.mock.calls[0]![0]!;
    expect(arg.entries).toHaveLength(1);
    expect(arg.entries[0].binding).toBe(0);
    expect(arg.entries[0].visibility).toBe(GPUShaderStage.FRAGMENT);
    expect(arg.entries[0].buffer.type).toBe('uniform');
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- tests/services/gpu/bindGroupLayouts/fadeUniforms.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/@types/rendering/FadeUniformsBgl.d.ts src/services/gpu/bindGroupLayouts/fadeUniforms.ts tests/services/gpu/bindGroupLayouts/fadeUniforms.test.ts
git commit -m "$(cat <<'EOF'
feat(gpu): add canonical FadeUniforms bind-group layout

Newtype-branded GPUBindGroupLayout shared across every consumer
pipeline. Sidesteps the layout:'auto' cross-pipeline trap.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.4: Canonical bind-group layout — sourceUniformsBgl

**Files:**
- Create: `src/services/gpu/bindGroupLayouts/sourceUniforms.ts`
- Create: `src/@types/rendering/SourceUniformsBgl.d.ts`

- [ ] **Step 1: Create the BGL type**

`src/@types/rendering/SourceUniformsBgl.d.ts`:

```ts
/**
 * SourceUniformsBgl — opaque newtype for the points-only canonical
 * source-uniforms bind-group layout. Used by both the visual
 * PointRenderer and the offscreen PickRenderer (they share the layout
 * identity so bind groups built once can be passed to either pipeline).
 */

export type SourceUniformsBgl = GPUBindGroupLayout & { readonly __brand: 'SourceUniformsBgl' };
```

- [ ] **Step 2: Create the BGL factory**

`src/services/gpu/bindGroupLayouts/sourceUniforms.ts`:

```ts
/**
 * sourceUniforms — canonical bind-group layout for the points-only
 * @group(2) SourceUniforms binding.
 *
 * Used by both the visual PointRenderer pipeline and the offscreen
 * PickRenderer pipeline. Sharing the layout identity means each
 * per-source SourceUniforms bind group built against this layout is
 * valid for either pipeline — exactly what the old `cloudFadeBuffer`
 * piggyback achieved less directly. See CLAUDE.md → "WebGPU
 * layout:'auto' bind groups don't cross pipelines" for the underlying
 * rationale.
 *
 * Vertex-stage visibility because the points vertex stage reads
 * `source.sourceCode` to compose '(sourceCode << 27u) | instance_index'.
 * The fragment stages (color + pick) don't read this binding directly,
 * but the pipeline layout must list every binding the shader modules
 * declare — the pick fragment relies on the vertex's packSelection
 * output through VSOut.instanceIdx.
 */

import type { SourceUniformsBgl } from '../../../@types/rendering/SourceUniformsBgl';

export function createSourceUniformsBgl(device: GPUDevice): SourceUniformsBgl {
  return device.createBindGroupLayout({
    label: 'sourceUniforms-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      },
    ],
  }) as SourceUniformsBgl;
}
```

- [ ] **Step 3: Write a smoke test**

Create `tests/services/gpu/bindGroupLayouts/sourceUniforms.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createSourceUniformsBgl } from '../../../../src/services/gpu/bindGroupLayouts/sourceUniforms';

describe('createSourceUniformsBgl', () => {
  it('builds a uniform-buffer bind-group layout at binding 0, vertex-visible', () => {
    const createBindGroupLayout = vi.fn().mockReturnValue({ __mock: 'bgl' });
    const fakeDevice = { createBindGroupLayout } as unknown as GPUDevice;
    const bgl = createSourceUniformsBgl(fakeDevice);
    expect(bgl).toBeDefined();
    expect(createBindGroupLayout).toHaveBeenCalledTimes(1);
    const arg = createBindGroupLayout.mock.calls[0]![0]!;
    expect(arg.entries).toHaveLength(1);
    expect(arg.entries[0].binding).toBe(0);
    expect(arg.entries[0].visibility).toBe(GPUShaderStage.VERTEX);
    expect(arg.entries[0].buffer.type).toBe('uniform');
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- tests/services/gpu/bindGroupLayouts/sourceUniforms.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/@types/rendering/SourceUniformsBgl.d.ts src/services/gpu/bindGroupLayouts/sourceUniforms.ts tests/services/gpu/bindGroupLayouts/sourceUniforms.test.ts
git commit -m "$(cat <<'EOF'
feat(gpu): add canonical SourceUniforms bind-group layout

Points-only @group(2) layout shared by both visual and pick pipelines.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.5: Add fadeBgl / sourceBgl to EngineGpuHandles

**Files:**
- Modify: `src/@types/engine/handles/EngineGpuHandles.d.ts`
- Modify: `src/services/engine/engine.ts` (state literal `gpu: { ... }` block)
- Modify: `src/services/engine/phases/initGpu.ts`

- [ ] **Step 1: Read `EngineGpuHandles.d.ts` to find the insertion point**

Run: `head -80 src/@types/engine/handles/EngineGpuHandles.d.ts`
Note the existing fields (`renderer`, `filamentRenderer`, `scalarVolumeRenderer`, etc.). Add the two new BGL fields directly after the renderer fields, with the imports near the top.

- [ ] **Step 2: Add the imports to `EngineGpuHandles.d.ts`**

```ts
import type { FadeUniformsBgl } from '../../rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../rendering/SourceUniformsBgl';
```

Add two new fields to the `export type EngineGpuHandles = { ... }` body, after the renderer fields:

```ts
  /**
   * Canonical FadeUniforms bind-group layout (@group(1)). Constructed
   * once in `initGpu` and shared by every renderer pipeline that fades.
   * Null until `initGpu` resolves; see EngineGpuHandles docblock on the
   * staged-construction pattern.
   */
  fadeBgl: FadeUniformsBgl | null;
  /**
   * Canonical SourceUniforms bind-group layout (@group(2), points
   * only). Constructed once in `initGpu` and shared between the
   * visual PointRenderer and the offscreen PickRenderer. Null until
   * `initGpu` resolves.
   */
  sourceBgl: SourceUniformsBgl | null;
```

- [ ] **Step 3: Initialize them as `null` in the engine.ts state literal**

In `src/services/engine/engine.ts`, inside `gpu: { ... }` literal, add (alongside the other null GPU handles, like `renderer: null`):

```ts
      fadeBgl: null,
      sourceBgl: null,
```

- [ ] **Step 4: Construct them in `initGpu`**

In `src/services/engine/phases/initGpu.ts`, near the top of the phase body (right after `state.gpu.device = device;` or wherever the device becomes available), add:

```ts
import { createFadeUniformsBgl } from '../../gpu/bindGroupLayouts/fadeUniforms';
import { createSourceUniformsBgl } from '../../gpu/bindGroupLayouts/sourceUniforms';

// ... then inside the phase function, after device acquisition:

  // Build the canonical fade + source bind-group layouts ONCE — every
  // renderer pipeline below threads these into createPipelineLayout so
  // each consumer's bind groups are valid across pipelines. See
  // src/services/gpu/bindGroupLayouts/fadeUniforms.ts for the rationale.
  state.gpu.fadeBgl = createFadeUniformsBgl(device);
  state.gpu.sourceBgl = createSourceUniformsBgl(device);
```

(The exact line number in `initGpu.ts` will vary; place the construction immediately after `device` is acquired and before any renderer factory is called.)

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — the renderers don't consume these yet; the fields are additive.

- [ ] **Step 6: Commit**

```bash
git add src/@types/engine/handles/EngineGpuHandles.d.ts src/services/engine/engine.ts src/services/engine/phases/initGpu.ts
git commit -m "$(cat <<'EOF'
feat(engine): construct canonical fade + source BGLs in initGpu

Stored on state.gpu.fadeBgl / state.gpu.sourceBgl, available to every
renderer factory below. No consumers yet — the renderer migrations
land in Phases 3+.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: pointRenderer migration

The points migration is the largest. It's split into five tasks: shaders, BufferEntry shape, factory wiring, draw-loop integration, and removing `isFading()`.

### Task 3.1: Update points WESL shaders for split uniforms

**Files:**
- Modify: `src/services/gpu/shaders/points/vertex.wesl`
- Modify: `src/services/gpu/shaders/points/colorFragment.wesl`

- [ ] **Step 1: Update `vertex.wesl`**

Replace the import + binding declarations + `packSelection` call site. The new top of `vertex.wesl` (lines 30-60 currently) becomes:

```wgsl
import package::points::io::Uniforms;
import package::points::io::PerVertex;
import package::points::io::VSOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::sourceUniforms::SourceUniforms;
import package::lib::colorIndex::ramp;
import package::lib::astro::distanceModulus;
import package::lib::selectionEncoding::packSelection;

// ── @group(0) — per-frame uniforms ──────────────────────────────────
//
// Same binding numbers as colorFragment.wesl. Both renderers' uniform
// buffers carry the layout described in 'points/io.wesl::Uniforms'.
@group(0) @binding(0) var<uniform> u: Uniforms;

// ── @group(1) — FadeUniforms (declared but unused at vertex stage) ─
//
// We don't re-declare FadeUniforms here because the vertex stage
// never reads it — only the fragment stage multiplies fade.opacity
// into alpha. The pipeline layout's @group(1) slot is still present
// (the fragment module declares it), so the bind group built by the
// renderer is valid; the vertex module simply doesn't reference the
// binding.

// ── @group(2) — per-source SourceUniforms ──────────────────────────
//
// Each loaded survey has its OWN @group(2) bind group whose buffer
// carries SourceUniforms's 16-byte struct (sourceCode + 12 bytes pad).
// Per-source bind groups dodge the 'queue.writeBuffer' race entirely
// (different uniform buffers per source means writes to one don't
// race against draws against another). The vertex stage reads
// 'source.sourceCode' to compose '(sourceCode << 27u) | instance_index'
// for the selection-halo + pick-output paths.
@group(2) @binding(0) var<uniform> source: SourceUniforms;
```

Then in the body of `vs(...)`, replace **every** reference to `cloud.sourceCode` with `source.sourceCode`. There is one such reference, on the line currently reading:

```wgsl
  let myPacked = packSelection(cloud.sourceCode, ii);
```

After the change:

```wgsl
  let myPacked = packSelection(source.sourceCode, ii);
```

Everything else in `vertex.wesl` stays unchanged.

- [ ] **Step 2: Update `colorFragment.wesl`**

Replace the imports + binding declarations at the top (currently lines 22-29). The new top becomes:

```wgsl
import package::points::io::Uniforms;
import package::points::io::VSOut;
import package::lib::math::saturate;
import package::lib::fadeUniforms::FadeUniforms;
import package::lib::fadeUniforms::applyFade;

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(1) @binding(0) var<uniform> fade: FadeUniforms;
```

Then in the body of `fs(...)`, replace the line currently reading:

```wgsl
  alpha = applyCloudFade(alpha, cloud.opacity);
```

with:

```wgsl
  alpha = applyFade(alpha, fade.opacity);
```

Everything else in `colorFragment.wesl` stays unchanged. Note: the original imported `applyCloudFade` from `cloudFade.wesl`; we now import `applyFade` from `fadeUniforms.wesl`. The function is identical (`return alpha * opacity;`) but renamed for clarity.

- [ ] **Step 3: Check pickFragment.wesl for fade references**

Run: `grep -n "cloud\|fade\|applyCloudFade\|CloudUniforms" src/services/gpu/shaders/points/pickFragment.wesl`

Expected: no matches OR matches only in comments. The pick fragment uses the vertex's `VSOut.instanceIdx` directly and does not need fade. If matches appear in code, edit `pickFragment.wesl` to remove every `cloud.*` reference and the `import package::lib::cloudFade::CloudUniforms;` line.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck`
Expected: PASS — TypeScript doesn't compile WESL, so the .wesl edits don't surface here.

Note: the shaders won't actually link until pointRenderer is updated to provide the new bind groups (Task 3.3). Don't run the renderer tests yet — they'll fail at runtime when the shader linker complains about missing @group(2) bindings.

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/shaders/points/vertex.wesl src/services/gpu/shaders/points/colorFragment.wesl src/services/gpu/shaders/points/pickFragment.wesl
git commit -m "$(cat <<'EOF'
refactor(shaders): split points cloud uniform into fade + source

vertex.wesl now imports SourceUniforms at @group(2); colorFragment.wesl
imports FadeUniforms at @group(1). The renderer wiring lands in the
next task; this commit alone will not link.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.2: Update PointRenderer types — BufferEntry + remove cloudFadeBuffer

**Files:**
- Modify: `src/@types/rendering/PointRenderer.d.ts`
- Modify: `src/@types/rendering/PickSourceDraw.d.ts`

- [ ] **Step 1: Update `PointRenderer.d.ts`**

Replace the `loadedSources()` return type's inline shape (lines 59-64 currently). The full block becomes:

```ts
  loadedSources(): IterableIterator<{
    source: Source;
    vertexBuffer: GPUBuffer;
    count: number;
    /**
     * The per-source SourceUniforms GPU buffer (16 bytes — sourceCode
     * u32 + 12 bytes pad). PickRenderer builds its OWN per-source
     * @group(2) bind group around this buffer using the canonical
     * sourceUniformsBgl layout (shared with the visual pipeline). The
     * underlying GPUBuffer is shared; PickRenderer's bind group is
     * just a per-pipeline view of the same bytes.
     *
     * The buffer is written ONCE at upload time (sourceCode never
     * changes for a given source) and read by both the visual and
     * pick pipelines on every draw.
     */
    sourceBuffer: GPUBuffer;
  }>;
```

Remove the `isFading(): boolean;` line entirely (line 88 currently). The render-on-demand predicate now consults the registry instead.

- [ ] **Step 2: Update `PickSourceDraw.d.ts`**

Replace the `cloudFadeBuffer: GPUBuffer;` line with:

```ts
  /**
   * The per-source SourceUniforms GPU buffer (was `cloudFadeBuffer`
   * pre-unified-fade). PickRenderer builds its own bind group against
   * the canonical sourceUniformsBgl layout to bind this buffer at
   * @group(2). Per-source identity (the 5-bit sourceCode) flows from
   * here into the picker's packed (sourceCode << 27 | instanceIdx)
   * output.
   */
  sourceBuffer: GPUBuffer;
```

- [ ] **Step 3: Run typecheck — expect failures**

Run: `npm run typecheck`
Expected: FAIL with type errors in `pointRenderer.ts` (still using `fade` / `CloudFade` and `cloudFadeBuffer`) and `pickRenderer.ts` (still using `src.cloudFadeBuffer`). These are fixed in the next two tasks.

Note: do not commit yet. The next task fixes the renderer.

---

### Task 3.3: pointRenderer factory — replace CloudFade with per-source fade+source buffers

**Files:**
- Modify: `src/services/gpu/renderers/pointRenderer.ts`

- [ ] **Step 1: Remove the `CloudFade` import**

In `pointRenderer.ts`, delete the line:

```ts
import { CloudFade } from '../resources/cloudFade';
```

Add new imports (alongside the existing `Source` / shaders / etc. block near the top):

```ts
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../../@types/rendering/SourceUniformsBgl';
```

- [ ] **Step 2: Update the factory signature**

Change `createPointRenderer` (around line 590) to accept the two canonical BGLs:

```ts
export function createPointRenderer(
  device: GPUDevice,
  format: GPUTextureFormat,
  fadeBgl: FadeUniformsBgl,
  sourceBgl: SourceUniformsBgl,
): PointRenderer {
```

- [ ] **Step 3: Update the pipeline to use a canonical pipeline layout**

In the `device.createRenderPipeline({ ... })` call (around line 608), replace `layout: 'auto'` with an explicit pipeline layout. The relevant section becomes:

```ts
  const pipelineLayout = device.createPipelineLayout({
    label: 'points-pipeline-layout',
    bindGroupLayouts: [
      // @group(0) — per-frame uniforms (viewProj, viewport, …). Built
      // from the pipeline's auto-derived layout via getBindGroupLayout(0)
      // below since it's pipeline-specific to this renderer.
      device.createBindGroupLayout({
        label: 'points-bgl-group0',
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        ],
      }),
      // @group(1) — FadeUniforms (canonical, shared with every fading renderer).
      fadeBgl,
      // @group(2) — SourceUniforms (canonical, shared with PickRenderer).
      sourceBgl,
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'points-pipeline',
    layout: pipelineLayout,
    // ... (vertex, fragment, primitive unchanged from current — copy verbatim)
  });
```

Important: keep the existing `vertex`, `fragment`, and `primitive` blocks of `createRenderPipeline` byte-identical (don't simplify them). Only the `layout` field changes from `'auto'` to `pipelineLayout`.

- [ ] **Step 4: Update the global `bindGroup` to use the explicit @group(0) layout**

The current code reads `pipeline.getBindGroupLayout(0)`. That still works against the explicit pipeline layout (`getBindGroupLayout(0)` returns the layout we passed at index 0). Leave that line unchanged.

- [ ] **Step 5: Update the `BufferEntry` local type**

Find the inline-typed `clouds` Map (around lines 562-566). Update the `LoadedSource` (or whatever the inline type is called in this file — read the surrounding lines to confirm) to:

```ts
type BufferEntry = {
  buffer: GPUBuffer;
  count: number;
  interleaved: Float32Array;
  /**
   * 16-byte GPU buffer holding the per-source FadeUniforms struct
   * (opacity f32 + 12 bytes pad). Written once per frame in `draw`
   * from the registry-read opacity value.
   */
  fadeBuffer: GPUBuffer;
  /**
   * Bind group binding `fadeBuffer` at @group(1) @binding(0) using
   * the canonical `fadeBgl` layout (so the same bind group works for
   * both the visual and pick pipelines).
   */
  fadeBindGroup: GPUBindGroup;
  /**
   * 16-byte GPU buffer holding the per-source SourceUniforms struct
   * (sourceCode u32 + 12 bytes pad). Written ONCE at upload time
   * (sourceCode never changes for a given source) and read by both
   * the visual and pick pipelines.
   */
  sourceBuffer: GPUBuffer;
  /**
   * Bind group binding `sourceBuffer` at @group(2) @binding(0) using
   * the canonical `sourceBgl` layout.
   */
  sourceBindGroup: GPUBindGroup;
};

const clouds = new Map<Source, BufferEntry>();
```

(Adjust the exact location of this type definition and the `clouds` Map declaration to match the file's existing structure; the surrounding context lives around lines 540-566 of the current file.)

- [ ] **Step 6: Update `upload(source, cloud)` to allocate the new buffers**

Find the `upload` function body (around line 750-869 currently). Replace the existing `CloudFade` block (lines 832-862, including `prev.fade.restart()`, the `new CloudFade(...)` call, and `fade.setSourceCode(source)`) with the explicit two-buffer allocation. The relevant section of `upload` becomes:

```ts
    // Destroy or recycle the previous-source state before replacing it.
    const prev = clouds.get(source);
    if (prev) {
      prev.buffer.destroy();
      prev.fadeBuffer.destroy();
      prev.sourceBuffer.destroy();
    }

    const buffer = device.createBuffer({
      label: `points-vertex-buffer-${source}`,
      size: interleaved.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, interleaved);

    // FadeUniforms — 16 bytes, written per frame from the registry.
    const fadeBuffer = device.createBuffer({
      label: `points-fade-uniform-${source}`,
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const fadeBindGroup = device.createBindGroup({
      label: `points-fade-bg-${source}`,
      layout: fadeBgl,
      entries: [{ binding: 0, resource: { buffer: fadeBuffer } }],
    });

    // SourceUniforms — 16 bytes, written ONCE here at upload time. The
    // 5-bit Source enum value never changes for a given source, so a
    // per-frame write would be wasted bytes. Pack sourceCode into the
    // first 4 bytes and leave the rest zero.
    const sourceBuffer = device.createBuffer({
      label: `points-source-uniform-${source}`,
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const sourceScratch = new ArrayBuffer(16);
    new Uint32Array(sourceScratch)[0] = source >>> 0;
    device.queue.writeBuffer(sourceBuffer, 0, sourceScratch);
    const sourceBindGroup = device.createBindGroup({
      label: `points-source-bg-${source}`,
      layout: sourceBgl,
      entries: [{ binding: 0, resource: { buffer: sourceBuffer } }],
    });

    clouds.set(source, {
      buffer,
      count: cloud.count,
      interleaved,
      fadeBuffer,
      fadeBindGroup,
      sourceBuffer,
      sourceBindGroup,
    });

    biasUploadCallback?.(source, cloud);
```

- [ ] **Step 7: Update `unload(source)` to destroy the new buffers**

Find the `unload` function (around line 877). Replace its body with:

```ts
  function unload(source: Source): void {
    const entry = clouds.get(source);
    if (!entry) return;
    entry.buffer.destroy();
    entry.fadeBuffer.destroy();
    entry.sourceBuffer.destroy();
    clouds.delete(source);
    biasUnloadCallback?.(source);
  }
```

- [ ] **Step 8: Update `destroy()` to destroy the new buffers**

Find the `destroy` function (around line 1319). Replace the per-entry teardown loop with:

```ts
  function destroy(): void {
    for (const entry of clouds.values()) {
      entry.buffer.destroy();
      entry.fadeBuffer.destroy();
      entry.sourceBuffer.destroy();
    }
    clouds.clear();
    uniformBuffer.destroy();
  }
```

- [ ] **Step 9: Update `loadedSources()` generator to emit `sourceBuffer`**

Find the `loadedSourcesGen` generator (around line 1034). Replace the yielded shape:

```ts
  function* loadedSourcesGen(): IterableIterator<{
    source: Source;
    vertexBuffer: GPUBuffer;
    count: number;
    sourceBuffer: GPUBuffer;
  }> {
    for (const source of ALL_SOURCES) {
      const entry = clouds.get(source);
      if (!entry) continue;
      yield {
        source,
        vertexBuffer: entry.buffer,
        count: entry.count,
        sourceBuffer: entry.sourceBuffer,
      };
    }
  }
  function loadedSources(): IterableIterator<{
    source: Source;
    vertexBuffer: GPUBuffer;
    count: number;
    sourceBuffer: GPUBuffer;
  }> {
    return loadedSourcesGen();
  }
```

- [ ] **Step 10: Update the `draw` loop to bind @group(1) + @group(2) and write fade per frame**

Find the per-source draw loop (around lines 1214-1226). It currently reads:

```ts
    for (const source of ALL_SOURCES) {
      const entry = clouds.get(source);
      if (!entry) continue;
      if (((visibleSourceMask >> source) & 1) === 0) continue;
      entry.fade.writeFrame();
      pass.setBindGroup(1, entry.fade.bindGroup);
      pass.setVertexBuffer(0, entry.buffer);
      pass.draw(6, entry.count);
    }
```

Replace with (the new `settings` object will carry a `fadeOpacity` lookup — see Task 3.4 for the signature change; for now use a closure-captured callback):

```ts
    for (const source of ALL_SOURCES) {
      const entry = clouds.get(source);
      if (!entry) continue;
      if (((visibleSourceMask >> source) & 1) === 0) continue;

      // Read the registry-managed opacity for THIS source's handle and
      // write it into the per-source fadeBuffer. One 16-byte writeBuffer
      // per visible survey per frame — negligible.
      const opacity = settings.fadeOpacityOf(source);
      fadeScratchF32[0] = opacity;
      // f32[1..3] (the three pad slots) stay zero.
      device.queue.writeBuffer(entry.fadeBuffer, 0, fadeScratchBuffer);

      pass.setBindGroup(1, entry.fadeBindGroup);
      pass.setBindGroup(2, entry.sourceBindGroup);
      pass.setVertexBuffer(0, entry.buffer);
      pass.draw(6, entry.count);
    }
```

At the top of the factory body (alongside other closure-captured const allocations like `uniformBuffer`), add the reusable scratch buffer:

```ts
  // Reusable scratch for the per-source per-frame fade writeBuffer call.
  // 16 bytes = opacity f32 + 12 bytes pad. The pad slots stay zero
  // (ArrayBuffer is zero-initialised; we never write them).
  const fadeScratchBuffer = new ArrayBuffer(16);
  const fadeScratchF32 = new Float32Array(fadeScratchBuffer);
```

- [ ] **Step 11: Remove the `isFading` function**

Delete the `function isFading(): boolean { ... }` block (around lines 1236-1241) and the `isFading,` entry from the returned `renderer` object (line 1358).

- [ ] **Step 12: Don't typecheck yet — the type of `PointDrawSettings` and the engine.ts call site still need work**

These land in Task 3.4. For now we have a complete renderer that compiles given the type changes; let the next task land the consumer updates.

- [ ] **Step 13: Stage but DO NOT commit yet — Task 3.4 must land in the same commit to keep the build green**

---

### Task 3.4: Update PointDrawSettings, runFrame, and PickRenderer for the new shape

**Files:**
- Modify: `src/@types/rendering/PointDrawSettings.d.ts`
- Modify: `src/services/engine/frame/runFrame.ts`
- Modify: `src/services/gpu/renderers/pickRenderer.ts`
- Modify: `src/services/engine/phases/initGpu.ts` (createPointRenderer call site)

- [ ] **Step 1: Add `fadeOpacityOf` to `PointDrawSettings`**

In `src/@types/rendering/PointDrawSettings.d.ts`, add a new readonly field:

```ts
  /**
   * Look up the registry-managed opacity for a given source. Called
   * once per visible source per frame from the points draw loop;
   * the renderer writes the returned value into the per-source
   * fadeBuffer. Closure-captured by the runFrame body around
   * `state.subsystems.fades.opacityOf({ kind: 'survey', source }, now)`.
   */
  readonly fadeOpacityOf: (source: Source) => number;
```

(Add `import type { Source } from '../../data/sources';` to the file if not already imported.)

- [ ] **Step 2: Wire `fadeOpacityOf` in `runFrame.ts`**

In `src/services/engine/frame/runFrame.ts`, find the call site that builds the `PointDrawSettings` object passed to `renderer.draw(...)`. Add the new field:

```ts
  fadeOpacityOf: (source) =>
    state.subsystems.fades.opacityOf({ kind: 'survey', source }, now),
```

The `now` value is the `performance.now()` (or scheduler-supplied timestamp) already used in the surrounding code; reuse the same binding.

- [ ] **Step 3: Update `pickRenderer.ts` to bind `sourceBindGroup` at @group(2) using `sourceBgl`**

In `src/services/gpu/renderers/pickRenderer.ts`, the pick factory currently builds per-source bind groups against `pipeline.getBindGroupLayout(1)` (around lines 484-493). The replacement uses the canonical `sourceBgl` against `@group(2)`.

First, update the factory signature to accept `sourceBgl`:

```ts
export function createPickRenderer(
  device: GPUDevice,
  // ... existing params ...
  sourceBgl: SourceUniformsBgl,
): PickRenderer {
```

Then update the pipeline layout. The pick pipeline must declare `@group(1)` (Fade, fragment-stage — even though the pick fragment doesn't read it, the vertex shader is shared and its bound bind groups must match the pipeline layout — actually wait, the pick fragment doesn't import FadeUniforms; the shared vertex.wesl now imports SourceUniforms at @group(2) only). Re-read the pick fragment to confirm.

Run: `grep -n "@group\|import" src/services/gpu/shaders/points/pickFragment.wesl`

If `pickFragment.wesl` declares no @group(1) and the vertex.wesl no longer imports FadeUniforms, then the pick pipeline layout only needs @group(0) and @group(2) — but WGSL doesn't allow gaps in @group numbering when bound. The fix is to give the pick pipeline an explicit pipeline layout listing all three groups, with @group(1) bound to a dummy or unused layout, OR add a no-op fade-uniforms declaration in pickFragment.wesl that the linker can satisfy.

The simplest correct approach: make `pickFragment.wesl` also bind `@group(1) @binding(0) var<uniform> fade: FadeUniforms;` even though it doesn't read it, so the pipeline layout's @group(1) is satisfied; otherwise WebGPU validation will fail at draw time because the visual pipeline binds @group(1) and the pick pipeline doesn't declare it.

Add to `pickFragment.wesl`'s imports + declarations (re-read the current file first to confirm exact line numbers; insert near the existing imports at the top):

```wgsl
import package::lib::fadeUniforms::FadeUniforms;

@group(1) @binding(0) var<uniform> fade: FadeUniforms;
```

(The pick fragment doesn't read `fade`, but the binding is required so the pipeline layout matches what the visual shaders expect — and so the pick pipeline can reuse the visual renderer's @group(1) bind group identity.)

Now in `pickRenderer.ts`, build the pipeline layout explicitly:

```ts
  const pipelineLayout = device.createPipelineLayout({
    label: 'pick-pipeline-layout',
    bindGroupLayouts: [
      device.createBindGroupLayout({
        label: 'pick-bgl-group0',
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        ],
      }),
      fadeBgl,   // @group(1) — passed in from caller; must match visual pipeline
      sourceBgl, // @group(2) — passed in from caller; shared identity with visual
    ],
  });
```

(Also extend the factory signature to accept `fadeBgl: FadeUniformsBgl` alongside `sourceBgl`.)

In the pick `pick()` body (around line 484), replace the per-source bind-group block:

```ts
    // Build per-source @group(2) bind groups against the SHARED
    // canonical sourceBgl layout — no longer pipeline-specific, so
    // the same bind group identity could be used for the visual pass
    // (but we still build a fresh per-pipeline group here because the
    // pick pipeline runs in its own pass with its own command encoder).
    for (const src of sourceList) {
      const sourceBindGroup = device.createBindGroup({
        label: `pick-bg-source-${src.source}`,
        layout: sourceBgl,
        entries: [{ binding: 0, resource: { buffer: src.sourceBuffer } }],
      });
      // Bind a zeroed @group(1) — the pick pass doesn't use fade.opacity
      // but the pipeline layout requires the binding to be present.
      // Reusing the same dummy buffer across draws is fine; no race
      // because @group(1) is read-only at the pipeline level.
      pass.setBindGroup(1, dummyFadeBindGroup);
      pass.setBindGroup(2, sourceBindGroup);
      pass.setVertexBuffer(0, src.vertexBuffer);
      pass.draw(6, src.count);
    }
```

At the top of the factory body, add the dummy fade buffer + bind group (these live for the pick renderer's lifetime; one allocation, never freed until `destroy()`):

```ts
  // Pick pipeline declares @group(1) (FadeUniforms) to match the
  // shared vertex shader's pipeline-layout shape, but the pick
  // fragment doesn't read fade.opacity. A zeroed buffer is fine —
  // the pick pipeline writes to the r32uint pick texture, not the
  // visual swap chain, so opacity has no observable effect.
  const dummyFadeBuffer = device.createBuffer({
    label: 'pick-fade-uniform-dummy',
    size: 16,
    usage: GPUBufferUsage.UNIFORM,
  });
  const dummyFadeBindGroup = device.createBindGroup({
    label: 'pick-fade-bg-dummy',
    layout: fadeBgl,
    entries: [{ binding: 0, resource: { buffer: dummyFadeBuffer } }],
  });
```

In the pick `destroy()`, add:

```ts
    dummyFadeBuffer.destroy();
```

- [ ] **Step 4: Update the `createPointRenderer` and `createPickRenderer` call sites in `initGpu.ts`**

Find the calls (in `src/services/engine/phases/initGpu.ts` or nearby phase files). Update each to pass the BGLs:

```ts
const renderer = createPointRenderer(device, format, state.gpu.fadeBgl!, state.gpu.sourceBgl!);
// ...
const pickRenderer = createPickRenderer(device, /* existing args */, state.gpu.fadeBgl!, state.gpu.sourceBgl!);
```

The `!` is safe here because `initGpu` constructed the BGLs at the top of the phase (Task 2.5).

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. If errors remain, they're in places referencing the old `entry.fade.*` or `entry.cloudFadeBuffer` — find them with `grep -rn "cloudFadeBuffer\|\.fade\.\|CloudFade" src/` and fix each call site.

- [ ] **Step 6: Run the test suite**

Run: `npm test`
Expected: PASS except for tests that exercise the removed `pointRenderer.isFading()` — those will be addressed in Task 3.5. If any other test fails, debug before continuing.

- [ ] **Step 7: Commit the points migration (3.2 + 3.3 + 3.4 together)**

```bash
git add src/@types/rendering/PointRenderer.d.ts src/@types/rendering/PickSourceDraw.d.ts src/@types/rendering/PointDrawSettings.d.ts src/services/gpu/renderers/pointRenderer.ts src/services/gpu/renderers/pickRenderer.ts src/services/gpu/shaders/points/pickFragment.wesl src/services/engine/frame/runFrame.ts src/services/engine/phases/initGpu.ts
git commit -m "$(cat <<'EOF'
refactor(gpu): migrate pointRenderer off CloudFade onto FadeRegistry

- BufferEntry gains fadeBuffer + sourceBuffer + their bind groups.
- @group(1) is FadeUniforms (canonical), @group(2) is SourceUniforms.
- Per-frame fade.opacity write reads from state.subsystems.fades.
- Source 5-bit code written once at upload, never per-frame.
- PickRenderer threads the shared sourceBgl identity at @group(2).
- pointRenderer.isFading() removed from the type and implementation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.5: Register survey handles in galaxyCatalogSourceRegistry

**Files:**
- Modify: `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts`

- [ ] **Step 1: Add the registration call**

In `wireGalaxyCatalogSourceSlot` (around line 207-285), add a `fades.register` call near the top of the function body, before the `createAssetSlot` call. The full edit:

```ts
export function wireGalaxyCatalogSourceSlot(
  state: EngineState,
  cfg: GalaxyCatalogSourceConfig,
  deps: WirePointSourceDeps,
): void {
  const { source, fetcher } = cfg;
  const { cb } = deps;
  const slotName = `${sourceName(source)}-points`;

  // Register the survey's fade handle at opacity 0 — the slot commit
  // will fadeTo(1, FADE_IN_DURATION_MS) once the upload lands. See
  // src/services/animation/fadeRegistry.ts for the registry contract.
  state.subsystems.fades.register({ kind: 'survey', source }, 0);

  const slot = createAssetSlot<GalaxyCatalog, GalaxyCatalogReq>({
    // ... rest of body unchanged
  });
```

- [ ] **Step 2: Update tests that assert subsystem state**

Run: `grep -rn "wireGalaxyCatalogSourceSlot\|fades" tests/services/engine/wiring/ | head`

If the existing `galaxyCatalogSourceRegistry.test.ts` mocks `state.subsystems` without a `fades` field, update its fixture to include a stub registry:

```ts
const fadesStub = {
  label: 'fadeRegistry',
  register: vi.fn(),
  unregister: vi.fn(),
  fadeTo: vi.fn(() => Promise.resolve()),
  setImmediate: vi.fn(),
  opacityOf: vi.fn(() => 1),
  isAnyAnimating: vi.fn(() => false),
  tick: vi.fn(),
  destroy: vi.fn(),
};
```

Add `fades: fadesStub` to the subsystems mock in that test file.

Then add a positive assertion:

```ts
it('registers a survey fade handle for the wired source', () => {
  // ... arrange + wireGalaxyCatalogSourceSlot(state, cfg, deps) ...
  expect(fadesStub.register).toHaveBeenCalledWith({ kind: 'survey', source: cfg.source }, 0);
});
```

- [ ] **Step 3: Run typecheck + tests**

Run: `npm run typecheck && npm test -- tests/services/engine/wiring/galaxyCatalogSourceRegistry.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/engine/wiring/galaxyCatalogSourceRegistry.ts tests/services/engine/wiring/galaxyCatalogSourceRegistry.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): register survey fade handle at slot wiring time

Each row of GALAXY_CATALOG_SOURCE_REGISTRY registers its FadeHandle
at opacity 0 in wireGalaxyCatalogSourceSlot, before the slot's commit
step runs. The commit (next task) drives the fadeTo lifecycle.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: Galaxy-catalog slot orchestration

### Task 4.1: Sequential fade-out → upload → fade-in in galaxyCatalogSourceRegistry commit

**Files:**
- Modify: `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts`

- [ ] **Step 1: Update the commit step**

In `wireGalaxyCatalogSourceSlot`, the `commit:` field of the slot factory currently looks like:

```ts
    commit: async (cloud) => {
      if (state.gpu.renderer === null) return;
      const t0 = performance.now();
      console.log(`[engine] upload start ${sourceName(source)} count=${cloud.count}`);
      await state.gpu.renderer.upload(source, cloud);
      state.sources.catalogs.set(source, cloud);
      // ...
    },
```

Replace its body with the sequential orchestration:

```ts
    commit: async (cloud) => {
      if (state.gpu.renderer === null) return;
      const handle: FadeHandle = { kind: 'survey', source };
      const fades = state.subsystems.fades;

      // If this is NOT the first load, fade out the existing buffer
      // before destroying it. The renderer keeps drawing the OLD
      // buffer with falling alpha until fade-out completes.
      const isFirstLoad = !state.sources.catalogs.has(source);
      if (!isFirstLoad) {
        await fades.fadeTo(handle, 0, FADE_OUT_DURATION_MS);
      }

      const t0 = performance.now();
      console.log(`[engine] upload start ${sourceName(source)} count=${cloud.count}`);
      await state.gpu.renderer.upload(source, cloud);
      state.sources.catalogs.set(source, cloud);
      const dtMs = Math.round(performance.now() - t0);

      // Fire-and-forget: fade-in starts immediately, the slot's
      // `ready` transition fires (subscribers wake), the camera
      // doesn't have to wait for the smoothstep to saturate before
      // the next user interaction can proceed.
      void fades.fadeTo(handle, 1, FADE_IN_DURATION_MS);

      const onGpu = Array.from(state.gpu.renderer.loadedSources())
        .map((e) => `${sourceName(e.source)}=${e.count}`)
        .join(', ');
      const total = state.gpu.renderer.totalCount();
      console.log(
        `[engine] upload done  ${sourceName(source)} count=${cloud.count} (${dtMs} ms) | on-GPU: ${onGpu} | total=${total}`,
      );
    },
```

Add imports at the top of `galaxyCatalogSourceRegistry.ts`:

```ts
import type { FadeHandle } from '../../../@types/animation/FadeHandle';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';
```

- [ ] **Step 2: Write integration test**

Create `tests/services/engine/wiring/galaxyCatalogSourceRegistryFade.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { wireGalaxyCatalogSourceSlot } from '../../../../src/services/engine/wiring/galaxyCatalogSourceRegistry';
import { Source } from '../../../../src/data/sources';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../../../src/services/animation/fadeController';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';

function makeFakeCatalog(count: number): GalaxyCatalog {
  // Minimal stub — the slot commit only reads .count for logging.
  return { count, source: Source.SDSS } as unknown as GalaxyCatalog;
}

describe('wireGalaxyCatalogSourceSlot — fade orchestration', () => {
  function makeFixture() {
    const fadeCalls: Array<{ target: number; duration: number }> = [];
    const fades = {
      label: 'fadeRegistry',
      register: vi.fn(),
      unregister: vi.fn(),
      fadeTo: vi.fn(async (_h: unknown, target: number, duration: number) => {
        fadeCalls.push({ target, duration });
      }),
      setImmediate: vi.fn(),
      opacityOf: vi.fn(() => 1),
      isAnyAnimating: vi.fn(() => false),
      tick: vi.fn(),
      destroy: vi.fn(),
    };
    const upload = vi.fn(async () => {});
    const state = {
      gpu: {
        renderer: {
          upload,
          loadedSources: () => [][Symbol.iterator](),
          totalCount: () => 0,
        },
      },
      sources: { catalogs: new Map() },
      subsystems: { fades, scheduler: { requestRender: vi.fn() } },
      assetSlots: { points: new Map() },
    };
    return { state, fades, upload, fadeCalls };
  }

  it('first load fires fadeTo(1, FADE_IN_DURATION_MS) only (no fade-out)', async () => {
    const fx = makeFixture();
    wireGalaxyCatalogSourceSlot(
      fx.state as never,
      { source: Source.SDSS, fetcher: vi.fn() } as never,
      { cb: {} } as never,
    );
    const slot = fx.state.assetSlots.points.get(Source.SDSS)!;
    // Drive the commit directly:
    await (slot as never as { _commitForTest: (c: GalaxyCatalog) => Promise<void> })
      ._commitForTest(makeFakeCatalog(1));
    // ... or, more realistically, the slot has its own `load()` API; the
    // test harness here is illustrative. The assertion is what matters:
    expect(fx.fadeCalls).toEqual([
      { target: 1, duration: FADE_IN_DURATION_MS },
    ]);
  });

  it('second load awaits fadeTo(0, FADE_OUT_DURATION_MS) before upload', async () => {
    const fx = makeFixture();
    // Pre-seed: pretend a catalog is already loaded.
    fx.state.sources.catalogs.set(Source.SDSS, makeFakeCatalog(99));
    wireGalaxyCatalogSourceSlot(
      fx.state as never,
      { source: Source.SDSS, fetcher: vi.fn() } as never,
      { cb: {} } as never,
    );
    // Drive commit...
    // Assert ordering: fadeTo(0) → upload → fadeTo(1).
    expect(fx.fadeCalls[0]).toEqual({ target: 0, duration: FADE_OUT_DURATION_MS });
    expect(fx.fadeCalls[1]).toEqual({ target: 1, duration: FADE_IN_DURATION_MS });
    expect(fx.upload).toHaveBeenCalledTimes(1);
  });
});
```

NOTE for the implementer: the `_commitForTest` pseudo-method above is a stand-in for whatever the AssetSlot test harness exposes today. Before writing this test, read `src/services/loading/AssetSlot.ts` to find the actual API for synchronously driving a commit in a test, and adapt the test accordingly. If no such hook exists, expose one via `__commitForTest` on the slot (test-only) or drive the slot through its `load(req)` method with a synchronous fetcher that resolves to the fake catalog.

- [ ] **Step 3: Run typecheck + tests**

Run: `npm run typecheck && npm test -- tests/services/engine/wiring/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/engine/wiring/galaxyCatalogSourceRegistry.ts tests/services/engine/wiring/galaxyCatalogSourceRegistryFade.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): sequential fade-out/upload/fade-in for survey commits

First load skips fade-out and just rams in from the initial-0 opacity;
subsequent loads (tier swap) await a 100 ms fade-out before destroying
the old buffer and starting the 600 ms fade-in.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: filamentRenderer migration

### Task 5.1: Update filament fragment WESL

**Files:**
- Modify: `src/services/gpu/shaders/filaments/fragment.wesl`

- [ ] **Step 1: Replace imports + bindings**

Replace lines 28-49 (the imports + `@group` declarations). New top:

```wgsl
import package::filaments::io::Uniforms;
import package::filaments::io::VSOut;
import package::lib::fadeUniforms::FadeUniforms;
import package::lib::fadeUniforms::applyFade;
import package::lib::masks::edgeBandMask;

@group(0) @binding(0) var<uniform> u : Uniforms;
@group(1) @binding(0) var<uniform> fade : FadeUniforms;
```

In the body (line ~106), replace:

```wgsl
  let alpha = applyCloudFade(
    edgeFade * 0.6 * densityBoost * u.intensityScale,
    cloud.opacity,
  );
```

with:

```wgsl
  let alpha = applyFade(
    edgeFade * 0.6 * densityBoost * u.intensityScale,
    fade.opacity,
  );
```

- [ ] **Step 2: Don't run anything yet — the renderer wiring follows in 5.2**

---

### Task 5.2: Update filamentRenderer factory

**Files:**
- Modify: `src/services/gpu/renderers/filamentRenderer.ts`
- Modify: `src/@types/rendering/FilamentRenderer.d.ts`

- [ ] **Step 1: Update `FilamentRenderer.d.ts`**

Remove the `isFading(): boolean;` method and its docblock. The full file becomes:

```ts
/**
 * Public surface of the filament renderer. Mirrors the methods the
 * pre-factory class exposed: upload / draw / clear / destroy.
 * Consumers see the identical shape; fade-in is now driven by
 * FadeRegistry (state.subsystems.fades) — the renderer reads the
 * per-frame opacity in `draw` and writes it into a per-handle GPU
 * fade buffer.
 */

import type { mat4 } from 'gl-matrix';
import type { FilamentCloud } from '../data/FilamentCloud';

export type FilamentRenderer = {
  readonly label: string;
  upload(cloud: FilamentCloud): void;
  clear(): void;
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    halfWidthPx: number,
    intensityScale: number,
    fadeOpacity: number,
  ): void;
  destroy(): void;
};
```

(`fadeOpacity` added as the sixth parameter to `draw` — the runFrame body reads `state.subsystems.fades.opacityOf({ kind: 'filaments' }, now)` and passes it in.)

- [ ] **Step 2: Update `filamentRenderer.ts`**

In `createFilamentRenderer`, change the signature to accept `fadeBgl: FadeUniformsBgl`:

```ts
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';

export function createFilamentRenderer(
  device: GPUDevice,
  hdrFormat: GPUTextureFormat,
  fadeBgl: FadeUniformsBgl,
): FilamentRenderer {
```

Remove the `import { CloudFade } from '../resources/cloudFade';` line.

Remove the local `cloudFadeBindGroupLayout` declaration (lines 165-174).

In `createPipelineLayout` (line 184), replace `bindGroupLayouts: [bindGroupLayout, cloudFadeBindGroupLayout]` with `bindGroupLayouts: [bindGroupLayout, fadeBgl]`.

In the closure state, replace `let fade: CloudFade | null = null;` with:

```ts
  // Per-handle FadeUniforms GPU buffer + bind group. Constructed lazily
  // on first upload (the filament cloud may never load in production
  // if the .bin file is absent), destroyed in destroy(). Subsequent
  // uploads reuse the buffer — only the per-frame opacity write changes.
  let fadeBuffer: GPUBuffer | null = null;
  let fadeBindGroup: GPUBindGroup | null = null;
  // Reusable scratch for the per-frame fade writeBuffer call.
  const fadeScratchBuffer = new ArrayBuffer(16);
  const fadeScratchF32 = new Float32Array(fadeScratchBuffer);
```

In `upload`, replace the `CloudFade` block (lines 271-278) with:

```ts
    if (fadeBuffer === null) {
      fadeBuffer = device.createBuffer({
        label: 'filaments-fade-uniform',
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      fadeBindGroup = device.createBindGroup({
        label: 'filaments-fade-bg',
        layout: fadeBgl,
        entries: [{ binding: 0, resource: { buffer: fadeBuffer } }],
      });
    }
```

In `draw`, update the signature to accept `fadeOpacity` and replace the body's fade lines. The full new `draw`:

```ts
  function draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    halfWidthPx: number,
    intensityScale: number,
    fadeOpacity: number,
  ): void {
    if (segmentCount === 0 || !instanceBuffer || !fadeBuffer || !fadeBindGroup) return;

    // Pack uniforms (unchanged from current — see UNIFORM_BYTES comment).
    const buf = new ArrayBuffer(UNIFORM_BYTES);
    const f32 = new Float32Array(buf);
    f32.set(viewProj as Float32Array, 0);
    f32[16] = viewportPx[0];
    f32[17] = viewportPx[1];
    f32[20] = halfWidthPx;
    f32[21] = intensityScale;
    device.queue.writeBuffer(uniformBuffer, 0, buf);

    // Write the per-frame fade.opacity from the registry-supplied value.
    fadeScratchF32[0] = fadeOpacity;
    device.queue.writeBuffer(fadeBuffer, 0, fadeScratchBuffer);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setBindGroup(1, fadeBindGroup);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.setVertexBuffer(0, quadVertexBuffer);
    pass.setVertexBuffer(1, instanceBuffer);
    pass.drawIndexed(6, segmentCount);
  }
```

Remove the `function isFading(): boolean { ... }` block entirely (lines 330-332).

In `destroy`, replace `fade?.destroy();` with:

```ts
    fadeBuffer?.destroy();
```

In the returned `renderer` object literal, remove the `isFading,` entry.

- [ ] **Step 3: Update `initGpu.ts` filamentRenderer call site**

Find the `createFilamentRenderer(device, format)` call and update it to pass `state.gpu.fadeBgl!`:

```ts
const filamentRenderer = createFilamentRenderer(device, format, state.gpu.fadeBgl!);
```

- [ ] **Step 4: Update `runFrame.ts` call site that calls `filamentRenderer.draw(...)`**

Find where `filamentRenderer.draw(...)` is called per-frame. Add the new sixth parameter:

```ts
state.gpu.filamentRenderer.draw(
  pass,
  viewProj,
  viewportPx,
  halfWidthPx,
  intensityScale,
  state.subsystems.fades.opacityOf({ kind: 'filaments' }, now),
);
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: PASS, except for any test referencing `filamentRenderer.isFading()` — find and update them with `grep -rn "filamentRenderer.isFading\|filamentRenderer\?.isFading" tests/ src/`.

- [ ] **Step 7: Commit**

```bash
git add src/services/gpu/shaders/filaments/fragment.wesl src/services/gpu/renderers/filamentRenderer.ts src/@types/rendering/FilamentRenderer.d.ts src/services/engine/phases/initGpu.ts src/services/engine/frame/runFrame.ts
git commit -m "$(cat <<'EOF'
refactor(gpu): migrate filamentRenderer off CloudFade onto FadeRegistry

Single per-renderer fadeBuffer + fadeBindGroup (filament is a single
instance, not a Map<Source, Entry>). draw() now accepts fadeOpacity
as a parameter; the per-frame body reads from state.subsystems.fades.
isFading() removed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5.3: Register filament handle + drive fadeTo from filamentSlot

**Files:**
- Modify: `src/services/loading/slots/filamentSlot.ts`

- [ ] **Step 1: Register and fade in on commit**

In `src/services/loading/slots/filamentSlot.ts`, the existing factory becomes:

```ts
import { createAssetSlot } from '../AssetSlot';
import { filamentFetcher } from '../fetchers/filamentFetcher';
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';
import type { FilamentReq } from '../../../@types/loading/FilamentReq';
import type { FilamentCloud } from '../../../@types/data/FilamentCloud';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createFilamentSlot: SlotFactory<FilamentCloud, FilamentReq> = (state, cb) => {
  // Register the filament fade handle at opacity 0; the commit's
  // fadeTo(1, FADE_IN_DURATION_MS) ramps it in once the upload lands.
  // Filament is one-shot — never reloaded on tier change — so no
  // fade-out branch is needed.
  state.subsystems.fades.register({ kind: 'filaments' }, 0);

  const slot = createAssetSlot({
    name: 'filaments',
    fetch: filamentFetcher,
    commit: async (cloud) => {
      if (!state.gpu.filamentRenderer) return;
      await state.gpu.filamentRenderer.upload(cloud);
      void state.subsystems.fades.fadeTo({ kind: 'filaments' }, 1, FADE_IN_DURATION_MS);
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(
        `[engine] filaments: ${s.value.stripCount} strips, ${s.value.vertexCount} verts`,
      );
      cb.filaments?.onReady?.(s.value.stripCount, s.value.vertexCount);
      state.subsystems.scheduler.requestRender();
    }
  });
  state.assetSlots.filaments = slot;
  return slot;
};
```

- [ ] **Step 2: Run typecheck + tests**

Run: `npm run typecheck && npm test -- tests/services/loading/slots/`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/services/loading/slots/filamentSlot.ts
git commit -m "$(cat <<'EOF'
feat(loading): register filament fade handle + fade-in on commit

One-shot — filaments never reload on tier change, so the slot does
just a fade-in (no fade-out branch).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: scalarVolumeRenderer integration

### Task 6.1: Update scalarVolume fragment WESL

**Files:**
- Modify: `src/services/gpu/shaders/scalarVolume/fragment.wesl`

- [ ] **Step 1: Add FadeUniforms import + binding, multiply final color by fade.opacity**

In `src/services/gpu/shaders/scalarVolume/fragment.wesl`, near the top imports (line 28), add:

```wgsl
import package::lib::fadeUniforms::FadeUniforms;
```

After the existing `@group(0)` bindings (lines 99-103), add:

```wgsl
@group(1) @binding(0) var<uniform> fade: FadeUniforms;
```

At the bottom of `fs_main`, the existing `return accum;` (line 368) becomes:

```wgsl
  // Apply the per-field fade opacity. Multiplying the entire vec4
  // (rgb * a, a) by a scalar preserves the premultiplied-alpha
  // invariant (output stays in the (rgb * faded_a, faded_a) shape
  // the additive blend expects). The volume's per-step alpha
  // composition is unchanged — we just dim the final integrated
  // result.
  return accum * fade.opacity;
```

- [ ] **Step 2: Don't run anything yet — the renderer wiring follows in 6.2**

---

### Task 6.2: Update scalarVolumeRenderer factory

**Files:**
- Modify: `src/services/gpu/renderers/scalarVolumeRenderer.ts`
- Modify: `src/@types/rendering/FieldEntry.d.ts`
- Modify: `src/@types/rendering/ScalarVolumeRenderer.d.ts` (find it via `find src/@types -name "ScalarVolumeRenderer*"`)

- [ ] **Step 1: Update `FieldEntry.d.ts`**

Add two new fields to `FieldEntry`:

```ts
  /**
   * Per-field FadeUniforms GPU buffer (16 bytes — opacity f32 + 12
   * bytes pad). Written each frame in `draw` from the registry-read
   * opacity for this field's handle.
   */
  fadeBuffer: GPUBuffer;
  /**
   * Bind group binding `fadeBuffer` at @group(1) @binding(0) using
   * the canonical fadeBgl.
   */
  fadeBindGroup: GPUBindGroup;
```

- [ ] **Step 2: Update `scalarVolumeRenderer.ts`**

Change the factory signature to accept `fadeBgl`:

```ts
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';

export function createScalarVolumeRenderer(
  device: GPUDevice,
  format: GPUTextureFormat,
  fadeBgl: FadeUniformsBgl,
): ScalarVolumeRenderer {
```

Replace the pipeline construction (line 198). Currently `layout: 'auto'`. Update to explicit:

```ts
  // @group(0) layout — pipeline-specific (uniform + 3D texture + sampler
  // + 1D texture + sampler). Built from a manual BindGroupLayout descriptor
  // so the pipeline layout below can list it alongside the canonical fadeBgl.
  const group0Bgl = device.createBindGroupLayout({
    label: 'scalarVolume-bgl-group0',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '3d' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '1d' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'scalarVolume-pipeline-layout',
    bindGroupLayouts: [group0Bgl, fadeBgl],
  });

  const pipeline = device.createRenderPipeline({
    label: 'scalarVolume-pipeline',
    layout: pipelineLayout,
    // ... (vertex, fragment, primitive blocks unchanged — copy verbatim)
  });
  const bindGroupLayout = group0Bgl;
```

(The existing `pipeline.getBindGroupLayout(0)` reference becomes `group0Bgl` — same object identity.)

In `addField(handle, cube)` (around line 277), after the existing `const bindGroup = device.createBindGroup({...})` block, add:

```ts
      const fadeBuffer = device.createBuffer({
        label: `scalarVolume-fade-uniform-${handle}`,
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const fadeBindGroup = device.createBindGroup({
        label: `scalarVolume-fade-bg-${handle}`,
        layout: fadeBgl,
        entries: [{ binding: 0, resource: { buffer: fadeBuffer } }],
      });
```

In the `fields.set(handle, { ... })` block, add the two fields to the spread:

```ts
        fadeBuffer,
        fadeBindGroup,
```

In `removeField(handle)`, add:

```ts
      entry.fadeBuffer.destroy();
```

In the existing destroy-old-entry branch at the top of `addField` (around line 279), add:

```ts
        existing.fadeBuffer.destroy();
```

In the `draw(...)` method (around line 467), update the signature to accept the `fadeOpacityOf` callback:

```ts
    draw(pass, viewProj, viewportPx, cameraPosWorld, fadeOpacityOf) {
```

(Update `ScalarVolumeRenderer.d.ts`'s `draw` method type accordingly.)

Inside the per-field loop (around line 491), after `device.queue.writeBuffer(e.uniformBuffer, 0, scratch);`, add:

```ts
        // Per-field fade.opacity write: read from the registry for this
        // field's handle, write into the 16-byte fadeBuffer.
        const fadeScratchBuffer = new ArrayBuffer(16);
        new Float32Array(fadeScratchBuffer)[0] = fadeOpacityOf(e.handle);
        device.queue.writeBuffer(e.fadeBuffer, 0, fadeScratchBuffer);

        pass.setBindGroup(0, e.bindGroup);
        pass.setBindGroup(1, e.fadeBindGroup);
        pass.drawIndexed(CUBE_INDICES.length);
```

(Note: the existing `pass.setBindGroup(0, e.bindGroup);` line moves into the block above; remove the duplicate.)

To avoid the per-frame ArrayBuffer allocation, hoist it to the factory scope (alongside the existing scratch buffer):

```ts
  const fadeScratchBuffer = new ArrayBuffer(16);
  const fadeScratchF32 = new Float32Array(fadeScratchBuffer);
```

And in the loop, use:

```ts
        fadeScratchF32[0] = fadeOpacityOf(e.handle);
        device.queue.writeBuffer(e.fadeBuffer, 0, fadeScratchBuffer);
```

In `destroy()` (line 517), add inside the loop:

```ts
        e.fadeBuffer.destroy();
```

- [ ] **Step 3: Update `ScalarVolumeRenderer.d.ts`**

Find the file with `find src/@types -name "ScalarVolumeRenderer*"`. Update the `draw` method type:

```ts
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: Vec2,
    cameraPosWorld: Vec3,
    fadeOpacityOf: (handle: ScalarFieldHandle) => number,
  ): void;
```

(Add `import type { ScalarFieldHandle } from './ScalarFieldHandle';` if not already imported.)

- [ ] **Step 4: Update `initGpu.ts` and `runFrame.ts` call sites**

In `initGpu.ts`, the `createScalarVolumeRenderer(device, format)` call becomes:

```ts
const scalarVolumeRenderer = createScalarVolumeRenderer(device, format, state.gpu.fadeBgl!);
```

In `runFrame.ts`, wherever `scalarVolumeRenderer.draw(...)` is called, add the fifth argument:

```ts
state.gpu.scalarVolumeRenderer.draw(
  pass,
  viewProj,
  viewportPx,
  cameraPosWorld,
  (handle) => state.subsystems.fades.opacityOf({ kind: 'scalarField', field: handle }, now),
);
```

- [ ] **Step 5: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS, modulo volume-renderer tests that need `fadeBgl` in their fixtures — update those with a stub `{} as FadeUniformsBgl` cast and a stub `fadeOpacityOf: () => 1` callback.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/shaders/scalarVolume/fragment.wesl src/services/gpu/renderers/scalarVolumeRenderer.ts src/@types/rendering/FieldEntry.d.ts src/@types/rendering/ScalarVolumeRenderer.d.ts src/services/engine/phases/initGpu.ts src/services/engine/frame/runFrame.ts
git commit -m "$(cat <<'EOF'
feat(gpu): integrate FadeRegistry into scalarVolumeRenderer

Per-field fadeBuffer + fadeBindGroup; draw multiplies final accum by
fade.opacity. Pipeline layout switched from 'auto' to canonical so
fadeBgl is the same identity every consumer uses.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6.3: Register scalar-field handles on addField, unregister on removeField

**Files:**
- Modify: `src/services/gpu/renderers/scalarVolumeRenderer.ts`

This is a small follow-up to Task 6.2 — the handle registration ideally happens at the *slot* level (matching surveys), but `addField` is the canonical create-a-field call point and there are three different slot files (cf4DensitySlot, mcpmSlot, syntheticVolumeSlots) so registering inside `addField` is the DRY choice.

The registry registration needs `state.subsystems.fades`, which the renderer doesn't have access to. The cleanest fix: pass a registration callback into the factory.

- [ ] **Step 1: Add `onFieldAdded` / `onFieldRemoved` callbacks to the factory**

Update the factory signature:

```ts
export function createScalarVolumeRenderer(
  device: GPUDevice,
  format: GPUTextureFormat,
  fadeBgl: FadeUniformsBgl,
  callbacks: {
    onFieldAdded: (handle: ScalarFieldHandle) => void;
    onFieldRemoved: (handle: ScalarFieldHandle) => void;
  },
): ScalarVolumeRenderer {
```

In `addField`, at the very end (after `fields.set(...)`), call `callbacks.onFieldAdded(handle)`.
In `removeField`, before the early-return `if (!entry) return;`, no — call after the destroys but before `fields.delete(handle)`: `callbacks.onFieldRemoved(handle);`.

- [ ] **Step 2: Wire the callbacks in `initGpu.ts`**

```ts
const scalarVolumeRenderer = createScalarVolumeRenderer(
  device,
  format,
  state.gpu.fadeBgl!,
  {
    onFieldAdded: (handle) => {
      state.subsystems.fades.register({ kind: 'scalarField', field: handle }, 0);
      // Fade in on first upload — fire and forget.
      void state.subsystems.fades.fadeTo(
        { kind: 'scalarField', field: handle },
        1,
        FADE_IN_DURATION_MS,
      );
    },
    onFieldRemoved: (handle) => {
      state.subsystems.fades.unregister({ kind: 'scalarField', field: handle });
    },
  },
);
```

Add the import:

```ts
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';
```

- [ ] **Step 3: Update tests that construct the volume renderer**

Run: `grep -rn "createScalarVolumeRenderer" tests/`

Update each test fixture to pass the new callbacks (or stubs):

```ts
const stubCallbacks = {
  onFieldAdded: vi.fn(),
  onFieldRemoved: vi.fn(),
};
createScalarVolumeRenderer(device, format, {} as never, stubCallbacks);
```

- [ ] **Step 4: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/renderers/scalarVolumeRenderer.ts src/@types/rendering/ScalarVolumeRenderer.d.ts src/services/engine/phases/initGpu.ts tests/
git commit -m "$(cat <<'EOF'
feat(gpu): register scalar-field fade handles on addField/removeField

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7: Label renderer fade integration

The label subsystem in this codebase routes through `labelDirector` and `labelRenderer`. There's effectively one label-renderer pipeline, but the spec wants per-layer fade (you-are-here, POI, galaxy names, scale bar). The cleanest implementation: the label-renderer takes a `fadeOpacityOf` callback parameterized by the producer that emitted each label, but a simpler-and-correct-today approach is to fade the entire label renderer as one layer, with the per-layer handles registered for future use.

### Task 7.1: Inspect the label-renderer surface and pick the right integration point

**Files:**
- Read: `src/services/gpu/renderers/labelRenderer.ts`
- Read: `src/services/gpu/renderers/markerLineRenderer.ts`
- Read: `src/services/engine/subsystems/labelDirectorSubsystem.ts`

- [ ] **Step 1: Identify the actual per-frame draw entry point**

Run:
```
grep -n "draw\|@group\|setBindGroup" src/services/gpu/renderers/labelRenderer.ts | head -30
```

And:
```
grep -n "draw\|setBindGroup\|@group" src/services/gpu/renderers/markerLineRenderer.ts | head -20
```

Note: the spec mentions four label layers but the codebase has two label renderers (`labelRenderer` and `markerLineRenderer`). The `labelDirector` already aggregates producers; per-layer fade requires the director (or each producer) to emit labels tagged with their layer, and the renderer to fade the labels via a per-layer fade buffer in the same draw or via multiple draws (one per layer).

**Decision for this plan:** treat the entire label-renderer as one fade layer per renderer pass for v1, registering one `{ kind: 'labelLayer', layer: 'youAreHere' | 'poi' | … }` handle per logical layer but driving the renderer with a single combined opacity (the max of all active layer opacities, or 1.0 in steady state). The per-layer-aware draw is a follow-up plan. The handles are registered now so the registry is structurally ready.

- [ ] **Step 2: Register label-layer handles in `engine.ts`**

In `src/services/engine/engine.ts`, right after the `state.subsystems` literal is fully constructed and the eager subsystems are reachable (find the point after the closing brace of the state literal), add:

```ts
  // Register the four label-layer fade handles at opacity 0. The
  // label producers (youAreHere, poi) and any future overlay (galaxy
  // names, scale bar) register at this point so a tour subsystem can
  // address them via state.subsystems.fades.fadeTo(...) without
  // additional plumbing. v1 of the label-fade integration drives the
  // label-renderer with a single combined opacity (see runFrame.ts);
  // per-layer aware draws are a follow-up plan.
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'youAreHere' }, 0);
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'poi' }, 0);
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'galaxyNames' }, 0);
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'scaleBar' }, 1);
```

(`scaleBar` is React-side; we register it at 1.0 so it's tour-addressable but never auto-faded.)

- [ ] **Step 3: Drive fade-in for youAreHere + POI when their producers first emit labels**

This belongs in the producer's first-emit hook. In `youAreHereSubsystem.ts` (find it in `src/services/engine/subsystems/`), at the first call site that produces a non-empty `Label[]` output, add:

```ts
void state.subsystems.fades.fadeTo({ kind: 'labelLayer', layer: 'youAreHere' }, 1, FADE_IN_DURATION_MS);
```

(Wrap in a `firstEmit` boolean guard so it only fires once per session.)

Repeat for `poiSubsystem.ts` with `layer: 'poi'`.

Read each file before editing to find the right method.

- [ ] **Step 4: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/engine.ts src/services/engine/subsystems/youAreHereSubsystem.ts src/services/engine/subsystems/poiSubsystem.ts
git commit -m "$(cat <<'EOF'
feat(engine): register label-layer fade handles

Registers youAreHere/poi/galaxyNames/scaleBar handles in the registry.
Producers fire fadeTo(1, FADE_IN_DURATION_MS) on first non-empty
emit. The label-renderer's per-layer fade-aware draw is deferred.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 8: Always-on overlay registration

### Task 8.1: Register milkyWay, proceduralDisks, texturedImpostors at setImmediate(1)

**Files:**
- Modify: `src/services/engine/phases/initGpu.ts`

- [ ] **Step 1: Register the three overlays after their subsystems are constructed**

In `initGpu.ts`, after `state.subsystems.galaxyAtlas`, `state.subsystems.proceduralDisks`, and `state.subsystems.texturedImpostors` are set (find the assignments), add:

```ts
  // Register always-on overlays at opacity 1.0 via setImmediate. The
  // registry exposes these to future tour playback (fadeTo lets a
  // tour dim a layer programmatically), but no automatic loading
  // fade-in is desired — the overlays are procedural / bundled and
  // appear immediately on first frame.
  state.subsystems.fades.register({ kind: 'overlay', id: 'milkyWay' }, 1);
  state.subsystems.fades.register({ kind: 'overlay', id: 'proceduralDisks' }, 1);
  state.subsystems.fades.register({ kind: 'overlay', id: 'texturedImpostors' }, 1);
```

(`register` already initializes at the given opacity; `setImmediate(1)` would be a separate call but is unnecessary since `register(handle, 1)` does the same thing — see `FadeController` constructor.)

- [ ] **Step 2: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/services/engine/phases/initGpu.ts
git commit -m "$(cat <<'EOF'
feat(engine): register always-on overlay fade handles at opacity 1.0

milkyWay/proceduralDisks/texturedImpostors registered so a future tour
subsystem can dim them via state.subsystems.fades.fadeTo(...). No
automatic loading-fade behaviour for these — they appear immediately.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 9: UI toggle async behavior

### Task 9.1: Add pickMask + drawMask to EngineSourceState

**Files:**
- Modify: `src/@types/engine/state/EngineSourceState.d.ts`
- Modify: `src/services/engine/engine.ts` (state literal initial values)

- [ ] **Step 1: Update `EngineSourceState.d.ts`**

Replace the `visibleMask: number;` field with two:

```ts
  /**
   * pickMask — clicked layer is non-clickable IMMEDIATELY on toggle off.
   * The picker reads this mask; a fading-out layer is excluded from
   * the pick output even while it's still visually fading. Flipped
   * synchronously in setSourceVisible.
   */
  pickMask: number;
  /**
   * drawMask — read by the renderer's per-source draw loop. Flipped
   * AFTER the fade-out smoothstep completes (or AT the start of
   * fade-in). A layer with its drawMask bit clear is skipped from
   * the draw entirely — saves a writeBuffer + draw call.
   */
  drawMask: number;
```

Replace any code that reads `visibleMask` — find with `grep -rn "visibleMask\|visibleSourceMask" src/`. For each call site, decide whether it wants pickMask or drawMask. **Most call sites become drawMask**: the renderer reads drawMask in its per-frame draw loop; auto-LOD writes drawMask; SettingsPanel reflects drawMask. The picker reads pickMask.

The migration is mechanical. Use this rule:
- `pointRenderer.draw(...)` → reads `state.sources.drawMask`.
- `pickRenderer.pick(...)` → reads `state.sources.pickMask` (filters out faded-out layers from pick output).
- Auto-LOD recompute → writes BOTH (auto-LOD is synchronous; no fade involved when the system decides to hide a band).
- `setSourceVisible(source, true)` → flips pickMask immediately, then `await fadeTo(handle, 1, FADE_IN_DURATION_MS)`, then flips drawMask.
- `setSourceVisible(source, false)` → flips pickMask immediately, then `await fadeTo(handle, 0, FADE_OUT_DURATION_MS)`, then flips drawMask.

- [ ] **Step 2: Update the engine.ts state literal**

Find the `sources: { ... }` literal. Replace:

```ts
  visibleMask: DEFAULT_VISIBLE_SOURCE_MASK,
```

with:

```ts
  pickMask: DEFAULT_VISIBLE_SOURCE_MASK,
  drawMask: DEFAULT_VISIBLE_SOURCE_MASK,
```

- [ ] **Step 3: Update `setSourceVisible` in `engine.ts`**

Replace the existing body (lines 924-941) with the async version:

```ts
  async function setSourceVisible(source: Source, visible: boolean): Promise<void> {
    if (state.sources.lodMode !== 'manual') {
      state.sources.lodMode = 'manual';
      cb.sources?.onLodModeChange?.('manual');
    }

    const handle: FadeHandle = { kind: 'survey', source };
    const targetMask = visible
      ? maskWith(state.sources.pickMask, source)
      : maskWithout(state.sources.pickMask, source);
    if (targetMask === state.sources.pickMask && targetMask === state.sources.drawMask) return;

    // pickMask flips IMMEDIATELY — a fading-out layer must not be clickable.
    state.sources.pickMask = targetMask;
    // Notify the UI of the (immediate) state change so the checkbox reflects.
    cb.sources?.onMaskChange?.(targetMask);
    state.subsystems.scheduler.requestRender();

    // If turning ON, flip drawMask first (so the renderer starts drawing
    // the layer this frame, even though opacity is currently 0). Then
    // fade IN.
    // If turning OFF, leave drawMask set so the renderer keeps drawing
    // during the fade-out, then flip drawMask once opacity reaches 0.
    if (visible) {
      state.sources.drawMask = targetMask;
      await state.subsystems.fades.fadeTo(handle, 1, FADE_IN_DURATION_MS);
    } else {
      await state.subsystems.fades.fadeTo(handle, 0, FADE_OUT_DURATION_MS);
      // Re-read intent at promise-resolve time: a rapid double-toggle
      // (off → on within 100 ms) will have already restarted the fade
      // back to 1 — in that case opacityOf > 0 and we should NOT clear
      // the drawMask bit. The last-issued fade wins.
      const finalOpacity = state.subsystems.fades.opacityOf(handle);
      if (finalOpacity === 0) {
        state.sources.drawMask = maskWithout(state.sources.drawMask, source);
      } else {
        state.sources.drawMask = maskWith(state.sources.drawMask, source);
      }
    }
    state.subsystems.scheduler.requestRender();
  }
```

Add to `setSourceVisible`'s signature in the public handle's call site (find the `setVisible: setSourceVisible,` line around line 1259) — the handle method now returns a Promise. Update `EngineHandle`'s `sources.setVisible` type:

```ts
setVisible(source: Source, visible: boolean): Promise<void>;
```

Find the type in `src/@types/engine/handles/EngineSourcesHandle.d.ts` (or similar). Update accordingly.

Add the import to `engine.ts`:

```ts
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../animation/fadeController';
import type { FadeHandle } from '../../@types/animation/FadeHandle';
```

- [ ] **Step 4: Update auto-LOD callers to write both masks**

Run: `grep -rn "visibleMask\|visibleSourceMask" src/services/engine/`

For each remaining reference — typically in `autoLod.ts` or wherever the auto-LOD recompute writes the mask — update to write both `pickMask` and `drawMask` simultaneously (auto-LOD changes are synchronous; no fade is desired for tier-driven mask shifts):

```ts
state.sources.pickMask = newMask;
state.sources.drawMask = newMask;
```

- [ ] **Step 5: Update consumers**

The renderer reads `drawMask`, the picker reads `pickMask`. In `runFrame.ts`'s point-renderer draw call site, change:

```ts
visibleSourceMask: state.sources.visibleMask,
```

to:

```ts
visibleSourceMask: state.sources.drawMask,
```

In the picker's call site (in `clickResolver.ts` or wherever picking dispatches), change references to read `state.sources.pickMask`.

- [ ] **Step 6: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS. If `App.tsx`'s `onToggleSource` handler errors because `setVisible` is now async, update it to not await (fire and forget) or to await (await it) per the UX desired — for parity with the spec, fire and forget:

```ts
onToggleSource={(s, visible) => {
  void handleRef.current?.sources.setVisible(s, visible);
}}
```

- [ ] **Step 7: Commit**

```bash
git add src/@types/engine/state/EngineSourceState.d.ts src/@types/engine/handles/EngineSourcesHandle.d.ts src/services/engine/engine.ts src/services/engine/frame/runFrame.ts src/services/engine/autoLod.ts src/components/App/App.tsx tests/
git commit -m "$(cat <<'EOF'
feat(engine): async setSourceVisible with pickMask/drawMask split

pickMask flips immediately (faded-out layer is non-clickable);
drawMask flips after the fade settles. Auto-LOD writes both
synchronously. App.tsx callsite fires-and-forgets the now-async
setVisible method.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9.2: Toggle-fade integration test

**Files:**
- Create: `tests/services/engine/setSourceVisibleFade.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { Source } from '../../../src/data/sources';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../../src/services/animation/fadeController';

// Minimal engine harness — the test invokes setSourceVisible directly via
// the engine handle. The test fixture must construct a real engine state
// or use the existing engine-test helpers under tests/services/engine/.
//
// IMPLEMENTER NOTE: If `createEngine` requires a real GPU canvas, use
// the existing `makeHeadlessEngine` (or equivalent) test helper.
// Otherwise drive setSourceVisible directly against a partial-state stub
// — the function only reads state.sources / state.subsystems.fades /
// state.subsystems.scheduler.

import { setSourceVisibleForTest } from '../../../src/services/engine/engine';
// (If setSourceVisible isn't exported for tests, expose it via a
// __setSourceVisibleForTest export in engine.ts — read engine.ts's
// existing test exports for the established pattern.)

describe('setSourceVisible — fade orchestration', () => {
  function makeFixture(initialMask: number) {
    const fadeCalls: Array<{ target: number; duration: number }> = [];
    const fades = {
      label: 'fadeRegistry',
      register: vi.fn(),
      unregister: vi.fn(),
      fadeTo: vi.fn(async (_h, target, duration) => { fadeCalls.push({ target, duration }); }),
      setImmediate: vi.fn(),
      opacityOf: vi.fn(() => 0),
      isAnyAnimating: vi.fn(() => false),
      tick: vi.fn(),
      destroy: vi.fn(),
    };
    const state = {
      sources: {
        pickMask: initialMask,
        drawMask: initialMask,
        lodMode: 'manual' as const,
      },
      subsystems: { fades, scheduler: { requestRender: vi.fn() } },
    };
    return { state, fades, fadeCalls };
  }

  it('toggle OFF flips pickMask immediately, awaits FADE_OUT_DURATION_MS, then clears drawMask', async () => {
    const fx = makeFixture(0b11111);
    fx.fades.opacityOf = vi.fn(() => 0); // post-fade opacity is 0
    await setSourceVisibleForTest(fx.state as never, { cb: {} } as never, Source.SDSS, false);
    // pickMask cleared synchronously:
    expect((fx.state.sources.pickMask >> Source.SDSS) & 1).toBe(0);
    // fadeTo called with (target=0, duration=FADE_OUT_DURATION_MS):
    expect(fx.fadeCalls).toEqual([{ target: 0, duration: FADE_OUT_DURATION_MS }]);
    // drawMask cleared after the await:
    expect((fx.state.sources.drawMask >> Source.SDSS) & 1).toBe(0);
  });

  it('toggle ON sets drawMask first, then awaits FADE_IN_DURATION_MS', async () => {
    const fx = makeFixture(0); // every bit off
    await setSourceVisibleForTest(fx.state as never, { cb: {} } as never, Source.SDSS, true);
    expect((fx.state.sources.pickMask >> Source.SDSS) & 1).toBe(1);
    expect((fx.state.sources.drawMask >> Source.SDSS) & 1).toBe(1);
    expect(fx.fadeCalls).toEqual([{ target: 1, duration: FADE_IN_DURATION_MS }]);
  });

  it('rapid toggle off → on within fade-out leaves drawMask set (last-issued wins)', async () => {
    const fx = makeFixture(0b11111);
    // First toggle off — pickMask clears, fadeTo(0, 100) starts.
    const p1 = setSourceVisibleForTest(fx.state as never, { cb: {} } as never, Source.SDSS, false);
    // Immediately toggle on — pickMask sets, fadeTo(1, 600) starts.
    fx.fades.opacityOf = vi.fn(() => 1); // by the time p1 resolves, opacity is back at 1
    const p2 = setSourceVisibleForTest(fx.state as never, { cb: {} } as never, Source.SDSS, true);
    await Promise.all([p1, p2]);
    // The final drawMask state is what the last-issued fade settled on (opacity > 0).
    expect((fx.state.sources.drawMask >> Source.SDSS) & 1).toBe(1);
  });
});
```

- [ ] **Step 2: Expose `setSourceVisible` for testing if not already**

In `engine.ts`, add at the end of the file (or near the existing test exports):

```ts
// Test-only export: lets tests drive setSourceVisible against a
// minimal state stub without instantiating a full engine.
export { setSourceVisible as setSourceVisibleForTest };
```

(Only if `setSourceVisible` is currently inside the `createEngine` closure. If so, you'll need to either lift it to a module-scope function that takes `state` + `cb` as parameters, or expose it via the engine handle's `__internal` namespace. Read the existing engine test exports — find with `grep -n "__test\|forTest\|for_test" src/services/engine/engine.ts` — and follow the established pattern.)

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/services/engine/setSourceVisibleFade.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/services/engine/setSourceVisibleFade.test.ts src/services/engine/engine.ts
git commit -m "$(cat <<'EOF'
test(engine): cover setSourceVisible fade orchestration

Three cases: toggle off, toggle on, rapid double-toggle.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 10: RoD predicate simplification + CloudFade deletion

### Task 10.1: Replace per-renderer isFading() with fades.isAnyAnimating()

**Files:**
- Modify: `src/services/engine/frame/runFrame.ts`

- [ ] **Step 1: Update the still-animating predicate**

Find the predicate in `runFrame.ts` (around lines 474-481). Replace:

```ts
  const stillAnimating =
    state.settings.camera.autoRotate ||
    state.subsystems.tweens.isActive() ||
    state.subsystems.spaceMouse.hasAxes() ||
    (ready && state.subsystems.texturedImpostors.hasInFlightWork()) ||
    (ready && state.gpu.renderer.isFading()) ||
    (state.gpu.filamentRenderer !== null && state.gpu.filamentRenderer.isFading());
  if (stillAnimating) state.subsystems.scheduler.requestRender();
```

with:

```ts
  // All fade-related "is anything still animating" goes through the
  // unified FadeRegistry now — replacing the OR-chain of per-renderer
  // isFading() calls. Tick the registry first so any due fadeTo
  // promises resolve THIS frame (rather than waiting for the next).
  state.subsystems.fades.tick(now);
  const stillAnimating =
    state.settings.camera.autoRotate ||
    state.subsystems.tweens.isActive() ||
    state.subsystems.spaceMouse.hasAxes() ||
    (ready && state.subsystems.texturedImpostors.hasInFlightWork()) ||
    state.subsystems.fades.isAnyAnimating(now);
  if (stillAnimating) state.subsystems.scheduler.requestRender();
```

(`now` is the frame's `performance.now()` timestamp; reuse the local already in scope. If `now` isn't in scope at this point in `runFrame`, declare it earlier in the frame body: `const now = performance.now();`.)

- [ ] **Step 2: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/services/engine/frame/runFrame.ts
git commit -m "$(cat <<'EOF'
refactor(engine): collapse RoD fade predicate onto fades.isAnyAnimating

Replaces the OR-chain of pointRenderer.isFading() and
filamentRenderer.isFading() with a single registry-wide check.
Also ticks the registry once per frame so fadeTo promises resolve
in lockstep with the frame body.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10.2: Delete CloudFade and its WESL lib

**Files:**
- Delete: `src/services/gpu/resources/cloudFade.ts`
- Delete: `src/services/gpu/shaders/lib/cloudFade.wesl`
- Delete: `tests/services/gpu/resources/cloudFade.test.ts` (if it exists)

- [ ] **Step 1: Verify no remaining references to CloudFade**

Run: `grep -rn "CloudFade\|cloudFade\|CLOUD_FADE_DURATION_MS\|applyCloudFade\|CloudUniforms" src/ tests/`

Expected: zero matches. If any remain, fix the call site before deleting the file.

- [ ] **Step 2: Delete the files**

Run:
```
rm src/services/gpu/resources/cloudFade.ts
rm src/services/gpu/shaders/lib/cloudFade.wesl
test -f tests/services/gpu/resources/cloudFade.test.ts && rm tests/services/gpu/resources/cloudFade.test.ts || true
```

- [ ] **Step 3: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: PASS — Vite + WESL linker produce a clean bundle.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: delete CloudFade — fully replaced by FadeRegistry

cloudFade.ts and cloudFade.wesl have no remaining consumers. Every
renderer that previously used CloudFade now reads opacity from
state.subsystems.fades and writes it into its own per-handle
fadeBuffer; the picker reads sourceBuffer via the canonical
sourceUniformsBgl identity.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10.3: Final verification

- [ ] **Step 1: Run the full pipeline**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS at every stage.

- [ ] **Step 2: Smoke-test the dev server manually**

Ask the user to refresh `http://localhost:5173` and verify:
  - First load: surveys fade in over ~600 ms.
  - Tier swap: small fade-out (~100 ms), brief invisible gap, then fade-in (~600 ms).
  - Survey toggle in SettingsPanel: clicking off → smooth fade-out (~100 ms); clicking back on → smooth fade-in.
  - Filaments fade in on first load.
  - Volumes fade in on first load.
  - No console errors mentioning `CloudFade`, `cloud.opacity`, or `@group(1)` binding errors.

If anything visually regressed, debug before proceeding.

- [ ] **Step 3: Final commit if any fixes were needed**

If the smoke test surfaced fixes, commit them:

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix(fade): post-migration polish

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review

### Spec coverage check

| Spec section | Implementing task(s) |
|---|---|
| Core primitive: `FadeController` | 1.3, 1.4, 1.5 |
| Registry: `FadeRegistry` | 1.6, 1.7, 1.8 |
| Two separate uniforms, two separate bind groups | 2.1, 2.2, 2.3, 2.4 |
| Renderer-side data model (pointRenderer) | 3.2, 3.3, 3.4 |
| Renderer-side data model (filamentRenderer) | 5.1, 5.2 |
| Renderer-side data model (scalarVolumeRenderer) | 6.1, 6.2 |
| Renderer-side data model (label renderers) | 7.1 |
| Sequential tier-swap orchestration | 4.1 |
| UI layer-toggle (async fade-out) | 9.1, 9.2 |
| Render-on-demand integration | 10.1 |
| Handle registration at engine bootstrap | 1.9, 3.5, 5.3, 6.3, 7.1, 8.1 |
| Delete CloudFade | 10.2 |
| Final verification | 10.3 |

Every spec section maps to at least one task.

### Placeholder scan

Searched the plan for "TBD", "TODO", "implement later", "fill in details", "similar to Task N". One conditional reference exists in Task 4.1 step 2 ("the `_commitForTest` pseudo-method above is a stand-in for whatever the AssetSlot test harness exposes today"). This is **not** a placeholder for code; it's a directive to the implementer to read `AssetSlot.ts` first before writing the test, which is the honest answer when the codebase's test harness surface isn't visible from the spec. The implementer is given a concrete fallback (expose `__commitForTest` on the slot or drive via `load()` with a synchronous fetcher) so the task is not blocked.

Similarly, Task 7.1 step 3 says "find the right method" for the youAreHere and POI subsystems — the implementer must read those files to identify the first-emit hook. Given the per-subsystem variation, listing line numbers ahead of time would lie. The directive is concrete enough to act on.

### Type-name consistency

- `FadeController` (Task 1.3, 1.5) — used in `FadeRegistry` (Task 1.6, 1.8). Match.
- `FadeHandle` (Task 1.2) — used everywhere downstream. Match.
- `FadeUniformsBgl` (Task 2.3) — used in `pointRenderer` (3.3), `pickRenderer` (3.4), `filamentRenderer` (5.2), `scalarVolumeRenderer` (6.2). Match.
- `SourceUniformsBgl` (Task 2.4) — used in `pointRenderer` (3.3), `pickRenderer` (3.4). Not used by non-points renderers (per the spec). Match.
- `fadeBgl` (field name on `EngineGpuHandles`) — used in initGpu (2.5), and as a parameter name across renderer factories (3.3, 5.2, 6.2). Match.
- `sourceBgl` — match.
- `FADE_IN_DURATION_MS` / `FADE_OUT_DURATION_MS` — exported from `fadeController.ts` (1.5); imported in `galaxyCatalogSourceRegistry.ts` (4.1), `filamentSlot.ts` (5.3), `scalarVolumeRenderer` callbacks (6.3), and `engine.ts` setSourceVisible (9.1). Match.
- `pickMask` / `drawMask` — introduced in 9.1; replaces the legacy `visibleMask`. Every consumer is updated in the same task.
- `sourceBuffer` (replaces the legacy `cloudFadeBuffer` on the points `loadedSources` iterator) — used in 3.2, 3.3, 3.4. Match.

### Bootstrap order verification

The spec says: "`FadeRegistry` is constructed and attached to `state.subsystems.fades` **before** any renderer is constructed."

Plan check:
- Task 1.9 constructs `state.subsystems.fades` in the eager `state.subsystems` literal of `engine.ts` (alongside `tweens`/`scheduler`). The IIFE that runs `initGpu` fires AFTER the state literal — so renderer construction inside `initGpu` (Tasks 2.5, 3.4, 5.2, 6.2) finds a non-null `state.subsystems.fades`. Survey handle registration (Task 3.5) is inside `wireGalaxyCatalogSourceSlot`, called from `wireSlots` which runs after `initGpu` — registry is live before. Same for filament (5.3), volume callbacks (6.3), labels (7.1), and overlays (8.1).

Order is consistent with the spec.

---

**Plan complete.** Saved to `docs/superpowers/plans/2026-05-17-unified-fade-architecture.md`. Total: 10 phases, ~33 numbered tasks.

Recommended execution: subagent-driven (fresh subagent per task; two-stage review between tasks). Run via `superpowers:subagent-driven-development`.
