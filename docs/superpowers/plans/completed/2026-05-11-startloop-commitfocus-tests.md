# startLoop + commitFocus Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add focused, M7-style tests for two engine source files that currently have zero direct test coverage — `startLoop.ts` (the bootstrap phase that kicks the rAF loop) and `commitFocus.ts` (the shared focus protocol). Pin the highest-leverage invariants; don't try to exhaustively cover every branch.

**Architecture:** Two new test files following the exact pattern established by `tests/services/engine/phases/wireInput.test.ts` — module-level `vi.mock` for the load-bearing collaborators (`runFrame`, `tweenToGalaxy`), minimal `makeState` / `makeDeps` fixtures, and one focused assertion per invariant. No production code changes; pure test addition.

**Tech Stack:** TypeScript, Vitest. No new dependencies. The tests are pure-Node — they don't need GPU, DOM, or Worker support.

---

## Context for an engineer with no skymap background

skymap's engine boots through four bootstrap phases (`initGpu`, `wireSlots`, `wireInput`, `startLoop`). The render loop is **render-on-demand**: nothing renders until something calls `scheduler.requestRender()`. The first such call happens at the tail of `startLoop`. If that call is ever silently dropped, the user sees a black canvas on first paint and the engine sits in "loading" forever.

`commitFocus` is the shared 3-line tail that three public-handle methods (`focusOn`, `selectFamous`, `selectByAlias`) all converge on: update selection, fire `onFocusChange` callback, start the camera tween. Order matters — React reads `onFocusChange` to update the URL hash, and the hash update must land before the camera animation starts. A future refactor that reorders these three calls would silently drift the URL hash out of sync with the canvas.

Both files were called out in the 2026-05-11 second architectural audit's finding #5: "Eight engine source files have no direct test, including the boot-time `startLoop`". `startLoop` and `commitFocus` are the highest-leverage of the eight — every boot runs `startLoop`, every focus action runs `commitFocus`. This plan ships their tests; the other six (autoLod, logCameraState, cssToTexPx, focusTween, cameraSnapshot, labelProducer) are deferred.

The reference test shape lives at `tests/services/engine/phases/wireInput.test.ts` — a single-file test that mocks every external collaborator, uses minimal fixtures, and asserts on the load-bearing call contracts rather than internal plumbing. Mirror that pattern.

## File Structure

**Create:**
- `tests/services/engine/phases/startLoop.test.ts`
- `tests/services/engine/helpers/commitFocus.test.ts`

**Modify:** none — production code unchanged.

The test paths mirror the source paths exactly (`src/services/engine/phases/startLoop.ts` → `tests/services/engine/phases/startLoop.test.ts`); this is the project convention.

---

## Task 1: `startLoop.test.ts`

**Files:**
- Create: `tests/services/engine/phases/startLoop.test.ts`

**Invariants pinned:**
1. **Happy path** — `frameRef.current` is replaced with a real frame body AND `scheduler.requestRender()` is called exactly once.
2. **Frame body call contract** — when the newly-assigned `frameRef.current` is invoked, it calls `runFrame(state, frameDeps, perfNow)` with the right shape.
3. **Early-return** — if `state.sources.clouds.size === 0`, neither `frameRef.current` nor `requestRender` is touched.
4. **GPU readiness guard** — if any of `milkyWayRenderer` / `thumbnailRenderer` / `diskRenderer` is null, the phase throws a clear error rather than silently proceeding.

- [ ] **Step 1: Write the failing test file**

