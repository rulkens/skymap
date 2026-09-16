/**
 * EngineSubsystemHandles — long-lived owned-helpers sub-bag of `EngineState`.
 *
 * A "subsystem" is a self-contained facade owning its own mutable state
 * and exposing a small imperative API (`runFrame`, `apply`, `connect`,
 * etc.) that the engine drives once per relevant event.
 *
 * ### Why some fields are null at construction
 *
 *   - Eager (no GPU dep): `scheduler`, `fades`, `assetQueue` — constructed up-front
 *     so their callbacks can be captured before the GPU IIFE finishes.
 *   - Lazy (inside the GPU init IIFE): `earthTiles`, `clickResolver`,
 *     `inputBindings`.
 *
 * The mixed nullability matches `EngineGpuHandles.d.ts` so consumer
 * null-checks stay honest and `destroy()` can null fields back out
 * symmetrically. Splitting subsystems into their own bag lets per-frame
 * helpers accept just the slice they touch rather than the whole state.
 */

import type { SurfaceTileSubsystem } from '../subsystems/SurfaceTileSubsystem';
import type { Label2DDirector } from '../subsystems/Label2DDirector';
import type { StructureFocusSubsystem } from '../subsystems/StructureFocusSubsystem';
import type { ClipPlayer } from '../subsystems/ClipPlayer';
import type { ClipPathInspector } from '../subsystems/ClipPathInspector';
import type { ClickResolver } from '../ClickResolver';
import type { InputBindings } from '../../input/InputBindings';
import type { InputAggregator } from '../subsystems/InputAggregator';
import type { RenderScheduler } from '../subsystems/RenderScheduler';
import type { FadeRegistry } from '../../animation/FadeRegistry';
import type { LoadProgressEmitter } from '../../loading/LoadProgressEmitter';
import type { Destroyable } from '../../rendering/Destroyable';
import type { PriorityQueue } from '../../../utils/concurrency/priorityQueue';

