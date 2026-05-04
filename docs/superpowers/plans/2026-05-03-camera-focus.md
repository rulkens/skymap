# Camera Focus & Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two smooth camera operations to Skymap — `focusOn(xyz)` to pivot the orbit camera onto a pinned galaxy, and `focusOnHome()` to return to Earth's initial framing — driven by InfoCard buttons, a new home button, and keyboard shortcuts (`f`, `h`).

**Architecture:** Tween state lives on the engine (single in-flight tween, mutated each frame from inside the existing render loop). Pure helper modules (`easeOutCubic`, `lerp`, `lerpAngleShortest`, `cameraTween`) keep the math testable without GPU. React only triggers `handle.focusOn(...)` / `handle.focusOnHome()`; the engine owns the per-frame interpolation and short-circuits the tween when the user grabs the mouse so manual controls always win.

**Tech Stack:** TypeScript 6, React 19, gl-matrix 3.4, Vite 8, Vitest 4, WebGPU. Project conventions: `type` not `interface`, didactic comments, single quotes, 100-char lines, trailing commas, CSS modules per component, no React component barrels.

---

## File Structure

**Pure math helpers (one function per file, mirrors `src/utils/math/` style):**

- `src/utils/math/easeOutCubic.ts` — `easeOutCubic(t: number): number`. Cubic ease-out curve; takes a 0..1 input and returns a 0..1 output that decelerates near the end.
- `src/utils/math/lerp.ts` — `lerp(a: number, b: number, t: number): number`. Pure scalar linear interpolation; the building block of every tween.
- `src/utils/math/lerpAngleShortest.ts` — `lerpAngleShortest(a: number, b: number, t: number): number`. Like `lerp` but treats inputs as radians on a circle and always interpolates along the shorter arc — so a tween from yaw=6.0 to yaw=0.3 sweeps through ~2π (the short way) instead of going all the way around backwards.

**Tween state machine (engine-side, no GPU):**

- `src/camera/cameraTween.ts` — pure module. Defines the `CameraTween` type and `advanceCameraTween(cam, tween, nowMs)` which mutates `cam` toward the tween end-state and returns `true` when the tween has finished. Decoupled from `OrbitCamera`'s WebGPU/DOM neighbours so it can be unit-tested.

**Engine integration:**

- `src/engine.ts` — capture the initial camera snapshot for home (already done by `initialCamRef`), add `currentTween` closure variable, advance it inside the `frame()` function before the existing scale-bar/auto-rotate logic, expose `focusOn` + `focusOnHome` on the public handle. Cancel the tween on `pointerdown` so manual orbit controls remain authoritative.
- `src/@types/EngineHandle.d.ts` — add `focusOn` and `focusOnHome` method signatures.

**UI:**

- `src/components/InfoCard/FullCard.tsx` — when `pinned`, show a "Focus" button next to the PINNED badge that fires `props.onFocus(info)`.
- `src/components/InfoCard/InfoCard.tsx` — pass through `onFocus` to `FullCard`.
- `src/components/HomeButton/HomeButton.tsx` (new) — small fixed button at the bottom-left edge of the canvas (sits next to the SettingsPanel), shows a tiny home glyph as inline SVG, fires `props.onClick`.
- `src/components/HomeButton/HomeButton.module.css` (new) — glassmorphic styling consistent with `SettingsPanel.module.css`.
- `src/App.tsx` — wire `onFocus` from `InfoCard`, render `<HomeButton />`, attach a single `keydown` effect for `f` (focus selected) and `h` (home).

**Tests:**

- `tests/utils/math/easeOutCubic.test.ts`
- `tests/utils/math/lerp.test.ts`
- `tests/utils/math/lerpAngleShortest.test.ts`
- `tests/camera/cameraTween.test.ts`

**Docs:**

- `README.md` — add a one-paragraph "Camera focus" section under existing keyboard shortcuts / controls notes.

**Untouched:**

- `src/camera/orbitCamera.ts` — math/state already does what we need; the tween mutates `cam.yaw/pitch/distance/target` and calls `updatePosition` exactly like the orbit controls do.

---

## Task 1: easeOutCubic helper

**Files:**

- Create: `src/utils/math/easeOutCubic.ts`
- Create: `tests/utils/math/easeOutCubic.test.ts`
- Modify: `src/utils/math/index.ts` (add re-export)

- [ ] **Step 1: Write the failing test**

Create `tests/utils/math/easeOutCubic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { easeOutCubic } from '../../../src/utils/math/easeOutCubic';

describe('easeOutCubic', () => {
  it('returns 0 at t=0', () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(easeOutCubic(1)).toBe(1);
  });

  it('decelerates: easeOutCubic(0.5) > 0.5 (past the midpoint already)', () => {
    // Cubic ease-out reaches 7/8 at t=0.5: 1 - (1-0.5)^3 = 1 - 0.125 = 0.875
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 6);
  });

  it('clamps inputs above 1 to a sensible value (no overshoot)', () => {
    // Strict math gives 1 - (1 - 1.5)^3 = 1 - (-0.125) = 1.125, but we want
    // tween outputs to never overshoot the target. easeOutCubic must clamp.
    expect(easeOutCubic(1.5)).toBe(1);
  });

  it('clamps inputs below 0 to 0 (no rewind)', () => {
    expect(easeOutCubic(-0.2)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/utils/math/easeOutCubic.test.ts`
Expected: FAIL with "Cannot find module '../../../src/utils/math/easeOutCubic'".

- [ ] **Step 3: Implement `easeOutCubic`**

Create `src/utils/math/easeOutCubic.ts`:

```ts
/**
 * easeOutCubic — a 0..1 → 0..1 easing curve that decelerates as t approaches 1.
 *
 * ### What is "easing"?
 *
 * A linear tween moves at constant speed: at t=0.5 you're exactly halfway. That
 * feels mechanical because nothing in the physical world starts and stops
 * abruptly — a real camera move accelerates from rest, glides, then settles.
 *
 * Easing functions reshape the linear t into a curve that produces that
 * "natural" feel. `easeOutCubic` is the simplest variant that decelerates near
 * the end:  starts fast, slows down, settles softly.  It is the standard
 * choice for "snap to target" UI animations because the user sees motion
 * start *immediately* (no perceived lag) and finish *gently* (no overshoot).
 *
 * ### The formula
 *
 *     f(t) = 1 - (1 - t)^3
 *
 * Reading it geometrically:
 *   - At t=0:   f = 1 - 1   = 0   (stationary at the start)
 *   - At t=0.5: f = 1 - 1/8 = 7/8 (already 87.5% of the way there)
 *   - At t=1:   f = 1 - 0   = 1   (settled exactly on target)
 *
 * The derivative at t=1 is zero, which is the mathematical statement of
 * "settles softly" — the curve flattens as it touches the top.
 *
 * ### Why clamp?
 *
 * We hand this function the elapsed-time fraction `(now - start) / duration`
 * straight from the render loop.  On a slow frame `now` may overshoot the
 * deadline so the fraction can be slightly above 1; the cube of a value
 * `< 0` is negative, which would flip the curve and overshoot the tween
 * target visibly.  Clamping is one extra `Math.max/min` and removes the bug.
 *
 * @param t  Linear progress in [0, 1].  Values outside the range are clamped.
 * @returns  Eased progress in [0, 1].
 */
export function easeOutCubic(t: number): number {
  // Clamp first — see docstring "Why clamp?" above.
  const clamped = Math.max(0, Math.min(1, t));
  // 1 - (1 - t)^3.  Compute (1 - t) once for clarity and to keep the JIT happy.
  const inv = 1 - clamped;
  return 1 - inv * inv * inv;
}
```

