# Render-on-Demand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Skymap's render loop from continuous (`requestAnimationFrame`
perpetually re-scheduled) to _render-on-demand_ — frames are only encoded and
submitted when something has actually changed, and the loop sleeps when the
scene is idle. Idle CPU should drop from "every-frame ~3.5 M-iteration galaxy
loop + GPU encode" to "zero".

**Architecture:** A tiny `renderScheduler` module owns a `dirty` flag and a
single rAF token. Every state mutation that affects what would be drawn calls
`requestRender()`, which sets `dirty = true` and schedules exactly one rAF.
The engine's existing `frame()` body runs unchanged inside that rAF, but its
_tail_ now re-schedules **only** when something is _currently_ animating
(autoRotate, an in-flight camera tween, non-zero SpaceMouse axes, or a
pending image-queue fetch whose async resolution will dirty the atlas). When
none of those apply, the loop pauses; the next event handler that calls
`requestRender()` resumes it for one frame.

**Tech Stack:** Plain TypeScript. `requestAnimationFrame` /
`cancelAnimationFrame`. Vitest for the new scheduler unit tests (a fake rAF
is injected so tests are deterministic — no real RAF needed). No new npm
dependencies.

**Success criteria:**

- After the canvas has loaded and stops moving, `requestAnimationFrame`
  fires zero times. Verifiable in the Performance tab: frame chart goes
  flat at ~0% main-thread CPU.
- Mouse drag, wheel zoom, keyboard shortcuts, settings-panel changes,
  command palette `selectFamous`, and InfoCard "focus" all wake the loop
  immediately and the scene re-renders within one frame.
- Auto-rotate keeps the loop spinning for as long as it's enabled, and
  stops cleanly when toggled off (no extra ghost frames).
- Camera tweens (`focusOn`, `focusOnHome`, `selectFamous`) run smoothly to
  completion, then the loop sleeps.
- SpaceMouse: any non-zero axis keeps the loop running; releasing the
  puck back to neutral lets it sleep on the next frame.
- Pending galaxy-image fetches keep the loop awake at a low cadence (so
  the bitmap can land in the atlas and trigger one more render);
  bitmapReady/bitmapFailed completion calls `requestRender()` and lets
  the loop sleep again.
- No regression: pick on hover still works, click-to-select still works,
  the InfoCard, scale bar, and all settings panel controls behave
  identically.

---

## File Structure

**Create:**

- `src/services/engine/renderScheduler.ts` — pure scheduler abstraction.
  Exports `createRenderScheduler({ rafImpl?, cafImpl? })` returning
  `{ requestRender, cancelRender, isScheduled }`. Pure module (no React,
  no WebGPU, no closure access into engine state). Injects rAF for
  testability. Independently unit-tested.
- `tests/services/engine/renderScheduler.test.ts` — Vitest suite for the
  scheduler. Uses a fake `rafImpl`/`cafImpl` so tests are deterministic.

**Modify:**

- `src/services/engine/engine.ts` — wire the scheduler. Replace the
  unconditional `rafId = requestAnimationFrame(frame)` at the tail of
  `frame()` with a conditional re-schedule based on a `stillAnimating()`
  predicate. Plumb `requestRender()` calls into every event handler,
  setter, and async resolution point that mutates render-affecting state.
- `src/services/camera/orbitControls.ts` — accept an optional
  `onCameraChange` callback in `OrbitControlsOptions`; call it from
  pointerdown / pointermove / wheel handlers (in BOTH orbit and pan
  branches) so the engine can route it into `requestRender()`. Existing
  callers without the callback work unchanged.
- `README.md` — document the render-on-demand pattern in the
  "Architecture" or "Renderer quick map" section.

**Read but do not modify (referenced by trigger-site enumeration):**

- `src/services/camera/cameraTween.ts` — `advanceCameraTween` already
  returns `false` while running and `true` when done; the engine's frame
  loop continues to call it via the existing branch. The "still
  animating" predicate inspects `currentTween !== null`.
- `src/services/input/spaceMouse.ts` — `onAxes` callback fires on every
  HID report; we add a `requestRender()` call alongside the axis stash.
- `src/services/gpu/galaxyImageQueue.ts` — exposes `inFlight` count
  indirectly via `drain()`. We extend it with a tiny
  `inFlightCount(): number` getter so the still-animating predicate can
  ask the queue whether any fetch is in flight.

---

## Caveats / Pre-flight notes

These are the surprising or non-obvious bits the executor must keep in mind.
None block the plan; all are addressed by tasks below.

- **HDR + tone-map plan is in flight.** Commit `9a81976` and follow-ups
  refactor `frame()` to render points/quads/disks into an `rgba16float`
  HDR target, then run a fullscreen tone-map pass writing to the swap
  chain. This plan must be executed _after_ HDR lands. The frame-tail
  re-schedule call is in the same place either way (right after the
  hover-pick block), so the merge conflict surface is small. Confirm in
  Task 0 that the HDR plan is fully merged before starting.

- **Auto-LOD recompute is per-frame.** Currently `autoLodMask(cam.distance)`
  runs every frame in `'auto'` mode and fires `onSourceMaskChange` only
  when the bitmask actually flips. With render-on-demand, the recompute
  only happens on frames where `requestRender()` was called — i.e.
  precisely when the camera moved (which is the only thing that could
  cause `cam.distance` to change). **No regression.** Document in code.

- **Hover detection is event-driven, not per-frame.** `latestMouseCss` is
  set on `pointermove`; the per-frame block that issues a pick is gated
  on `latestMouseCss !== lastPickedMouseCss`. With render-on-demand, the
  pointermove handler calls `requestRender()`, the next frame runs the
  hover gate, and the pick completes asynchronously. The `.then()` that
  calls `setHovered(...)` runs _after_ the GPU readback resolves, which
  is 1-2 frames later — and `setHovered` calls `cb.onHoverChange`, which
  triggers React re-renders, but does NOT need to wake the engine loop
  (the engine doesn't need to redraw on hover). **No regression.**

- **Thumbnail enqueue gate is per-frame.** With render-on-demand the
  per-galaxy enqueue loop only runs when the camera moves (or a setting
  changes that toggles the visibility mask). That's the _desired_
  behaviour — galaxies in the user's current view get their thumbnails;
  galaxies the user never looks at don't enqueue. **No regression.**

- **Atlas LRU frame counter.** The texture atlas evicts by oldest
  `lastSeenFrame`. With render-on-demand the counter advances less often.
  Semantics still hold — "evict the slot whose key was last touched in
  the oldest render" is still well-defined when renders are sparse. The
  invariant that matters is _ordering_: every key currently visible
  shares the same `frameCounter` value within a single render, and any
  newly-visible key gets the next-higher value on the next render. That
  invariant is preserved because we still increment `frameCounter` once
  per `frame()` body. **No regression.**

- **Pending image fetch must dirty the atlas.** The fetch's `onResult`
  callback runs after the network promise resolves and uploads the
  bitmap to the atlas. With render-on-demand, that upload happens at an
  arbitrary moment between frames — if we don't call `requestRender()`
  when the bitmap lands, the user will see no thumbnail until the camera
  moves again. Task 5 handles this.

- **Scale bar refresh is camera-driven.** `updateScaleBar()` recomputes
  pxPerMpc from `cam.distance` and fires `onScaleChange` only when the
  formatted label or rounded width changes. With render-on-demand it runs
  once per render, which is exactly when the camera could have changed.
  **No regression.**

- **`setExposure` has no echo callback.** Most setters fire an `on*Change`
  echo so React state mirrors engine truth. `setExposure` doesn't (the
  EngineHandle.d.ts comment notes this is intentional — no slider yet).
  We still need to call `requestRender()` from inside `setExposure`
  because exposure DOES affect the rendered image. Don't get tripped up
  by the missing echo.

- **`SpaceMouseInput.onAxes` may fire faster than display refresh.** A
  3DConnexion puck reports at 50-100 Hz; the display caps at 60-120 Hz.
  We must NOT call `requestRender()` once per HID report — that would
  flood the rAF queue uselessly. The scheduler's `isScheduled` short-
  circuit handles this naturally: every call after the first within a
  single frame is a no-op, so report-rate-flooding is harmless.

---

## Trigger-site enumeration

This is the master list of places that mutate render-affecting state. Every
one must call `requestRender()` after the mutation. The implementer pastes
the call in by hand following Tasks 3, 4, and 5.

