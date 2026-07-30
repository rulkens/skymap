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
 *   - Lazy (inside the GPU init IIFE): `galaxyAtlas`, `proceduralDisks`,
 *     `texturedDisks`, `clickResolver`, `inputBindings`.
 *
 * The mixed nullability matches `EngineGpuHandles.d.ts` so consumer
 * null-checks stay honest and `destroy()` can null fields back out
 * symmetrically. Splitting subsystems into their own bag lets per-frame
 * helpers accept just the slice they touch rather than the whole state.
 */

import type { BitmapStreamSubsystem } from '../subsystems/BitmapStreamSubsystem';
import type { EarthTileSubsystem } from '../subsystems/EarthTileSubsystem';
import type { ProceduralDiskSubsystem } from '../subsystems/ProceduralDiskSubsystem';
import type { TexturedDiskSubsystem } from '../subsystems/TexturedDiskSubsystem';
import type { DiskPlannerWalk } from '../subsystems/DiskPlannerWalk';
import type { HiResFamousSubsystem } from '../subsystems/HiResFamousSubsystem';
import type { HiResFamousTexture } from '../../rendering/HiResFamousTexture';
import type { BiasCorrectionSubsystem } from '../subsystems/BiasCorrectionSubsystem';
import type { LabelDirectorSubsystem } from '../subsystems/LabelDirectorSubsystem';
import type { StructureFocusSubsystem } from '../subsystems/StructureFocusSubsystem';
import type { ClipPlayer } from '../subsystems/ClipPlayer';
import type { ClipPathInspector } from '../subsystems/ClipPathInspector';
import type { ClickResolver } from '../ClickResolver';
import type { InputBindings } from '../../input/InputBindings';
import type { RenderScheduler } from '../subsystems/RenderScheduler';
import type { FadeRegistry } from '../../animation/FadeRegistry';
import type { LoadProgressEmitter } from '../../loading/LoadProgressEmitter';
import type { Destroyable } from '../../rendering/Destroyable';
import type { PriorityQueue } from '../../../utils/concurrency/priorityQueue';

export type EngineSubsystemHandles = {
  galaxyAtlas: BitmapStreamSubsystem | null;
  proceduralDisks: ProceduralDiskSubsystem | null;
  texturedDisks: TexturedDiskSubsystem | null;
  /**
   * The single per-frame catalog walk shared by the two disk planners
   * above. `runFrame` drives the procedural body then the textured body
   * over one shared stride cursor, so each surviving row's geometry is
   * computed once. Wired in `wireImpostorSubsystems` alongside the two
   * planners; null until then. Holds no GPU resource — just the cursor
   * map — so teardown order relative to the atlas is irrelevant.
   */
  diskPlannerWalk: DiskPlannerWalk | null;
  /**
   * LOD-3 hi-res Famous-galaxy planner. Wired in `wireSlots` alongside
   * `texturedDisks`, which reads `lastOutput.byFamousIdx` to fold
   * `hiResLayerIdx` + `hiResCrossfadeAlpha` into the disk instance
   * buffer. Null until `wireSlots` runs. Destroyed + rebuilt on tier
   * change so the underlying `texture_2d_array` always matches the
   * active tier's `layerSide`.
   */
  hiResFamous: HiResFamousSubsystem | null;
  /**
   * GPU resource handle for the hi-res Famous-galaxy `texture_2d_array`.
   * Owned at the engine level (not nested inside `hiResFamous`) so
   * tier-change teardown destroys the GPUTexture symmetrically with the
   * other per-tier resources, and so the renderer's `bindHiResArray(...)`
   * has a single obvious source for the new view. Null until `wireSlots`
   * runs.
   */
  hiResFamousTexture: HiResFamousTexture | null;
  /**
   * Earth's surface virtual texture — tile atlas, page table and residency
   * bookkeeping. Constructed in `wireSlots`; allocates no GPU memory until
   * the planner says the base texture has started magnifying, so a session
   * that never approaches Earth pays nothing. Null before `wireSlots` runs.
   */
  earthTiles: EarthTileSubsystem | null;
  clickResolver: ClickResolver | null;
  inputBindings: InputBindings | null;
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
   * Malmquist-bias correction subsystem. Owns the bias-mode flags,
   * cached per-source ratios/weights, and the async bake state machine.
   * Constructed eagerly (no GPU dep); the renderer is wired in during
   * `phases/initGpu.ts` via `attachRenderer(...)`. The reconcile saga
   * drives bake state via the bias.mode reconcile row.
   */
  biasCorrection: BiasCorrectionSubsystem;
  /**
   * Label director — owns `labelRenderer.setLabels` /
   * `markerLineRenderer.setLines`, polls every registered `LabelProducer`
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
  labelDirector: LabelDirectorSubsystem;
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
