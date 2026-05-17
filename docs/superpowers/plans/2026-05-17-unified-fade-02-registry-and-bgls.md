# Unified Fade Architecture (2/5) -- FadeRegistry + Canonical BGLs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `FadeRegistry` engine subsystem on top of the `FadeController` primitive, wire it into `state.subsystems.fades`, then land the two canonical (non-`'auto'`) bind-group layouts (`fadeUniformsBgl` at `@group(1)` and `sourceUniformsBgl` at `@group(2)`) plus the matching WESL libraries (`fadeUniforms.wesl`, `sourceUniforms.wesl`). Pure additive -- no renderer touches CloudFade yet; the registry is self-contained because `opacityOf` returns `1.0` for unregistered handles.

**Architecture:** `FadeRegistry` holds a `Map<string, FadeController>` keyed by `serializeFadeHandle(handle)`. Per-frame `tick(now)` walks every controller and calls its `tick`. `opacityOf(handle, now)` is the read-side for renderers; `fadeTo(handle, target, duration, now)` is the write-side. Engine bootstrap constructs the registry, the two canonical BGLs, and stores them on `state.subsystems.fades` and `state.gpu.{fadeBgl, sourceBgl}` respectively. No consumer pipelines yet -- that lands in sub-plan 03.

**Tech Stack:** TypeScript, WebGPU, WESL (`wesl-plugin` Vite linker), Vitest.

**Prerequisites:** `2026-05-17-unified-fade-01-foundation-controller.md` must be merged -- provides `FadeController`, `FadeHandle`, `LabelLayerId`, `OverlayId`, and the duration constants this sub-plan imports.

**Followed by:** `2026-05-17-unified-fade-03-points.md` -- migrates `pointRenderer` and the galaxy-catalog slot to consume `state.subsystems.fades` and the canonical BGLs.

**Spec reference:** `docs/superpowers/specs/2026-05-17-unified-fade-architecture-design.md`

**Definition of done:** `npm run typecheck && npm test && npm run build` all pass.

### Name & layout reference (used throughout)

See sub-plan 01 for the canonical `FadeHandle` union, `serializeFadeHandle`, and the WESL `FadeUniforms` / `SourceUniforms` struct shapes. They are referenced verbatim by tasks in this sub-plan.

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
   *
   * `nowMs` is passed through to the controller's `fadeTo` so tests
   * can inject deterministic timestamps. Production callers omit it
   * and let `performance.now()` flow through.
   */
  fadeTo(handle: FadeHandle, target: number, durationMs?: number, nowMs?: number): Promise<void>;

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
    r.fadeTo(h, 1, 600, 0).then(() => { done = true; });
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
    r.fadeTo(a, 1, 600, 1000); // start fade-in anchored at t=1000
    // Mid-ramp at t=1300 — still animating.
    expect(r.isAnyAnimating(1300)).toBe(true);
    // After the ramp ends at t=1600 — no longer animating.
    expect(r.isAnyAnimating(1700)).toBe(false);
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
    nowMs?: number,
  ): Promise<void> {
    const c = requireController(handle);
    const now = nowMs ?? performance.now();
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
    const now = nowMs ?? 0;
    for (const c of controllers.values()) c.tick(now);
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
  // (rather than `_pad: vec3<f32>`) so a future field can repurpose
  // any one slot without alignment churn — each pad is a free 4-byte
  // f32/u32 slot. (Wider types like vec2<f32> or vec4 need 8 / 16-byte
  // alignment respectively and would require resizing the struct.)
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

