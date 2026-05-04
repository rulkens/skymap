/**
 * EngineState — the canonical shape of every mutable runtime value the
 * engine owns.
 *
 * ### Why this module exists
 *
 * Phases 1–3 of the engine.ts refactor pulled per-frame GPU dispatch,
 * pointer/keyboard input wiring, click resolution, the SpaceMouse and
 * thumbnail subsystems, and the camera-tween facade out into siblings
 * under `src/services/engine/`.  Each extraction shrank `frame()` and
 * the public-handle setters to thin orchestrators — but the *opening*
 * of `createEngine` still declared ~30 individual `let` bindings:
 * settings, bias thresholds, source visibility, picking flags, GPU
 * pipeline handles, subsystem handles, the camera, the framing
 * snapshot, and a handful of in-flight signals.
 *
 * Reading any one of those bindings was easy.  Answering "what state
 * does the engine own?" was hard — the bindings were scattered down
 * 250+ lines of header comments and weren't grouped by concern.  A
 * fresh reader (or a future Claude session) had to scroll the whole
 * preamble to learn the answer.
 *
 * Consolidating the bindings into a single `EngineState` value, with
 * sub-bags organised by concern, gives the engine one obvious answer.
 * The mental model becomes:
 *
 *   - `state.settings`   — what the SettingsPanel surfaces.
 *   - `state.bias`       — Malmquist-bias correction tuning.
 *   - `state.sources`    — loaded clouds + visibility selectors.
 *   - `state.picking`    — hover / click / drag mutables.
 *   - `state.gpu`        — pipelines / textures allocated lazily.
 *   - `state.subsystems` — owned long-lived helpers.
 *   - `state.cam`        — the orbit camera (null until first cloud).
 *   - `state.initialCamRef` — framing snapshot for resetCamera().
 *
 * ### Why a single `const` instead of a class?
 *
 * The engine is a singleton: one canvas → one `createEngine` call →
 * one closure.  A class would gain only a `this.*` access pattern and
 * lose the clarity that the *outer* binding is immutable while every
 * *inner* field is mutated in place.  We use `const state: EngineState
 * = { ... }` so the closure cannot accidentally rebind the whole bag,
 * but `state.settings.brightness = 1.5` is still a one-liner.
 *
 * ### Why mutable in place rather than an immutable redux-style store?
 *
 * Per-frame writes happen in the rAF loop and the public-handle
 * setters fire several times per user interaction.  An immutable
 * setter (`state = { ...state, settings: { ...state.settings, brightness } }`)
 * would allocate two intermediate objects per slider drag — fine
 * for a React form, wasteful inside a 60 fps render loop.  Mutation
 * in place keeps allocations off the hot path and matches how the
 * subsystem facades (TweenManager, ThumbnailSubsystem) already manage
 * their own internal state.
 *
 * ### What this module is NOT
 *
 * - It does not own any *behaviour*.  It only declares types.  The
 *   factory that builds an `EngineState` value lives in `engine.ts`'s
 *   closure because it needs the `device` / `canvas` / callbacks that
 *   the engine receives.
 * - It does not list every transient closure variable.  Helpers like
 *   `lastScaleSig`, `detachControls`, and `cssToTexPx` stay as plain
 *   bindings — they're either single-use or scoped to one helper, not
 *   part of the engine's runtime state surface.
 * - It does not capture *initial values*.  Defaults live in
 *   `data/defaults.ts`; the consumer constructs an `EngineState` by
 *   pulling those constants into the right sub-bag.
 *
 * The type aliases below mirror the original closure groupings exactly,
 * with one bag per multi-paragraph header comment in the old engine.ts.
 * If a field's home isn't obvious, prefer the bag whose header would
 * have introduced it before this refactor.
 */

import type { BiasMode } from '../../data/biasMode';
import type { ToneMapCurve } from '../../data/toneMapCurve';
import type { LodMode, PointCloud } from '../../@types';
import type { Source } from '../../data/sources';
import type { PointRenderer } from '../gpu/pointRenderer';
import type { HdrTarget } from '../gpu/hdrTarget';
import type { ToneMapPass } from '../gpu/toneMapPass';
import type { createPickRenderer } from '../gpu/pickRenderer';
import type { createOrbitCamera } from '../camera/orbitCamera';
import type { ThumbnailSubsystem } from './thumbnailSubsystem';
import type { SpaceMouseSubsystem } from './spaceMouseSubsystem';
import type { TweenManager } from './tweenManager';
import type { ClickResolver } from './clickHandler';
import type { InputBindings } from './inputBindings';
import type { RenderScheduler } from './renderScheduler';
import type { FamousMetaEntry, FamousXrefMap } from './famousMetaLoader';
import type { InitialCam } from './cameraFraming';

/**
 * CSS-pixel mouse position record used by the throttled hover-pick
 * pipeline.  Defined locally rather than in `@types/` because no other
 * module reads or writes it — it's an engine-internal detail of how
 * the per-frame hover gate dedupes against "the last position we ran
 * a pick from".
 */
export type MousePos = { x: number; y: number };