### Pointer / wheel / keyboard (Task 3)

| File                                   | Approx. line                                                                         | Trigger                                                   | Notes                                                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/camera/orbitControls.ts` | `onMove` orbit branch (line ~332)                                                    | `cam.yaw -= dx*0.005; cam.pitch = …; updatePosition(cam)` | Add `options?.onCameraChange?.()` after `updatePosition`.                                                                                                                                       |
| `src/services/camera/orbitControls.ts` | `onMove` pan branch (line ~310)                                                      | `vec3.add(cam.target, …); updatePosition(cam)`            | Add `options?.onCameraChange?.()` after `updatePosition`.                                                                                                                                       |
| `src/services/camera/orbitControls.ts` | `onWheel` (line ~378)                                                                | `cam.distance = clampDistance(…); updatePosition(cam)`    | Add `options?.onCameraChange?.()` after `updatePosition`.                                                                                                                                       |
| `src/services/camera/orbitControls.ts` | `onDown` (line ~166)                                                                 | drag begins, hover cleared in engine                      | Engine's `pointerdown` listener already mutates state; add `requestRender()` there.                                                                                                             |
| `src/services/engine/engine.ts`        | `pointerdown` listener (line ~787)                                                   | clears tween, sets `pointerDown=true`, `setHovered(null)` | Add `requestRender()` after `setHovered(null)` — selection halo needs to update.                                                                                                                |
| `src/services/engine/engine.ts`        | `pointerleave` listener (line ~774)                                                  | `latestMouseCss = null; setHovered(null)`                 | Add `requestRender()` — hover halo clears.                                                                                                                                                      |
| `src/services/engine/engine.ts`        | `pointermove` listener (line ~767)                                                   | updates `latestMouseCss`                                  | Add `requestRender()` — hover-pick gate runs in next frame.                                                                                                                                     |
| `src/services/engine/engine.ts`        | `pointerup` (window listener, line ~796)                                             | `pointerDown = false`                                     | No `requestRender` needed — the next pointermove or other event will wake the loop; `pointerDown=false` alone doesn't change render output.                                                     |
| `src/services/engine/engine.ts`        | `pointercancel` (line ~800)                                                          | same as pointerup                                         | Same — no call needed.                                                                                                                                                                          |
| `src/services/engine/engine.ts`        | `keydown` Escape (line ~846)                                                         | `setSelected(null)`                                       | Add `requestRender()` — selection halo clears.                                                                                                                                                  |
| `src/services/engine/engine.ts`        | resize observer / `resizeCanvasToDisplay` true branch (line ~903, inside frame body) | recreates HDR target, updates aspect                      | Already inside a render frame — no extra call needed there. But: window resize triggers a fresh render too. Add a `window.addEventListener('resize', …)` listener that calls `requestRender()`. |

### Engine handle setters (Task 4)

Every setter that affects what the GPU draws must call `requestRender()` at the tail. Setters that are pure echoes to React without changing GPU output can skip it (none of these do — every engine handle setter affects rendering).

| Method                                       | engine.ts approx. line | Mutates                                                                               | requestRender?                                                                                |
| -------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `setPointSize`                               | ~1543                  | `pointSizePx`                                                                         | yes                                                                                           |
| `setBrightness`                              | ~1548                  | `brightness`                                                                          | yes                                                                                           |
| `setAutoRotate`                              | ~1553                  | `autoRotate`                                                                          | yes (so the loop wakes if previously idle)                                                    |
| `setGalaxyTexturesEnabled`                   | ~1558                  | `galaxyTexturesEnabled`                                                               | yes                                                                                           |
| `setHighlightFallback`                       | ~1568                  | `highlightFallback`                                                                   | yes                                                                                           |
| `setRealOnlyMode`                            | ~1576                  | `realOnlyMode`                                                                        | yes                                                                                           |
| `setBiasMode`                                | ~1584                  | `biasMode` (also kicks Schechter / angular workers)                                   | yes — and a follow-up `requestRender()` from inside the worker resolution (covered in Task 5) |
| `setAbsMagLimit`                             | ~1642                  | `absMagLimit`                                                                         | yes                                                                                           |
| `setExposure`                                | ~1652                  | `exposure` (clamped)                                                                  | yes                                                                                           |
| `setToneMapCurve`                            | ~1662                  | `toneMapCurve`                                                                        | yes                                                                                           |
| `resetCamera`                                | ~1676                  | mutates `cam` directly                                                                | yes                                                                                           |
| `focusOn`                                    | ~1693                  | sets `currentTween`                                                                   | yes (kicks the loop, which then keeps re-scheduling while tween in flight)                    |
| `selectFamous`                               | ~1722                  | sets selection + tween                                                                | yes                                                                                           |
| `focusOnHome`                                | ~1765                  | sets `currentTween`                                                                   | yes                                                                                           |
| `setLodMode`                                 | ~1795                  | `lodMode`                                                                             | yes                                                                                           |
| `setSourceVisible`                           | ~1801                  | `visibleSourceMask` (and forces manual mode)                                          | yes                                                                                           |
| `clearSelection`                             | ~1492                  | clears `selectedIndex`                                                                | yes                                                                                           |
| `setSpaceMouseSensitivity`                   | ~1863                  | `spaceMouseSensitivity` (only relevant when puck is deflected — but harmless to call) | yes                                                                                           |
| `connectSpaceMouse` (onAxes callback inside) | ~1833                  | `latestSpaceMouseAxes`                                                                | yes (every HID report; harmless because `isScheduled` short-circuits)                         |
| `connectSpaceMouse` (onConnectionChange)     | ~1841                  | resets axes on disconnect                                                             | yes                                                                                           |
| `disconnectSpaceMouse`                       | ~1852                  | resets axes                                                                           | yes                                                                                           |

### Async resolution points (Task 5)

| Site                                                | engine.ts approx. line | Context                                                                                                           |
| --------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `renderer.upload(...)` resolution                   | ~637, 679              | Cloud just baked into GPU buffer; new points are now drawable.                                                    |
| `loadFamousSidecars().then(...)`                    | ~656                   | Famous sidecars landed; future hover/select needs them. (No render impact today, but call it for forward-compat.) |
| Galaxy queue `onResult` (inside per-galaxy enqueue) | ~1228                  | Bitmap landed in atlas — must trigger one render so the quad shows up.                                            |
| `renderer.applySchechterMode()` resolution          | ~1614                  | Schechter weights baked into GPU buffer; vertex shader reads them next frame.                                     |
| `renderer.applyAngularReweightMode()` resolution    | ~1635                  | Same — angular weights baked.                                                                                     |
| Pick `.then((idx) => setHovered/setSelected(...))`  | ~836, 1466             | Hover/select state changed; selection halo needs redraw.                                                          |

---

## Task 0: Pre-flight

**Files:** none modified. Read-only inspection.

- [ ] **Step 1: Confirm HDR plan is merged**

Run:

```bash
git log --oneline -20 | head -20
```

Expected: see commits referencing HDR (`hdr`, `tone-map`, `hdrTarget`,
`toneMapPass`). If not present, halt — this plan must execute on top of
the HDR-merged engine.

- [ ] **Step 2: Inspect the current `frame()` body**

Read `src/services/engine/engine.ts` lines ~890–1480. Confirm the tail
of `frame()` ends with:

```ts
rafId = requestAnimationFrame(frame);
```

at approximately line 1476. Confirm the kickoff line at approximately
1479:

```ts
rafId = requestAnimationFrame(frame);
```

If the line numbers have drifted, **update the trigger-site table
above** in the plan file before continuing — the executor that follows
relies on those approximations.

- [ ] **Step 3: Baseline test count**

Run:

```bash
npm test -- --run
```

Expected: all tests pass. Record the exact "Tests N passed" number — Task
1 will add 6 tests, Task 6 will add 1 visual-verification check (manual,
no automated test).

- [ ] **Step 4: Baseline idle CPU**

Open `npm run dev`, navigate to the app, let the cloud load, do not
touch the mouse. In Chrome DevTools Performance tab, record 5 seconds.
Note the main-thread CPU percentage (typically 8–15% on a modern laptop
today). Save the recording / screenshot to `/tmp/idle-cpu-before.json`
or similar. This is the "before" baseline for Task 6.

---

## Task 1: Render scheduler module + tests

**Files:**

- Create: `src/services/engine/renderScheduler.ts`
- Create: `tests/services/engine/renderScheduler.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/services/engine/renderScheduler.test.ts`:

```ts
/**
 * Tests for the render scheduler — the tiny coalescing rAF wrapper that
 * powers Skymap's render-on-demand loop.
 *
 * The scheduler is intentionally trivial (one boolean + one rAF token);
 * the value of these tests is in pinning down the *contract* so future
 * refactors don't break the engine's "frame fires exactly once per
 * dirty-mark" guarantee.
 *
 * We inject a fake rAF that captures the queued callback into an array
 * rather than firing it immediately — this lets each test step the
 * "frame" forward deterministically.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRenderScheduler } from '../../../src/services/engine/renderScheduler';

/**
 * Build a fake rAF / cAF pair that captures pending callbacks in an
 * array.  Tests pop the array to "fire a frame".  Returns the install
 * pair plus a `flush()` helper that runs every queued callback in FIFO
 * order — useful for tests that don't care about per-frame stepping.
 */
