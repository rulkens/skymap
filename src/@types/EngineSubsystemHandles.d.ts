/**
 * EngineSubsystemHandles — the long-lived owned-helpers sub-bag of the
 * canonical `EngineState`.
 *
 * ### What's a subsystem here?
 *
 * "Subsystem" is the project's term for a self-contained facade that
 * owns its own internal mutable state and exposes a small imperative
 * API (`runFrame`, `apply`, `connect`, etc.) that the engine drives
 * once per relevant event.  The thumbnail pipeline, SpaceMouse input,
 * camera tweens, click resolution, input bindings, and render
 * scheduling are each one — each one was originally a 100+ line block
 * inside `engine.ts` that got extracted during Phases 1–3 of the
 * refactor.
 *
 * ### Why some fields are null at construction
 *
 * Two construction phases:
 *
 *   - Up-front (before the async GPU IIFE runs): `spaceMouse`, `tweens`,
 *     `scheduler`.  None of these need a GPU device — their callbacks
 *     queue work that the scheduler will pick up once the IIFE finishes.
 *   - Lazy (inside the IIFE): `thumbnails` (needs the GPU device + the
 *     QuadRenderer / DiskRenderer pair), `clickResolver` (needs the
 *     pick renderer), `inputBindings` (needs the scheduler so it can
 *     wake the loop on input).  These start as null.
 *
 * The mixed nullability here matches the GPU handles bag — see
 * `EngineGpuHandles.d.ts` for the same rationale (consumer null-checks
 * stay honest, destroy() can null them back out symmetrically).
 *
 * ### Why a separate type
 *
 * Same as the other state sub-bags: lets per-frame helpers (`renderFrame`,
 * the click handler) accept exactly the subsystem slice they touch
 * rather than the whole engine state.
 */

import type { ThumbnailSubsystem } from '../services/engine/subsystems/thumbnailSubsystem';
import type { SpaceMouseSubsystem } from '../services/engine/subsystems/spaceMouseSubsystem';
import type { SelectionSubsystem } from '../services/engine/subsystems/selectionSubsystem';
import type { BiasCorrectionSubsystem } from '../services/engine/subsystems/biasCorrectionSubsystem';
import type { TweenManager } from '../services/engine/camera/tweenManager';
import type { ClickResolver } from '../services/engine/interaction/clickHandler';
import type { InputBindings } from '../services/engine/interaction/inputBindings';
import type { RenderScheduler } from '../services/engine/subsystems/renderScheduler';
import type { LoadProgressEmitter } from '../services/engine/subsystems/loadProgressAggregator';

export type EngineSubsystemHandles = {
  thumbnails: ThumbnailSubsystem | null;
  spaceMouse: SpaceMouseSubsystem;
  tweens: TweenManager;
  clickResolver: ClickResolver | null;
  inputBindings: InputBindings | null;
  scheduler: RenderScheduler;
  /**
   * Hover/select state façade — owns the user-facing `(source, localIdx)`
   * selection pair and fans out `cb.onHoverChange` /
   * `cb.onSelectChange` only on actual change.  Constructed eagerly in
   * the state literal alongside `tweens` and `scheduler` (no GPU
   * dependency), so it's non-null from t=0.  See
   * `selectionSubsystem.ts`'s module header for why state moved off
   * `EnginePickingState` and onto this subsystem (single source of
   * truth, callback fan-out lives in one place).
   */
  selection: SelectionSubsystem;
  /**
   * Malmquist-bias correction subsystem (Spec E phase E.3).
   *
   * Owns the bias-mode flags, cached per-source ratios/weights, and the
   * async bake state machine — extracted from `PointRenderer` so the
   * renderer can shrink to a clean instanced-billboard drawer.
   * Constructed eagerly in the engine state literal alongside `selection`
   * / `tweens` / `scheduler` (no GPU dependency); the renderer is wired
   * in during `phases/initGpu.ts` via `attachRenderer(...)`.
   *
   * Phase E.3 wires the subsystem and tests it standalone.  Phase E.4
   * (DEFERRED — pending visual smoke test) cuts over `handle.setBiasMode`
   * to call into this subsystem.  Until then the subsystem is wired
   * and idle from the public-handle's POV.
   */
  biasCorrection: BiasCorrectionSubsystem;
  /**
   * Per-engine download-progress emitter — instantiated inside the
   * GPU init IIFE (so `cb.onLoadProgress` and the slot registry are in
   * scope at construction time).  Subscribes to every slot's state
   * transitions and recomputes the aggregate snapshot from
   * `aggregateRegistry` on every change, so the loading-bar UI sees
   * the same view of "what's still loading" as the dev panel.  Null
   * until the GPU init runs.
   */
  loadProgress: LoadProgressEmitter | null;
};