```ts
// tests/services/engine/phases/startLoop.test.ts
/**
 * startLoop — focused test for the highest-leverage invariants of the
 * fourth (and last) bootstrap phase.
 *
 * ### Why this file exists
 *
 * Pre-2026-05-11 audit #5 the only coverage `startLoop.ts` had was
 * `bootstrap.test.ts`, which mocks the phase at module scope — so the
 * ~150 lines that build `RunFrameDeps`, replace the forward-declared
 * `frameRef.current`, and fire the first `requestRender()` had zero
 * direct asserts.  Every boot runs this phase; a silent regression
 * here (e.g. forgetting `requestRender()`, swapping `frameRef.current`
 * order with the dep-bag build, skipping the cloud-count early return)
 * yields "black canvas on first paint, engine stuck in 'loading'" —
 * the same symptom class as the 2026-05-08 black-screen incident.
 *
 * ### What this file asserts
 *
 * Four invariants — see each test's docblock for the rationale:
 *   1. The happy path: `frameRef.current` is replaced AND
 *      `scheduler.requestRender()` is called.
 *   2. The new `frameRef.current` calls `runFrame(state, frameDeps,
 *      performance.now())` — pinning the call contract guards against
 *      a refactor that drops one of the three args.
 *   3. The cloud-count early return: zero clouds → no rAF kick.
 *   4. The renderer-readiness guard: null renderer → typed error.
 *
 * ### Why mock `runFrame`
 *
 * The real `runFrame` is the engine's per-frame body — it reads every
 * GPU renderer, runs the camera matrices, dispatches passes, and is
 * tested in its own `runFrame.test.ts`.  Here we only care that
 * `startLoop` *wires it up correctly*; mocking lets the new
 * `frameRef.current` be invoked at test time without dragging in
 * WebGPU.
 */

import { describe, it, expect, vi } from 'vitest';
import type { EngineState } from '../../../../src/@types';
import type { BootstrapDeps } from '../../../../src/services/engine/phases/bootstrap';

// ── Module mocks ──────────────────────────────────────────────────────

// `runFrame` is the engine's per-frame body — independently tested
// elsewhere.  Mock it so we can verify `startLoop` calls it with the
// right shape without invoking the real GPU pass dispatch.
const runFrameSpy = vi.fn();
vi.mock('../../../../src/services/engine/frame/runFrame', () => ({
  runFrame: (...args: unknown[]) => runFrameSpy(...args),
}));

// Imported AFTER the mocks so startLoop picks them up.
import { startLoop } from '../../../../src/services/engine/phases/startLoop';

// ── Fixtures ─────────────────────────────────────────────────────────

/**
 * Minimal `EngineState` shaped for startLoop's body.  Populates only
 * what the phase reads:
 *   - `state.sources.clouds.size` for the early-return guard;
 *   - `state.gpu.{milkyWay,thumbnail,disk,filament}Renderer` for the
 *     dep-bag build + the null-check guard;
 *   - `state.subsystems.scheduler.requestRender` for the rAF kick.
 *
 * `cloudCount` controls how many entries `clouds` carries; the values
 * don't matter (only `.size` is read in this phase).
 */
function makeState({ cloudCount = 1 } = {}): EngineState {
  const clouds = new Map<unknown, unknown>();
  for (let i = 0; i < cloudCount; i++) {
    clouds.set(i, {});
  }
  return {
    sources: { clouds },
    gpu: {
      milkyWayRenderer: { label: 'milkyWay' } as never,
      thumbnailRenderer: { label: 'thumbnail' } as never,
      diskRenderer: { label: 'disk' } as never,
      filamentRenderer: { label: 'filament' } as never,
    },
    subsystems: {
      scheduler: { requestRender: vi.fn() },
    },
    cam: {} as never,
  } as unknown as EngineState;
}

/**
 * Minimal `BootstrapDeps` shaped for startLoop's body.  Populates only
 * the fields the phase reads.  `frameRef.current` starts as a no-op
 * stub so we can assert it gets replaced.
 */
function makeDeps(): BootstrapDeps {
  return {
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    cb: {} as never,
    frameRef: { current: () => {} },
    detachControlsRef: { current: null },
    handleRef: { current: null },
    allSlots: new Map(),
    fpsCounter: { sample: () => null } as unknown as BootstrapDeps['fpsCounter'],
    lastReportedFps: { current: null },
    phaseLocals: {
      device: {} as GPUDevice,
      context: {} as GPUCanvasContext,
    },
    firstReadySourceRef: { current: null },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('startLoop', () => {
  it('replaces frameRef.current and fires scheduler.requestRender exactly once on the happy path', async () => {
    // Load-bearing invariant: the forward-declared `frameRef.current`
    // no-op stub MUST be replaced before the rAF kick.  The scheduler
    // was wired with `onFrame: () => frameRef.current()`, so if the
    // replacement is dropped, every subsequent tick runs the no-op
    // forever — black canvas indefinitely.
    const state = makeState({ cloudCount: 1 });
    const deps = makeDeps();
    const originalFrameBody = deps.frameRef.current;

    await startLoop(state, deps);

    expect(deps.frameRef.current).not.toBe(originalFrameBody);
    expect(state.subsystems.scheduler.requestRender).toHaveBeenCalledTimes(1);
  });

  it('the new frameRef.current invokes runFrame with (state, frameDeps, time)', async () => {
    // Pinning the call contract guards against a refactor that drops
    // or reorders the three args.  runFrame's own suite verifies the
    // body; here we only verify the wire.
    const state = makeState({ cloudCount: 1 });
    const deps = makeDeps();

    await startLoop(state, deps);
    runFrameSpy.mockClear();

    deps.frameRef.current();

    expect(runFrameSpy).toHaveBeenCalledTimes(1);
    const callArgs = runFrameSpy.mock.calls[0]!;
    expect(callArgs[0]).toBe(state);
    // frameDeps is built inside startLoop — verify it carries the
    // expected renderer + canvas references threaded from state/deps.
    const calledFrameDeps = callArgs[1] as Record<string, unknown>;
    expect(calledFrameDeps.canvas).toBe(deps.canvas);
    expect(calledFrameDeps.milkyWayRenderer).toBe(state.gpu.milkyWayRenderer);
    expect(calledFrameDeps.thumbnailRenderer).toBe(state.gpu.thumbnailRenderer);
    expect(calledFrameDeps.diskRenderer).toBe(state.gpu.diskRenderer);
    expect(calledFrameDeps.filamentRenderer).toBe(state.gpu.filamentRenderer);
    expect(typeof callArgs[2]).toBe('number'); // performance.now() snapshot
  });

  it('returns early without touching frameRef or requestRender when no clouds reached the GPU', async () => {
    // Pre-Phase-5 IIFE semantics: zero clouds means `wireInput`
    // bailed before constructing the camera, so starting the loop
    // would crash on the first frame trying to read `state.cam`.
    // The early return silently leaves the engine in 'loading'.
    const state = makeState({ cloudCount: 0 });
    const deps = makeDeps();
    const originalFrameBody = deps.frameRef.current;

    await startLoop(state, deps);

    expect(state.subsystems.scheduler.requestRender).not.toHaveBeenCalled();
    expect(deps.frameRef.current).toBe(originalFrameBody);
  });

  it('throws a clear error when a required GPU renderer is null', async () => {
    // Pre-M1 these reads silently `!`-banged, deferring crashes to
    // the first frame.  Post-M1 the phase fails loudly at the
    // construction site so reordering bugs surface here, not five
    // frames later in some renderer's draw() call.
    const state = makeState({ cloudCount: 1 });
    state.gpu.milkyWayRenderer = null as never;
    const deps = makeDeps();

    await expect(startLoop(state, deps)).rejects.toThrow(
      /milkyWay\/thumbnail\/disk renderers must be initialised/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run tests/services/engine/phases/startLoop.test.ts`
