# Unified Fade Architecture (5/5) -- UI Toggle + RoD Predicate + CloudFade Deletion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the user-facing UI toggle async behavior (separate `pickMask` and `drawMask` so a survey can be invisible-but-still-pickable during the fade-out), collapse the per-renderer `isFading()` checks in the render-on-demand predicate down to `state.subsystems.fades.isAnyAnimating(now)`, delete the now-unused `CloudFade` class and its WESL library, and run the final verification pass.

**Architecture:** `EngineSourceState` gains a `pickMask: ReadonlySet<Source>` and `drawMask: ReadonlySet<Source>`. Toggle-off path: clear `pickMask` immediately (clicks stop registering), then `await fades.fadeTo(handle, 0, FADE_OUT_DURATION_MS)`, then clear `drawMask`. Toggle-on path: set both masks, then `fades.fadeTo(handle, 1, FADE_IN_DURATION_MS)`. `runFrame.ts`'s render-on-demand predicate drops every per-renderer `isFading()` call and reads only the registry. `cloudFade.ts` and `cloudFade.wesl` (plus the corresponding test file) are deleted.

**Tech Stack:** TypeScript, WebGPU, WESL (`wesl-plugin` Vite linker), Vitest, React.

**Prerequisites:** `2026-05-17-unified-fade-04-filaments-volume-labels-overlays.md` must be merged -- every renderer must already be reading from the registry; this sub-plan removes the last `CloudFade` references and the per-renderer `isFading()` API.

**Followed by:** none -- this is the final sub-plan. After merging, the unified fade architecture is complete.

**Spec reference:** `docs/superpowers/specs/2026-05-17-unified-fade-architecture-design.md`

**Definition of done:** `npm run typecheck && npm test && npm run build` all pass; manual smoke test on `http://localhost:5173` confirms first-load fade-in, tier-swap fade-out then fade-in, survey toggle fade-out / fade-in, filaments fade-in, volumes fade-in, and no console errors mentioning `CloudFade`, `cloud.opacity`, or `@group(1)` binding mismatches.

---

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
import {
  FADE_IN_DURATION_MS,
  FADE_OUT_DURATION_MS,
} from '../../../src/services/animation/fadeController';

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
      fadeTo: vi.fn(async (_h, target, duration) => {
        fadeCalls.push({ target, duration });
      }),
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
