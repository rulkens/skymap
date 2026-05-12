/**
 * spaceMouseSubsystem — owns the entire 6DOF puck input pipeline.
 *
 * Before this module existed, the engine kept four closure variables
 * for SpaceMouse state:
 *
 *   - `spaceMouseInput`        — lazily-allocated `SpaceMouseInput`
 *   - `latestSpaceMouseAxes`   — last decoded report (mutated by HID)
 *   - `lastSpaceMouseFrameMs`  — wall-clock delta tracker
 *   - `spaceMouseSensitivity`  — user-facing scalar
 *
 * …plus a per-frame block inside `frame()` that ran `applyAxesToCamera`,
 * cancelled the running tween if any axis was non-zero, and reset the
 * dt baseline whenever the puck went back to rest.  The SettingsPanel
 * setters in the public handle also poked directly at these closure
 * variables.  Six call sites for one cohesive responsibility.
 *
 * Pulling all of that into a single subsystem mirrors the pattern
 * already established by `thumbnailSubsystem.ts`: a factory returning
 * a typed handle, internal state in closure, explicit per-frame
 * `applyToCamera()` seam.
 *
 * ### Critical: the subsystem does NOT own the tween reference
 *
 * The Phase 2a subagent flagged this as the trickiest piece of the
 * SpaceMouse extraction.  The old per-frame block did `currentTween =
 * null` whenever an axis was deflected — but the tween reference was
 * an engine concern (the manager that owns it lives in
 * `tweenManager.ts`).  Coupling the SpaceMouse code to a closure
 * variable from a sibling subsystem would have re-introduced exactly
 * the kind of cross-cutting knot Phase 2 is unpicking.
 *
 * Solution: the subsystem accepts a `cancelTween` callback at
 * construction.  When `applyToCamera()` sees non-zero axes it calls
 * the callback before mutating `cam`.  The engine wires this to
 * `tweens.cancel()`.  The coupling is now explicit, single-purpose,
 * and trivially mockable in unit tests.
 *
 * ### onAxes wake vs. applyToCamera wake
 *
 * Two distinct render-on-demand wake-ups in the SpaceMouse path:
 *
 *   1. `onAxes` — fires from the WebHID `inputreport` listener,
 *      *outside* the rAF loop.  We must wake the loop here so the
 *      next frame body sees the new axes.  The subsystem calls the
 *      engine's `onAxes` callback (which forwards to
 *      `scheduler.requestRender()`).
 *
 *   2. `applyToCamera()` — runs *inside* `frame()`, so it does NOT
 *      need to wake the scheduler itself.  The still-animating
 *      predicate at the bottom of `frame()` calls `hasAxes()` and
 *      keeps the loop ticking on its own.
 *
 * ### dt clamp + reset semantics
 *
 * Same behaviour as the pre-extraction inline block:
 *
 *   - dt is computed against the previous SpaceMouse-active frame
 *     (not the previous render frame), so a long stretch of zero
 *     input doesn't produce a giant catch-up jump on the first frame
 *     the user touches the puck again.
 *   - dt is clamped to ≤ 50 ms so a tab-foreground regain after
 *     long sleep doesn't produce a multi-second jump.
 *   - the dt baseline is reset to `null` whenever `applyToCamera()`
 *     is called with all-zero axes, so the next deflection starts
 *     a fresh dt instead of integrating against a stale timestamp.
 *
 * ### Lazy SpaceMouseInput allocation
 *
 * The `SpaceMouseInput` constructor does a `navigator.hid.getDevices()`
 * call (silent re-acquire of paired devices).  Browsers without WebHID
 * tolerate it (the class has its own feature check), but allocating a
 * SpaceMouseInput unconditionally would still cost a constructor call
 * every time the engine starts on those browsers.  We keep the lazy
 * pattern: the puck object is only built on the first `connect()`
 * call.  Once built, it stays — `disconnect()` releases the device
 * but keeps the wrapper for the next reconnect.
 */