function makeFakeRaf() {
  let nextId = 1;
  const queue: Array<{ id: number; cb: FrameRequestCallback }> = [];
  const rafImpl: typeof requestAnimationFrame = (cb) => {
    const id = nextId++;
    queue.push({ id, cb });
    return id;
  };
  const cafImpl: typeof cancelAnimationFrame = (id) => {
    const idx = queue.findIndex((entry) => entry.id === id);
    if (idx >= 0) queue.splice(idx, 1);
  };
  function fireOne(): void {
    const entry = queue.shift();
    if (!entry) throw new Error('fakeRaf: no callbacks queued');
    entry.cb(performance.now());
  }
  function pendingCount(): number {
    return queue.length;
  }
  return { rafImpl, cafImpl, fireOne, pendingCount };
}

describe('createRenderScheduler', () => {
  it('does not schedule a frame until requestRender is called', () => {
    const fake = makeFakeRaf();
    const onFrame = vi.fn();
    createRenderScheduler({ onFrame, rafImpl: fake.rafImpl, cafImpl: fake.cafImpl });
    expect(fake.pendingCount()).toBe(0);
    expect(onFrame).not.toHaveBeenCalled();
  });

  it('requestRender schedules exactly one rAF', () => {
    const fake = makeFakeRaf();
    const onFrame = vi.fn();
    const sched = createRenderScheduler({
      onFrame,
      rafImpl: fake.rafImpl,
      cafImpl: fake.cafImpl,
    });
    sched.requestRender();
    expect(fake.pendingCount()).toBe(1);
  });

  it('coalesces multiple requestRender calls before the frame fires', () => {
    const fake = makeFakeRaf();
    const onFrame = vi.fn();
    const sched = createRenderScheduler({
      onFrame,
      rafImpl: fake.rafImpl,
      cafImpl: fake.cafImpl,
    });
    sched.requestRender();
    sched.requestRender();
    sched.requestRender();
    expect(fake.pendingCount()).toBe(1);
    fake.fireOne();
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('after the frame fires, the loop is idle until requestRender is called again', () => {
    const fake = makeFakeRaf();
    const onFrame = vi.fn();
    const sched = createRenderScheduler({
      onFrame,
      rafImpl: fake.rafImpl,
      cafImpl: fake.cafImpl,
    });
    sched.requestRender();
    fake.fireOne();
    expect(fake.pendingCount()).toBe(0);
    expect(onFrame).toHaveBeenCalledTimes(1);

    // No further activity ⇒ no more frames scheduled.
    expect(fake.pendingCount()).toBe(0);

    // A new requestRender wakes the loop again.
    sched.requestRender();
    expect(fake.pendingCount()).toBe(1);
    fake.fireOne();
    expect(onFrame).toHaveBeenCalledTimes(2);
  });

  it('a requestRender during the frame body re-schedules the next frame', () => {
    // This simulates the engine's "still animating" tail: onFrame calls
    // requestRender() at the end if a tween is in flight.
    const fake = makeFakeRaf();
    let stillAnimating = true;
    const onFrame = vi.fn(() => {
      if (stillAnimating) sched.requestRender();
    });
    const sched = createRenderScheduler({
      onFrame,
      rafImpl: fake.rafImpl,
      cafImpl: fake.cafImpl,
    });

    sched.requestRender();
    fake.fireOne(); // frame 1 — schedules frame 2
    expect(fake.pendingCount()).toBe(1);
    fake.fireOne(); // frame 2 — schedules frame 3
    expect(fake.pendingCount()).toBe(1);

    // Animation ends.
    stillAnimating = false;
    fake.fireOne(); // frame 3 — does NOT schedule another
    expect(fake.pendingCount()).toBe(0);
    expect(onFrame).toHaveBeenCalledTimes(3);
  });

  it('cancelRender drops a queued frame and lets the loop sleep again', () => {
    const fake = makeFakeRaf();
    const onFrame = vi.fn();
    const sched = createRenderScheduler({
      onFrame,
      rafImpl: fake.rafImpl,
      cafImpl: fake.cafImpl,
    });
    sched.requestRender();
    expect(fake.pendingCount()).toBe(1);
    sched.cancelRender();
    expect(fake.pendingCount()).toBe(0);
    // Subsequent requestRender works normally.
    sched.requestRender();
    expect(fake.pendingCount()).toBe(1);
  });

  it('isScheduled() reports the current scheduling state', () => {
    const fake = makeFakeRaf();
    const onFrame = vi.fn();
    const sched = createRenderScheduler({
      onFrame,
      rafImpl: fake.rafImpl,
      cafImpl: fake.cafImpl,
    });
    expect(sched.isScheduled()).toBe(false);
    sched.requestRender();
    expect(sched.isScheduled()).toBe(true);
    fake.fireOne();
    expect(sched.isScheduled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npx vitest run tests/services/engine/renderScheduler.test.ts
```

Expected: FAIL with `Cannot find module '.../renderScheduler'`.

- [ ] **Step 3: Implement the scheduler**

Create `src/services/engine/renderScheduler.ts`:

````ts
/**
 * renderScheduler — coalescing wrapper around `requestAnimationFrame`.
 *
 * ### Why a dedicated module
 *
 * The engine's render loop used to perpetually re-schedule itself,
 * burning CPU on every frame even when nothing had changed. Switching
 * to render-on-demand requires a single source of truth that knows
 * "is a frame already queued?" — otherwise multiple event handlers
 * firing in the same tick (e.g. pointermove + wheel + resize) would
 * each queue their own rAF, defeating the purpose.
 *
 * Extracting the boolean + token bookkeeping into a tiny module gives
 * us:
 *
 *   1. Vitest coverage of the contract (one frame per dirty-mark, no
 *      duplicates, sleeps when no one calls `requestRender`).  No
 *      WebGPU device required to test.
 *   2. A clean seam where the engine doesn't have to think about rAF
 *      tokens at all — it just calls `requestRender()` from event
 *      handlers and `frame()` runs.
 *
 * ### Usage from the engine
 *
 * ```ts
 * const sched = createRenderScheduler({ onFrame: () => frame() });
 * canvas.addEventListener('pointermove', () => {
 *   latestMouseCss = ...;
 *   sched.requestRender();
 * });
 *
 * function frame() {
 *   // ...all the existing per-frame work...
 *   if (autoRotate || currentTween || hasAnyAxis(spaceMouse) || queue.inFlightCount() > 0) {
 *     sched.requestRender();
 *   }
 * }
 * ```
 *
 * ### Why inject rAF / cAF
 *
 * Vitest runs in Node where `requestAnimationFrame` is patched with
 * `setImmediate`-equivalent timing. Injecting the raf implementation
 * lets unit tests run a synchronous fake instead of relying on Node
 * event-loop ordering — the tests pop a callback from a captured
 * queue and verify behaviour deterministically.
 */

export type RenderSchedulerOptions = {
  /** Called every time a scheduled frame fires. */
  onFrame: () => void;
  /**
   * rAF implementation. Defaults to the global `requestAnimationFrame`.
   * Tests inject a fake.
   */
  rafImpl?: (cb: FrameRequestCallback) => number;
  /**
   * cAF implementation. Defaults to the global `cancelAnimationFrame`.
   * Tests inject a fake.
   */
  cafImpl?: (id: number) => void;
};

export type RenderScheduler = {
  /**
   * Mark the scene dirty and ensure exactly one rAF is queued. Subsequent
   * calls before the frame fires are coalesced into the existing token.
   *
   * Idempotent within a single frame — call as many times as you like
   * from event handlers; only one frame will fire.
   */
  requestRender(): void;
  /**
   * Cancel a queued frame (if any) and reset to "idle". Used by the
   * engine's `destroy()` to avoid a final post-teardown frame firing
   * after GPU resources have been released.
   */
  cancelRender(): void;
  /**
   * `true` when a frame is queued and pending; `false` when the loop is
   * idle. Mostly for tests; also useful for assertions in DevTools.
   */
  isScheduled(): boolean;
};

export function createRenderScheduler(opts: RenderSchedulerOptions): RenderScheduler {
  const raf = opts.rafImpl ?? requestAnimationFrame.bind(window);
  const caf = opts.cafImpl ?? cancelAnimationFrame.bind(window);

  // The single rAF token. 0 means "not scheduled" — rAF returns a
  // strictly positive integer per the WHATWG spec, so 0 is a safe
  // sentinel.
  let token = 0;

  function tick(): void {
    // Clear the token BEFORE running the frame body so that a
    // `requestRender()` call from inside `onFrame` (e.g. the engine's
    // "still animating" tail) is allowed to schedule the *next* frame
    // rather than being short-circuited as a duplicate of this one.
    token = 0;
    opts.onFrame();
  }

  return {
    requestRender(): void {
      if (token !== 0) return; // already queued — coalesce
      token = raf(tick);
    },
    cancelRender(): void {
      if (token === 0) return;
      caf(token);
      token = 0;
    },
    isScheduled(): boolean {
      return token !== 0;
    },
  };
}
````

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
npx vitest run tests/services/engine/renderScheduler.test.ts
```

Expected: PASS, 7/7.

- [ ] **Step 5: Run the full test suite**

Run:

```bash
npm test -- --run
```

Expected: PASS, baseline + 7 new tests.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/renderScheduler.ts tests/services/engine/renderScheduler.test.ts
git commit -m "feat(engine): render scheduler abstraction (coalescing rAF)"
```

---

## Task 2: Wire the scheduler into engine.ts

**Files:**

- Modify: `src/services/engine/engine.ts`
- Modify: `src/services/gpu/galaxyImageQueue.ts` (add `inFlightCount` getter)

The goal of this task is the _minimal_ refactor: stop the unconditional
re-schedule, replace it with a conditional one, and route the kickoff
through the scheduler. **No** trigger-site plumbing yet — that's Tasks
3-5. After this task the engine renders once and then sleeps; user
input does not yet wake it. This is intentional — we want the
"sleep-when-idle" behaviour visible in isolation before plumbing the
wake-up paths.

- [ ] **Step 1: Add `inFlightCount` to `GalaxyImageQueue`**

The still-animating predicate needs to know whether any thumbnail
fetch is in flight. Today the class only exposes `drain()`. Add a
small accessor.

Edit `src/services/gpu/galaxyImageQueue.ts`. Inside the
`GalaxyImageQueue` class, after the `drain()` method, add:

```ts
  /**
   * Number of fetches currently running (not including pending ones).
   * Used by the engine's render-on-demand loop to decide whether to
   * keep ticking — a pending fetch's onResult will dirty the atlas
   * the moment it lands, so we keep one frame queued while at least
   * one is live.
   *
   * Exposing the count rather than a boolean keeps the API honest:
   * a future caller might want to throttle differently when 1 fetch
   * is in flight vs. 4.
   */
  inFlightCount(): number {
    return this.inFlight.size;
  }
```

- [ ] **Step 2: Add a test for `inFlightCount`**

Find `tests/services/gpu/galaxyImageQueue.test.ts`. Add a new test at
the end of the file (inside the existing top-level `describe` block,
before its closing `});`):

```ts
it('inFlightCount reports the number of running fetches', async () => {
  const queue = new GalaxyImageQueue();
  expect(queue.inFlightCount()).toBe(0);

  // Build a fetcher that we can resolve manually.
  let resolveFetch: (b: ImageBitmap | null) => void = () => {};
  const fetcher = () =>
    new Promise<ImageBitmap | null>((resolve) => {
      resolveFetch = resolve;
    });

  queue.enqueue({ key: 'k1', priority: 1, fetcher, onResult: () => {} });
  expect(queue.inFlightCount()).toBe(1);

  resolveFetch(null);
  // Drain so the .finally() runs and the count drops back to 0.
  await queue.drain();
  expect(queue.inFlightCount()).toBe(0);
});
```

- [ ] **Step 3: Run the test**

```bash
npx vitest run tests/services/gpu/galaxyImageQueue.test.ts
```

Expected: PASS, including the new `inFlightCount` test.

- [ ] **Step 4: Wire the scheduler into engine.ts**

Find this import block near the top of `engine.ts` (around line 73):

```ts
import { autoLodMask } from './autoLod';
```

Add directly after it:

```ts
import { createRenderScheduler, type RenderScheduler } from './renderScheduler';
```

Find the `let rafId = 0;` declaration (around line 292). Replace it
with:

```ts
// Render scheduler — owns the single rAF token and the dirty flag.
// Built inside the async IIFE because `frame` is defined there; the
// scheduler instance is hoisted into the outer closure so `destroy()`
// can call its `cancelRender()` from the public handle below.
//
// Initialised to a no-op shim so the type stays non-nullable; the
// real scheduler replaces this once the IIFE finishes setup.
let scheduler: RenderScheduler = {
  requestRender(): void {
    /* not yet wired */
  },
  cancelRender(): void {
    /* not yet wired */
  },
  isScheduled(): boolean {
    return false;
  },
};
```

- [ ] **Step 5: Replace the frame-tail re-schedule**

In the `frame()` function, find the early-return block around line
~975 that currently reads:

```ts
const vp = cam ? computeViewProj(cam) : null;
if (!vp || !renderer) {
  rafId = requestAnimationFrame(frame);
  return;
}
```

Replace with:

```ts
const vp = cam ? computeViewProj(cam) : null;
if (!vp || !renderer) {
  // Camera/renderer not ready yet — try again next frame.
  // (This branch only fires during the brief window between
  // engine startup and the first cloud landing; once both are
  // present it's never taken.)
  scheduler.requestRender();
  return;
}
```

Find the inner early-return inside the hover-pick block (around line
~1448) that currently reads:

```ts
if (visibleSources.length === 0) {
  rafId = requestAnimationFrame(frame);
  return;
}
```

Replace with:

```ts
if (visibleSources.length === 0) {
  // No surveys are visible right now (user toggled them all
  // off).  Let the loop sleep — the next setSourceVisible
  // call will wake it.
  return;
}
```

Find the unconditional re-schedule at the tail of `frame()` (around
line 1476) that currently reads:

```ts
        // Schedule the next frame. `requestAnimationFrame` syncs to the display
        // refresh rate and pauses automatically when the tab is hidden.
        rafId = requestAnimationFrame(frame);
      }
```

Replace with:

```ts
        // ── Render-on-demand: continue ticking ONLY if motion or async
        // work is in flight.  Otherwise the loop sleeps; event handlers
        // and engine handle setters call scheduler.requestRender() to
        // wake it for one frame each.
        //
        // Predicate breakdown:
        //   - autoRotate: continuous yaw advancement; render every frame.
        //   - currentTween: easeOutCubic interpolation; render until
        //     advanceCameraTween reports finished and clears the ref.
        //   - hasAnyAxis(latestSpaceMouseAxes): puck deflected; render
        //     every frame to apply the per-frame velocity.
        //   - queue.inFlightCount(): a thumbnail fetch is racing the
        //     network; when it lands the onResult uploads to the atlas
        //     and (via Task 5) calls requestRender() — but we keep one
        //     frame queued anyway so the load-fade lerp ramps smoothly.
        const stillAnimating =
          autoRotate ||
          currentTween !== null ||
          hasAnyAxis(latestSpaceMouseAxes) ||
          queue.inFlightCount() > 0;
        if (stillAnimating) scheduler.requestRender();
      }
```

Find the kickoff line at the end of the IIFE (around line 1479) that
currently reads:

```ts
rafId = requestAnimationFrame(frame);
```

Replace with:

```ts
// Build the scheduler now that `frame` is defined, then kick off
// the first render.  After that one frame, the loop sleeps until
// an event handler or a setter calls scheduler.requestRender().
scheduler = createRenderScheduler({ onFrame: frame });
scheduler.requestRender();
```

Find the `destroy()` method (around line 1500). The line:

```ts
cancelAnimationFrame(rafId);
```

Replace with:

```ts
// Cancel any in-flight frame so we don't tick after teardown.
scheduler.cancelRender();
```

Find the `let rafId = 0;` declaration that you replaced in Step 4.
Confirm it's no longer in the file.

- [ ] **Step 6: TypeCheck**

```bash
npm run typecheck
```

Expected: clean — no unused-variable warnings on `rafId`, no missing
imports.

- [ ] **Step 7: Run tests**

```bash
npm test -- --run
```

Expected: all tests pass. The tests don't exercise the engine's frame
loop directly (we don't have an integration test for it), so this
mostly confirms we didn't break unit tests in adjacent modules.

- [ ] **Step 8: Visual smoke check**

`npm run dev` is already running per project convention. Open the app
in the browser. Expected behaviour at this point:

- The cloud loads and renders ONCE.
- Rotating the mouse / scrolling does NOTHING (no event wiring yet).
- The browser DevTools Performance tab shows zero CPU after the first
  paint.

This is the "render-once" milestone — Tasks 3-5 add the wake-up paths.

If the cloud doesn't render at all: a wake-up path required for
initial animation isn't covered. Likely culprit: an `await` inside
the IIFE happens _after_ the scheduler is built, so the first frame
fires before `cam` and `renderer` are non-null and bails via the
early-return. Verify the kickoff line lives AFTER all the `await`
points and AFTER `cam` is assigned.

- [ ] **Step 9: Commit**

```bash
git add src/services/engine/engine.ts src/services/gpu/galaxyImageQueue.ts tests/services/gpu/galaxyImageQueue.test.ts
git commit -m "feat(engine): conditional re-schedule based on still-animating predicate"
```

---

## Task 3: Plumb requestRender into pointer / wheel / keyboard handlers

**Files:**

- Modify: `src/services/camera/orbitControls.ts`
- Modify: `tests/services/camera/orbitControls.test.ts` (NEW — only if no
  tests exist for the module today; if a file already exists, append.)
- Modify: `src/services/engine/engine.ts`

This task wakes the loop on user input.

- [ ] **Step 1: Extend `OrbitControlsOptions`**

Edit `src/services/camera/orbitControls.ts`. Find the
`OrbitControlsOptions` type (around line 54) and add a second optional
field:

```ts
export type OrbitControlsOptions = {
  /**
   * Called when the user clicks (as opposed to drags) on the canvas.
   *
   * A "click" is defined as a pointerup that occurred within 4 CSS pixels of
   * the corresponding pointerdown. This threshold distinguishes intentional
   * taps from the tiny pointer jitter that always precedes a drag start.
   *
   * Coordinates are in CSS pixels (matching `e.clientX` / `e.clientY`), so
   * the caller can pass them directly to pick-coordinate conversion without
   * any additional scaling.
   *
   * @param xCss  Horizontal CSS pixel position of the click.
   * @param yCss  Vertical CSS pixel position of the click.
   */
  onClick?: (xCss: number, yCss: number) => void;
  /**
   * Called every time the camera state has been mutated by this module
   * (any pointer drag, pan, or wheel zoom).  The engine routes this
   * into its render scheduler so a single user gesture wakes the
   * render loop for one frame.
   *
   * Optional for backwards compatibility with callers that don't yet
   * use render-on-demand — those will simply not get the callback and
   * the loop will need to be ticking via some other mechanism.
   *
   * Fired AFTER `updatePosition(cam)` so the camera state is fully
   * settled before the engine reads it for the next frame.
   */
  onCameraChange?: () => void;
};
```

- [ ] **Step 2: Call onCameraChange from each mutation site**

Still in `orbitControls.ts`:

In `onMove`'s pan branch (around line 311), after `updatePosition(cam);` change:

```ts
vec3.add(cam.target as vec3, cam.target as vec3, panDeltaScratch);
updatePosition(cam);
return;
```

to:

```ts
vec3.add(cam.target as vec3, cam.target as vec3, panDeltaScratch);
updatePosition(cam);
options?.onCameraChange?.();
return;
```

In `onMove`'s orbit branch (around line 343), after `updatePosition(cam);`, add the same call:

```ts
    cam.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, cam.pitch + dy * 0.005));
    updatePosition(cam);
    options?.onCameraChange?.();
  };
