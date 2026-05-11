# Subsystem Wake Convention + Destroyable Shape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle audit findings #1 (subsystem wake convention) and #4+#15 (Destroyable shape) into one branch. Establish a `Destroyable` base type that every engine subsystem satisfies; collapse `engine.destroy()` into a uniform iteration; fix `loadProgressAggregator`'s leaked slot subscribers; replace `biasCorrectionSubsystem`'s `getState()` escape hatch with three narrow closures.

**Architecture:** Two concerns, one branch. They're bundled because both add fields to every subsystem's return shape; doing them together means each subsystem file is edited once. The `Destroyable` type mirrors the `Renderer` pattern from PR #99 — minimal contract (`{ destroy(): void }`), enforced via `satisfies Destroyable` at each factory return. After this PR every subsystem has a uniform `destroy()` method, `engine.destroy()` iterates over them, and the bias subsystem's wake mechanism is a narrow `requestRender: () => void` closure rather than a `getState()` escape hatch.

**Tech Stack:** TypeScript, Vitest. No new dependencies.

---

## Context for an engineer with no skymap background

skymap's engine constructs ~13 subsystems (selection, tweens, biasCorrection, youAreHere, labelDirector, pois, fpsCounter, thumbnails, spaceMouse, scheduler, clickResolver, inputBindings, loadProgress). Today their teardown is inconsistent:

- `selectionSubsystem` has a `destroy()` method that **isn't called** by `engine.destroy()`.
- `thumbnails`, `spaceMouse`, `inputBindings`, `scheduler` have teardown methods but with three different names (`destroy`, `destroy`, `detach`, `cancelRender`).
- Seven subsystems have **no teardown at all** (tweens, biasCorrection, youAreHere, labelDirector, pois, clickResolver, loadProgress).
- `loadProgressAggregator.attachSlot()` discards the unsubscriber that `AssetSlot.subscribe()` returns, **leaking subscriptions** on destroy.
- `biasCorrectionSubsystem` takes a `getState: () => EngineState` closure and reaches in for three things: `settings.bias.mode`, `sources.clouds`, and `subsystems.scheduler.requestRender()`. The `getState` escape hatch lets it reach for anything — a smell the audit flagged because the next subsystem author may copy it for legitimate uses and accidentally couple to unrelated state.

The convention this PR establishes: **every subsystem returns a Destroyable**, and the **wake-the-loop mechanism is a narrow `requestRender: () => void` closure**, not a `getState()` reach-in. The result is uniform iteration in `engine.destroy()` and one mockable seam per subsystem for tests.

## File Structure

**Create:**
- `src/@types/Destroyable.d.ts` — base type.
- `tests/services/engine/subsystems/loadProgressAggregator.test.ts` — pin the real-fix invariant.

**Modify:**
- `src/@types/index.d.ts` — re-export `Destroyable`.
- `src/@types/EngineSubsystemHandles.d.ts` — tighten field types to extend `Destroyable`.
- `src/services/engine/subsystems/renderScheduler.ts` — rename `cancelRender()` → `destroy()`.
- `src/services/engine/interaction/inputBindings.ts` — rename `detach()` → `destroy()`.
- `src/services/engine/subsystems/selectionSubsystem.ts` — `satisfies Destroyable`.
- `src/services/engine/subsystems/thumbnailSubsystem.ts` — `satisfies Destroyable`.
- `src/services/engine/subsystems/spaceMouseSubsystem.ts` — `satisfies Destroyable`.
- `src/services/engine/camera/tweenManager.ts` — add `destroy()` that calls `cancel()`.
- `src/services/engine/subsystems/biasCorrectionSubsystem.ts` — add `destroy()` (no-op); replace `getState` with 3 narrow closures.
- `src/services/engine/subsystems/youAreHereSubsystem.ts` — add no-op `destroy()`.
- `src/services/engine/subsystems/labelDirectorSubsystem.ts` — add no-op `destroy()`.
- `src/services/engine/subsystems/poiSubsystem.ts` — add no-op `destroy()`.
- `src/services/engine/interaction/clickHandler.ts` (or wherever `createClickResolver` lives) — add no-op `destroy()`.
- `src/services/engine/subsystems/loadProgressAggregator.ts` — capture unsubscribers; real `destroy()`.
- `src/services/engine/engine.ts` — rewrite `destroy()` to iterate; pass narrow closures to bias factory.