import type { Destroyable } from '../../../@types';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import { SpaceMouseInput } from '../../input/spaceMouse';
import { applyCurve } from '../../input/spaceMouseSensitivity';
import { applyAxesToCamera, hasAnyAxis } from '../../input/spaceMouseToCamera';
import type { SpaceMouseAxes } from '../../input/spaceMouseAxes';
import { ZERO_AXES } from '../../input/spaceMouseAxes';
import { updatePosition } from '../../camera/orbitCamera';
import { DEFAULT_SPACE_MOUSE_SENSITIVITY } from '../../../data/defaults';

/**
 * Hard ceiling on the per-frame wall-clock dt fed into the camera
 * application.  ~3 frames at 60 Hz — long enough to feel snappy after
 * a brief stutter, short enough that a tab-foreground regain after a
 * minute of sleep doesn't slam the camera across the universe.
 */
const MAX_DT_MS = 50;

/**
 * Default first-frame dt when no previous timestamp exists.  16 ms is
 * a reasonable 60 Hz approximation; the second frame onwards will use
 * the real measured delta.
 */
const FIRST_FRAME_DT_MS = 16;

export type SpaceMouseSubsystem = {
  /**
   * Open the device-picker UI and open the selected device.  Forwards
   * directly to `SpaceMouseInput.connect()`.  Returns `{ ok: true }`
   * on success, `{ ok: false }` on user-cancelled or browser-unsupported.
   */
  connect(): Promise<{ ok: boolean }>;
  /** Release the device and wipe the cached axes.  Idempotent. */
  disconnect(): void;
  /** True when a HIDDevice is currently open. */
  isConnected(): boolean;
  /** Update the user-facing sensitivity scalar (applied AFTER the cube curve). */
  setSensitivity(value: number): void;
  /**
   * Fast predicate for the still-animating gate — returns true iff any
   * axis in the latest report is non-zero.  Runs once per frame.
   */
  hasAxes(): boolean;
  /**
   * Apply the latest axes to `cam`, scaled by elapsed wall-clock time.
   * No-op (resets the dt baseline) when all axes are zero.  Calls the
   * engine-supplied `cancelTween` callback before mutating `cam` so
   * the focus tween yields to user input — same precedence rule as
   * mouse drag.
   */
  applyToCamera(cam: OrbitCamera, nowMs: number): void;
  /** Tear-down: release the device.  Called from engine.destroy(). */
  destroy(): void;
};

/**
 * Minimal interface the subsystem needs from a SpaceMouseInput.
 * Production passes the real `SpaceMouseInput` class; tests pass a
 * stub that lets them invoke `onAxes` / `onConnectionChange`
 * synchronously without touching WebHID.
 */
export type SpaceMouseInputLike = {
  connect(): Promise<boolean>;
  disconnect(): void;
  isConnected(): boolean;
};

export type SpaceMouseInputCtorOptions = {
  onAxes: (axes: SpaceMouseAxes) => void;
  onConnectionChange?: (connected: boolean, productName: string | null) => void;
};

export type SpaceMouseInputFactory = (options: SpaceMouseInputCtorOptions) => SpaceMouseInputLike;

export type CreateSpaceMouseSubsystemInput = {
  /**
   * Tween-cancel hook.  Called from `applyToCamera()` whenever the
   * puck is deflected.  Engine wires this to `tweens.cancel()`.
   */
  cancelTween: () => void;
  /**
   * Connection-change hook.  Forwarded from the underlying
   * SpaceMouseInput's onConnectionChange.  Engine wires this to the
   * `onSpaceMouseConnectedChange` UI callback so React's "Connected"
   * indicator drops back to false when the puck is unplugged.
   */
  onConnectionChange: (connected: boolean) => void;
  /**
   * Render-on-demand wake-up.  Called from the WebHID inputreport
   * listener (outside the rAF loop) so the next frame sees the new
   * axes.  Engine wires this to `scheduler.requestRender()`.
   */
  onAxes: () => void;
  /**
   * Optional factory override.  Production omits this and we use the
   * real `SpaceMouseInput` class; tests pass a stub factory so they
   * can drive `onAxes` / `onConnectionChange` directly.
   */
  inputFactory?: SpaceMouseInputFactory;
};