```

In `onWheel` (around line 379), after `updatePosition(cam);`, add the
same call:

```ts
    cam.distance = clampDistance(cam.distance * factor);
    updatePosition(cam);
    options?.onCameraChange?.();
  };
```

In `onDown` (around line 200), after `canvas.setPointerCapture(e.pointerId);`, add:

```ts
    canvas.setPointerCapture(e.pointerId);
    // Notify the engine so it can wake the render loop — any
    // subsequent pointermove will fire the same callback.  Calling
    // here too means the click→hover-clear path also gets a frame.
    options?.onCameraChange?.();
  };
```

- [ ] **Step 3: Update the engine's `attachOrbitControls` call**

Edit `src/services/engine/engine.ts`. Find the
`detachControls = attachOrbitControls(canvas, cam, { ... });` block
(around line 810). Add a second option:

```ts
detachControls = attachOrbitControls(canvas, cam, {
  onClick: (xCss, yCss) => {
    // ...existing onClick body unchanged...
  },
  onCameraChange: () => {
    // Camera moved — wake the render loop for one frame.
    // Auto-LOD recompute, scale-bar refresh, and pick gate all
    // run inside the next frame body.
    scheduler.requestRender();
  },
});
```

- [ ] **Step 4: Plumb requestRender into the engine's own pointer / keyboard / resize listeners**

Still in `engine.ts`:

Find the `pointermove` listener (around line 767):

```ts
addCanvasListener('pointermove', (e) => {
  const pe = e as PointerEvent;
  latestMouseCss = { x: pe.clientX, y: pe.clientY };
});
```

Change to:

```ts
addCanvasListener('pointermove', (e) => {
  const pe = e as PointerEvent;
  latestMouseCss = { x: pe.clientX, y: pe.clientY };
  // Wake the loop so the next frame can issue a hover pick.
  // The pick itself is async (1-2 frames later) but its .then
  // also calls requestRender (Task 5) so the selection halo
  // updates as soon as the readback lands.
  scheduler.requestRender();
});
```

Find the `pointerleave` listener (around line 774):

```ts
addCanvasListener('pointerleave', () => {
  latestMouseCss = null;
  setHovered(null);
});
```

Change to:

```ts
addCanvasListener('pointerleave', () => {
  latestMouseCss = null;
  setHovered(null);
  // Render once so the selection halo (if any) is recomputed
  // for the cleared hover state.
  scheduler.requestRender();
});
```

Find the `pointerdown` listener (around line 787):

```ts
addCanvasListener('pointerdown', () => {
  currentTween = null;
  pointerDown = true;
  setHovered(null);
});
```

Change to:

```ts
addCanvasListener('pointerdown', () => {
  currentTween = null;
  pointerDown = true;
  setHovered(null);
  scheduler.requestRender();
});
```

Find the Esc-key listener (around line 846):

```ts
addWindowListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') setSelected(null);
});
```

Change to:

```ts
addWindowListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    setSelected(null);
    // Selection halo cleared; re-render with the new highlight
    // index uniform.
    scheduler.requestRender();
  }
});
```

Add a new window resize listener directly after the keydown listener:

```ts
// Window resize: schedule one render so resizeCanvasToDisplay()
// (which runs at the top of the next frame body) sees the new
// size and recreates the HDR target.  Without this wake-up the
// canvas would stay at its old backing-store resolution until
// some other event happened to schedule a frame.
addWindowListener('resize', () => {
  scheduler.requestRender();
});
```

- [ ] **Step 5: TypeCheck + tests**

```bash
npm run typecheck && npm test -- --run
```

Expected: PASS.

- [ ] **Step 6: Visual smoke check**

In the browser:

- Drag the mouse → cloud orbits smoothly.
- Pan with right-click drag → cloud pans.
- Wheel scroll → zoom in/out.
- Press Escape with a galaxy selected → halo clears.
- Resize the window → canvas re-renders crisply at the new size.
- Stop touching anything for 5 seconds → DevTools Performance flat at
  ~0% main-thread.

If a gesture feels "sticky" or skips a frame: the corresponding
`onCameraChange` / `requestRender` call is missing or in the wrong
place. Verify it lives AFTER the state mutation, not before.

- [ ] **Step 7: Commit**

```bash
git add src/services/camera/orbitControls.ts src/services/engine/engine.ts
git commit -m "feat(engine): wake render loop on pointer/wheel/keyboard input"
```

---

## Task 4: Plumb requestRender into engine handle setters

**Files:**

- Modify: `src/services/engine/engine.ts`

This task wakes the loop on every settings-panel change, focus tween,
LOD/source-visibility flip, and SpaceMouse activity.

- [ ] **Step 1: Add requestRender to every setting setter**

Edit each of the following methods on the public handle (around lines
1543–1865 in engine.ts). After the existing body, before the closing
`,`, add:

```ts
scheduler.requestRender();
```

The full list (paste this exact line at the end of every method):

- `clearSelection` (line ~1492) — only inside the `if (selectedIndex !== null)` branch.
- `setPointSize` (line ~1543)
- `setBrightness` (line ~1548)
- `setAutoRotate` (line ~1553)
- `setGalaxyTexturesEnabled` (line ~1558)
- `setHighlightFallback` (line ~1568)
- `setRealOnlyMode` (line ~1576)
- `setBiasMode` (line ~1584) — at the very end, AFTER the optional Schechter / angular bake branches; the bake's resolve also calls requestRender (Task 5).
- `setAbsMagLimit` (line ~1642)
- `setExposure` (line ~1652)
- `setToneMapCurve` (line ~1662)
- `resetCamera` (line ~1676) — inside the body, AFTER `updatePosition(cam)`.
- `focusOn` (line ~1693) — at the end, AFTER `currentTween = { ... }`. The tween's per-frame advance keeps the loop ticking until `advanceCameraTween` returns true; this initial wake is what kicks the cycle off.
- `selectFamous` (line ~1722) — at the end, AFTER setting `currentTween`.
- `focusOnHome` (line ~1765) — same.
- `setLodMode` (line ~1795) — only on the actual change branch (after the early-return guard).
- `setSourceVisible` (line ~1801) — only when `next !== visibleSourceMask` (i.e. AFTER the `if (next === visibleSourceMask) return;` guard).

For example, `setPointSize` becomes:

```ts
    setPointSize(sizePx) {
      pointSizePx = sizePx;
      cb.onPointSizeChange?.(sizePx);
      scheduler.requestRender();
    },