Expected: PASS — 4 passing.

- [ ] **Step 3: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: previous baseline + 4 new tests passing.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/services/engine/phases/startLoop.test.ts
git commit -m "$(cat <<'EOF'
test(phases): startLoop — pin frame body + rAF kick invariants

M7-style focused test for the fourth bootstrap phase. Asserts the
four highest-leverage invariants: happy-path frameRef replacement
+ requestRender; new frameRef.current call contract; zero-clouds
early return; null-renderer guard. Mocks runFrame so the test
runs pure-Node.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `commitFocus.test.ts`

**Files:**
- Create: `tests/services/engine/helpers/commitFocus.test.ts`

**Invariants pinned:**
1. **Order** — when selection is provided, `setSelected` → `onFocusChange` → `tweenToGalaxy` fire in that order (asserted via `mock.invocationCallOrder`).
2. **Optional selection** — when selection is omitted, `setSelected` is NOT called; the other two still fire.
3. **Optional `cb.camera.onFocusChange`** — engine must not crash if it's undefined.
4. **Optional `cb.camera`** — engine must not crash if the whole camera sub-bag is undefined.
5. **`selection.info` pass-through** — `setSelected` receives `selection.info` verbatim, including when it's omitted (passed as `undefined`).

- [ ] **Step 1: Write the failing test file**