export type EngineSubsystemHandles = {
  /**
   * Earth's surface virtual texture — tile atlas, page table and residency
   * bookkeeping. Constructed in `wireSlots`; allocates no GPU memory until
   * the planner says the base texture has started magnifying, so a session
   * that never approaches Earth pays nothing. Null before `wireSlots` runs.
   */
  surfaceTiles: SurfaceTileSubsystem | null;
  clickResolver: ClickResolver | null;
  inputBindings: InputBindings | null;
  /**
   * Queue between the orbit-controls gesture recognizer (which only emits) and
   * `runFrame`'s replay, the frame's one input-apply site. Eager — the recognizer is
   * attached in `wireInput`, but `runFrame` drains from its first tick, which
   * can precede that async phase.
   */
  inputAggregator: InputAggregator;
  scheduler: RenderScheduler;
  /**
   * Unified fade registry — owns one FadeController per registered
   * FadeId. Constructed eagerly BEFORE any renderer so renderer
   * construction can call `register(...)` without a null-check. Drives
   * the render-on-demand predicate and the slot orchestration's
   * fade-out → upload → fade-in sequence. See
   * `src/services/animation/fadeRegistry.ts`.
   */
  fades: FadeRegistry;
  /**
   * Bounded-concurrency priority queue for boot asset fetches (catalog
   * `.bin` files, body textures) — see `ASSET_QUEUE_CONCURRENCY` for the
   * N = 2 rationale. `evaluateRows` enqueues onto this instead of calling
   * `slot.load()` directly, so a cold boot's demanded rows load in
   * priority order instead of all racing the connection pool at once.
   * `T = void` because the queue only gates ordering/concurrency here —
   * the result the caller cares about is the slot's own state, read via
   * `slot.state()` inside the enqueued fetcher, not a value threaded back
   * through `onResult`. Constructed eagerly (no GPU dep) alongside
   * `scheduler` / `fades`, since `evaluateRows` can fire before the GPU
   * IIFE finishes.
   */
  assetQueue: PriorityQueue<void>;
  /**
   * Label director — owns `labelRenderer.setLabels` /
   * `markerLineRenderer.setLines`, polls every registered `Label2DProducer`
   * each frame, merges outputs, and flushes once. Lets multiple overlays
   * (the Milky Way "you are here" pin, cluster structures, future
   * galaxy/void labels) coexist without stomping each other's full-set
   * replacements. The Milky Way label is contributed by the bare
   * `produceMilkyWayLabel` function (registered inline in `engine.ts`), not a
   * subsystem.
   *
   * Constructed eagerly; the two renderers are wired during
   * `phases/initGpu.ts` via `attachRenderers(...)` once the font-atlas
   * fetch completes. Producers register right after the state literal so
   * they're in place before the first frame.
   */
  cosmoLabelDirector: Label2DDirector;
  /**
   * The NEAR0 sibling of `cosmoLabelDirector` — same `createLabel2DDirector`
   * factory, `screenSeparation`/`exponentialApproach`/lift arms instead of
   * COSMO's `bboxOverlap`/`smoothstepRamp`/no-lift (`FOREGROUND_LABEL_DIRECTOR`
   * in `src/data/labels/`). Attaches `foregroundLabelRenderer` +
   * `foregroundMarkerLineRenderer` at the same two sites `cosmoLabelDirector`
   * attaches its own pair.
   */
  foregroundLabelDirector: Label2DDirector;
  /**
   * Cluster focus-mode subsystem — drives the "dim non-members of the
   * selected cluster/SC/void" effect. Selection-driven: `runFrame` calls
   * `update(selectedStructure, nowMs)` each frame and threads
   * `produceFocusUniforms(nowMs)` into the points draw. Constructed
   * eagerly; no GPU dep, non-null from t=0.
   */
  structureFocus: StructureFocusSubsystem;
  /**
   * Clip-player Resource — owns the active clip's scene cues, the
   * `clipOpacity` channel (per-layer transient opacity), and clip-completion
   * lifecycle (`endClip` dispatch with the two-frame post-produce defer).
   *
   * Constructed eagerly (no GPU dep), non-null from t=0. `tick(nowMs)` is
   * the first step of `runFrame` (Task 12), before the camera produce step,
   * so scene cues fire before the pose is evaluated on each frame.
   */
  clipPlayer: ClipPlayer;
  /**
   * Clip-path inspector (debug) — holds the precomputed `ClipPathSnapshot` the
   * "Calculate" button produces, read each frame by the clip-path debug pass to
   * draw the speed-coloured route + scrub gizmo. Eager (no GPU dep), non-null
   * from t=0; snapshot null until the first Calculate.
   */
  clipPathInspector: ClipPathInspector;
  /**
   * Per-engine download-progress emitter — instantiated inside the GPU
   * init IIFE so the `engineLoadProgressChanged` dispatch and the slot registry are in scope.
   * Subscribes to every slot's state transitions and recomputes the
   * aggregate snapshot from `aggregateRegistry` on every change, so the
   * loading-bar UI sees the same view of "what's still loading" as the
   * dev panel. Null until the GPU init runs.
   */
  loadProgress: LoadProgressEmitter | null;
};

/**
 * Compile-time guard: every subsystem field must satisfy `Destroyable`.
 *
 * The mapped type strips `| null` via `NonNullable<...>` (nullable fields
 * are fine — the engine null-checks before calling destroy) and requires
 * the rest to be assignable to `Destroyable`. A missing `destroy()`
 * resolves to `never` for that key, surfacing as a compile error here
 * rather than as a silent leak at runtime when `engine.destroy()` walks
 * the bag uniformly.
 */
type _EnforceDestroyable = {
  [K in keyof EngineSubsystemHandles]: NonNullable<EngineSubsystemHandles[K]> extends Destroyable
    ? true
    : never;
};
