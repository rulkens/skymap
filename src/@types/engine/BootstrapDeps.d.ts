import type { EngineCallbacks } from './EngineCallbacks';
import type { EngineHandle } from './EngineHandle';
import type { AssetSlot } from '../loading/AssetSlot';
import type { FpsCounter } from './subsystems/FpsCounter';
import type { PhaseLocals } from './PhaseLocals';

/**
 * Closure captures the bootstrap phases rely on.  Every entry was a
 * free reference in the original `engine.ts` IIFE; the survey done in
 * Phase 5 Task 5.1 enumerated each one and confirmed read-only vs.
 * mutated.  Mutated bindings (`frame`, `detachControls`, `handle`) are
 * boxed as `{current}` refs so writes round-trip back into createEngine's
 * outer scope across the module boundary.
 */
export type BootstrapDeps = {
  /** createEngine arg — for resize, viewport reads, listener attach. */
  canvas: HTMLCanvasElement;
  /** createEngine arg — UI-callback sink. */
  cb: EngineCallbacks;

  /**
   * Mutable: forward-declared `frame` binding from `engine.ts`.  The
   * scheduler in `state.subsystems.scheduler` was wired with
   * `onFrame: () => frameRef.current()` so this assignment in
   * `startLoop` makes every subsequent rAF tick run the real body.
   * Boxed as `{current}` so the write round-trips back across the
   * module boundary — see Phase 3's `lastReportedFps` for the same
   * pattern.
   */
  frameRef: { current: () => void };

  /**
   * Mutable: orbit-controls detach handle.  `wireInput` writes the
   * detach function returned by `attachOrbitControls`; `engine.ts`'s
   * `destroy()` reads `detachControlsRef.current?.()` to remove the
   * listeners.  Boxed for the same write-across-modules reason as
   * `frameRef`.
   */
  detachControlsRef: { current: (() => void) | null };

  /**
   * Mutable: the public `EngineHandle`.  The handle literal is
   * evaluated AFTER the bootstrap IIFE in `engine.ts` (it captures
   * helpers that close over `state`), but `wireInput`'s onDoubleClick
   * handler calls `handle.focusOn(lastClickedInfo)` for galaxies and
   * `handle.focusOn(lastClickedPoi)` for POIs (the unified `focusOn`
   * method accepts the full `FocusableTarget` — both `GalaxyInfo` and
   * `StructureRecord`).  We thread the
   * reference through a `{current}` ref so engine.ts can assign it
   * after the handle literal evaluates — by the time the user can
   * actually double-click, the handle is fully wired.  Null until
   * engine.ts sets it.
   */
  handleRef: { current: EngineHandle | null };

  /**
   * Flat slot registry, keyed by `slot.name`.  `wireSlots` populates
   * it as each slot is minted; the public handle exposes the same
   * Map as `assetSlots` for the `LoadingDevPanel` debug component.
   * Same instance is also handed to `createLoadProgressEmitter` so
   * the loading bar and the dev panel agree byte-for-byte on what's
   * "in flight".  See engine.ts's outer-scope declaration for the
   * full lifecycle rationale.
   */
  allSlots: Map<string, AssetSlot<unknown, unknown>>;

  /** Rolling 60-frame counter; threaded through to `startLoop`'s `RunFrameDeps`. */
  fpsCounter: FpsCounter;

  /**
   * Mutable: last integer fps value reported via `cb.onFpsChange`.
   * Threaded through to `startLoop`'s `RunFrameDeps` (the frame body
   * reads + writes it).  Boxed as `{current}` — see Phase 3.
   */
  lastReportedFps: { current: number | null };

  /**
   * Phase-local carrier for IIFE-scoped device/context handles that
   * survive past `initGpu` but don't belong on `EngineState`.  Written
   * by `initGpu`; read by `wireSlots`, `wireInput`, and `startLoop`.
   * Undefined until `initGpu` runs; the type asserts non-null at the
   * read sites since the orchestrator's order guarantees `initGpu` has
   * completed by then.  See `initGpu.ts`'s `PhaseLocals` for the
   * contents and the rationale on not promoting these to
   * `EngineState`.
   */
  phaseLocals?: PhaseLocals;
};