```

And `clearSelection` becomes:

```ts
    clearSelection() {
      if (selectedIndex !== null) {
        setSelected(null);
        scheduler.requestRender();
      }
    },
```

And `resetCamera` becomes:

```ts
    resetCamera() {
      if (!cam || !initialCamRef) return;
      cam.target[0] = initialCamRef.target[0];
      cam.target[1] = initialCamRef.target[1];
      cam.target[2] = initialCamRef.target[2];
      cam.distance = initialCamRef.distance;
      cam.yaw = initialCamRef.yaw;
      cam.pitch = initialCamRef.pitch;
      updatePosition(cam);
      scheduler.requestRender();
    },
```

- [ ] **Step 2: Wake the loop on SpaceMouse axis updates**

Find the `connectSpaceMouse` method (around line 1826). The
`onAxes` callback currently reads:

```ts
          onAxes: (axes) => {
            latestSpaceMouseAxes = axes;
          },
```

Change to:

```ts
          onAxes: (axes) => {
            latestSpaceMouseAxes = axes;
            // Wake the loop. If the puck is deflected, the next
            // frame's still-animating predicate will keep ticking
            // (hasAnyAxis returns true).  When the user releases the
            // puck back to neutral the predicate flips to false on
            // the next frame and the loop sleeps.  The scheduler
            // coalesces multiple HID reports per frame into one rAF.
            scheduler.requestRender();
          },
          onConnectionChange: (connected) => {
            cb.onSpaceMouseConnectedChange?.(connected);
            if (!connected) latestSpaceMouseAxes = { ...ZERO_AXES };
            // Wake one frame so the still-animating predicate sees
            // the zeroed axes and lets the loop sleep cleanly.
            scheduler.requestRender();
          },