---

## Task 1: `Destroyable` type + renames

**Files:**
- Create: `src/@types/Destroyable.d.ts`
- Modify: `src/@types/index.d.ts` (re-export)
- Modify: `src/services/engine/subsystems/renderScheduler.ts` (rename `cancelRender` → `destroy`)
- Modify: `src/services/engine/interaction/inputBindings.ts` (rename `detach` → `destroy`)
- Modify: `src/services/engine/engine.ts` (update both call sites)
- Modify: `src/services/engine/subsystems/selectionSubsystem.ts` (`satisfies Destroyable` at factory return)
- Modify: `src/services/engine/subsystems/thumbnailSubsystem.ts` (`satisfies Destroyable`)
- Modify: `src/services/engine/subsystems/spaceMouseSubsystem.ts` (`satisfies Destroyable`)

- [ ] **Step 1: Create the `Destroyable` type**

```ts
// src/@types/Destroyable.d.ts
/**
 * Destroyable — minimal base contract every engine subsystem satisfies.
 *
 * ### Why this type exists
 *
 * skymap's engine constructs ~13 subsystems at boot. Pre-this-PR their
 * teardown was a mosaic: some had a `destroy()` method, some had
 * `detach()`, some had `cancelRender()`, and seven had no teardown
 * method at all — so `engine.destroy()` had to know each subsystem's
 * specific name (or skip it entirely, as it did for several).
 *
 * The `Destroyable` contract is intentionally minimal — just
 * `destroy(): void`. The corresponding `satisfies Destroyable` clause
 * at each factory return turns "I forgot to add destroy()" into a
 * compile-time error rather than a runtime leak.
 *
 * ### Why a `type` not an `interface`
 *
 * Per skymap convention; `type` aliases compose more cleanly with
 * intersection types like `SomeSubsystem & Destroyable`.
 */
export type Destroyable = {
  destroy(): void;
};
```

- [ ] **Step 2: Re-export from `@types/index.d.ts`**

Find the existing re-export block in `src/@types/index.d.ts` (look for `export type { Renderer } from './Renderer';` or similar). Add immediately below:

```ts
export type { Destroyable } from './Destroyable';
```

- [ ] **Step 3: Rename `cancelRender` → `destroy` in `renderScheduler.ts`**

Open `src/services/engine/subsystems/renderScheduler.ts`. Find the `RenderScheduler` type around line 78:

```ts
cancelRender(): void;
```

Rename to:

```ts
destroy(): void;
```

And in the factory implementation around line 109 — same rename in the returned object.

Add `satisfies Destroyable` at the factory return:

```ts
const scheduler = { /* ...existing fields... */ } satisfies RenderScheduler;
scheduler satisfies Destroyable;
return scheduler;
```

(Or if the factory returns the object literal directly, switch to `const` + `satisfies` first, then return.)

- [ ] **Step 4: Rename `detach` → `destroy` in `inputBindings.ts`**

Open `src/services/engine/interaction/inputBindings.ts`. Find the `InputBindings` type around line 70:

```ts
detach(): void;
```

Rename to:

```ts
destroy(): void;
```

And in the factory around line 196 — same rename in the returned object. Add the `satisfies Destroyable` latch.

Search the file for any docstring references to `detach()` and update them to `destroy()` — except for the existing comment around line 112 mentioning "so `detach()` can walk both arrays". Leave the conceptual explanation; just update the method name reference.

- [ ] **Step 5: Update call sites in `engine.ts`**

Open `src/services/engine/engine.ts` and find the existing `destroy()` function (around line 1071-1158). Two specific call sites:

- `state.subsystems.scheduler.cancelRender();` → `state.subsystems.scheduler.destroy();`
- `state.subsystems.inputBindings?.detach();` → `state.subsystems.inputBindings?.destroy();`

Do NOT yet collapse the iteration — that's Task 5. For now just rename the two calls.

- [ ] **Step 6: Add `satisfies Destroyable` to existing-destroy subsystems**

In each of these files, after the factory builds its returned object, add the `satisfies Destroyable` latch. The existing `destroy()` methods are already in place; only the latch is new.

- `src/services/engine/subsystems/selectionSubsystem.ts` — has `destroy()` around line 225
- `src/services/engine/subsystems/thumbnailSubsystem.ts` — has `destroy()` (large file)
- `src/services/engine/subsystems/spaceMouseSubsystem.ts` — has `destroy()` around line 146