```ts
// tests/services/engine/helpers/commitFocus.test.ts
/**
 * commitFocus — focused test for the highest-leverage invariants of
 * the shared focus-commit protocol.
 *
 * ### Why this file exists
 *
 * `commitFocus` is the shared 3-call tail of three public-handle
 * methods (`focusOn`, `selectFamous`, `selectByAlias`).  Each method
 * was tested at the engine.ts integration level pre-extraction; the
 * extraction landed without a direct test for the kernel.  The
 * 2026-05-11 second architectural audit's finding #5 called this out:
 * the kernel has 137 lines of carefully-rationalised order-and-
 * optionality logic with no direct asserts, and any future refactor
 * that swaps the call order would silently drift the URL hash out of
 * sync with the camera state.
 *
 * ### What this file asserts
 *
 * Five invariants — see each test's docblock for the rationale:
 *   1. Order: setSelected → onFocusChange → tweenToGalaxy when
 *      selection is provided.
 *   2. Optional selection: omitted → setSelected NOT called.
 *   3. Optional onFocusChange callback: undefined cb.camera.onFocusChange
 *      must not crash.
 *   4. Optional camera sub-bag: undefined cb.camera must not crash.
 *   5. selection.info pass-through: undefined info reaches setSelected
 *      as undefined (NOT a thrown error or skipped call).
 *
 * ### Why mock `tweenToGalaxy`
 *
 * The real `tweenToGalaxy` reads `state.cam`, calls
 * `state.subsystems.tweens.start(...)`, and calls
 * `state.subsystems.scheduler.requestRender()`.  It's tested
 * separately in `tweenToGalaxy.test.ts`.  Here we only need to
 * verify it's called — mocking lets us assert the call shape without
 * stubbing out the entire camera subsystem.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineCallbacks, EngineState, GalaxyInfo } from '../../../../src/@types';

// ── Module mocks ──────────────────────────────────────────────────────

const tweenToGalaxySpy = vi.fn();
vi.mock('../../../../src/services/engine/camera/tweenToGalaxy', () => ({
  tweenToGalaxy: (...args: unknown[]) => tweenToGalaxySpy(...args),
}));

// Imported AFTER the mock so commitFocus picks it up.
import { commitFocus } from '../../../../src/services/engine/helpers/commitFocus';

// ── Fixtures ─────────────────────────────────────────────────────────

/**
 * Minimal state + callbacks for a commitFocus call.  Returns the spy
 * refs alongside the state/cb objects so each test can assert on them
 * directly.
 */
function makeFixtures() {
  const setSelected = vi.fn();
  const onFocusChange = vi.fn();
  const state = {
    subsystems: { selection: { setSelected } },
  } as unknown as EngineState;
  const cb = {
    camera: { onFocusChange },
  } as unknown as EngineCallbacks;
  const info = { source: 0, localIdx: 7, diameterKpc: 30 } as unknown as GalaxyInfo;
  return { state, cb, info, setSelected, onFocusChange };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('commitFocus', () => {
  beforeEach(() => {
    tweenToGalaxySpy.mockClear();
  });

  it('fires setSelected → onFocusChange → tweenToGalaxy in that order when selection is provided', () => {
    // Order is load-bearing.  React reads `onFocusChange` to update
    // the URL hash; if the tween fired first, the camera would
    // animate before the URL flipped, causing the hash and canvas to
    // diverge on deep-link transitions.
    const { state, cb, info, setSelected, onFocusChange } = makeFixtures();
    const selectionKey = { source: 1, localIdx: 42 };
    const selectionInfo = { source: 1, localIdx: 42 } as unknown as GalaxyInfo;

    commitFocus(state, cb, info, { key: selectionKey, info: selectionInfo });

    expect(setSelected).toHaveBeenCalledWith(selectionKey, selectionInfo);
    expect(onFocusChange).toHaveBeenCalledWith(info);
    expect(tweenToGalaxySpy).toHaveBeenCalledWith(state, info);

    // Vitest's `mock.invocationCallOrder` is a monotonic counter
    // assigned across ALL spies — so comparing the three captured
    // values verifies relative order independent of how many other
    // mocks were called between them.
    const setSelectedOrder = setSelected.mock.invocationCallOrder[0]!;
    const onFocusChangeOrder = onFocusChange.mock.invocationCallOrder[0]!;
    const tweenOrder = tweenToGalaxySpy.mock.invocationCallOrder[0]!;
    expect(setSelectedOrder).toBeLessThan(onFocusChangeOrder);
    expect(onFocusChangeOrder).toBeLessThan(tweenOrder);
  });

  it('skips setSelected but still fires onFocusChange + tweenToGalaxy when selection is omitted', () => {
    // `focusOn` and the URL-hash-driven focus path both pass
    // `undefined` for selection so the existing halo isn't clobbered.
    // The other two calls must still fire — the camera tween and the
    // React-side focus echo are unconditional.
    const { state, cb, info, setSelected, onFocusChange } = makeFixtures();

    commitFocus(state, cb, info);

    expect(setSelected).not.toHaveBeenCalled();
    expect(onFocusChange).toHaveBeenCalledWith(info);
    expect(tweenToGalaxySpy).toHaveBeenCalledWith(state, info);
  });

  it('does not crash when cb.camera.onFocusChange is undefined', () => {
    // Headless test callers and internal tweens don't subscribe to
    // onFocusChange.  Optional chaining must absorb the missing
    // listener; the tween must still fire.
    const { state, info } = makeFixtures();
    const cb = { camera: {} } as unknown as EngineCallbacks;

    expect(() => commitFocus(state, cb, info)).not.toThrow();
    expect(tweenToGalaxySpy).toHaveBeenCalledWith(state, info);
  });

  it('does not crash when cb.camera is undefined', () => {
    // Same shape as the previous test but at one level out: the
    // whole `camera` sub-bag is missing.  Double optional chaining
    // must absorb both layers.
    const { state, info } = makeFixtures();
    const cb = {} as unknown as EngineCallbacks;

    expect(() => commitFocus(state, cb, info)).not.toThrow();
    expect(tweenToGalaxySpy).toHaveBeenCalledWith(state, info);
  });

  it('passes selection.info=undefined through to setSelected when omitted', () => {
    // `selectFamous` omits `info` from its CommitFocusSelection
    // because its palette-pick path never races the renderer upload.
    // The selection subsystem must receive `undefined` (NOT skip the
    // call) so its own live-lookup path runs.
    const { state, cb, info, setSelected } = makeFixtures();
    const selectionKey = { source: 1, localIdx: 42 };

    commitFocus(state, cb, info, { key: selectionKey });

    expect(setSelected).toHaveBeenCalledWith(selectionKey, undefined);
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run tests/services/engine/helpers/commitFocus.test.ts`
Expected: PASS — 5 passing.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: Task 1's baseline + 5 new tests passing.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/services/engine/helpers/commitFocus.test.ts
git commit -m "$(cat <<'EOF'
test(helpers): commitFocus — pin focus-commit protocol invariants