- [ ] **Step 4: Re-export from the math barrel**

Edit `src/utils/math/index.ts`, add the line just above `export * from './sdssExplorerUrl';`:

```ts
export * from './easeOutCubic';
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run tests/utils/math/easeOutCubic.test.ts`
Expected: PASS, 5 assertions.

- [ ] **Step 6: Commit**

```bash
git add src/utils/math/easeOutCubic.ts src/utils/math/index.ts tests/utils/math/easeOutCubic.test.ts
git commit -m "feat: add easeOutCubic easing helper"
```

---

## Task 2: lerp helper

**Files:**

- Create: `src/utils/math/lerp.ts`
- Create: `tests/utils/math/lerp.test.ts`
- Modify: `src/utils/math/index.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/utils/math/lerp.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lerp } from '../../../src/utils/math/lerp';

describe('lerp', () => {
  it('returns a at t=0', () => {
    expect(lerp(3, 9, 0)).toBe(3);
  });

  it('returns b at t=1', () => {
    expect(lerp(3, 9, 1)).toBe(9);
  });

  it('returns the midpoint at t=0.5', () => {
    expect(lerp(3, 9, 0.5)).toBeCloseTo(6, 10);
  });

  it('handles negative ranges', () => {
    expect(lerp(-10, 10, 0.25)).toBeCloseTo(-5, 10);
  });

  it('does not clamp t — extrapolation is the caller’s responsibility', () => {
    // Some animation systems intentionally extrapolate (overshoot springs);
    // lerp itself stays purely mathematical.
    expect(lerp(0, 10, 1.5)).toBeCloseTo(15, 10);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/utils/math/lerp.test.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement `lerp`**

Create `src/utils/math/lerp.ts`:

```ts
/**
 * lerp — pure scalar linear interpolation between `a` and `b` at parameter `t`.
 *
 * ### The formula and why we write it this way
 *
 * The textbook expression is `a + (b - a) * t`.  An equally valid form is
 * `a * (1 - t) + b * t` ("convex combination" form).  For finite `a, b` and
 * `t ∈ [0, 1]` they produce identical results, but they differ in two
 * practical respects:
 *
 *   1. The convex form is the *correct* one when `a` and `b` are very large
 *      and very different magnitudes — `(b - a)` can lose precision while
 *      `a*(1-t) + b*t` keeps each term scaled.  This matters in camera tweens
 *      where coordinates can be in the millions of Mpc.
 *   2. The convex form composes nicely with the boundary cases:  at `t=1` we
 *      get exactly `b` (no `a + (b - a)` rounding ricochet), and at `t=0`
 *      we get exactly `a`.  Tests that assert `lerp(a, b, 1) === b` rely on
 *      this exactness.
 *
 * We use the convex form for both reasons.
 *
 * ### Why no clamping?
 *
 * Some callers want to extrapolate (springs, overshoot, parallax beyond
 * endpoints).  Easing curves should clamp; arithmetic primitives shouldn't.
 *
 * @param a  Start value (returned at t=0).
 * @param b  End value (returned at t=1).
 * @param t  Interpolation parameter.  Inside [0, 1] interpolates; outside extrapolates.
 * @returns  The interpolated scalar.
 */
export function lerp(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}
```

- [ ] **Step 4: Re-export from the math barrel**

Edit `src/utils/math/index.ts`, add directly after the easeOutCubic line:

```ts
export * from './lerp';
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run tests/utils/math/lerp.test.ts`
Expected: PASS, 5 assertions.

- [ ] **Step 6: Commit**

```bash
git add src/utils/math/lerp.ts src/utils/math/index.ts tests/utils/math/lerp.test.ts
git commit -m "feat: add lerp scalar helper"
```

---

## Task 3: lerpAngleShortest helper

**Files:**

- Create: `src/utils/math/lerpAngleShortest.ts`
- Create: `tests/utils/math/lerpAngleShortest.test.ts`
- Modify: `src/utils/math/index.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/utils/math/lerpAngleShortest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lerpAngleShortest } from '../../../src/utils/math/lerpAngleShortest';

const TAU = Math.PI * 2;