```

Find `disconnectSpaceMouse` (around line 1852):

```ts
    disconnectSpaceMouse() {
      spaceMouseInput?.disconnect();
      latestSpaceMouseAxes = { ...ZERO_AXES };
    },
```

Change to:

```ts
    disconnectSpaceMouse() {
      spaceMouseInput?.disconnect();
      latestSpaceMouseAxes = { ...ZERO_AXES };
      scheduler.requestRender();
    },
```

`setSpaceMouseSensitivity` doesn't strictly need a render (it only
takes effect on the next frame the puck is deflected, which already
keeps the loop ticking). Skip it for now — adding the call would be
harmless but cluttered.

- [ ] **Step 3: TypeCheck + tests**

```bash
npm run typecheck && npm test -- --run
```

Expected: PASS.

- [ ] **Step 4: Visual smoke check**

- Drag every slider in the SettingsPanel — each immediate adjustment
  changes the rendered output.
- Toggle Auto-rotate on → cloud rotates smoothly. Toggle off → stops
  on the next frame.
- Click "Reset Camera" → camera tween smoothly home.
- Open command palette (Cmd+K), pick a famous galaxy → camera tweens
  to it; selection halo appears.
- Stop interacting for 5 seconds with auto-rotate OFF → CPU flat.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/engine.ts
git commit -m "feat(engine): wake render loop on every handle setter and SpaceMouse event"
```

---

## Task 5: Plumb requestRender into async resolution points

**Files:**

- Modify: `src/services/engine/engine.ts`

These wake the loop after async work completes — cloud uploads,
sidecar fetches, thumbnail bitmap arrivals, Schechter/angular
worker bakes, pick readbacks.

- [ ] **Step 1: Wake on `renderer.upload` resolution**

Find the cloud-upload block inside `loadAllClouds` (around line 637):

```ts
renderer.upload(result.source, result.cloud).catch((err) => {
  console.error(`[engine] point bake failed for source ${result.source}:`, err);
});
clouds.set(result.source, result.cloud);
cb.onCloudReady?.(result.source, result.cloud.count);
```

Change to:

```ts
renderer
  .upload(result.source, result.cloud)
  .then(() => {
    // GPU buffer is now ready — render so the new points appear
    // (the per-frame draw skips sources whose buffer isn't ready
    // yet, so without this call the cloud would stay invisible
    // until some other event woke the loop).
    scheduler.requestRender();
  })
  .catch((err) => {
    console.error(`[engine] point bake failed for source ${result.source}:`, err);
  });
clouds.set(result.source, result.cloud);
cb.onCloudReady?.(result.source, result.cloud.count);
// Wake immediately too — `clouds.set` enables hover/pick on the
// (still-baking) cloud's CPU-side metadata.  Harmless even if
// the GPU buffer isn't quite ready: the per-frame draw skips
// not-yet-uploaded sources by design.
scheduler.requestRender();
```

Find the synthetic-fallback path (around line 679):

```ts
renderer.upload(fallback.source, fallback.cloud).catch((err) => {
  console.error('[engine] synthetic-fallback bake failed:', err);
});
```

Change to:

```ts
renderer
  .upload(fallback.source, fallback.cloud)
  .then(() => {
    scheduler.requestRender();
  })
  .catch((err) => {
    console.error('[engine] synthetic-fallback bake failed:', err);
  });
```

- [ ] **Step 2: Wake on famous-sidecar load**

Find `loadFamousSidecars()` (around line 656):

```ts
loadFamousSidecars()
  .then((sc) => {
    famousMeta = sc.meta;
    famousXrefs = sc.xrefs;
  })
  .catch((err) => {
    console.warn('[engine] famous sidecars failed to load:', err);
  });
```

Change to:

```ts
loadFamousSidecars()
  .then((sc) => {
    famousMeta = sc.meta;
    famousXrefs = sc.xrefs;
    // No direct render-state change — the sidecars only feed
    // hover-card text — but the famous-galaxy thumbnails
    // referenced by these entries will now be enqueueable from
    // the per-frame loop.  Wake one frame so the user sees the
    // famous overlays without having to nudge the camera.
    scheduler.requestRender();
  })
  .catch((err) => {
    console.warn('[engine] famous sidecars failed to load:', err);
  });
```

- [ ] **Step 3: Wake on bitmap-fetch resolution**

Find the `queue.enqueue({ ..., onResult: ... })` block (around line 1228) inside the per-galaxy thumbnail loop:

```ts
                  onResult: (bitmap) => {
                    if (!bitmap) {
                      bitmapFailed.add(key);
                      return;
                    }
                    if (atlas.lastSeenFrame(key) === undefined) {
                      bitmap.close();
                      return;
                    }
                    atlas.uploadBitmap(slot, bitmap);
                    bitmapReady.add(key);
                    bitmapReadyTime.set(key, performance.now());
                    bitmap.close();
                  },
```

Change to:

```ts
                  onResult: (bitmap) => {
                    if (!bitmap) {
                      bitmapFailed.add(key);
                      // Wake one frame so the still-animating predicate
                      // re-checks queue.inFlightCount() and the loop
                      // can sleep if this was the last in-flight fetch.
                      scheduler.requestRender();
                      return;
                    }
                    if (atlas.lastSeenFrame(key) === undefined) {
                      bitmap.close();
                      scheduler.requestRender();
                      return;
                    }
                    atlas.uploadBitmap(slot, bitmap);
                    bitmapReady.add(key);
                    bitmapReadyTime.set(key, performance.now());
                    bitmap.close();
                    // Wake the loop so the freshly-uploaded thumbnail
                    // appears on the next frame.  The load-fade lerp
                    // (LOAD_FADE_MS = 400 ms) needs the loop ticking
                    // for the duration of the fade — handled by the
                    // still-animating predicate's queue.inFlightCount
                    // path (which keeps ticking while any fetch is
                    // pending) plus a follow-up wake here for the
                    // fade-in animation.
                    scheduler.requestRender();
                  },
```

**Note on the load fade:** the load-fade lerp wants the loop ticking
for ~400 ms after the bitmap lands. The simplest correct way to
achieve this is to extend the still-animating predicate. Update the
predicate in `engine.ts` (the `stillAnimating = ...` line you wrote
in Task 2 around line 1476):

```ts
const FADE_DURATION_MS = 400;
const fadeInProgress =
  bitmapReadyTime.size > 0 &&
  [...bitmapReadyTime.values()].some((t) => performance.now() - t < FADE_DURATION_MS);
const stillAnimating =
  autoRotate ||
  currentTween !== null ||
  hasAnyAxis(latestSpaceMouseAxes) ||
  queue.inFlightCount() > 0 ||
  fadeInProgress;
if (stillAnimating) scheduler.requestRender();
```

The `[...map.values()]` allocation is fine — `bitmapReadyTime` caps
at the atlas slot count (256), so the iteration is < 256 numbers per
frame and only runs while _some_ fade is active.

- [ ] **Step 4: Wake on Schechter / angular bake completion**

Find the lazy bake calls in `setBiasMode` (around line 1614):

```ts
if (!wasSchechter && isSchechter && renderer) {
  renderer.applySchechterMode().catch((err) => {
    console.error('[engine] Schechter ratio bake failed:', err);
  });
}
```

Change to:

```ts
if (!wasSchechter && isSchechter && renderer) {
  renderer
    .applySchechterMode()
    .then(() => {
      // Weights are now in the GPU buffer; the next frame will
      // pick them up.
      scheduler.requestRender();
    })
    .catch((err) => {
      console.error('[engine] Schechter ratio bake failed:', err);
    });
}
```

And around line 1635:

```ts
if (!wasAngular && isAngular && renderer) {
  renderer.applyAngularReweightMode().catch((err) => {
    console.error('[engine] Angular re-weight bake failed:', err);
  });
}
```

Change to:

```ts
if (!wasAngular && isAngular && renderer) {
  renderer
    .applyAngularReweightMode()
    .then(() => {
      scheduler.requestRender();
    })
    .catch((err) => {
      console.error('[engine] Angular re-weight bake failed:', err);
    });
}
```

- [ ] **Step 5: Wake on pick readback resolution**

Find the click-pick block (around line 826):

```ts
          pickRendererHandle
            .pick(...)
            .then((idx) => {
              setSelected(idx === -1 ? null : idx);
            });
```

Change to:

```ts
pickRendererHandle
  .pick(
    [canvas.width, canvas.height],
    cssToTexPx(xCss),
    cssToTexPx(yCss),
    visibleSources,
    renderer.uniformBuffer,
  )
  .then((idx) => {
    setSelected(idx === -1 ? null : idx);
    // Selection changed — render so the highlight halo
    // updates on the next frame.
    scheduler.requestRender();
  });
```

Find the hover-pick block (around line 1458):

```ts
          pickRendererHandle!
            .pick(...)
            .then((idx) => {
              setHovered(idx === -1 ? null : idx);
            })
            .finally(() => {
              pickInFlight = false;
            });
```

Change to:

```ts
pickRendererHandle!
  .pick(
    [canvas.width, canvas.height],
    cssToTexPx(pos.x),
    cssToTexPx(pos.y),
    visibleSources,
    renderer.uniformBuffer,
  )
  .then((idx) => {
    const wasHovered = hoveredIndex;
    setHovered(idx === -1 ? null : idx);
    // Only schedule a render if hover actually changed —
    // setHovered already short-circuits its callback in
    // that case, but the engine's per-frame draw uses the
    // `selectedIndex` uniform, NOT a hover one.  So a
    // hover change does NOT actually require a re-render
    // unless we want to update some hover-only visual.
    // For now we DON'T have one (hover only feeds the
    // InfoCard text), so skip the request to keep idle
    // CPU at zero on mouse-over without click.
    void wasHovered;
  })
  .finally(() => {
    pickInFlight = false;
  });
```

(If a future task adds a hover halo, add `scheduler.requestRender();`
inside the `.then` after `setHovered(...)`.)

- [ ] **Step 6: TypeCheck + tests**

```bash
npm run typecheck && npm test -- --run
```

Expected: PASS.

- [ ] **Step 7: Visual smoke check**

- Cold-load the app: clouds appear progressively as each survey
  finishes. No sticky frame where a survey loads but doesn't show up.
- Zoom in close to a galaxy with a thumbnail: the thumbnail loads
  smoothly with the load fade. Once the fade completes, idle CPU
  drops to zero.
- Click a galaxy: selection halo appears immediately.
- Click empty space: halo clears immediately.
- Open SettingsPanel, change BiasMode to Schechter: the redistribution
  applies smoothly after the worker finishes (~1-2 seconds), no need
  to nudge the camera.

- [ ] **Step 8: Commit**

```bash
git add src/services/engine/engine.ts
git commit -m "feat(engine): wake render loop on async resolution points (uploads, fetches, picks)"
```

---

## Task 6: Visual / performance verification

**Files:** none modified.

This task is the cumulative verification check.

- [ ] **Step 1: Profile idle CPU**

Open `npm run dev`, load the app, frame any cloud, do not touch the
mouse. In Chrome DevTools Performance tab, record 5 seconds.

Expected: main-thread CPU < 1% (was 8–15% before this plan). The
"frames" track should show effectively nothing — at most one rAF
fire per second (browser implicit redraws on tab focus changes,
nothing user-visible).

If CPU is still high: the still-animating predicate is firing
constantly because of one of:

- `bitmapReadyTime` has stale entries (a galaxy was loaded more than
  400 ms ago but its entry was never cleared). Verify the fade
  predicate's `< FADE_DURATION_MS` check is correct.
- `queue.inFlightCount()` is non-zero because a fetcher is hung.
  Check the network tab.
- Something else is calling `scheduler.requestRender()` every frame.
  Add a console.count('requestRender') temporarily to find the
  culprit.

- [ ] **Step 2: Profile interactive responsiveness**

Hold a mouse drag across the canvas for 3 seconds. The camera should
move smoothly with no skipped frames.

Hold the wheel scroll for 2 seconds. The zoom should be smooth.

Toggle every settings-panel control in sequence. Each should produce
one immediate frame.

- [ ] **Step 3: Profile auto-rotate**