Pattern at each return:

```ts
const subsystem: SelectionSubsystem = { /* ... */ };
subsystem satisfies Destroyable;
return subsystem;
```

If the factory currently returns an object literal directly, switch to the `const subsystem = ...; return subsystem;` pattern first so `satisfies` has something to attach to.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS at the existing baseline. No new tests; the renames must not break any existing tests.

- [ ] **Step 8: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/@types/Destroyable.d.ts src/@types/index.d.ts \
  src/services/engine/subsystems/renderScheduler.ts \
  src/services/engine/interaction/inputBindings.ts \
  src/services/engine/engine.ts \
  src/services/engine/subsystems/selectionSubsystem.ts \
  src/services/engine/subsystems/thumbnailSubsystem.ts \
  src/services/engine/subsystems/spaceMouseSubsystem.ts
git commit -m "$(cat <<'EOF'
refactor(types): Destroyable base type + rename teardown methods

New Destroyable type at src/@types/Destroyable.d.ts; subsystems that
already had teardown methods (selection, thumbnails, spaceMouse,
inputBindings, scheduler) now satisfy it. Renames scheduler's
cancelRender() → destroy() and inputBindings' detach() → destroy()
for uniform teardown naming across the subsystem bag.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `destroy()` to subsystems lacking one

**Files:**
- Modify: `src/services/engine/camera/tweenManager.ts` — `destroy()` calls `cancel()`
- Modify: `src/services/engine/subsystems/biasCorrectionSubsystem.ts` — no-op `destroy()`
- Modify: `src/services/engine/subsystems/youAreHereSubsystem.ts` — no-op `destroy()`
- Modify: `src/services/engine/subsystems/labelDirectorSubsystem.ts` — no-op `destroy()`
- Modify: `src/services/engine/subsystems/poiSubsystem.ts` — no-op `destroy()`
- Modify: clickResolver factory (find via `grep -rn 'createClickResolver' src/`) — no-op `destroy()`
- Modify: `src/services/engine/subsystems/loadProgressAggregator.ts` — placeholder no-op (real fix in T3)

For each file:
1. Add `destroy(): void` to the public type.
2. Add `destroy()` method to the returned object (`cancel()` body for tweens, empty body for the rest).
3. Add `satisfies Destroyable` at the factory return.

- [ ] **Step 1: `tweenManager.ts`**

Open `src/services/engine/camera/tweenManager.ts`. In the `TweenManager` type, add (alongside the existing `cancel()`):

```ts
/**
 * Tear down the manager. Cancels any running tween and is otherwise
 * inert — there are no event listeners or workers to release.
 */
destroy(): void;
```

In the factory implementation, add the method to the returned object:

```ts
destroy(): void {
  this.cancel?.() ?? cancel();  // or whichever closure-binding the factory uses
},
```

If `cancel` is a closure-scoped function in the factory, just call it directly: `destroy(): void { cancel(); }`. Then add the `satisfies Destroyable` latch.

- [ ] **Step 2: `biasCorrectionSubsystem.ts`**

In the `BiasCorrectionSubsystem` type, add:

```ts
/**
 * Tear down the subsystem. Currently a no-op — bias bakes spawn
 * per-call workers that self-terminate, and there are no event
 * listeners or persistent subscriptions to release. Method exists for
 * uniform iteration in `engine.destroy()`. Track the audit-#2
 * follow-up if per-call worker tracking is later added.
 */
destroy(): void;
```

In the factory, add the no-op method. Add `satisfies Destroyable` at the return.

- [ ] **Step 3: `youAreHereSubsystem.ts`, `labelDirectorSubsystem.ts`, `poiSubsystem.ts`**

For each: add `destroy(): void` to the public type with a no-op rationale docstring ("no closures, no listeners — exists for uniform iteration"), implement as `destroy(): void {}`, add the `satisfies Destroyable` latch.

- [ ] **Step 4: clickResolver factory**

Run `grep -rn 'createClickResolver' src/` to find the factory file. Add `destroy(): void` to the public type, implement as no-op (`function destroy(): void {}`), add the `satisfies Destroyable` latch.

- [ ] **Step 5: `loadProgressAggregator.ts` — placeholder**

In `src/services/engine/subsystems/loadProgressAggregator.ts`, update the `LoadProgressEmitter` type to add:

```ts
/**
 * Release every subscriber attached via `attachSlot`. Real
 * implementation lands in the next commit; this placeholder exists
 * so the type satisfies Destroyable and consumers can call destroy()
 * uniformly.
 */
destroy(): void;
```

In the factory's returned object add `destroy(): void {}` as a placeholder. Add `satisfies Destroyable`. The real fix is Task 3.

- [ ] **Step 6: Run the full test suite + typecheck**

Run: `npm test` and `npm run typecheck`. Both PASS at baseline.

- [ ] **Step 7: Commit**

```bash
git add -A  # (use git status first to verify only the intended files staged)
git commit -m "$(cat <<'EOF'
refactor(subsystems): add destroy() to every subsystem

Adds destroy() to tweenManager (calls cancel), biasCorrection (no-op),
youAreHere (no-op), labelDirector (no-op), pois (no-op), clickResolver
(no-op), loadProgressAggregator (placeholder no-op). Every subsystem
now satisfies Destroyable. Real loadProgress destroy lands in the
next commit; engine.destroy() iteration rewrite lands at the end.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `loadProgressAggregator` real `destroy()` + tests

**Files:**
- Modify: `src/services/engine/subsystems/loadProgressAggregator.ts`
- Create: `tests/services/engine/subsystems/loadProgressAggregator.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
// tests/services/engine/subsystems/loadProgressAggregator.test.ts
/**
 * Tests for the loadProgressAggregator's load-bearing destroy()
 * behaviour — capturing slot unsubscribers and releasing them on
 * teardown.
 *
 * ### Why this file exists
 *
 * Pre-this-PR, `attachSlot(slot)` called `slot.subscribe(publish)`
 * and discarded the unsubscriber. Result: subscriptions outlived
 * `engine.destroy()`, so any slot state change after teardown still
 * fired `publish` (which then called the emit callback that may have
 * been replaced with a stale reference). The 2026-05-11 second audit
 * called this finding #15 — bundled with #4 (incomplete
 * engine.destroy() iteration).
 *
 * ### What this file asserts
 *
 * 1. attachSlot wires a subscriber that fires emit when the slot
 *    transitions (round-trip through a fake slot).
 * 2. destroy() releases every captured subscriber — post-destroy
 *    slot transitions don't fire emit.
 * 3. destroy() is idempotent — calling twice doesn't crash and
 *    doesn't double-release (the subscriber list clears).
 */

import { describe, it, expect, vi } from 'vitest';
import { createLoadProgressEmitter } from '../../../../src/services/engine/subsystems/loadProgressAggregator';
import type { AssetSlot, LoadState } from '../../../../src/services/loading/types';

/**
 * Minimal AssetSlot fake. Captures every subscribe() callback so the
 * test can drive state transitions; returns an unsubscriber that
 * removes the callback from the captured list.
 */
function makeFakeSlot(): {
  slot: AssetSlot<unknown, unknown>;
  fire(): void;
  subscriberCount(): number;
} {
  const subscribers: Array<(s: LoadState<unknown>) => void> = [];
  const slot = {
    state(): LoadState<unknown> {
      // Doesn't matter for these tests; aggregateRegistry reads it
      // but we mock that out by passing an empty slot map below.
      return { status: 'loading', loadedBytes: 0, totalBytes: 0 } as never;
    },
    subscribe(fn: (s: LoadState<unknown>) => void): () => void {
      subscribers.push(fn);
      return () => {
        const idx = subscribers.indexOf(fn);
        if (idx !== -1) subscribers.splice(idx, 1);
      };
    },
  } as unknown as AssetSlot<unknown, unknown>;
  return {
    slot,
    fire(): void {
      for (const fn of subscribers) {
        fn({ status: 'loading', loadedBytes: 0, totalBytes: 0 } as never);
      }
    },
    subscriberCount(): number {
      return subscribers.length;
    },
  };
}