export function createSpaceMouseSubsystem(
  input: CreateSpaceMouseSubsystemInput,
): SpaceMouseSubsystem {
  const { cancelTween, onConnectionChange, onAxes } = input;
  const factory: SpaceMouseInputFactory =
    input.inputFactory ?? ((options) => new SpaceMouseInput(options));

  // Lazily allocated on first connect().  Holding off on the
  // SpaceMouseInput construction means the WebHID API is never touched
  // on browsers that don't support it (the wrapper class also has its
  // own feature check, but skipping the constructor entirely is cheaper
  // and keeps the call graph narrower).
  let spaceMouseInput: SpaceMouseInputLike | null = null;

  // Most recent decoded HID report.  Mutated by the inputreport
  // listener on every successful decode; read once per frame by
  // `hasAxes()` and `applyToCamera()`.
  let latestAxes: SpaceMouseAxes = { ...ZERO_AXES };

  // dt-baseline timestamp.  null when the puck is at rest — see the
  // module-header rationale on why null-resetting on rest matters.
  let lastFrameMs: number | null = null;

  // User-facing sensitivity scalar (DEFAULT_SPACE_MOUSE_SENSITIVITY by
  // default).  Multiplied AFTER the cube curve so the curve shape stays
  // identical regardless of the user's preferred speed.
  let sensitivity = DEFAULT_SPACE_MOUSE_SENSITIVITY;

  function ensureInput(): SpaceMouseInputLike {
    if (spaceMouseInput !== null) return spaceMouseInput;
    spaceMouseInput = factory({
      onAxes: (axes) => {
        // Stash the latest reading; the per-frame applyToCamera will
        // pick it up.  We don't apply axes here because that would
        // tie the camera-update rate to the device's report rate
        // (which can exceed display refresh) instead of the rAF loop.
        latestAxes = axes;
        // Wake one frame so the new axes land on the next tick.  If
        // the puck is held deflected the still-animating predicate
        // will keep the loop ticking; when the user releases it the
        // predicate flips false on the next frame and the loop
        // sleeps.  The scheduler coalesces multiple HID reports per
        // frame into one rAF.
        onAxes();
      },
      onConnectionChange: (connected) => {
        onConnectionChange(connected);
        // Wipe the cached axes on disconnect so the per-frame loop
        // stops applying the last reading received before we lost
        // the device.
        if (!connected) latestAxes = { ...ZERO_AXES };
      },
    });
    return spaceMouseInput;
  }

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the SpaceMouse subsystem is one
  // of the engine's ~13 teardown targets, and the shared shape lets
  // engine.destroy() iterate uniformly across the bag.
  const subsystem: SpaceMouseSubsystem = {
    async connect(): Promise<{ ok: boolean }> {
      const sm = ensureInput();
      const ok = await sm.connect();
      return { ok };
    },
    disconnect(): void {
      spaceMouseInput?.disconnect();
      // Reset cached axes so the next frame doesn't continue applying
      // the last reading received before disconnect.
      latestAxes = { ...ZERO_AXES };
    },
    isConnected(): boolean {
      return spaceMouseInput?.isConnected() ?? false;
    },
    setSensitivity(value: number): void {
      sensitivity = value;
    },
    hasAxes(): boolean {
      return hasAnyAxis(latestAxes);
    },
    applyToCamera(cam: OrbitCamera, nowMs: number): void {
      if (!hasAnyAxis(latestAxes)) {
        // Reset the dt baseline whenever the puck is at rest, so when
        // the user re-grabs it we start a fresh dt instead of
        // integrating against a stale timestamp.
        lastFrameMs = null;
        return;
      }
      const dt =
        lastFrameMs === null ? FIRST_FRAME_DT_MS : Math.min(nowMs - lastFrameMs, MAX_DT_MS);
      lastFrameMs = nowMs;

      // Yield to user input — same precedence rule as mouse drag.
      // The callback no-ops when no tween is running.
      cancelTween();

      const shaped = applyCurve(latestAxes, sensitivity);
      applyAxesToCamera(cam, shaped, dt);
      updatePosition(cam);
    },
    destroy(): void {
      spaceMouseInput?.disconnect();
      // We don't null out spaceMouseInput because `disconnect` already
      // released the underlying device; keeping the wrapper reference
      // costs ~zero and avoids a "destroyed" guard on the methods.
      latestAxes = { ...ZERO_AXES };
      lastFrameMs = null;
    },
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