describe('lerpAngleShortest', () => {
  it('returns a at t=0', () => {
    expect(lerpAngleShortest(1.0, 2.5, 0)).toBeCloseTo(1.0, 10);
  });

  it('returns b at t=1', () => {
    // The output may be `b` itself OR an equivalent angle (b + 2π·k).
    // We compare modulo 2π to allow for the implementation’s choice.
    const out = lerpAngleShortest(1.0, 2.5, 1);
    const diff = ((out - 2.5) % TAU + TAU) % TAU;
    // Either ~0 or ~2π — both are valid representations of the same angle.
    expect(Math.min(diff, TAU - diff)).toBeLessThan(1e-10);
  });

  it('takes the short arc across the 2π boundary', () => {
    // From 6.0 (≈ just below 2π) to 0.3 — the SHORT path is forward by ~0.6,
    // not backward by ~5.7. So at t=0.5 we expect to be near (6.0 + 0.3)/2 = 3.15
    // wrapped... actually: short forward delta = 0.3 + (TAU - 6.0) ≈ 0.5832.
    // At t=0.5 the result is 6.0 + 0.5832/2 = 6.2916, which mod 2π is 0.0084.
    const out = lerpAngleShortest(6.0, 0.3, 0.5);
    const wrapped = ((out % TAU) + TAU) % TAU;
    // Compare to the expected short-arc midpoint (≈ 0.0084 rad).
    const expectedShort = 0.5 * (0.3 + (TAU - 6.0));
    const expected = (6.0 + expectedShort) % TAU;
    expect(Math.abs(wrapped - expected)).toBeLessThan(1e-6);
  });

  it('does NOT take the long way (sanity check)', () => {
    // From 0.1 to 6.2 (≈ TAU - 0.083): short delta is BACKWARD ≈ -0.183,
    // not forward ≈ +6.1. At t=0.5 we should land near 0.1 - 0.0917 ≈ 0.0083
    // (or its wrapped equivalent), nowhere near the long-way midpoint of 3.15.
    const out = lerpAngleShortest(0.1, 6.2, 0.5);
    const wrapped = ((out % TAU) + TAU) % TAU;
    // The long-way midpoint would be ~3.15. We must be far from it.
    expect(Math.abs(wrapped - Math.PI)).toBeGreaterThan(1.0);
  });

  it('handles equal angles (delta = 0)', () => {
    expect(lerpAngleShortest(1.5, 1.5, 0.5)).toBeCloseTo(1.5, 10);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/utils/math/lerpAngleShortest.test.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement `lerpAngleShortest`**

Create `src/utils/math/lerpAngleShortest.ts`:

```ts
/**
 * lerpAngleShortest — interpolate between two radian angles along the SHORT arc.
 *
 * ### Why scalar `lerp` is wrong for angles
 *
 * Yaw is stored as a float that grows without bound — drag-rotating a few
 * times can leave you at yaw = 12.7 rad even though the camera is visually
 * pointing the same way as yaw = 0.13.  If the user clicks "Focus" on a
 * galaxy whose computed target yaw is 0.3, a naive `lerp(12.7, 0.3, t)`
 * would sweep the camera *backward* through every angle from 12.7 down to
 * 0.3 — over 12 radians (almost two full revolutions) of pointless spin.
 *
 * What we actually want is "go the short way": find the equivalent angle of
 * `b` that sits within ±π of `a`, then linearly interpolate to it.  Mod-2π
 * gives infinitely many equivalent representations; the *shortest signed
 * delta* between two angles is the unique one in (−π, +π].
 *
 * ### The shortest-arc formula
 *
 *     delta = ((b - a + π) mod 2π) - π
 *
 * Reading right-to-left:
 *
 *   1. `b - a`           — naive raw difference (could be ±anything).
 *   2. `... + π`         — shift the wrap point so the desired range becomes [0, 2π).
 *   3. `mod 2π`          — fold into the principal range [0, 2π).
 *   4. `... - π`         — shift back so the result lives in [−π, +π).
 *
 * (Note: JavaScript's `%` is "truncated remainder", not "modulo" — for
 * negative values it returns a negative remainder.  We fix that with the
 * standard `((x % m) + m) % m` trick to get a true non-negative modulo.)
 *
 * Result: `delta` is the unique signed angle in (−π, +π] that, added to
 * `a`, lands on the same point as `b` on the unit circle.  Then a normal
 * scalar lerp `a + delta * t` walks the short way around.
 *
 * ### Why this matters for camera tweens
 *
 * Yaw is the only angular state we tween (pitch is clamped to ±(π/2 − ε) and
 * never wraps).  Without shortest-arc, returning to home (yaw=0) from a
 * heavily-rotated state produces a comically long backwards spin.  This is
 * the kind of subtle bug worth a learning moment in a comment.
 *
 * @param a  Start angle in radians.  May be any real number.
 * @param b  End angle in radians.  May be any real number.
 * @param t  Interpolation parameter, 0..1.
 * @returns  An angle that smoothly walks from `a` toward `b` along the short arc.
 */
export function lerpAngleShortest(a: number, b: number, t: number): number {
  const TAU = Math.PI * 2;
  // Raw difference, which we will fold into (-π, +π].
  const raw = b - a + Math.PI;
  // True (non-negative) modulo: JS's `%` keeps the sign of the dividend, so
  //   (-0.1) % 6.28  === -0.1   (not 6.18, which is what we want).
  // The standard fix is `((x % m) + m) % m`.
  const folded = ((raw % TAU) + TAU) % TAU;
  // Shift back so [0, 2π) becomes [-π, +π) — the short signed arc.
  const delta = folded - Math.PI;
  return a + delta * t;
}
```

- [ ] **Step 4: Re-export from the math barrel**

Edit `src/utils/math/index.ts`, add directly after the lerp line:

```ts
export * from './lerpAngleShortest';
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run tests/utils/math/lerpAngleShortest.test.ts`
Expected: PASS, 5 assertions.

- [ ] **Step 6: Commit**

```bash
git add src/utils/math/lerpAngleShortest.ts src/utils/math/index.ts tests/utils/math/lerpAngleShortest.test.ts
git commit -m "feat: add shortest-arc angle lerp helper"
```

---

## Task 4: cameraTween state machine

**Files:**

- Create: `src/camera/cameraTween.ts`
- Create: `tests/camera/cameraTween.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/camera/cameraTween.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { vec3 } from 'gl-matrix';
import { createOrbitCamera } from '../../src/camera/orbitCamera';
import { advanceCameraTween, type CameraTween } from '../../src/camera/cameraTween';

function makeCam() {
  return createOrbitCamera({
    target: [0, 0, 0],
    distance: 100,
    yaw: 0,
    pitch: 0,
    fovYRad: Math.PI / 4,
    aspect: 1,
    near: 1,
    far: 1000,
  });
}

function makeTween(startMs: number, durationMs: number): CameraTween {
  return {
    startMs,
    durationMs,
    fromTarget: vec3.fromValues(0, 0, 0),
    toTarget: vec3.fromValues(10, 0, 0),
    fromDistance: 100,
    toDistance: 50,
    fromYaw: 0,
    toYaw: 0,
    fromPitch: 0,
    toPitch: 0,
  };
}

describe('advanceCameraTween', () => {
  it('at t=0 leaves the camera on the FROM state and reports not finished', () => {
    const cam = makeCam();
    const tween = makeTween(1000, 600);
    const finished = advanceCameraTween(cam, tween, 1000);
    expect(finished).toBe(false);
    expect(cam.target[0]).toBeCloseTo(0, 6);
    expect(cam.distance).toBeCloseTo(100, 6);
  });

  it('at t=1 snaps exactly to the TO state and reports finished', () => {
    const cam = makeCam();
    const tween = makeTween(1000, 600);
    const finished = advanceCameraTween(cam, tween, 1600);
    expect(finished).toBe(true);
    expect(cam.target[0]).toBeCloseTo(10, 6);
    expect(cam.distance).toBeCloseTo(50, 6);
  });

  it('past the deadline still snaps to TO (never overshoots) and reports finished', () => {
    const cam = makeCam();
    const tween = makeTween(1000, 600);
    const finished = advanceCameraTween(cam, tween, 9999);
    expect(finished).toBe(true);
    expect(cam.target[0]).toBeCloseTo(10, 6);
    expect(cam.distance).toBeCloseTo(50, 6);
  });

  it('mid-tween distance and target are between FROM and TO', () => {
    const cam = makeCam();
    const tween = makeTween(1000, 600);
    advanceCameraTween(cam, tween, 1300); // halfway in wall-clock time
    // easeOutCubic(0.5) = 0.875, so we expect roughly 87.5% of the way.
    expect(cam.target[0]).toBeGreaterThan(8);
    expect(cam.target[0]).toBeLessThan(9);
    expect(cam.distance).toBeLessThan(60);
    expect(cam.distance).toBeGreaterThan(50);
  });

  it('updates cam.position (calls updatePosition under the hood)', () => {
    const cam = makeCam();
    // After construction, position is [0, 0, 100] (yaw=pitch=0 → +Z axis).
    expect(cam.position[2]).toBeCloseTo(100, 5);
    const tween = makeTween(1000, 600);
    advanceCameraTween(cam, tween, 1600); // finish
    // target moved to [10, 0, 0], distance shrank to 50, yaw=pitch=0 still.
    // dir = [0, 0, 1] still, so position = target + 50*dir = [10, 0, 50].
    expect(cam.position[0]).toBeCloseTo(10, 5);
    expect(cam.position[2]).toBeCloseTo(50, 5);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/camera/cameraTween.test.ts`
Expected: FAIL ("Cannot find module '../../src/camera/cameraTween'").

- [ ] **Step 3: Implement `cameraTween`**

Create `src/camera/cameraTween.ts`:

```ts
/**
 * cameraTween — pure state machine that drives an OrbitCamera from a
 * captured "from" snapshot to a "to" snapshot over a fixed duration.
 *
 * ### Why a separate module?
 *
 * The render loop in `engine.ts` already does enough — adding a multi-channel
 * tween calculation inline would bury the logic and make it untestable
 * without spinning up a WebGPU device. By extracting the pure math here we
 * get:
 *
 *   1. Vitest coverage of the easing, the shortest-arc yaw, and the boundary
 *      conditions (t=0, t=1, t>1) — none of which require a GPU.
 *   2. A clear contract: `advanceCameraTween` is the *only* function the
 *      engine calls per frame; if the tween is non-null the engine just
 *      forwards `(cam, tween, performance.now())` and reads the boolean
 *      return value to decide whether to clear `currentTween`.
 *
 * ### Single in-flight tween policy
 *
 * Engine state holds at most one `CameraTween` at a time.  Starting a new
 * tween (focus on a different galaxy, or interrupting with home) snapshots
 * the *current* camera state into the new tween's `from*` fields and
 * replaces the running tween.  This keeps motion continuous — no jumps,
 * no queued backlog, no fight between two tweens for the same camera.
 *
 * ### Channels we tween
 *
 *   - target    (vec3)  — pivot point of the orbit
 *   - distance  (number) — radius
 *   - yaw       (radians, shortest-arc)
 *   - pitch     (radians, scalar lerp — pitch is clamped, never wraps)
 *
 * fovYRad / aspect / near / far do NOT tween.  They aren't camera *pose*;
 * they are projection settings tied to the canvas size and lens.
 */

import { vec3 } from 'gl-matrix';
import type { OrbitCamera } from '../@types';
import { updatePosition } from './orbitCamera';
import { easeOutCubic } from '../utils/math/easeOutCubic';
import { lerp } from '../utils/math/lerp';
import { lerpAngleShortest } from '../utils/math/lerpAngleShortest';

/**
 * A single in-flight camera tween — a frozen "from → to" plan that the
 * engine advances each frame using `performance.now()` as the wall clock.
 *
 * All `from*` fields are captured at the moment the tween is created, so
 * interrupting a running tween with a new one always starts smoothly from
 * the *current* camera state, never the original starting state.
 */
export type CameraTween = {
  /** `performance.now()` value at the moment the tween was created. */
  startMs: number;
  /** Total tween duration in milliseconds (we use 600 throughout the app). */
  durationMs: number;

  /** Camera target at tween start.  Captured once; never mutated. */
  fromTarget: vec3;
  /** Camera target at tween end. */
  toTarget: vec3;

  /** Camera distance (radius) at tween start. */
  fromDistance: number;
  /** Camera distance at tween end. */
  toDistance: number;

  /** Camera yaw (radians) at tween start. */
  fromYaw: number;
  /** Camera yaw at tween end. */
  toYaw: number;

  /** Camera pitch (radians) at tween start. */
  fromPitch: number;
  /** Camera pitch at tween end. */
  toPitch: number;
};

/**
 * Advance the tween by writing the eased intermediate state into `cam`.
 *
 * The function does NOT track its own progress; the caller passes in the
 * current wall-clock time (`performance.now()` in the browser, an injected
 * value in tests).  This makes the function pure with respect to time and
 * trivially testable.
 *
 * ### Saturation behaviour
 *
 * If `nowMs` is past the deadline, the camera is snapped exactly to the
 * `to*` values and the function returns `true`.  This matters because
 * `easeOutCubic` clamps its input — without the explicit deadline check
 * a tween whose first frame happens to land past `startMs + durationMs`
 * (e.g. a paused tab waking up) would still produce a meaningful "land on
 * target" frame, but the engine wouldn't know to clear `currentTween`.
 *
 * @param cam   The camera to mutate in-place.
 * @param tween The tween descriptor.
 * @param nowMs Current wall-clock time, in ms (typically `performance.now()`).
 * @returns     `true` if the tween has completed (caller should drop it),
 *              `false` if the tween is still in progress.
 */
export function advanceCameraTween(
  cam: OrbitCamera,
  tween: CameraTween,
  nowMs: number,
): boolean {
  // Linear progress in [0, 1+].  We clamp at 1 (saturate the tween) and use
  // the clamp to detect "finished".
  const rawT = (nowMs - tween.startMs) / tween.durationMs;
  const finished = rawT >= 1;
  const linearT = finished ? 1 : Math.max(0, rawT);

  // Apply easing to the linear progress.  easeOutCubic is its own clamp, but
  // we already clamped above — passing a known-clean value is just clearer.
  const t = easeOutCubic(linearT);

  // ── Target (vec3 lerp) ────────────────────────────────────────────────
  // We mutate cam.target in place rather than allocating; the orbit camera
  // type stores target as a `[number, number, number]` tuple under the hood
  // (see OrbitCameraInit) and updatePosition reads it directly.
  cam.target[0] = lerp(tween.fromTarget[0], tween.toTarget[0], t);
  cam.target[1] = lerp(tween.fromTarget[1], tween.toTarget[1], t);
  cam.target[2] = lerp(tween.fromTarget[2], tween.toTarget[2], t);

  // ── Distance (scalar lerp) ────────────────────────────────────────────
  cam.distance = lerp(tween.fromDistance, tween.toDistance, t);

  // ── Yaw (shortest-arc angle lerp) ─────────────────────────────────────
  // Yaw can be any real number after extended dragging; we always want to
  // sweep the short way around the circle.  See lerpAngleShortest docstring.
  cam.yaw = lerpAngleShortest(tween.fromYaw, tween.toYaw, t);

  // ── Pitch (scalar lerp; pitch is clamped, never wraps) ────────────────
  cam.pitch = lerp(tween.fromPitch, tween.toPitch, t);

  // Recompute world-space position from the new spherical state.  Same
  // contract as the orbit-controls module: any time you mutate yaw/pitch/
  // distance/target, call updatePosition before the next render.
  updatePosition(cam);

  return finished;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/camera/cameraTween.test.ts`
Expected: PASS, 5 assertions.

- [ ] **Step 5: Commit**

```bash
git add src/camera/cameraTween.ts tests/camera/cameraTween.test.ts
git commit -m "feat: add cameraTween state machine and tests"
```

---

## Task 5: Engine integration — focusOn + focusOnHome

**Files:**

- Modify: `src/@types/EngineHandle.d.ts`
- Modify: `src/engine.ts`

- [ ] **Step 1: Extend the EngineHandle type**

Edit `src/@types/EngineHandle.d.ts`. Add the following two members inside the `EngineHandle` type, immediately after the existing `resetCamera` entry and before `setLodMode?`:

```ts
  /**
   * Smoothly tween the camera so that `worldXYZ` becomes the new orbit target.
   *
   * The current yaw and pitch are preserved (the user keeps their orientation);
   * only `target` and `distance` change.  Distance tweens to a sensible viewing
   * range — for now a fixed multiple of the synthetic 30 kpc galaxy diameter
   * (a future task replaces the constant with the real `galaxyDiameterKpc`).
   *
   * Calling this while another tween is running cancels the previous tween and
   * starts a new one from the current camera state, so motion stays continuous.
   * If the world position is the origin and the camera is already there, the
   * call is a no-op.  Tween duration: 600 ms.
   */
  focusOn: (worldXYZ: [number, number, number]) => void;

  /**
   * Smoothly tween the camera back to the initial framing captured at engine
   * startup (target=origin, distance=bbox×2.5, yaw=0, pitch=0.3).
   *
   * Symmetric to `focusOn`: starts from the current state, eases over 600 ms,
   * cancels any running tween.  Always allowed — calling at home produces a
   * tiny no-op tween, never an error.
   */
  focusOnHome: () => void;
```

- [ ] **Step 2: Add the focus constants and tween state to the engine**

Edit `src/engine.ts`.

(a) Just after the existing imports block (right after the `import type { PointInfo, ... }` line), add:

```ts
import { advanceCameraTween, type CameraTween } from './camera/cameraTween';
import { vec3 } from 'gl-matrix';
```

(b) Just below the comment-block ending `// ── Auto-LOD heuristic ────────...` (so above `export function autoLodMask`), add a new section:

```ts
// ─── Focus tween constants ──────────────────────────────────────────────────────

/**
 * Tween duration for focus / home camera moves, in milliseconds.
 *
 * 600 ms is the sweet spot the UI explored: long enough that the user reads it
 * as motion (not a teleport) and gets oriented in the new frame, short enough
 * that it never feels sluggish during rapid clicking through the InfoCard list.
 */
const FOCUS_TWEEN_MS = 600;

/**
 * Diameter of a "typical" galaxy, in kiloparsecs.
 *
 * A sibling plan is landing a `galaxyDiameterKpc(point)` helper that derives
 * a per-galaxy diameter from photometry; until that lands we use a constant.
 * 30 kpc is roughly the diameter of the Milky Way's stellar disc — a sane
 * placeholder that puts the camera at a "naked-eye" distance from any galaxy.
 */
const FOCUS_GALAXY_DIAMETER_KPC = 30;

/**
 * Convert kpc → Mpc (1 Mpc = 1000 kpc) so the focus distance lives in the
 * same units as `cam.distance`.  This factor is used once below; we name it
 * to keep the math in `focusDistanceMpc` self-documenting.
 */
const KPC_PER_MPC = 1000;

/**
 * Focus distance multiplier — how many galaxy diameters away from the target
 * we want to sit.  4× a 30 kpc disc is 120 kpc = 0.12 Mpc, which is a good
 * "see the whole galaxy with a little space around it" framing.
 */
const FOCUS_DIAMETER_MULTIPLIER = 4;

/**
 * Compute the focus camera distance for a galaxy.
 *
 * Currently a constant (4 × 30 kpc = 120 kpc = 0.12 Mpc) but factored as a
 * function so the upcoming per-galaxy diameter helper can drop in cleanly.
 */
function focusDistanceMpc(): number {
  return (FOCUS_DIAMETER_MULTIPLIER * FOCUS_GALAXY_DIAMETER_KPC) / KPC_PER_MPC;
}
```

(c) Inside `createEngine`, just below the `let initialCamRef: InitialCam | null = null;` line, add:

```ts
  // ── In-flight focus / home tween ────────────────────────────────────────
  //
  // At most one tween at a time.  Starting a new focus or home cancels the
  // running one (we replace this reference; the old tween descriptor is just
  // GC'd).  Set to null when no tween is active.  Mutated by:
  //   - the public handle's `focusOn` / `focusOnHome` (start a tween)
  //   - the `pointerdown` handler           (cancel on user grab)
  //   - the per-frame `frame()` loop         (clear when finished)
  let currentTween: CameraTween | null = null;
```

(d) In the `pointerdown` listener body (find `addCanvasListener('pointerdown', () => {`), add `currentTween = null;` as the first line of the handler body, with a comment:

```ts
      addCanvasListener('pointerdown', () => {
        // Manual orbit controls always win — cancel any running focus tween
        // the moment the user grabs the mouse.  Otherwise the tween's
        // updatePosition would fight the orbit-controls' updatePosition for
        // the same camera each frame, producing a juddery jump.
        currentTween = null;
        pointerDown = true;
        setHovered(null);
      });
```

(e) Inside `frame()`, immediately above the auto-rotate block (`if (autoRotate && cam) { ... }`), add the tween advance:

```ts
        // ── Focus / home tween ────────────────────────────────────────────
        //
        // If a tween is in flight, advance it.  `advanceCameraTween` mutates
        // the camera state and calls updatePosition internally, so by the time
        // we hit the auto-rotate block below the camera is already at the
        // eased intermediate frame.  When the tween reports finished we clear
        // the reference so subsequent frames skip this branch entirely.
        if (currentTween && cam) {
          const finished = advanceCameraTween(cam, currentTween, performance.now());
          if (finished) currentTween = null;
        }
```

(f) Inside the public `handle` object literal, just after the existing `resetCamera()` method, add the two new methods:

```ts
    focusOn(worldXYZ) {
      // Camera may not be ready yet (cloud still loading); drop the call.
      // Same defensive pattern as resetCamera() above.
      if (!cam) return;

      // Snapshot the CURRENT camera state — not the original startup state —
      // so an in-progress tween hands off smoothly to the new one.  vec3.clone
      // copies the target tuple so future mutation of cam.target doesn't
      // corrupt the from-snapshot.
      currentTween = {
        startMs: performance.now(),
        durationMs: FOCUS_TWEEN_MS,
        fromTarget: vec3.clone(cam.target as vec3),
        toTarget: vec3.fromValues(worldXYZ[0], worldXYZ[1], worldXYZ[2]),
        fromDistance: cam.distance,
        toDistance: focusDistanceMpc(),
        fromYaw: cam.yaw,
        toYaw: cam.yaw, // preserve yaw — user keeps their orientation
        fromPitch: cam.pitch,
        toPitch: cam.pitch, // preserve pitch
      };
    },

    focusOnHome() {
      // Camera or initial snapshot may not be ready yet — same pattern as
      // resetCamera.  Both must exist for a meaningful tween.
      if (!cam || !initialCamRef) return;

      currentTween = {
        startMs: performance.now(),
        durationMs: FOCUS_TWEEN_MS,
        fromTarget: vec3.clone(cam.target as vec3),
        toTarget: vec3.fromValues(
          initialCamRef.target[0],
          initialCamRef.target[1],
          initialCamRef.target[2],
        ),
        fromDistance: cam.distance,
        toDistance: initialCamRef.distance,
        fromYaw: cam.yaw,
        toYaw: initialCamRef.yaw,
        fromPitch: cam.pitch,
        toPitch: initialCamRef.pitch,
      };
    },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean — no errors.

- [ ] **Step 4: Run all existing tests to confirm nothing regressed**

Run: `npm test`
Expected: PASS — every test (math + camera + parsers + sources + ...) green.

- [ ] **Step 5: Commit**

```bash
git add src/@types/EngineHandle.d.ts src/engine.ts
git commit -m "feat: wire focusOn and focusOnHome into the engine tween loop"
```

---

## Task 6: InfoCard "Focus" button on FullCard

**Files:**

- Modify: `src/components/InfoCard/FullCard.tsx`
- Modify: `src/components/InfoCard/InfoCard.tsx`
- Modify: `src/components/InfoCard/FullCard.module.css`

- [ ] **Step 1: Add styles for the Focus button**

Append to `src/components/InfoCard/FullCard.module.css`:

```css
/* ── Focus button (only visible when the card is pinned) ──────────────────────
 *
 * The button sits inline with the title row, to the right of the PINNED badge.
 * Same glassmorphic vibe as the SettingsPanel buttons so it feels like part of
 * the same control surface.  We size it small (compact icon + label) because
 * the card is itself a tight overlay; a full-width button would dominate it.
 */
.focusButton {
  margin-left: 8px;
  padding: 2px 8px;
  border: 1px solid rgba(160, 200, 255, 0.25);
  border-radius: 4px;
  background: rgba(40, 60, 100, 0.35);
  color: #e8eeff;
  font: inherit;
  font-size: 10px;
  letter-spacing: 0.04em;
  cursor: pointer;
  text-transform: uppercase;
}

.focusButton:hover {
  background: rgba(60, 90, 140, 0.5);
  border-color: rgba(180, 220, 255, 0.4);
}

.focusButton:active {
  background: rgba(80, 120, 180, 0.55);
}
```

- [ ] **Step 2: Add `onFocus` to FullCardProps and render the button when pinned**

Edit `src/components/InfoCard/FullCard.tsx`.

(a) Update `FullCardProps`:

```ts
/** Props for FullCard. */
export type FullCardProps = {
  info: PointInfo;
  /** When true, show the PINNED badge and apply the pinned styling variant. */
  pinned?: boolean;
  /**
   * Optional callback fired when the user clicks the Focus button.
   *
   * Only rendered when `pinned` is true — the button only makes sense for the
   * persistent (selected) galaxy, not for the transient hover preview.  When
   * omitted, the button is not rendered.
   */
  onFocus?: (info: PointInfo) => void;
};
```

(b) Update the component signature and the title-row JSX:

```ts
export function FullCard({ info, pinned = false, onFocus }: FullCardProps): ReactNode {
  // Compose the outer class: always infoCardFull, plus pinned variant when needed.
  // CSS modules scope both classes so we just combine them with a space.
  const outerClass = pinned ? `${styles.infoCardFull} ${styles.pinned}` : styles.infoCardFull;

  return (
    <div className={outerClass} role="status" aria-live="polite">
      {/* ── Title row ─────────────────────────────────────────────────────── */}
      <div className={styles.cardTitle}>
        <span>Object</span>
        {/* The PINNED badge is always in the DOM; CSS shows/hides via .pinned */}
        <span className={styles.pinnedBadge}>Pinned</span>
        {/*
          Focus button — only rendered when the card is pinned AND a callback
          was supplied. We pass the full PointInfo so the parent can pull both
          the index (for telemetry) and the world coordinates (for the camera
          tween) without re-doing the lookup.
        */}
        {pinned && onFocus && (
          <button
            type="button"
            className={styles.focusButton}
            onClick={() => onFocus(info)}
            aria-label={`Focus camera on ${info.sdssName}`}
          >
            Focus
          </button>
        )}
      </div>
```

(Leave the rest of the JSX unchanged.)

- [ ] **Step 3: Forward `onFocus` through InfoCard**

Edit `src/components/InfoCard/InfoCard.tsx`.

(a) Update `InfoCardProps`:

```ts
export type InfoCardProps = {
  /** The point currently under the cursor, or null when the cursor is on empty sky. */
  hovered: PointInfo | null;
  /** The pinned/selected point, or null when nothing is pinned. */
  selected: PointInfo | null;
  /**
   * Optional callback fired when the user clicks "Focus" on the pinned card.
   * Forwarded to FullCard; ignored on the compact hover card.
   */
  onFocus?: (info: PointInfo) => void;
};
```

(b) Update the function signature and pass `onFocus` to both `FullCard` invocations:

```ts
export function InfoCard({ hovered, selected, onFocus }: InfoCardProps): ReactNode {
  // Nothing to show — stay entirely out of the DOM.
  if (!hovered && !selected) return null;

  // Stacked case (both hovered AND selected, different indices).
  if (hovered && selected && hovered.index !== selected.index) {
    return (
      <div className={`${styles.infoCardStack} infoCardStack`}>
        <FullCard info={selected} pinned={true} onFocus={onFocus} />
        <CompactCard info={hovered} />
      </div>
    );
  }

  // Single-card case.
  const info = hovered ?? selected!;
  const pinned = !hovered;
  return <FullCard info={info} pinned={pinned} onFocus={pinned ? onFocus : undefined} />;
}
```

- [ ] **Step 4: Wire from App.tsx**

Edit `src/App.tsx`. Update the `<InfoCard ... />` line in the render:

```tsx
      <InfoCard
        hovered={hovered}
        selected={selected}
        onFocus={(info) =>
          handleRef.current?.focusOn([
            // Recover the world-space xyz from the cloud's stored RA/Dec/distance
            // is unnecessary here — PointInfo doesn't carry x/y/z directly, but
            // the engine indexes the cloud internally.  We pass the info index
            // forward by computing the position from the cloud arrays *inside*
            // the engine.  The simplest API is to add a separate `focusOnIndex`
            // method, BUT we deliberately keep the spec's signature: a
            // [x, y, z] tuple in Mpc.  We extract xyz from the PointInfo's
            // distance + RA/Dec via raDecZToCartesian.
            ...raDecZToCartesianTuple(info),
          ])
        }
      />
```

Wait — `PointInfo` does NOT carry the raw `x, y, z`. We have two reasonable options. Pick option A for this plan:

  - **Option A (chosen here):** add `x, y, z` to `PointInfo` and populate them in `buildPointInfo`. This is the smallest change and keeps the engine's `focusOn` signature pure-data (no index lookup).

Replace the JSX above with the simpler (final) form, and instead extend `PointInfo`:

```tsx
      <InfoCard
        hovered={hovered}
        selected={selected}
        onFocus={(info) => handleRef.current?.focusOn([info.x, info.y, info.z])}
      />
```

Now apply the `PointInfo` extension below in Step 5.

- [ ] **Step 5: Extend PointInfo with raw xyz and populate it**

Edit `src/@types/PointInfo.d.ts`. Add a new section just after the `objID` field:

```ts
  /** @group World-space position */

  /**
   * World-space X coordinate in Mpc.  Same value as `cloud.positions[idx*3+0]`.
   * Carried on `PointInfo` so consumers like the camera-focus button can pivot
   * the orbit camera onto this galaxy without re-deriving xyz from RA/Dec.
   */
  x: number;
  /** World-space Y coordinate in Mpc. */
  y: number;
  /** World-space Z coordinate in Mpc. */
  z: number;
```

Edit `src/engine.ts`'s `buildPointInfo` function. Inside the returned object literal (just after `objID: cloud.objIDs[idx]!,`), add:

```ts
    // World-space coordinates — copied so React side has them for camera focus.
    x: px,
    y: py,
    z: pz,
```

- [ ] **Step 6: Typecheck and run tests**

Run: `npm run typecheck && npm test`
Expected: clean typecheck; all tests pass (existing PointInfo tests don't assert on its shape, so adding fields is safe).

- [ ] **Step 7: Commit**

```bash
git add src/components/InfoCard/FullCard.tsx src/components/InfoCard/InfoCard.tsx src/components/InfoCard/FullCard.module.css src/@types/PointInfo.d.ts src/engine.ts src/App.tsx
git commit -m "feat: add Focus button to pinned InfoCard and xyz to PointInfo"
```

---

## Task 7: HomeButton component

**Files:**

- Create: `src/components/HomeButton/HomeButton.tsx`
- Create: `src/components/HomeButton/HomeButton.module.css`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the HomeButton CSS**

Create `src/components/HomeButton/HomeButton.module.css`:

```css
/*
 * HomeButton.module.css — small glass button that returns the camera home.
 *
 * Positioned to the RIGHT of the SettingsPanel (which sits at left:16px,
 * bottom:16px and is ~200px wide).  We anchor at left:232px so the home
 * button has a 16px gap from the panel's right edge.
 */

.homeButton {
  position: fixed;
  bottom: 16px;
  left: 232px; /* SettingsPanel left:16 + min-width:200 + gap:16 */
  z-index: 10;

  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;

  background: rgba(8, 12, 28, 0.65);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(160, 200, 255, 0.16);
  border-radius: 8px;

  color: #cfd8ff;
  cursor: pointer;
  padding: 0;
}

.homeButton:hover {
  background: rgba(40, 60, 100, 0.75);
  border-color: rgba(180, 220, 255, 0.4);
}

.homeButton:active {
  background: rgba(80, 120, 180, 0.55);
}

.homeIcon {
  width: 18px;
  height: 18px;
  display: block;
}
```

- [ ] **Step 2: Create the HomeButton component**

Create `src/components/HomeButton/HomeButton.tsx`:

```tsx
/**
 * HomeButton — a small glass button that pivots the camera back to its
 * initial framing (target=origin, default distance/yaw/pitch).
 *
 * Positioned bottom-left next to the SettingsPanel, so the two "world
 * controls" sit side-by-side without overlapping the InfoCard (top-right)
 * or the StatusBar (top-left).
 *
 * The button is purely presentational — it just fires `props.onClick`.
 * App.tsx wires the click to `handleRef.current?.focusOnHome()`.
 *
 * ### Why an inline SVG icon?
 *
 * Inline SVG keeps the asset in the bundle (no extra HTTP request), inherits
 * `currentColor` for theming, and scales crisply at any DPI.  The shape is
 * the standard "house" glyph — instantly recognisable at 18×18 px.
 */

import type { ReactNode } from 'react';
import styles from './HomeButton.module.css';

type Props = {
  /** Fired when the user clicks the home glyph. */
  onClick: () => void;
};

export function HomeButton({ onClick }: Props): ReactNode {
  return (
    <button
      type="button"
      className={styles.homeButton}
      onClick={onClick}
      aria-label="Return camera to home view"
      title="Return to home (h)"
    >
      {/*
        Standard house glyph.  Stroke-only so it inherits currentColor and
        renders well on the dark glass background.  viewBox 0 0 24 24 is the
        de-facto icon-grid size; width/height come from the CSS class so the
        SVG is independent of the base font size.
      */}
      <svg
        className={styles.homeIcon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Roof + walls */}
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10.5V20h14V10.5" />
        {/* Door */}
        <path d="M10 20v-5h4v5" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 3: Render HomeButton from App.tsx**

Edit `src/App.tsx`.

(a) Add the import next to the other component imports:

```ts
import { HomeButton } from './components/HomeButton/HomeButton';
```

(b) Add the `<HomeButton ... />` line right after `<SettingsPanel ... />` in the render output:

```tsx
      <HomeButton onClick={() => handleRef.current?.focusOnHome()} />
```

- [ ] **Step 4: Smoke test in the dev server**

`npm run dev` should already be running (per the user's working-style note).  Open the page in the browser, click a galaxy to pin it, click Focus on the InfoCard — camera should glide to the galaxy.  Click the home button — camera glides back.

- [ ] **Step 5: Commit**

```bash
git add src/components/HomeButton/HomeButton.tsx src/components/HomeButton/HomeButton.module.css src/App.tsx
git commit -m "feat: add HomeButton to return the camera to its initial framing"
```

---

## Task 8: Keyboard shortcuts (`f` and `h`)

**Files:**

- Modify: `src/App.tsx`

- [ ] **Step 1: Extend the existing keydown effect**

Edit `src/App.tsx`. Replace the existing Esc-only `useEffect` body with a multi-key handler that also handles `f` (focus selected) and `h` (home).  Find:

```ts
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // `?.` safe-calls: no-op if the engine hasn't started yet or was destroyed.
        handleRef.current?.clearSelection();
      }
    };
```

Replace it with:

```ts
    const onKeyDown = (e: KeyboardEvent) => {
      // ── Ignore keystrokes typed into form fields ──────────────────────────
      //
      // If the user is editing an <input> or <textarea>, we shouldn't hijack
      // their `f` and `h` keystrokes.  `e.target` could be any Element, so we
      // narrow with a tag check before reading its name.  This guards against
      // future text inputs (search box, label rename, etc.).
      const target = e.target as Element | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (target as HTMLElement)?.isContentEditable) {
        return;
      }

      // ── Esc: clear pinned selection ──────────────────────────────────────
      if (e.key === 'Escape') {
        // `?.` safe-calls: no-op if the engine hasn't started yet or was destroyed.
        handleRef.current?.clearSelection();
        return;
      }

      // ── f: focus on currently-selected galaxy (no-op if nothing pinned) ──
      //
      // We read `selected` from React state via a ref-style closure: the
      // listener captures the current `selected` because this effect re-runs
      // when `selected` changes (see the dependency array below).  Without
      // that re-run we would close over the initial `null` value forever.
      if (e.key === 'f' || e.key === 'F') {
        if (selected) {
          handleRef.current?.focusOn([selected.x, selected.y, selected.z]);
        }
        return;
      }

      // ── h: return to the home / Earth view ────────────────────────────────
      if (e.key === 'h' || e.key === 'H') {
        handleRef.current?.focusOnHome();
        return;
      }
    };
```

(b) Update the dependency array on this `useEffect` from `[]` to `[selected]` so the closure picks up the latest selection:

```ts
  }, [selected]); // re-bind when the pinned point changes so `f` reads the latest.
```

- [ ] **Step 2: Smoke test in the dev server**

In the running app: click a galaxy to pin it, press `f` → camera focuses on it; press `h` → camera returns home.  Make sure the SettingsPanel's slider focus doesn't accidentally trigger keystrokes (test by clicking into a slider and typing).

- [ ] **Step 3: Run all tests one more time**

Run: `npm test && npm run typecheck`
Expected: green on both.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add f/h keyboard shortcuts for camera focus and home"
```

---

## Task 9: README note

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Read the existing keyboard / controls section**

Run: `grep -n -i 'keyboard\|escape\|controls\|shortcut' README.md` to locate the relevant section.

- [ ] **Step 2: Add a Camera Focus paragraph**

Append (or merge into the existing controls section) the following block in `README.md`:

```markdown
### Camera focus

- **Focus button** on a pinned galaxy's InfoCard pivots the camera onto that
  galaxy with a 600 ms ease-out tween.  Yaw and pitch are preserved so you
  don't lose your orientation.
- **Home button** (bottom-left, next to the Settings panel) returns the camera
  to its initial framing — origin target, default distance and pitch.
- **Keyboard shortcuts:**
  - `f` — focus on the currently-pinned galaxy (no-op if nothing is pinned).
  - `h` — return to the home / Earth view.
  - `Esc` — clear the pinned selection (existing behaviour).

Tweens are interrupted by mouse-drag or wheel — manual orbit controls always
take precedence over an in-progress focus.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document focus and home camera controls"
```

---

## Self-Review

**Spec coverage check:**

- "Focus button on pinned InfoCard" — Task 6 (FullCard.tsx) renders the button when pinned, wires the callback through InfoCard, and into App.tsx via `focusOn`.
- "Distance tweens to ~8-15 Mpc, or 4× galaxy diameter — use 30 kpc constant for now" — Task 5 defines `FOCUS_GALAXY_DIAMETER_KPC = 30` and `focusDistanceMpc()` that returns 4 × 30 / 1000 = 0.12 Mpc.  *Spec ambiguity:* the spec says "~8-15 Mpc OR 4× a 30 kpc galaxy diameter", but those don't agree — 4 × 30 kpc = 0.12 Mpc, two orders of magnitude below 8 Mpc.  We honour the explicit "4× galaxy diameter, 30 kpc constant" instruction; the 8-15 Mpc range presumably referred to a different galaxy size.  The constant is named so a future task can swap in a real diameter helper without changing the formula.
- "Yaw/pitch unchanged" — Task 5's `focusOn` sets `toYaw = cam.yaw`, `toPitch = cam.pitch`.
- "Home button bottom-left near SettingsPanel" — Task 7 positions at `left:232px` (right of the panel).
- "Keyboard `h` for home, `f` for focus on currently-selected" — Task 8.
- "Tween: 0.6 s, easeOutCubic, vec3 lerp / scalar lerp / shortest-arc yaw, single in-flight" — Tasks 1-5.
- "Pure tween helpers extracted with unit tests, one function per file" — Tasks 1, 2, 3, 4.
- "No backwards compatibility shims; EngineHandle gets two additive methods" — Task 5.
- Edge case: focusOn mid-tween cancels prev — Task 5 step 2(f) overwrites `currentTween`, no queueing.
- Edge case: mouse-drag during tween cancels — Task 5 step 2(d) clears `currentTween` on `pointerdown`.
- Edge case: focus on origin — `focusDistanceMpc()` is independent of position; the tween simply tweens to (0,0,0) and a tiny distance.  No div-by-zero anywhere because we never normalise.
- Edge case: home while at home — Task 5's `focusOnHome` doesn't short-circuit; it just produces a 600ms no-op tween, which is acceptable per the spec.

**Placeholder scan:** Searched for "TBD", "TODO", "implement appropriately", "fill in", "similar to". None present in step bodies.  Where a step references "find the existing line X and replace…" the surrounding context is shown so the engineer can match it unambiguously.

**Type consistency:**

- `EngineHandle.focusOn(worldXYZ: [number, number, number])` declared in Task 5 step 1 matches the App.tsx call in Task 6 step 4 (`handleRef.current?.focusOn([info.x, info.y, info.z])`) and the `App.tsx` keyboard call in Task 8 step 1.
- `CameraTween` declared in Task 4 used identically in Task 5 step 2.
- `PointInfo.x/y/z` declared in Task 6 step 5, populated in `buildPointInfo`, consumed in App.tsx focus callbacks (Tasks 6, 8).
- `FullCardProps.onFocus(info: PointInfo) => void` declared in Task 6 step 2(a), invoked in step 2(b) `onClick={() => onFocus(info)}`, forwarded through `InfoCard` in step 3.

**Spec ambiguities surfaced (also noted in agent report):**

1. The "~8-15 Mpc" clause in the focus distance spec contradicts the "4× × 30 kpc" formula by a factor of ~80×.  Plan honours the explicit formula path (the spec calls the 8-15 Mpc bit "or", and the formula is more concrete); future per-galaxy diameter work can revisit.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-03-camera-focus.md`.  Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