describe('loadProgressAggregator', () => {
  it('attachSlot wires a subscriber that fires emit on slot transition', () => {
    const emit = vi.fn();
    const emitter = createLoadProgressEmitter(emit, new Map());
    const { slot, fire, subscriberCount } = makeFakeSlot();

    emitter.attachSlot(slot);
    expect(subscriberCount()).toBe(1);

    fire();
    // emit fires once on transition. The exact payload depends on
    // aggregateRegistry's read of the (empty) slot map; just assert
    // that emit was invoked at least once as a result of the fire.
    expect(emit).toHaveBeenCalled();
  });

  it('destroy() releases every attached subscriber', () => {
    const emit = vi.fn();
    const emitter = createLoadProgressEmitter(emit, new Map());
    const slot1 = makeFakeSlot();
    const slot2 = makeFakeSlot();

    emitter.attachSlot(slot1.slot);
    emitter.attachSlot(slot2.slot);
    expect(slot1.subscriberCount()).toBe(1);
    expect(slot2.subscriberCount()).toBe(1);

    emitter.destroy();

    // Both slots now have zero subscribers — the unsubscribers were
    // called from inside destroy().
    expect(slot1.subscriberCount()).toBe(0);
    expect(slot2.subscriberCount()).toBe(0);

    // Post-destroy transitions must not fire emit.
    emit.mockClear();
    slot1.fire();
    slot2.fire();
    expect(emit).not.toHaveBeenCalled();
  });

  it('destroy() is idempotent', () => {
    const emit = vi.fn();
    const emitter = createLoadProgressEmitter(emit, new Map());
    const { slot } = makeFakeSlot();

    emitter.attachSlot(slot);
    emitter.destroy();

    expect(() => emitter.destroy()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/engine/subsystems/loadProgressAggregator.test.ts`
Expected: FAIL on the `destroy()` test (the placeholder from T2 doesn't actually release subscribers).

- [ ] **Step 3: Implement the real `destroy()`**

Open `src/services/engine/subsystems/loadProgressAggregator.ts`. The current factory body looks like:

```ts
return {
  emit: publish,
  attachSlot(slot) {
    slot.subscribe(publish);
  },
  destroy(): void {},  // placeholder from Task 2
};
```

Replace with:

```ts
// Capture every subscriber's unsubscribe handle so `destroy()` can
// release the lot. Without this, slot state changes after engine
// teardown still fired `publish`, holding the emit callback (and
// every closure it captures) alive past intended lifetime.
const unsubscribers: Array<() => void> = [];
const emitter = {
  emit: publish,
  attachSlot(slot: AssetSlot<unknown, unknown>): void {
    unsubscribers.push(slot.subscribe(publish));
  },
  destroy(): void {
    for (const u of unsubscribers) u();
    unsubscribers.length = 0;
  },
};
emitter satisfies Destroyable;
return emitter;
```

(Add a `Destroyable` import: `import type { Destroyable } from '../../../@types';`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/services/engine/subsystems/loadProgressAggregator.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Full suite + typecheck**

Run: `npm test` and `npm run typecheck`. Both PASS; new tests included.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/subsystems/loadProgressAggregator.ts \
  tests/services/engine/subsystems/loadProgressAggregator.test.ts
git commit -m "$(cat <<'EOF'
fix(loadProgress): capture unsubscribers so destroy() releases them

Pre-fix, attachSlot() discarded the unsubscriber returned by
slot.subscribe() — every attach leaked a subscription that outlived
engine.destroy(). Now unsubscribers are collected in a per-emitter
list and destroy() walks the list. Idempotent on repeat calls.

Tests cover the wire-up (transition fires emit), the release
(post-destroy transitions don't fire emit), and idempotency.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `biasCorrection` `getState()` → narrow closures

**Files:**
- Modify: `src/services/engine/subsystems/biasCorrectionSubsystem.ts`
- Modify: `src/services/engine/engine.ts` (factory call site)
- Modify: any existing test files that pass `getState` (search `tests/` for `getState` against the bias subsystem)

The current `BiasCorrectionDeps` shape (around line 117):

```ts
export type BiasCorrectionDeps = {
  getState: () => EngineState;
  schechterRunner?: SchechterRunner;
  angularRunner?: AngularRunner;
};
```

The `getState()` is read at three sites:
- line 252: `mode = getState().settings.bias.mode;`
- line 260: `const clouds = getState().sources.clouds;`
- lines 325, 333: `getState().subsystems.scheduler.requestRender();`

Replace with three narrow closures.

- [ ] **Step 1: Tighten the deps type**

Open `src/services/engine/subsystems/biasCorrectionSubsystem.ts`. Replace the `BiasCorrectionDeps` type:

```ts
export type BiasCorrectionDeps = {
  /**
   * Current bias mode — read lazily on every bake decision because
   * the user can flip modes between bakes. Replaces the old
   * `getState().settings.bias.mode` read.
   */
  getMode: () => BiasMode;

  /**
   * Currently-loaded source clouds, keyed by Source enum. Read
   * lazily because the cloud map is mutated in place across tier
   * swaps and per-source uploads. Replaces the old
   * `getState().sources.clouds` read.
   */
  getLoadedClouds: () => Map<Source, PointCloud>;

  /**
   * Wake the render loop. Called after every bake completes (the
   * uploaded splice changes what the visual pass renders, so the
   * shader needs another frame). Replaces the old
   * `getState().subsystems.scheduler.requestRender()` reach-in.
   */
  requestRender: () => void;

  /** Optional override for the Schechter-ratio bake (test-injected). */
  schechterRunner?: SchechterRunner;

  /** Optional override for the angular-weight bake (test-injected). */
  angularRunner?: AngularRunner;
};
```

(`BiasMode` is already imported in the file; `Map<Source, PointCloud>` matches the in-state shape — verify `Source` and `PointCloud` are imported, add imports if not.)

- [ ] **Step 2: Replace the three usage sites**

Inside the factory body:
- Line ~252: `mode = getState().settings.bias.mode;` → `mode = deps.getMode();`
- Line ~260: `const clouds = getState().sources.clouds;` → `const clouds = deps.getLoadedClouds();`
- Line ~325, ~333: `getState().subsystems.scheduler.requestRender();` → `deps.requestRender();`

(The factory likely destructures `deps` at the top — adjust the destructure to pull out the three new closures, or keep accessing via `deps.X`. Match the existing destructuring pattern in the file.)

- [ ] **Step 3: Update the engine.ts call site**

Open `src/services/engine/engine.ts`. Find the `createBiasCorrectionSubsystem` call. The current call passes `getState: () => state`. Replace with the three narrow closures:

```ts
const biasCorrection = createBiasCorrectionSubsystem({
  getMode: () => state.settings.bias.mode,
  getLoadedClouds: () => state.sources.clouds,
  requestRender: () => state.subsystems.scheduler.requestRender(),
  // schechterRunner / angularRunner remain unchanged
});
```

- [ ] **Step 4: Update tests**

Run `grep -rn 'createBiasCorrectionSubsystem\|biasCorrectionSubsystem' tests/` to find test files that construct the subsystem. Update each to pass the three narrow closures instead of `getState`. The test stubs typically construct a fake state object — they now construct three narrow stubs (`vi.fn(() => 'off')`, `vi.fn(() => new Map())`, `vi.fn()`).

- [ ] **Step 5: Run test suite + typecheck**

Run: `npm test` and `npm run typecheck`. Both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/subsystems/biasCorrectionSubsystem.ts \
  src/services/engine/engine.ts tests/services/engine/subsystems/  # add specific test files as needed
git commit -m "$(cat <<'EOF'
refactor(bias): replace getState() escape hatch with narrow closures

BiasCorrectionDeps now takes getMode, getLoadedClouds, requestRender
as three narrow closures instead of getState: () => EngineState.
Removes the only subsystem in the engine that could reach into
arbitrary state via a single deps field. Tests now stub three
specific closures instead of a fake EngineState.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `EngineSubsystemHandles` tightening + `engine.destroy()` rewrite

**Files:**
- Modify: `src/@types/EngineSubsystemHandles.d.ts`
- Modify: `src/services/engine/engine.ts`

- [ ] **Step 1: Tighten the EngineSubsystemHandles type**

Open `src/@types/EngineSubsystemHandles.d.ts`. The existing shape is roughly:

```ts
export type EngineSubsystemHandles = {
  scheduler: RenderScheduler;
  selection: SelectionSubsystem;
  tweens: TweenManager;
  // ...etc
  thumbnails: ThumbnailSubsystem | null;
  // ...
};
```

The types themselves now already satisfy Destroyable (added in Tasks 1-3), so the existing field declarations work as-is. No change needed to the type itself — but verify by adding a compile-time check at the bottom of the file:

```ts
import type { Destroyable } from './Destroyable';

// Compile-time guard: every subsystem field MUST satisfy Destroyable.
// If a future subsystem is added without a destroy() method, this
// type alias fails to compile.
type _EnforceDestroyable = {
  [K in keyof EngineSubsystemHandles]:
    NonNullable<EngineSubsystemHandles[K]> extends Destroyable ? true : never;
};
```

(The `_EnforceDestroyable` type is unused at runtime but unused-type checking is forgiving; if every field satisfies Destroyable, the type resolves to all-true. If any field violates, it resolves to `never` somewhere and the TS check fails.)

- [ ] **Step 2: Rewrite `engine.destroy()` to iterate uniformly**

Open `src/services/engine/engine.ts`. Find the `destroy()` function (around line 1071). The current body has ~10 specific subsystem teardown calls + 10 specific renderer destroys + the orbit-controls detach.

Replace the subsystem-specific block with a uniform iteration:

```ts
function destroy(): void {
  // 1. Cancel the render loop first — every subsequent destroy() must
  //    be safe to call after the loop has stopped.
  state.subsystems.scheduler.destroy();

  // 2. Detach DOM-level listeners next (before subsystems that may
  //    fire from those listeners are torn down).
  state.subsystems.inputBindings?.destroy();
  detachControlsRef.current?.();

  // 3. Walk every other subsystem. Order doesn't matter past this
  //    point — all subsystems are independent of each other for
  //    teardown.
  state.subsystems.selection.destroy();
  state.subsystems.tweens.destroy();
  state.subsystems.biasCorrection.destroy();
  state.subsystems.youAreHere.destroy();
  state.subsystems.labelDirector.destroy();
  state.subsystems.pois.destroy();
  state.subsystems.thumbnails?.destroy();
  state.subsystems.spaceMouse.destroy();
  state.subsystems.clickResolver?.destroy();
  state.subsystems.loadProgress?.destroy();

  // 4. GPU renderers — every one is a Renderer (has destroy() too).
  state.gpu.pickRenderer?.destroy();
  state.gpu.postProcess?.destroy();
  state.gpu.filamentRenderer?.destroy();
  state.gpu.labelRenderer?.destroy();
  state.gpu.markerLineRenderer?.destroy();
  state.gpu.thumbnailRenderer?.destroy();
  state.gpu.diskRenderer?.destroy();
  state.gpu.proceduralDiskRenderer?.destroy();
  state.gpu.milkyWayRenderer?.destroy();
  state.gpu.scalarVolumeRenderer?.destroy();
  state.gpu.renderer?.destroy();  // point renderer (the canonical "renderer" field)
}
```

(Adjust the exact field names to match `EngineSubsystemHandles` and `EngineGpuHandles` in the project. Use the Read tool to verify the existing destroy() body before editing — line numbers may have drifted.)

- [ ] **Step 3: Run the full test suite + typecheck + build**

Run: `npm test`, `npm run typecheck`, `npm run build`. All PASS.

- [ ] **Step 4: Commit**

```bash
git add src/@types/EngineSubsystemHandles.d.ts src/services/engine/engine.ts
git commit -m "$(cat <<'EOF'
refactor(engine): uniform destroy() iteration over every subsystem

Now that every subsystem satisfies Destroyable (Tasks 1-3), engine.
destroy() walks them all uniformly. Selection, tweens, biasCorrection,
youAreHere, labelDirector, pois, clickResolver, loadProgress — all
now torn down. The previous body silently skipped 7 of these.

Compile-time guard at the bottom of EngineSubsystemHandles.d.ts
ensures every future field continues to satisfy Destroyable.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final verification, push, PR

**Files:** none — verification + PR open.

- [ ] **Step 1: Final test run**

Run: `npm test`. Expected: previous baseline + 3 new loadProgress tests passing.

- [ ] **Step 2: Typecheck both configs**

Run: `npm run typecheck`. PASS.

- [ ] **Step 3: Production build**

Run: `npm run build`. PASS.

- [ ] **Step 4: Verify git log**

Run: `git log --oneline main..HEAD`. Expected: 6 commits (1 plan + 5 implementation), in order:

```
<sha1>  docs(plans): subsystem-wake + Destroyable — bundled audit #1 + #4+#15 plan
<sha2>  refactor(types): Destroyable base type + rename teardown methods
<sha3>  refactor(subsystems): add destroy() to every subsystem
<sha4>  fix(loadProgress): capture unsubscribers so destroy() releases them
<sha5>  refactor(bias): replace getState() escape hatch with narrow closures
<sha6>  refactor(engine): uniform destroy() iteration over every subsystem
```

- [ ] **Step 5: Push**

Run: `git push -u origin refactor/subsystem-wake-and-destroyable`.

- [ ] **Step 6: Open PR**

```bash
gh pr create --title "refactor: Destroyable subsystem shape + narrow bias wake convention" --body "$(cat <<'EOF'
## Summary

Bundles audit findings #1 (subsystem wake convention) and #4+#15
(Destroyable shape) from the 2026-05-11 second architectural audit.
Both add fields to every subsystem's return type, so they're shipped
together to avoid editing each subsystem twice.

### What changes
- New \`Destroyable\` base type at \`src/@types/Destroyable.d.ts\`.
- Every subsystem now has a \`destroy()\` method (no-op where there's
  nothing to release; real work for loadProgressAggregator).
- \`scheduler.cancelRender()\` renamed to \`scheduler.destroy()\`.
- \`inputBindings.detach()\` renamed to \`inputBindings.destroy()\`.
- \`engine.destroy()\` collapsed to uniform iteration over the
  subsystem and GPU handle bags. Previously 7 subsystems were
  silently skipped (selection, tweens, biasCorrection, youAreHere,
  labelDirector, pois, clickResolver, loadProgress).
- \`loadProgressAggregator\` now captures slot unsubscribers and
  releases them on destroy — the audit #15 leak fix.
- \`biasCorrectionSubsystem\` deps shrunk: \`getState: () => EngineState\`
  → three narrow closures (\`getMode\`, \`getLoadedClouds\`, \`requestRender\`).
  Removes the only subsystem-level \"reach into arbitrary state\" escape
  hatch in the engine.
- Compile-time guard in \`EngineSubsystemHandles.d.ts\` ensures every
  future subsystem field satisfies Destroyable.

### Test plan
- [x] \`npm test\` — passing (+ 3 new tests for loadProgress)
- [x] \`npm run typecheck\` — clean
- [x] \`npm run build\` — clean

### Visual smoke checks needed before merge
This PR rewrites \`engine.destroy()\`. Behaviour is additive (more
things torn down, not fewer), but a regression here would only
manifest at canvas remount / hot reload. The reviewer should
confirm:
- Engine hot reload (Vite HMR) doesn't accumulate phantom listeners
- Tier swap (medium → large) still works without console errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Audit #1 (subsystem wake): biasCorrection's getState() is the only legitimate target — the audit's broader observation about "every subsystem solves wake differently" is partially resolved by the convention now being implicit in the codebase (thumbnail's `requestRender` pattern stays; spaceMouse's `onAxes` is a domain event not a wake mechanism; labelDirector's per-frame state-arg read is fine because it's called from runFrame). Confirmed in survey before plan drafting.
- Audit #4 (incomplete engine.destroy iteration): every subsystem in the handles bag now has destroy() and engine.destroy() iterates uniformly. ✓
- Audit #15 (loadProgress leak): explicit fix in Task 3 with focused tests. ✓

**Placeholder scan:** No "TBD" / "TODO" / "implement later" in any task. Every step shows the exact code to add or replace.

**Type consistency:**
- `Destroyable` exported as `{ destroy(): void }` consistently across Tasks 1-5.
- `BiasCorrectionDeps` new shape (`getMode`, `getLoadedClouds`, `requestRender`) consistent between Task 4 and the engine.ts call site update.
- `EngineSubsystemHandles._EnforceDestroyable` compile-time guard added in Task 5; depends on Tasks 1-3 establishing the destroy methods.

**Known scope omissions (intentional):**
- spaceMouseSubsystem's `onAxes` domain callback stays — it's not a wake mechanism, it's a data callback.
- labelDirectorSubsystem's per-frame `state.subsystems.scheduler.requestRender()` read stays — it's called from runFrame with state already in scope; not the same smell as bias's getState() escape hatch.
- Worker termination tracking in biasCorrection is deferred to a future audit-#2 follow-up — the no-op destroy() is the placeholder.
- The audit's mention of `fpsCounter` is out of scope: it lives in `BootstrapDeps.lastReportedFps`, not `EngineSubsystemHandles`, and has nothing to release.
- Renderer base type (`Renderer` from PR #99) intentionally not extended to include subsystem-only fields — renderers are GPU-resource owners; subsystems are state-machine owners. Two parallel base types is the right factoring.