M7-style focused test for the shared focus-commit kernel. Asserts
five invariants: setSelected → onFocusChange → tweenToGalaxy
order; optional selection; optional onFocusChange callback; optional
camera sub-bag; selection.info=undefined pass-through. Mocks
tweenToGalaxy so the test runs pure-Node.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Final verification, push, PR

**Files:** none — verification + PR open.

- [ ] **Step 1: Final test suite run**

Run: `npm test`
Expected: pass; baseline + 9 new tests.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS for both `tsconfig.json` and `tsconfig.tools.json`.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Verify git log**

Run: `git log --oneline main..HEAD`
Expected: 3 commits (1 plan + 2 implementation), in order:

```
<sha1>  docs(plans): startLoop + commitFocus tests — audit #5 plan
<sha2>  test(phases): startLoop — pin frame body + rAF kick invariants
<sha3>  test(helpers): commitFocus — pin focus-commit protocol invariants
```

- [ ] **Step 5: Push the branch**

Run: `git push -u origin test/startloop-commitfocus`
Expected: branch pushed.

- [ ] **Step 6: Open the PR**

Run:

```bash
gh pr create --title "test: startLoop + commitFocus — pin load-bearing invariants" --body "$(cat <<'EOF'
## Summary

Addresses audit finding #5 from the second architectural audit
(2026-05-11): \`startLoop.ts\` (156 LOC, runs on every boot) and
\`commitFocus.ts\` (137 LOC, runs on every focus action) had zero
direct test coverage. M7-style focused tests pin the highest-leverage
invariants — order, optionality, call contracts — without trying to
exhaustively cover every branch.

### \`startLoop.test.ts\` — 4 tests

- Happy path: \`frameRef.current\` replaced + \`requestRender\` fired.
- Frame body call contract: new \`frameRef.current\` invokes \`runFrame(state, frameDeps, time)\`.
- Zero-clouds early return: no rAF kick, frameRef untouched.
- Null-renderer guard: typed error rather than silent first-frame crash.

### \`commitFocus.test.ts\` — 5 tests

- Order: \`setSelected → onFocusChange → tweenToGalaxy\` when selection is provided.
- Optional selection: \`setSelected\` not called when omitted.
- Optional \`onFocusChange\`: no crash when undefined.
- Optional \`cb.camera\` sub-bag: no crash when undefined.
- \`selection.info=undefined\` pass-through: \`setSelected\` receives undefined verbatim.

### What this guards against

- The 2026-05-08 black-screen incident class — silent regressions in
  the rAF-kick path that yield "boots but never renders".
- A future refactor that swaps the \`setSelected → onFocusChange → tween\`
  order — would silently drift URL hash out of sync with camera state.
- Null-renderer crashes deferred to first-frame instead of phase boundary.

### Why these two files first

Both are on hot paths (every boot / every focus action). The other six
untested engine files flagged by the audit (autoLod, logCameraState,
cssToTexPx, focusTween, cameraSnapshot, labelProducer) are deferred —
lower frequency or already covered by integration tests.

## Test plan

- [x] \`npm test\` — passing (+ 9 new tests)
- [x] \`npm run typecheck\` — clean
- [x] \`npm run build\` — clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: gh prints the PR URL.

---

## Self-Review

**Spec coverage:**
- Audit #5 listed `startLoop` and `commitFocus` as the highest-leverage of eight untested files. Plan covers both with 4 + 5 focused tests. Six other files (autoLod, logCameraState, cssToTexPx, focusTween, cameraSnapshot, labelProducer) are deferred — explicitly out of scope per the PR description.
- The wireInput.test.ts reference pattern is followed: module mocks, minimal fixtures, focused per-invariant tests, didactic docblocks.

**Placeholder scan:** No "TBD", "TODO", or "implement later". Every step has concrete code, exact commands, and explicit expected outcomes.

**Type consistency:**
- `makeState` and `makeDeps` shapes in startLoop.test.ts match the parts of `EngineState` / `BootstrapDeps` that the real production code reads — no unused fields.
- `makeFixtures` in commitFocus.test.ts matches the `EngineState` / `EngineCallbacks` parts the kernel touches.
- The mocked module paths (`../../../../src/services/engine/frame/runFrame`, `../../../../src/services/engine/camera/tweenToGalaxy`) match the production imports verbatim.

**Known scope omissions (intentional):**
- The four other untested engine files (autoLod.ts, logCameraState.ts, cssToTexPx.ts, focusTween.ts, cameraSnapshot.ts, labelProducer.ts) — explicitly out of scope; the audit ranked them lower-leverage.
- Visual smoke test — neither file has any visual output beyond what's already covered by every previous visual check.
- Exhaustive coverage of `startLoop` / `commitFocus`: the plan deliberately picks the load-bearing invariants rather than per-branch coverage. The wireInput precedent (one test asserting the highest-leverage contract) is followed here with 4 + 5 focused tests because both files have multiple distinct invariants worth pinning, not because exhaustive coverage is the goal.
