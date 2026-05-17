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
 *   - Lazy (inside the IIFE): `galaxyAtlas` / `proceduralDisks` /
 *     `texturedImpostors` (need the GPU device + the
 *     TexturedQuadRenderer / TexturedDiskRenderer pair), `clickResolver`
 *     (needs the pick renderer), `inputBindings` (needs the scheduler so
 *     it can wake the loop on input).  These start as null.
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
import type { FadeRegistry } from '../../animation/FadeRegistry';
import type { LoadProgressEmitter } from '../../loading/LoadProgressEmitter';
import type { Destroyable } from '../../rendering/Destroyable';

export type EngineSubsystemHandles = {
  galaxyAtlas: GalaxyAtlasSubsystem | null;
  proceduralDisks: ProceduralDiskSubsystem | null;
  texturedImpostors: TexturedImpostorSubsystem | null;
  spaceMouse: SpaceMouseSubsystem;
  tweens: TweenManager;
  clickResolver: ClickResolver | null;
  inputBindings: InputBindings | null;
  scheduler: RenderScheduler;
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
   * Phase E.3 wired the subsystem (idle); phase E.4 cut
   * `handle.setBiasMode` over to call `setMode` on this subsystem and
   * deleted the renderer's old bias-mode methods.  Production now
   * routes the user's mode toggles through here.
   */
  biasCorrection: BiasCorrectionSubsystem;
  /**
   * "YOU ARE HERE" Milky Way marker subsystem (Task R4).
   *
   * Owns the camera-distance → fade-alpha transition state and drives
   * `labelRenderer.setLabels` / `markerLineRenderer.setLines` only when
   * alpha changes.  Constructed eagerly in the engine state literal (no
   * GPU dep); the two renderers are wired during `phases/initGpu.ts` via
   * `attachRenderers(...)` after the `loadFontAtlas()` fetch completes.
   *
   * Non-null from t=0 — the subsystem's `runFrame` internally null-checks
   * the renderers, so calling it before `attachRenderers` is safe.
   *
   * Post-Task-6: youAreHere is now a `LabelProducer`; renderer ownership
   * (and the per-frame setLabels/setLines flush) has moved to
   * `labelDirector`, which polls every registered producer.
   */
  youAreHere: YouAreHereSubsystem;
  /**
   * Label director — owns `labelRenderer.setLabels` / `markerLineRenderer
   * .setLines`, polls every registered `LabelProducer` each frame, merges
   * outputs, and flushes once.  Replaces the previous direct-call pattern
   * (youAreHere called the renderers itself) so multiple overlays
   * (you-are-here pin, cluster POIs, future galaxy/void labels) coexist
   * without stomping each other's full-set replacements.
   *
   * Constructed eagerly in the engine state literal; the two renderers
   * are wired in during `phases/initGpu.ts` via `attachRenderers(...)`
   * once the font-atlas fetch completes.  Producers are registered right
   * after the state literal so they're in place before the first frame.
   */
  labelDirector: LabelDirectorSubsystem;
  /**
   * Points-of-interest subsystem — typed list of named anchors (clusters,
   * famous galaxies, voids) rendered as text labels with optional
   * crosshairs.  Implements `LabelProducer`; registered with
   * `labelDirector`.  Populated by various sources: the `?anchors=1` URL
   * flag pushes the six cluster anchors at startup; future code may add
   * runtime entries from user clicks or palette searches.
   *
   * Constructed eagerly; no GPU dependency.  Empty until something calls
   * `setPois`.
   */
  pois: PoiSubsystem;
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

/**
 * Compile-time guard: every subsystem field MUST satisfy `Destroyable`.
 *
 * This is an unused type alias — its only job is to fail tsc if a future
 * subsystem is added to `EngineSubsystemHandles` without a `destroy()`
 * method.  The mapped type strips `| null` from each field via
 * `NonNullable<...>` (nullable fields are fine — the engine null-checks
 * before calling destroy), then requires every non-null field to be
 * assignable to `Destroyable`.  If any field is missing `destroy()`,
 * the conditional resolves to `never` for that key, surfacing as a
 * compile error here rather than as a silent leak at runtime when
 * `engine.destroy()` walks the bag uniformly.
 */
type _EnforceDestroyable = {
  [K in keyof EngineSubsystemHandles]:
    NonNullable<EngineSubsystemHandles[K]> extends Destroyable ? true : never;
};