/**
 * User-facing rendering settings — every value the SettingsPanel
 * surfaces, plus the underlying flags the engine forwards into the
 * per-frame uniform.  Mutated by the public-handle setters at the
 * bottom of `engine.ts`; consumed inside the per-frame loop and the
 * `renderFrame` dispatch.
 */
export type EngineSettingsState = {
  pointSizePx: number;
  brightness: number;
  autoRotate: boolean;
  galaxyTexturesEnabled: boolean;
  highlightFallback: boolean;
  realOnlyMode: boolean;
  depthFadeEnabled: boolean;
  exposure: number;
  toneMapCurve: ToneMapCurve;
};

/**
 * Malmquist-bias correction state.  `mode` selects which correction the
 * vertex shader applies; the four numeric fields are the threshold /
 * Schechter parameters consumed when their respective modes are active.
 *
 * Apparent-magnitude / Schechter values stay zero until either the
 * `applySchechterMode()` worker bake or the `applyAngularReweightMode()`
 * worker bake completes — see `setBiasMode` in engine.ts for the lazy
 * activation flow.
 */
export type EngineBiasState = {
  mode: BiasMode;
  absMagLimit: number;
  apparentMagLimit: number;
  schechterMStar: number;
  schechterAlpha: number;
};

/**
 * Loaded data + visibility selectors.
 *
 * - `visibleMask` is a 32-bit per-source bitmask; the renderer skips
 *   sources whose bit is clear.
 * - `lodMode` decides whether the per-frame loop owns the mask
 *   (`'auto'`) or the user does (`'manual'`).
 * - `clouds` mirrors the renderer's per-source GPU buffers in CPU
 *   memory so picking / hover can resolve indices into PointInfo.
 * - `famousMeta` / `famousXrefs` are the optional sidecars that enrich
 *   InfoCard text for the Famous catalog.  Empty until their fetch
 *   resolves; consumers null-check before reading.
 */
export type EngineSourceState = {
  visibleMask: number;
  lodMode: LodMode;
  clouds: Map<Source, PointCloud>;
  famousMeta: FamousMetaEntry[];
  famousXrefs: FamousXrefMap;
};

/**
 * Hover / click / drag mutables.
 *
 * - `hoveredIndex` / `selectedIndex` are GLOBAL instance IDs (i.e.
 *   already through `resolveGlobalIdx` in reverse).  `null` = none.
 * - `latestMouseCss` is updated on every pointermove; the per-frame
 *   loop runs a fresh pick if it differs from `lastPickedMouseCss`.
 * - `pickInFlight` gates against issuing a new pick before the GPU
 *   readback from the previous one resolves.
 * - `pointerDown` suppresses hover picks during an orbit drag.
 */
export type EnginePickingState = {
  hoveredIndex: number | null;
  selectedIndex: number | null;
  latestMouseCss: MousePos | null;
  lastPickedMouseCss: MousePos | null;
  pickInFlight: boolean;
  pointerDown: boolean;
};

/**
 * GPU pipelines / targets allocated lazily during the async startup
 * IIFE.  Each field starts as `null` and gets assigned exactly once
 * after `initGpu` resolves; `destroy()` releases them and resets to
 * `null` for symmetry.
 */
export type EngineGpuHandles = {
  renderer: PointRenderer | null;
  pickRenderer: ReturnType<typeof createPickRenderer> | null;
  hdrTarget: HdrTarget | null;
  toneMapPass: ToneMapPass | null;
};

/**
 * Owned subsystem handles.
 *
 * Some are constructed up-front (before the async IIFE runs) because
 * they don't need a GPU device — their callbacks queue work that the
 * scheduler will dispatch once the IIFE finishes:
 *
 *   - `spaceMouse`, `tweens`, `scheduler`
 *
 * The rest are constructed inside the async IIFE because they need
 * `device`, `canvas`, or another late-bound dependency:
 *
 *   - `thumbnails` (needs the GPU device + QuadRenderer/DiskRenderer)
 *   - `clickResolver` (needs the pick renderer)
 *   - `inputBindings` (needs the scheduler so it can wake the loop)
 *
 * Up-front subsystems land in this bag as fully-built values.  Lazy
 * subsystems start as `null` and get assigned later in the IIFE.
 */
export type EngineSubsystemHandles = {
  thumbnails: ThumbnailSubsystem | null;
  spaceMouse: SpaceMouseSubsystem;
  tweens: TweenManager;
  clickResolver: ClickResolver | null;
  inputBindings: InputBindings | null;
  scheduler: RenderScheduler;
};

/**
 * The full engine state.
 *
 * One value owned by `createEngine`'s closure; mutated in place by
 * setters / async-arrival callbacks / the per-frame loop.  The outer
 * `const state` binding never reassigns — only the internal fields
 * change.  This type is the canonical answer to "what state does the
 * engine own?".
 */
export type EngineState = {
  settings: EngineSettingsState;
  bias: EngineBiasState;
  sources: EngineSourceState;
  picking: EnginePickingState;
  gpu: EngineGpuHandles;
  subsystems: EngineSubsystemHandles;
  cam: ReturnType<typeof createOrbitCamera> | null;
  initialCamRef: InitialCam | null;
};