Toggle auto-rotate on. The cloud should rotate at ~3°/sec smoothly.
DevTools Performance shows ~60 fps with frame work consistent with
the pre-render-on-demand baseline (we haven't reduced per-frame
cost; we've only stopped scheduling frames when nothing is happening).

Toggle auto-rotate off. The rotation should stop within one frame
(the next `frame()` body sees `autoRotate === false`, advances yaw
by 0 degrees, doesn't re-schedule, and sleeps).

- [ ] **Step 4: Profile camera tween**

Click "Reset Camera". Tween should run smoothly to completion (600
ms). DevTools shows ~60 fps for the duration of the tween, then flat.

Pick a famous galaxy via Cmd+K. Same — smooth tween, then flat.

- [ ] **Step 5: Profile SpaceMouse (skip if no hardware)**

If a 3DConnexion puck is paired:

- Touch the puck → loop runs at ~60 fps.
- Release the puck → loop sleeps within one frame.

If no puck: skip.

- [ ] **Step 6: Profile thumbnail loading**

Zoom in until galaxy thumbnails load. Watch the load fades complete.
Verify CPU drops to zero ~400 ms after the last thumbnail finishes
fading in.

- [ ] **Step 7: Document the result**

Save a Performance recording to `/tmp/idle-cpu-after.json` and compare
against the Task 0 baseline. Report the delta in the commit message
of Task 7.

---

## Task 7: Update README

**Files:**

- Modify: `README.md` (and/or `CLAUDE.md` if appropriate)

- [ ] **Step 1: Add a render-on-demand section to the README**

Find the "Renderer quick map" or equivalent section in `README.md`.
Add a paragraph describing the render-on-demand pattern:

```markdown
### Render scheduling: render-on-demand

The engine doesn't run a continuous render loop — `frame()` fires
only when something has changed. Every event handler that mutates
render-affecting state (mouse drag, wheel zoom, settings change,
camera tween, image-queue completion, …) calls
`scheduler.requestRender()`, which schedules exactly one rAF. Inside
the frame body, after the GPU work is submitted, the tail re-schedules
_only_ when motion is in flight: `autoRotate`, an active camera
tween, deflected SpaceMouse axes, pending thumbnail fetches, or
recent thumbnail load-fade. Otherwise the loop pauses.

Idle CPU is effectively zero — no GPU encoding, no per-galaxy
thumbnail-priority loop, no uniform writes.

The scheduler abstraction lives in
`src/services/engine/renderScheduler.ts` and is unit-tested
independently of WebGPU.
```

- [ ] **Step 2: Update CLAUDE.md "Renderer quick map" if present**

If `CLAUDE.md` has a "Renderer quick map" section, add a one-line
entry:

```markdown
- **`renderScheduler.ts` + `engine.ts` frame tail**: render-on-demand.
  `requestRender()` from event handlers wakes the loop; the frame body
  re-schedules only while `autoRotate || currentTween || hasAnyAxis ||
queue.inFlightCount > 0 || recent-fade` is true.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: render-on-demand pattern in README + CLAUDE.md"
```

---

## Open questions / ambiguities for the user

These came up while writing the plan. The user should answer before
dispatching execution; the implementer can default to the listed
choice if no answer is given.

1. **Should hover-pick wake the render loop?** Today hover only feeds
   the InfoCard text — it does NOT update any GPU-side highlight halo
   (only `selectedIndex` does, and that's set by click). Task 5 Step 5
   chooses **NOT** to call `requestRender()` after hover-pick resolves.
   This keeps idle CPU at zero when the user is just moving the mouse
   over the canvas. If a future feature adds a hover halo, the
   implementer must add the call. **Default: NO request on hover.**

2. **Should the atlas LRU `frameCounter` advance on every
   `requestRender()` call, or only when a frame actually fires?**
   The plan keeps the current behaviour: `frameCounter++` inside
   `frame()`, so the counter only ticks when a frame is encoded. With
   render-on-demand this means LRU eviction is "least-recently-rendered"
   rather than "least-recently-of-wall-clock-time". The semantics
   remain correct but the counter ticks less often. **Default: keep
   current behaviour. Re-visit if eviction starts behaving strangely.**

3. **Should `setSpaceMouseSensitivity` call `requestRender()`?** The
   sensitivity only matters when the puck is deflected, and that's a
   state where the loop is already ticking (the still-animating
   predicate sees `hasAnyAxis === true`). Calling it when the puck
   is at rest would render a single frame for nothing. Task 4 Step 2
   skips it. **Default: NO call.**

4. **Should `cb.onScaleChange` from `updateScaleBar` trigger
   `requestRender()`?** No — `updateScaleBar` is called from inside
   `frame()`, so we're already in a render. The change is reported to
   React but doesn't need to wake the engine. **Default: NO call.**

5. **What about devicePixelRatio changes?** A user dragging the window
   between two monitors with different DPRs would change the backing
   store size — `resizeCanvasToDisplay` returns true on the next frame
   if it runs. We rely on the `window.addEventListener('resize')`
   listener (Task 3 Step 4) to wake the loop. If a browser ever fires
   only a `devicepixelratio` media-query change without a `resize`
   event, that path could miss. **Default: ship with `resize` only;
   add a `matchMedia('(resolution)')` listener if a regression is
   reported.**

6. **Should `connectSpaceMouse`'s `await spaceMouseInput.connect()`
   resolution call `requestRender()`?** The `onAxes` callback inside
   the input handles per-report wakes; the `onConnectionChange`
   callback handles transitions; both already call requestRender.
   The outer `connect()` resolution doesn't directly mutate render
   state, so no extra call is needed. **Default: NO call on the outer
   await.**

---

## Surprising state-mutation paths found in the codebase

These are paths where the engine's existing code mutates render-
affecting state in non-obvious places. The implementer should be aware
of them — Tasks 3-5 cover them all but the executor should double-
check after each commit:

- **`attachOrbitControls` mutates `cam` directly** without firing any
  callback. Until Task 3 Step 1 introduces `onCameraChange`, the
  engine has no way to know the camera moved except by reading
  `cam.yaw` etc. on every frame. This is _the_ central reason
  render-on-demand is non-trivial in this codebase — the camera is a
  shared mutable POJO, not an event-emitting object.

- **`pointermove` updates `latestMouseCss` but the per-frame loop is
  what initiates the pick.** This means hover detection is implicitly
  per-frame, not per-event. With render-on-demand, the pointermove
  handler's `requestRender()` (Task 3 Step 4) is what gets the pick
  to happen at all. Without it, the user could move the mouse over a
  galaxy and never see hover info because no frame would fire.

- **The `pointerdown` listener clears `currentTween`.** This wasn't
  obvious from the public handle's API — it's an internal mutation
  that affects render state (the camera should stop tweening
  mid-flight when the user grabs it). Task 3 Step 4 covers it
  (the handler already calls `setHovered(null)` and now also
  `requestRender()`).

- **`renderer.upload` is fire-and-forget on the `clouds.set` /
  `cb.onCloudReady` path.** The visual rendering of the new survey
  starts on whichever frame fires AFTER the worker finishes baking.
  In the old continuous-loop world this happened automatically; with
  render-on-demand we need to explicitly wake the loop on the
  upload's promise resolution (Task 5 Step 1).

- **`renderer.applySchechterMode` and `applyAngularReweightMode` are
  also fire-and-forget**, kicked off lazily from `setBiasMode`. Same
  fix (Task 5 Step 4): chain a `.then(scheduler.requestRender)`.

- **The atlas is mutated from the bitmap fetch's onResult callback,
  not from inside `frame()`.** This is the trickiest async path —
  the upload happens at an arbitrary moment between frames, and
  without a `requestRender()` in the onResult, the user could be
  staring at a still scene while the GPU silently has a freshly-
  uploaded thumbnail it never gets to draw. Task 5 Step 3 fixes this.

- **`autoRotate` uses a fixed per-frame yaw delta**, not a wall-clock
  delta. With render-on-demand at irregular cadence (e.g. fade-in
  finishes mid-rotation, scheduler sleeps for 100 ms, then resumes),
  the rotation will appear to _slow down_ during sparse periods. This
  is a pre-existing behavioural quirk, made more visible by render-
  on-demand. The user-facing fix is to convert the yaw advancement
  to wall-clock-based — out of scope for this plan, but worth
  flagging. **Document but do not fix here.**
