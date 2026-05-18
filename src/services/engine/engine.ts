/**
 * Engine — the imperative WebGPU core, decoupled from any UI framework.
 *
 * This module is responsible for everything that touches the GPU, the camera,
 * and the raw browser input events. It knows nothing about React — it receives
 * simple callback functions and calls them when state changes.
 *
 * The boundary is deliberate:
 *
 *   Engine (engine.ts)            React (App.tsx, components/)
 *   ─────────────────────         ─────────────────────────────
 *   WebGPU device / buffers   ←→  status bar text
 *   requestAnimationFrame     ←→  info card fields
 *   pointer / keyboard events ←→  scale bar label + width
 *   orbit camera math
 *   GPU pick readback
 *
 * Callbacks are the seam. The engine fires `onStatusChange`, `onHoverChange`,
 * and `onSelectChange` only when values *actually change*, so the React side
 * can call `setState` directly without worrying about spurious re-renders.
 * Per-frame `onCameraChange` emissions instead fire unconditionally while
 * the camera exists; React-side `setState` equality checks filter the noise.
 *
 * ### Module layout
 *
 * The pure / leaf concerns and the cohesive subsystems live in sibling
 * modules so this file can stay focused on the imperative orchestration:
 *
 *   Pure helpers:
 *   - `autoLod.ts`             — LOD heuristic (also re-exported as public API)
 *   - `focusTween.ts`          — focus camera tween constants + distance helper
 *   - `galaxyInfoBuilder.ts`   — buildGalaxyInfo / maxAbsCoord / niceRound
 *   - `cloudLoader.ts`         — parallel /data/{sdss,2mrs,glade}.bin fetch + synthetic fallback
 *   - `cameraFraming.ts`       — bbox + FOV → initial camera snapshot
 *   - `seedSettingsCallbacks.ts` — fan-out of default settings to optional cb hooks
 *   - `scaleBar.ts`            — pure scale-bar tick selection + label formatting (consumed by React)
 *
 *   Subsystems (closure-returning factories with internal state):
 *   - `tweenManager.ts`        — at-most-one in-flight CameraTween facade
 *   - `spaceMouseSubsystem.ts` — 6DOF puck device + per-frame camera mutation
 *   - `clickHandler.ts`        — pick → globalIdx → GalaxyInfo resolver
 *   - `inputBindings.ts`       — pointer/keyboard/resize listener bag
 *   - `thumbnailSubsystem.ts`  — atlas + queue + per-frame thumbnail draw
 *
 *   Bootstrap phases (post-Phase-5; lift the ~1100-line async IIFE):
 *   - `phases/initGpu.ts`      — device + every renderer + point-source slots
 *   - `phases/wireSlots.ts`    — sidecar slots + thumbnails + parallel load
 *   - `phases/wireInput.ts`    — pickRenderer + camera + orbit-controls + click
 *   - `phases/startLoop.ts`    — RunFrameDeps assembly + first requestRender
 *   - `phases/bootstrap.ts`    — orchestrator + BootstrapDeps + Phase signature
 *
 * Hover/select state lives in `state.subsystems.selection` (Spec D.3
 * extracted the four inline helpers — `setHovered` / `setSelected` /
 * `selectionEq` / `galaxyInfoForSelection` — into the closure-returning
 * factory `selectionSubsystem.ts`).  The public handle and the
 * forward-declared `frameRef` / `detachControlsRef` / `handleRef` boxes
 * stay inline here because they're written by the bootstrap phases via
 * the `{current}` ref pattern (the bootstrap modules are siblings, not
 * parents).
 *
 * ### Usage
 *
 * ```ts
 * const handle = createEngine(canvas, {
 *   onStatusChange: (s) => setStatus(s),
 *   onHoverChange:  (p) => setReactHovered(p),
 *   onSelectChange: (p) => setReactSelected(p),
 *   onCameraChange: (snap) => setScale(computeScaleInfo({...})),
 * });
 *
 * // later (e.g. React cleanup):
 * handle.destroy();
 * ```
 */

import { Source, maskWith, maskWithout } from '../../data/sources';
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_AUTO_ROTATE,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_EXPOSURE,
  DEFAULT_FILAMENT_INTENSITY,
  DEFAULT_FILAMENTS_ENABLED,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
  DEFAULT_MILKY_WAY_ENABLED,
  DEFAULT_HIGHLIGHT_FALLBACK,
  DEFAULT_LOD_MODE,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_REAL_ONLY_MODE,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VISIBLE_SOURCE_MASK,
  DEFAULT_VOLUMES_ENABLED,
  DEFAULT_VOLUME_FIELD_INTENSITY,
  DEFAULT_VOLUME_PALETTE_ID,
} from '../../data/defaults';
import type { GalaxyInfo } from '../../@types/engine/GalaxyInfo';
import type { LodMode } from '../../@types/data/LodMode';
import type { GalaxyCatalog } from '../../@types/data/GalaxyCatalog';
import type { EngineCallbacks } from '../../@types/engine/EngineCallbacks';
import type { EngineHandle } from '../../@types/engine/EngineHandle';
import type { EngineState } from '../../@types/engine/state/EngineState';
import type { BiasMode } from '../../@types/data/BiasMode';
import type { ScalarCube } from '../../@types/data/ScalarCube';
import type { ScalarFieldPaletteId } from '../../@types/data/ScalarFieldPaletteId';
import type { Tier } from '../../@types/data/Tier';
import type { FamousMetaEntry } from '../../@types/loading/FamousMetaEntry';
import type { FamousXrefMap } from '../../@types/loading/FamousXrefMap';

import { createTweenManager } from './camera/tweenManager';
import { createRenderScheduler } from './subsystems/renderScheduler';
import { createFadeRegistry } from '../animation/fadeRegistry';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../animation/fadeController';
import type { FadeHandle } from '../../@types/animation/FadeHandle';
import { createSelectionSubsystem } from './subsystems/selectionSubsystem';
import { createBiasCorrectionSubsystem } from './subsystems/biasCorrectionSubsystem';
import { createYouAreHereSubsystem } from './subsystems/youAreHereSubsystem';
import { createLabelDirectorSubsystem } from './subsystems/labelDirectorSubsystem';
import { createPoiSubsystem } from './subsystems/poiSubsystem';
import { createFpsCounter } from './subsystems/fpsCounter';
import { buildGalaxyInfo } from './helpers/galaxyInfoBuilder';
import { commitFocus } from './helpers/commitFocus';
import { logCameraState } from './helpers/logCameraState';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { PgcAliasMap } from '../../@types/loading/PgcAliasMap';
import { awaitSlotReady } from '../loading/awaitSlotReady';
import { TIER_TARGETS } from '../../data/tierTargets';
import { snapToCameraSnapshot, tweenToCameraSnapshot } from './camera/cameraSnapshot';
import { MILKY_WAY_CENTER_WORLD, MILKY_WAY_VIEW_DISTANCE_MPC } from '../../data/galacticCenter';
import { getVolumeFieldDefaults } from '../../data/volumeFieldDefaults';

// ── SpaceMouse 6DOF input (optional, WebHID-only) ────────────────────────────
//
// The whole subsystem (WebHID device handle, axes-cache, dt-baseline,
// sensitivity scalar, per-frame camera mutation) lives in
// `spaceMouseSubsystem.ts`.  Engine-side we just instantiate it once,
// pass it `cancelTween` / `onAxes` / `onConnectionChange` callbacks,
// and call `applyToCamera()` from `frame()`.  The handle's
// connect/disconnect/sensitivity setters forward straight through.
import { createSpaceMouseSubsystem } from './subsystems/spaceMouseSubsystem';
import { buildSettersFromTable } from './wiring/settingsTable';
import type { SettingsTableKey } from '../../@types/settings/SettingsTableKey';
import { runBootstrapPhases } from './phases/bootstrap';
import type { BootstrapDeps } from '../../@types/engine/BootstrapDeps';
import { createDisabledGpuTimingService } from '../gpu/timing/gpuTimingService';

/**
 * Start the WebGPU engine on `canvas`.
 *
 * Returns a handle synchronously; async setup (GPU init, data loading)
 * progresses in the background and is reported via `cb.onStatusChange`.
 *
 * ### Lifecycle
 *
 *   1. `cb.onStatusChange({ kind: 'initializing' })` fires immediately.
 *   2. `initGpu()` + `loadCloud()` run asynchronously.
 *   3. `cb.onStatusChange({ kind: 'loading' })` fires before the fetch.
 *   4. `cb.onStatusChange({ kind: 'ready', ... })` fires when the render loop
 *      starts, or `{ kind: 'error' }` if GPU init fails.
 *   5. `cb.onHoverChange`, `cb.onSelectChange`, `cb.onCameraChange` fire during
 *      steady-state rendering as the user interacts.
 *
 * @throws Never — errors are reported via `onStatusChange({ kind: 'error' })`.
 */

// ── Test-accessible setSourceVisible logic ──────────────────────────────────
//
// The business logic of `setSourceVisible` is extracted to a module-scope
// async function so that tests can invoke it directly against a partial-state
// stub without instantiating a full GPU engine. The closure inside
// `createEngine` delegates straight here.
//
// The two parameters use intersection-typed picks so the function signature
// remains narrow (only the fields it actually reads) while accepting the
// full `EngineState` and `EngineCallbacks` types from production callers.
export async function setSourceVisibleImpl(
  state: Pick<import('../../@types/engine/state/EngineState').EngineState, 'sources' | 'subsystems'>,
  opts: { cb: Pick<EngineCallbacks, 'sources'> },
  source: Source,
  visible: boolean,
): Promise<void> {
  const { cb } = opts;
  if (state.sources.lodMode !== 'manual') {
    state.sources.lodMode = 'manual';
    cb.sources?.onLodModeChange?.('manual');
  }

  const handle: FadeHandle = { kind: 'survey', source };
  const targetMask = visible
    ? maskWith(state.sources.pickMask, source)
    : maskWithout(state.sources.pickMask, source);
  if (targetMask === state.sources.pickMask && targetMask === state.sources.drawMask) return;

  // pickMask flips IMMEDIATELY — a fading-out layer must not be clickable.
  state.sources.pickMask = targetMask;
  // Notify the UI of the (immediate) state change so the checkbox reflects.
  cb.sources?.onMaskChange?.(targetMask);
  state.subsystems.scheduler.requestRender();

  if (visible) {
    state.sources.drawMask = targetMask;
    await state.subsystems.fades.fadeTo(handle, 1, FADE_IN_DURATION_MS);
  } else {
    await state.subsystems.fades.fadeTo(handle, 0, FADE_OUT_DURATION_MS);
    // Re-read opacity rather than closing over `visible`, because a
    // concurrent toggle may have reversed the fade by the time we
    // resume here (off→on within the 100ms fade-out window). The
    // last-issued fade wins: if a fade-in started while we were
    // awaiting fade-out, opacityOf returns > 0 and we leave the
    // drawMask bit set so the renderer keeps drawing through the
    // ramp-up. The promise we awaited is the OLDER fade's settle —
    // by the time it resolves, the registry's current target is
    // whatever the newer call set, not 0.
    const finalOpacity = state.subsystems.fades.opacityOf(handle);
    if (finalOpacity === 0) {
      state.sources.drawMask = maskWithout(state.sources.drawMask, source);
    } else {
      state.sources.drawMask = maskWith(state.sources.drawMask, source);
    }
  }
  state.subsystems.scheduler.requestRender();
}

// Test-only alias. The implementation lives at module scope as
// `setSourceVisibleImpl` so it's directly testable; this re-export
// matches the import name used in tests written before the rename.
export { setSourceVisibleImpl as setSourceVisibleForTest };

export function createEngine(canvas: HTMLCanvasElement, cb: EngineCallbacks): EngineHandle {
  // ── Mutable engine state ─────────────────────────────────────────────────
  //
  // Everything lives as closure variables rather than a class because the
  // engine is a singleton: one canvas → one engine → one set of state.
  // Closure variables are slightly simpler to reason about than `this.*` and
  // they keep the internal state completely inaccessible from outside.

  // The whole engine state — see `@types/EngineState.d.ts` (and the
  // per-sub-bag `.d.ts` siblings) for the type-level map of every field,
  // with per-bag rationale.  Sub-bag groupings:
  //
  //   - `settings`   → SettingsPanel-surfaced knobs (initial values
  //                    seeded from `data/defaults.ts`, the single
  //                    source of truth shared with App.tsx so the
  //                    panel doesn't flash a stale value before the
  //                    first echo callback fires).
  //   - `bias`       → Malmquist-bias bake outputs (apparentMagLimit +
  //                    two Schechter parameters; all three stay 0 until
  //                    the shader's mode-2/3/4 branches activate via the
  //                    `setBiasMode` lazy bake forwarded to
  //                    `state.subsystems.biasCorrection.setMode`).  The
  //                    user-facing knobs (mode + absMagLimit) live on
  //                    `state.settings.bias`.
  //   - `sources`    → loaded `GalaxyCatalog`s + visibility bitmask +
  //                    LOD mode + the optional famous-galaxy sidecars.
  //   - `picking`    → hover / click / drag mutables (latest CSS-pixel
  //                    mouse position, in-flight pick guard, drag flag).
  //   - `gpu`        → renderer / pickRenderer / HDR target /
  //                    tone-map pass — all null until the async IIFE
  //                    finishes `initGpu`.
  //   - `subsystems` → owned long-lived helpers; `tweens`/`spaceMouse`
  //                    construct up-front, the rest land later.
  //   - `cam` / `initialCamSnapshot` → orbit camera + framing snapshot,
  //                                both null until the first cloud
  //                                loads.
  //
  // The outer `state` binding is `const` because the closure never
  // reassigns it — only the inner fields mutate.  Mutation in place
  // matches how the subsystem facades already manage their own state
  // and avoids per-frame allocations on the hot path.

  // ── Frame-function forward declaration ────────────────────────────────────
  //
  // The render loop's `frame()` body lives in `runFrame.ts`, called
  // from the `startLoop` bootstrap phase, because it reads GPU
  // resources (device, context, texturedQuadRenderer, texturedDiskRenderer) that
  // initGpu() returns asynchronously.  But the `RenderScheduler` we
  // wire into `state.subsystems.scheduler` needs an `onFrame` callback
  // at construction time — which is *here*, in the synchronous state
  // literal below.
  //
  // We resolve the chicken-and-egg by forward-declaring `frameRef` as a
  // `{ current }` ref initialised to a no-op stub.  The state literal's
  // scheduler captures `frameRef` (via the `() => frameRef.current()`
  // closure) rather than the stub's current value, so when the
  // `startLoop` phase later assigns `frameRef.current = () => { /* real
  // body */ }`, every subsequent rAF invocation runs the real body.
  //
  // Why a ref (not a `let`)?  The bootstrap phases live in sibling
  // modules (`phases/startLoop.ts`); a `let` would be invisible across
  // the module boundary.  The ref-box round-trip is the same pattern
  // Phase 3's `lastReportedFps` introduced for `runFrame.ts`'s closure
  // captures — see `phases/bootstrap.ts`'s `BootstrapDeps` for the
  // full inventory of refs threaded through.
  //
  // The stub is silently a no-op rather than a logging warning
  // because its only invocation window is "rAF fires before
  // `startLoop` finishes wiring `frameRef.current`" — vanishingly rare
  // (the user would have to interact with the canvas in the first
  // ~milliseconds of startup), and harmless even if it does fire.
  const frameRef: { current: () => void } = {
    current: () => {
      /* stub until startLoop assigns the real body — see comment above */
    },
  };

  // ── Rolling FPS counter ────────────────────────────────────────────────────
  //
  // Lives at engine scope so the same instance accumulates samples across
  // every frame() invocation (a counter inside frame() would reset on each
  // call).  The counter itself is a thin closure over a 60-frame ring buffer
  // — see fpsCounter.ts for the why-rolling-window rationale.
  //
  // We track `lastReportedFps` here too so we can throttle the callback
  // fan-out: integer fps values change at most once per ~16 ms in the worst
  // case (60 → 59 → 60 oscillation under noise), but in practice a steady
  // framerate produces just one initial fire and then silence — far cheaper
  // than every-N-frames polling, which would burn React renders even when
  // the number was unchanged.  Per-change is the lighter option.
  const fpsCounter = createFpsCounter(60);
  // Boxed as `{current}` so the frame body in `runFrame.ts` can write
  // to it across the module boundary — see runFrame.ts's module header
  // for the {current} ref pattern.
  const lastReportedFps: { current: number | null } = { current: null };

  const state: EngineState = {
    // ── Settings — the user-facing SettingsPanel sub-bags ──────────
    //
    // After H5 (2026-05-11) every settings field lives under a named
    // cluster.  The defaults flow through unchanged from
    // `data/defaults.ts`; what changed is the shape — each cluster
    // groups what conceptually goes together (point billboard knobs
    // under `points`, HDR controls under `tonemap`, etc.).  See
    // `EngineSettingsState.d.ts` for the type-level map.
    settings: {
      points: {
        sizePx: DEFAULT_POINT_SIZE_PX,
        brightness: DEFAULT_BRIGHTNESS,
        depthFade: DEFAULT_DEPTH_FADE_ENABLED,
        highlightFallback: DEFAULT_HIGHLIGHT_FALLBACK,
        realOnly: DEFAULT_REAL_ONLY_MODE,
      },
      tonemap: {
        exposure: DEFAULT_EXPOSURE,
        curve: DEFAULT_TONE_MAP_CURVE,
      },
      camera: {
        autoRotate: DEFAULT_AUTO_ROTATE,
      },
      // Bias's user-tunable subset.  The bake-derived fields
      // (apparentMagLimit / schechterMStar / schechterAlpha) stay on
      // `state.bias` — they're worker outputs, not settings.  Why -19
      // as the volume-limited default?  It's roughly the absolute
      // magnitude where the SDSS spectroscopic main sample is
      // volume-complete out to the survey's flux limit — bright enough
      // that almost every catalog galaxy meeting it has a measured
      // spectrum, dim enough that we still see plenty of structure.
      bias: {
        mode: DEFAULT_BIAS_MODE,
        absMagLimit: DEFAULT_ABS_MAG_LIMIT,
      },
      thumbnails: {
        enabled: DEFAULT_GALAXY_TEXTURES_ENABLED,
      },
      milkyWay: {
        enabled: DEFAULT_MILKY_WAY_ENABLED,
      },
      filaments: {
        enabled: DEFAULT_FILAMENTS_ENABLED,
        intensity: DEFAULT_FILAMENT_INTENSITY,
      },
      volumes: {
        masterEnabled: DEFAULT_VOLUMES_ENABLED,
        // Starts empty; populated by addVolumeField / cleared by
        // removeVolumeField.  SettingsPanel reads this map to render
        // per-field intensity sliders without going through the GPU
        // handle.
        fields: {},
      },
      // Per-category POI label visibility.  Defaults to every category
      // visible so the labelDirector emits every cluster / supercluster
      // / famous galaxy / void on first paint; the React shell's four
      // Overlays → Labels checkboxes toggle individual categories.
      // The literal record is the single source of truth — adding a
      // fifth POI category means widening `POI_STYLES` in
      // `poiSubsystem` AND adding the row here.
      labelCategoryVisibility: {
        cluster: true,
        supercluster: true,
        famousGalaxy: true,
        void: true,
      },
    },
    bias: {
      // Bake-only sentinels — overwritten before the shader's
      // mode-2/3/4 branches are reachable.  See `setBiasMode` for the
      // lazy worker bake.  The user-tunable mode + absMagLimit live
      // on `state.settings.bias`.
      apparentMagLimit: 0,
      schechterMStar: 0,
      schechterAlpha: 0,
    },
    sources: {
      // Two 32-bit bitmasks, one bit per `Source` enum value.
      //
      // pickMask — flipped IMMEDIATELY when the user toggles a survey,
      // so a fading-out layer is not clickable even while still visible.
      //
      // drawMask — flipped AFTER fade-out (or AT the start of fade-in).
      // The renderer iterates `loadedSources()` and skips any whose bit
      // is clear.  Both default to ALL_VISIBLE_MASK so "draw everything
      // that is loaded" holds until either the auto-LOD heuristic
      // recomputes them from camera distance, or the user toggles
      // a single source in the settings panel.
      pickMask: DEFAULT_VISIBLE_SOURCE_MASK,
      drawMask: DEFAULT_VISIBLE_SOURCE_MASK,
      // 'auto'   → per-frame `autoLodMask(cam.distance)` rewrite.
      // 'manual' → user owns the mask; auto-LOD paused.
      lodMode: DEFAULT_LOD_MODE,
      // Mirrors the renderer's per-source GPU buffers in CPU memory
      // so picking can resolve `(source, localIdx)` into a GalaxyInfo
      // without a GPU readback for every hover.  Empty until the
      // first parallel fetch resolves.
      catalogs: new Map<Source, GalaxyCatalog>(),
      // Optional sidecars — `galaxyInfoBuilder` null-checks both, so a
      // hover firing before they land just renders the generic
      // InfoCard layout.
      famousMeta: [],
      famousXrefs: {},
      // Currently-loaded data tier.  Seeded from `cb.initialTier` (Task 5
      // of the data-tiers plan); the default of 'medium' matches the
      // pre-tier ~600k-galaxy desktop budget.  `setTier` mutates this in
      // place before kicking off per-source reloads.
      tier: cb.initialTier ?? 'medium',
    },
    picking: {
      // hovered/selected used to live here — they moved to
      // `state.subsystems.selection` in Spec D.3.  This bag now
      // exclusively holds the per-frame pick-throttle state (see
      // `EnginePickingState.d.ts` for the narrowed responsibility).
      latestMouseCss: null,
      lastPickedMouseCss: null,
      pickInFlight: false,
      pointerDown: false,
    },
    gpu: {
      // All GPU handles populate during the async IIFE below and
      // release in `destroy()`.  See `@types/EngineGpuHandles.d.ts`
      // for the null-until-init lifecycle rationale.
      renderer: null,
      pickRenderer: null,
      // Canonical fade + source bind-group layouts. Built once in
      // initGpu and threaded into every renderer's createPipelineLayout
      // so every consumer's bind groups share one layout identity. See
      // services/gpu/bindGroupLayouts/fadeUniforms.ts for the rationale
      // (layout:'auto' cross-pipeline trap).
      fadeBgl: null,
      sourceBgl: null,
      postProcess: null,
      volumeOffscreen: null,
      filamentRenderer: null,
      // labelRenderer + markerLineRenderer: null until initGpu completes
      // the loadFontAtlas() fetch and constructs both renderers.  They're
      // excluded from the isEngineReady predicate (same rationale as
      // filamentRenderer — optional async resources, null-checked at
      // point of use by labelsPass / markerLinesPass).
      labelRenderer: null,
      markerLineRenderer: null,
      // clusterMarkerRenderer: null until initGpu constructs it
      // (cluster-viz sub-plan 2 task 13).  Excluded from
      // isEngineReady — null-checked at point of use by the
      // cluster-marker frame pass (task 14).
      clusterMarkerRenderer: null,
      // texturedQuadRenderer / texturedDiskRenderer / proceduralDiskRenderer /
      // milkyWayRenderer: null until initGpu constructs them.  These
      // four don't gate any frame-loop logic via state.gpu — the frame
      // body reads them through RunFrameDeps (assembled in
      // `phases/startLoop.ts`).  They live here so `destroy()` below
      // has a reachable reference to release each renderer's GPU
      // buffers, AND so the later bootstrap phases (`wireSlots`,
      // `startLoop`) consume the same identities by reading
      // `state.gpu.X` directly.  Pre-2026-05-08 they lived only on
      // the bootstrap-local `phaseLocals` carrier (which goes away
      // once `startLoop` finishes), leaving destroy() unable to
      // clean them up; M1 of the 2026-05-11 audit then collapsed
      // the redundant `phaseLocals` mirror.  See
      // `EngineGpuHandles.d.ts` for the full reachability story.
      texturedQuadRenderer: null,
      texturedDiskRenderer: null,
      proceduralDiskRenderer: null,
      milkyWayRenderer: null,
      // Constructed during initGpu, null until then.  Excluded from the
      // isEngineReady predicate — the volumeUpsamplePass null-checks
      // both handles before calling hasActiveFields(), so a null state
      // is a silent no-op.
      scalarVolumeRenderer: null,
      // Constructed alongside scalarVolumeRenderer in initGpu; null until
      // then.  Excluded from the isEngineReady predicate — the
      // volumeUpsamplePass null-checks this field at point of use.
      volumeUpsample: null,
      // Per-pass GPU timing service.  Always non-null — initialized
      // here with a no-op stub (no GPU resources), then replaced by
      // initGpu with the device-aware service after the device is
      // acquired.  Consumers gate work behind `.enabled`.  Destroy
      // calls into the live slot symmetrically with the renderers.
      timingService: createDisabledGpuTimingService(),
    },
    subsystems: {
      // ── LOD-1 / LOD-2 impostor planners + atlas ─────────────────
      // All three null until `wireSlots` constructs them post-GPU init.
      galaxyAtlas: null,
      proceduralDisks: null,
      texturedImpostors: null,
      // ── Tween manager ──────────────────────────────────────────
      // At most one camera tween at a time.  Sites that mutate it:
      //   - public handle's focusOn / focusOnHome / selectFamous
      //     (start a tween — auto-replaces any running one),
      //   - pointerdown handler                (cancel on user grab),
      //   - SpaceMouse per-frame block         (cancel on puck deflect),
      //   - per-frame frame() loop             (advance + auto-clear).
      tweens: createTweenManager(),

      // ── SpaceMouse subsystem ──────────────────────────────────
      // All puck state (axes cache, dt baseline, sensitivity, lazy
      // WebHID handle) lives inside the subsystem.  We hand it three
      // callbacks: cancelTween (yields the focus tween to user
      // input), onConnectionChange (UI indicator), onAxes (wakes the
      // render loop so the next frame applies the new axes).
      spaceMouse: createSpaceMouseSubsystem({
        cancelTween: () => state.subsystems.tweens.cancel(),
        onConnectionChange: (connected) => {
          // Nested fire only (H5 task 11).  The SpaceMouse subsystem is the
          // single site that fires the connected-change echo for both
          // `connectSpaceMouse` and `disconnectSpaceMouse` (the handle
          // methods don't echo directly — the subsystem's lifecycle
          // owns the truth and pushes it back out via this callback).
          cb.input?.spaceMouse?.onConnectedChange?.(connected);
          // Wake one frame so the still-animating predicate sees
          // the freshly-zeroed axes (the subsystem clears them on
          // disconnect) and lets the loop sleep cleanly.
          state.subsystems.scheduler.requestRender();
        },
        onAxes: () => state.subsystems.scheduler.requestRender(),
      }),

      // ── Selection subsystem ──────────────────────────────────────
      // Owns the user-facing hover / select state and fans out
      // `cb.onHoverChange` / `cb.onSelectChange` only on actual
      // change.  Constructed eagerly here (no GPU dep) so the public
      // handle's `clearSelection` / `selectFamous` / `selectByAlias`
      // can call into it from t=0 without a null-check.  Cloud +
      // sidecar accessors are passed as closures (not snapshots) so
      // the subsystem reads the LIVE map at call time — see the
      // module header for why that matters across tier swaps and the
      // pre-GPU-upload race window.
      selection: createSelectionSubsystem({
        cb,
        getCloud: (s) => state.sources.catalogs.get(s),
        getFamousMeta: () => state.sources.famousMeta,
        getFamousXrefs: () => state.sources.famousXrefs,
      }),

      // ── Bias-correction subsystem (Spec E phase E.3 + E.4) ────────
      // Owns Malmquist-bias mode flags, cached per-source ratios/
      // weights, and the async bake state machine — extracted from
      // PointRenderer.  Constructed eagerly here (no GPU dep); the
      // renderer is wired during `phases/initGpu` via
      // `attachRenderer(...)`.  Phase E.4 cut `handle.setBiasMode`
      // over to call `setMode` on this subsystem (see the handle
      // method below) and deleted the renderer's legacy bias-mode
      // methods — production routes mode toggles through here now.
      //
      // No `schechterRunner` / `angularRunner` overrides — the
      // module-level defaults (Vite `?worker` runners on this same
      // subsystem module) take over in production; tests inject
      // synchronous stubs at the test factory call site.
      biasCorrection: createBiasCorrectionSubsystem({
        getMode: () => state.settings.bias.mode,
        getLoadedClouds: () => state.sources.catalogs,
        requestRender: () => state.subsystems.scheduler.requestRender(),
      }),

      // ── You-are-here subsystem (Task R4) ─────────────────────────
      // Owns the "YOU ARE HERE" marker fade-alpha state and drives
      // labelRenderer + markerLineRenderer per frame.  Constructed
      // eagerly here (no GPU dep); the two renderers are wired in
      // during `phases/initGpu.ts` via `attachRenderers(...)` after
      // the `loadFontAtlas()` fetch completes.
      youAreHere: createYouAreHereSubsystem(),

      // ── Label director + POI subsystem (Task 6) ──────────────────
      //
      // The director owns the actual `labelRenderer.setLabels` /
      // `markerLineRenderer.setLines` calls — youAreHere and pois are
      // both `LabelProducer`s that the director polls and merges each
      // frame.  Renderers are wired in during `initGpu` via the
      // director's `attachRenderers(...)`; producer registration
      // happens right after this state literal (see below) so the
      // director sees both producers before the first frame fires.
      labelDirector: createLabelDirectorSubsystem(),
      pois: createPoiSubsystem(),

      // ── Render scheduler — eager, capture-safe ────────────────────
      //
      // The real scheduler is created right here in the state literal,
      // *not* via a deferred shim swap.  Its `onFrame` callback closes
      // over the forward-declared `frame` binding above; the IIFE
      // assigns the real frame body before any rAF can fire.  See the
      // forward declaration's docstring for the full rationale.
      //
      // Anyone who captures `state.subsystems.scheduler` from this
      // moment onward gets the live scheduler — no shim, no proxy,
      // no post-init reassignment.  This is the architectural fix to
      // the Phase 2b "captured the shim by reference" regression that
      // broke hover-pick for one refactor cycle.
      scheduler: createRenderScheduler({ onFrame: () => frameRef.current() }),

      // ── Fade registry ──────────────────────────────────────────
      //
      // Constructed eagerly so renderer construction in `initGpu`
      // can register handles without a null-check. The registry is
      // pure CPU — no GPU device needed at construction time.
      fades: createFadeRegistry(),

      // The remaining subsystems land later in the IIFE once their
      // dependencies (GPU device, pickRenderer, scheduler) exist.
      clickResolver: null,
      inputBindings: null,
      // Aggregator for download-progress events — instantiated inside
      // the GPU init IIFE before the first `loadAllClouds` call so
      // `cb.onLoadProgress` is the closure target.  See the IIFE.
      loadProgress: null,
    },
    cam: null,
    initialCamSnapshot: null,
    // ── Asset-loading slot bag ───────────────────────────────────────────
    //
    // The slot machinery (see `services/loading/AssetSlot.ts`) replaces the
    // imperative `cloudLoader.reloadSource` call sites with a race-checked
    // fetch→commit pipeline.  We declare the Map up-front so consumers can
    // call `state.assetSlots.points.get(source)?.load(...)` without a null
    // check, but the actual slots are constructed inside the GPU init IIFE
    // — they close over `state.gpu.renderer` for their commit step, and
    // that handle is null until `initGpu` resolves.
    //
    // Task 8 populates only the SDSS entry; Task 9 fills in the rest.  An
    // alternative would be to lazily construct slots on first `load()`,
    // but that splits the wiring across two files (engine + setTier helper)
    // and obscures the lifecycle.  Eager construction inside the IIFE
    // keeps every slot's birth and its renderer-handle in the same lexical
    // scope.
    assetSlots: {
      points: new Map(),
      // Filament slot is minted inside the GPU init IIFE — it commits to
      // `state.gpu.filamentRenderer`, which is null until then.  Null
      // initial mirrors the `state.gpu.renderer = null` lifecycle.
      filaments: null,
      // Famous + PGC-alias slots have no GPU handles to wait for, but we
      // still construct them inside the IIFE alongside the rest of the
      // slot bag so every `state.assetSlots.*` field has the same birth
      // site.  Keeps the lifecycle story uniform: "all slots are minted
      // in one place, by one IIFE pass".
      famousMeta: null,
      pgcAlias: null,
      // CF-4 DM density slot — minted inside the GPU init IIFE alongside
      // the filament slot.  Same null-then-set lifecycle: the slot's
      // commit registers a field on `state.gpu.scalarVolumeRenderer`,
      // which is null until the IIFE constructs it.
      cf4Density: null,
      // MCPM Cosmic Web slot — same null-then-set lifecycle as cf4Density.
      // Tier-aware: setTier reloads on tier change.  See loading/slots/mcpmSlot.ts.
      mcpm: null,
    },
  };

  // ── Register label producers with the director (Task 6) ───────────────
  //
  // Order of registration = order in the merged label list (youAreHere
  // first, POIs after).  Both producers are constructed eagerly in the
  // state literal above, so this runs synchronously before any frame can
  // fire.  We deliberately register both even when the POI subsystem is
  // empty — the director treats an empty contribution as a no-op and
  // there's nothing async to gate on.
  //
  // Structural typing carries the assignment: `YouAreHereSubsystem` is
  // an alias for `LabelProducer`, and `PoiSubsystem` extends it.
  state.subsystems.labelDirector.registerProducer(state.subsystems.youAreHere);
  state.subsystems.labelDirector.registerProducer(state.subsystems.pois);

  // ── Cleanup function returned by `attachOrbitControls` ─────────────────
  // Orbit-controls attachment lives outside `inputBindings` because it
  // needs a fully-constructed OrbitCamera which doesn't exist at
  // engine() time — see inputBindings.ts's docstring.  This handle is
  // a transient local rather than engine state because it's a single
  // teardown function with no other consumers.
  //
  // Boxed as `{current}` because `attachOrbitControls` runs inside the
  // `wireInput` bootstrap phase (a sibling module), so the assignment
  // crosses a module boundary — same `{current}` ref pattern Phase 3
  // introduced for `lastReportedFps`.  `destroy()` reads through the
  // ref to detach the listeners.
  const detachControlsRef: { current: (() => void) | null } = { current: null };

  // ── Async startup ────────────────────────────────────────────────────────

  // Flat slot registry, keyed by `slot.name`.  Lifted to outer scope so the
  // public handle can expose it as `assetSlots` (consumed by the
  // `LoadingDevPanel` debug component — see `EngineHandle.assetSlots`).
  // The IIFE below populates this Map as each slot is minted; it stays
  // empty until then.  The same Map instance is also handed to
  // `aggregateRegistry` / `createLoadProgressEmitter`, so the loading
  // bar and the dev panel agree byte-for-byte on what's "in flight".
  const allSlots = new Map<string, AssetSlot<unknown, unknown>>();

  cb.lifecycle?.onStatusChange?.({ kind: 'initializing' });

  // ── Bootstrap dependency bag ─────────────────────────────────────────────
  //
  // The four bootstrap phases (`initGpu`, `wireSlots`, `wireInput`,
  // `startLoop`) live in `phases/*.ts` and consume a shared
  // `BootstrapDeps` object built here.  Anything the pre-Phase-5 IIFE
  // captured from createEngine's outer scope flows through this bag —
  // the canvas + cb args, the `{current}` ref boxes for forward-declared
  // bindings (frameRef, detachControlsRef, handleRef), and the values
  // needed for `RunFrameDeps` assembly in `startLoop`
  // (fpsCounter, lastReportedFps, allSlots).  The pure `cssToTexPx`
  // helper is imported directly in `runFrame.ts` / `wireInput.ts`;
  // scale-bar derivation moved to React-side via `cb.onCameraChange`.
  //
  // `handleRef.current` is null at this point — the public handle is
  // declared AFTER the bootstrap IIFE below.  `wireInput`'s onDoubleClick
  // closure reads through the ref lazily, so the assignment that lands
  // a few lines past the IIFE is in scope by the time a user can
  // physically double-click the canvas.
  const handleRef: { current: EngineHandle | null } = { current: null };
  // `firstReadySourceRef` carries the first survey whose cloud arrived
  // on the GPU (or `Source.Synthetic` for the fallback) from `wireSlots`
  // forward into `wireInput`, where it shapes the `kind: 'ready'`
  // status payload.  Pre-M1 (2026-05-11 audit) this lived on
  // `phaseLocals.firstReadySource`, which hid the mutation site by
  // shaping it like an `initGpu` output.  The ref makes the contract
  // explicit: a `{current}` box written by one phase and read by a
  // later one, same pattern as `frameRef` / `detachControlsRef`.
  const firstReadySourceRef: { current: Source | null } = { current: null };
  const bootstrapDeps: BootstrapDeps = {
    canvas,
    cb,
    frameRef,
    detachControlsRef,
    handleRef,
    allSlots,
    fpsCounter,
    lastReportedFps,
    firstReadySourceRef,
  };
  // The main async IIFE runs the bootstrap phases.  All errors are
  // caught here and reported via `onStatusChange` — same single
  // try/catch contract the pre-Phase-5 IIFE had.  See
  // `phases/bootstrap.ts`'s `runBootstrapPhases` header for what the
  // four-await chain covers.
  (async () => {
    try {
      await runBootstrapPhases(state, bootstrapDeps);

      // ── Dev-only: trigger the synthetic Gaussian volume ──────────────
      //
      // This mirrors the pattern used by the synthetic point-cloud slot
      // fallback in `wireSlots.ts` (`synthSlot.load(...)` at the end of
      // the parallel survey gate).  The volume slot was minted and
      // registered inside `wireSlots` but intentionally left without an
      // initial `load()` call — the load trigger lives here, AFTER
      // `runBootstrapPhases`, because the slot's commit step calls
      // `state.gpu.scalarVolumeRenderer.addField(...)`, and that renderer
      // is only guaranteed non-null once `initGpu` has completed (which
      // is part of `runBootstrapPhases`).  Calling `load()` before
      // `initGpu` resolves would race the renderer construction; calling it
      // here means the renderer is always ready by the time the async
      // fetch resolves and the commit fires.
      //
      // The `import.meta.env.DEV` guard is mandatory: the slots
      // themselves are only minted in dev builds (see `wireSlots.ts`),
      // so `state.assetSlots.syntheticVolumes` is `undefined` in
      // production.  The truthiness check is purely defensive — Vite's
      // dead-code elimination would strip this entire branch in a
      // production build regardless, because `import.meta.env.DEV` is
      // a compile-time constant that evaluates to `false` outside
      // `vite dev`.
      //
      // We trigger all three fixtures' loads with the same dims +
      // box size so they overlay coherently when the user toggles
      // them on.  Per-fixture default-enabled state is set inside the
      // slot's commit (Gaussian on; grids off).  The shape
      // discriminator on each request picks which generator the
      // fetcher dispatches to.
      if (import.meta.env.DEV && state.assetSlots.syntheticVolumes) {
        const slots = state.assetSlots.syntheticVolumes;
        slots['debug-gaussian']?.load({
          handle: 'debug-gaussian',
          shape: 'gaussian',
          dims: 64,
          boxSizeMpc: 400,
        });
        slots['debug-cartesian']?.load({
          handle: 'debug-cartesian',
          shape: 'cartesian',
          dims: 64,
          boxSizeMpc: 400,
        });
        slots['debug-spherical']?.load({
          handle: 'debug-spherical',
          shape: 'spherical',
          dims: 64,
          boxSizeMpc: 400,
        });
      }
    } catch (err) {
      // Surface initialisation failures via the status callback so the UI
      // shows a readable message rather than a blank canvas.
      const message = err instanceof Error ? err.message : String(err);
      cb.lifecycle?.onStatusChange?.({ kind: 'error', message });
      console.error('Engine startup failed:', err);
    }
  })();

  // ── Public handle ─────────────────────────────────────────────────────────
  //
  // The thirteen table-driven setters land in `boringSetters` and the
  // bespoke ones (async bakes, subsystem forwards, multi-field
  // mutations) live as local `function`s below.  The handle literal at
  // the end stitches both into the eleven sub-handle clusters that make
  // up the public surface.
  const boringSetters = buildSettersFromTable(state, cb, () =>
    state.subsystems.scheduler.requestRender(),
  ) satisfies Record<SettingsTableKey, (value: unknown) => void>;

  // ── Bespoke methods (don't fit the settingsTable shape) ────────────
  //
  // Each function below owns work the descriptor table can't express:
  // async worker bakes (`setBiasMode`), per-source asset-slot reloads
  // (`setTier`), subsystem forwards (`connectSpaceMouse`,
  // `setSpaceMouseSensitivity`), multi-field mutations
  // (`setSourceVisible`), or returning live engine state
  // (`getCloud`, `listVolumeFields`).  They're declared up-front so the
  // sub-handle literal below can reference each by its local name —
  // no `handle.X!` forward references, no `!` non-null assertions.

  function clearSelection(): void {
    // Only fire the callback when something was actually selected.
    // This lets the Esc handler in App.tsx call this unconditionally.
    if (state.subsystems.selection.selected() !== null) {
      state.subsystems.selection.setSelected(null);
      // Clearing the pin also clears the camera-focus target — Esc /
      // close ✕ are explicit "I'm done with this galaxy" signals.
      cb.camera?.onFocusChange?.(null);
      state.subsystems.scheduler.requestRender();
    }
  }

  function setBiasMode(mode: BiasMode): void {
    // Forwarded into the per-frame uniform on the next draw.  The
    // shader branches on the integer value (0 = none, 1 = volume-
    // limited, …) so flipping this from devtools or the SettingsPanel
    // takes effect on the next rendered frame without any pipeline
    // rebuild.
    //
    // We always fire the echo callback — even when the mode is
    // unchanged — so the UI seeds correctly on first call.
    //
    // ### Spec E phase E.4 — cut over to biasCorrectionSubsystem
    //
    // Pre-E.4 this delegated to `state.gpu.renderer.setBiasMode(mode)`
    // and chained a `.then(requestRender)`.  Spec E.4 routes through
    // the subsystem instead — the subsystem owns the mode-flag mirror,
    // the cached per-source ratios/weights, and the worker-runner
    // registry; the renderer keeps only the layout-aware splice
    // surface (`spliceSchechterRatios` / `spliceAngularWeights` /
    // `clearBiasOverlays`).  The `void` discards the returned Promise
    // — engine.ts doesn't await.  The subsystem's `setMode` calls
    // `state.subsystems.scheduler.requestRender()` itself when each
    // per-source splice completes, so visuals update progressively as
    // bakes resolve (same observable behaviour as the pre-E.4 chained
    // `.then`).
    state.settings.bias.mode = mode;
    cb.bias?.onModeChange?.(mode);
    void state.subsystems.biasCorrection.setMode(mode);
    state.subsystems.scheduler.requestRender();
  }

  function resetCamera(): void {
    // Snapshot null-check; cam-null is absorbed inside the helper.
    // Both must exist for a meaningful snap.
    if (!state.initialCamSnapshot) return;
    snapToCameraSnapshot(state, state.initialCamSnapshot);
  }

  function focusOn(info: GalaxyInfo): void {
    // Camera may not be ready yet (cloud still loading); drop the
    // call.  This guard is *separate* from `tweenToGalaxy`'s own
    // cam-null guard — we need it here to gate the `onFocusChange`
    // callback fan-out inside `commitFocus`.  Without the early
    // return, a focus call against a still-bootstrapping engine
    // would update `#focus=…` in the URL while the camera silently
    // refused to move.
    if (!state.cam) return;
    commitFocus(state, cb, info);
  }

  function focusOnHome(): void {
    // Snapshot null-check; cam-null is absorbed inside the helper.
    if (!state.initialCamSnapshot) return;

    // Returning to the home view means we're no longer focused on any
    // particular galaxy.  Notify so the URL clears its `#focus=…`.
    // Stays at the call site (not in the helper) because firing
    // `onFocusChange(null)` is "this action is leaving a focus
    // state", which `tweenToCameraSnapshot` doesn't decide.
    cb.camera?.onFocusChange?.(null);

    tweenToCameraSnapshot(state, state.initialCamSnapshot);
  }

  function focusOnMilkyWay(): void {
    // Distinct from `focusOnHome`: home is the bootstrap-derived wide
    // framing at hundreds of Mpc, well past the impostor's fade-out
    // threshold.  This method tweens to a viewpoint inside the
    // impostor's full-visibility band so the Milky Way is the
    // dominant on-screen subject — target Sgr A* in world space, ride
    // in to `MILKY_WAY_VIEW_DISTANCE_MPC`, preserve the user's
    // current yaw/pitch so they don't get a disorienting snap.
    //
    // Reuses `tweenToCameraSnapshot` (the same helper that powers
    // `focusOnHome`) by synthesizing an `InitialCam`-shaped snapshot
    // on the fly.
    const cam = state.cam;
    if (!cam) return;

    // The Milky Way isn't a catalog object, so any pinned focus on a
    // catalog galaxy is no longer relevant — clear it so the URL
    // hash doesn't keep trying to resolve a stale focus.
    cb.camera?.onFocusChange?.(null);

    tweenToCameraSnapshot(state, {
      target: [MILKY_WAY_CENTER_WORLD[0], MILKY_WAY_CENTER_WORLD[1], MILKY_WAY_CENTER_WORLD[2]],
      distance: MILKY_WAY_VIEW_DISTANCE_MPC,
      yaw: cam.yaw,
      pitch: cam.pitch,
      fovYRad: cam.fovYRad,
      near: cam.near,
      far: cam.far,
    });
  }

  function logCameraStateFn(): void {
    logCameraState(state.cam);
  }

  function selectFamous(id: string): void {
    // Guard: famous catalog may not be loaded yet (sidecars arrive async,
    // slightly after the point cloud).  Early return is safe — the user
    // would have to invoke the palette in the ~500 ms window before the
    // sidecar fetch resolves, which is cosmetically acceptable.
    const cloud = state.sources.catalogs.get(Source.Famous);
    if (!cloud) return;
    const localIdx = state.sources.famousMeta.findIndex((m) => m.id === id);
    if (localIdx < 0) return;

    // Build the same GalaxyInfo the picker would, using the live sidecars
    // so the famous block (name, description, thumbnail) populates.
    const info = buildGalaxyInfo(
      cloud,
      localIdx,
      Source.Famous,
      state.sources.famousMeta,
      state.sources.famousXrefs,
    );
    if (!info) return;

    // selectFamous is a deliberate user focus action (palette pick),
    // so the camera-focus target moves to this galaxy too — hence
    // bundling the selection key into `commitFocus`.
    commitFocus(state, cb, info, { key: { source: Source.Famous, localIdx } });
  }

  type SelectByAliasTarget = {
    source: Source;
    localIdx: number;
    famousMeta?: readonly FamousMetaEntry[];
    famousXrefs?: FamousXrefMap;
  };

  function selectByAlias({ source, localIdx, famousMeta, famousXrefs }: SelectByAliasTarget): void {
    // Guard: source cloud may not be loaded yet (e.g. user opened
    // the palette before GLADE finished arriving), or the localIdx
    // could be stale across a tier swap.  Both are safe early-return
    // conditions — palette stays open, no selection happens.
    const cloud = state.sources.catalogs.get(source);
    if (!cloud) return;
    if (localIdx < 0 || localIdx >= cloud.count) return;

    // Build a GalaxyInfo so the InfoCard populates correctly.
    // Caller-supplied `famousMeta`/`famousXrefs` win over the
    // engine's internal copies — see the EngineHandle JSDoc for the
    // race this defends against.
    const info = buildGalaxyInfo(
      cloud,
      localIdx,
      source,
      famousMeta ?? state.sources.famousMeta,
      famousXrefs ?? state.sources.famousXrefs,
    );
    if (!info) return;

    commitFocus(state, cb, info, { key: { source, localIdx }, info });
  }

  function loadPgcAliasesFn(): Promise<PgcAliasMap> {
    const slot = state.assetSlots.pgcAlias;
    slot?.load();
    return awaitSlotReady(slot, new Map() as PgcAliasMap);
  }

  function setLodMode(mode: LodMode): void {
    if (mode === state.sources.lodMode) return;
    state.sources.lodMode = mode;
    cb.sources?.onLodModeChange?.(mode);
    state.subsystems.scheduler.requestRender();
  }

  async function setSourceVisible(source: Source, visible: boolean): Promise<void> {
    // Delegate to the module-scope helper so tests can drive the same
    // logic against a partial-state stub without a full GPU engine.
    return setSourceVisibleImpl(state, { cb }, source, visible);
  }

  function setTier(tier: Tier): void {
    if (tier === state.sources.tier) return;
    const prevTier = state.sources.tier;
    state.sources.tier = tier;
    cb.sources?.onTierChange?.(tier);

    // For each tier-relevant source, decide whether the new tier needs
    // a re-fetch.  Same target → skip; different target → hand the
    // slot the new request and let it cancel any prior in-flight load,
    // re-fetch the new tier's `.bin`, and run its commit step.
    //
    // Filaments are NOT swapped on tier change — see
    // `filamentFetcher.ts`'s docblock for the rationale.
    for (const src of [Source.SDSS, Source.TwoMRS, Source.Glade, Source.Famous]) {
      if (TIER_TARGETS[prevTier][src] === TIER_TARGETS[tier][src]) continue;
      state.assetSlots.points.get(src)?.load({ source: src, tier });
    }

    // MCPM volume: tier-aware (unlike CF-4). Same per-tier reload semantics
    // as the point-source loop above — different fetcher, different field
    // handle, but the AssetSlot machinery handles cancellation of any
    // in-flight previous-tier load identically.
    state.assetSlots.mcpm?.load({ tier });
  }

  function getCloud(source: Source): GalaxyCatalog | undefined {
    return state.sources.catalogs.get(source);
  }

  function getCloudObjIds(source: Source): BigUint64Array | undefined {
    return state.sources.catalogs.get(source)?.objIDs;
  }

  function setVolumesEnabled(enabled: boolean): void {
    // Master toggle — mutate the settings bag so the per-frame gates
    // in `volumeUpsamplePass.enabled` (and `encodeVolumes` via the
    // same `volumesEnabled` check threaded through) see the new value
    // on the next frame.  We do
    // NOT fire an echo callback (no `cb.onVolumesEnabledChange`)
    // because the React layer owns this value optimistically.
    state.settings.volumes.masterEnabled = enabled;
    // Drive the FadeRegistry on the volumesMaster handle. The
    // encodeHdr* sites multiply this master opacity into every
    // per-field fade lookup, so the entire scalar-volume subsystem
    // ramps in lockstep on master toggle. The pass-enabled gate
    // accepts EITHER masterEnabled === true OR opacity > 0, so the
    // pass keeps blitting through the ~100 ms fade-out tail.
    void state.subsystems.fades.fadeTo(
      { kind: 'volumesMaster' },
      enabled ? 1 : 0,
      enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
    );
    state.subsystems.scheduler.requestRender();
  }

  function addVolumeField(fieldHandle: string, cube: ScalarCube): void {
    // Upload the cube to the renderer.  If the renderer isn't ready
    // yet, the call is a silent no-op — the field can be re-added
    // once the engine boots.
    state.gpu.scalarVolumeRenderer?.addField(fieldHandle, cube);
    // Seed the per-field settings entry with defaults if not already
    // present — re-registering the same handle preserves any
    // previously-tuned values.  Presentation defaults (palette +
    // densityScale) come from the per-handle registry in
    // `src/data/volumeFieldDefaults.ts`.
    if (!state.settings.volumes.fields[fieldHandle]) {
      const defaults = getVolumeFieldDefaults(fieldHandle);
      state.settings.volumes.fields[fieldHandle] = {
        enabled: true,
        intensity: DEFAULT_VOLUME_FIELD_INTENSITY,
        contrast: defaults.contrast,
        densityScale: defaults.densityScale,
        paletteId: defaults.paletteId,
        trim: defaults.trim,
        exposure: defaults.exposure,
      };
    }
    // Forward the current per-field tunables into the renderer so the
    // new upload inherits whatever the user set before re-registering.
    const persisted = state.settings.volumes.fields[fieldHandle]!;
    state.gpu.scalarVolumeRenderer?.setIntensity(fieldHandle, persisted.intensity);
    state.gpu.scalarVolumeRenderer?.setEnabled(fieldHandle, persisted.enabled);
    state.gpu.scalarVolumeRenderer?.setContrast(fieldHandle, persisted.contrast);
    state.gpu.scalarVolumeRenderer?.setDensityScale(fieldHandle, persisted.densityScale);
    state.gpu.scalarVolumeRenderer?.setFieldPalette(fieldHandle, persisted.paletteId);
    state.gpu.scalarVolumeRenderer?.setTrim(fieldHandle, persisted.trim);
    state.gpu.scalarVolumeRenderer?.setExposure(fieldHandle, persisted.exposure);
    // Drive the FadeRegistry from the persisted enable bit:
    //  - Field enabled → fade up to 1 over FADE_IN_DURATION_MS.
    //  - Field disabled → leave the registry at the initial 0 set by
    //    the onFieldAdded callback. The renderer's draw loop's
    //    `(!enabled && opacity <= 0)` skip clause keeps the field
    //    invisible until the user toggles it on (which fires the
    //    fade-in via setVolumeFieldEnabled).
    if (persisted.enabled) {
      void state.subsystems.fades.fadeTo(
        { kind: 'scalarField', field: fieldHandle },
        1,
        FADE_IN_DURATION_MS,
      );
    }
    cb.volumes?.onFieldsChanged?.();
    state.subsystems.scheduler.requestRender();
  }

  function removeVolumeField(fieldHandle: string): void {
    state.gpu.scalarVolumeRenderer?.removeField(fieldHandle);
    delete state.settings.volumes.fields[fieldHandle];
    cb.volumes?.onFieldsChanged?.();
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldEnabled(fieldHandle: string, enabled: boolean): void {
    if (state.settings.volumes.fields[fieldHandle]) {
      state.settings.volumes.fields[fieldHandle].enabled = enabled;
    }
    state.gpu.scalarVolumeRenderer?.setEnabled(fieldHandle, enabled);
    // Drive the FadeRegistry alongside the renderer flip. The renderer's
    // draw loop accepts (!enabled && opacity <= 0) as the skip condition,
    // so the field keeps rendering through the ~100 ms fade-out tail.
    void state.subsystems.fades.fadeTo(
      { kind: 'scalarField', field: fieldHandle },
      enabled ? 1 : 0,
      enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
    );
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldIntensity(fieldHandle: string, intensity: number): void {
    if (state.settings.volumes.fields[fieldHandle]) {
      state.settings.volumes.fields[fieldHandle].intensity = intensity;
    }
    state.gpu.scalarVolumeRenderer?.setIntensity(fieldHandle, intensity);
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldContrast(fieldHandle: string, contrast: number): void {
    if (state.settings.volumes.fields[fieldHandle]) {
      state.settings.volumes.fields[fieldHandle].contrast = contrast;
    }
    state.gpu.scalarVolumeRenderer?.setContrast(fieldHandle, contrast);
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldDensityScale(fieldHandle: string, value: number): void {
    if (state.settings.volumes.fields[fieldHandle]) {
      state.settings.volumes.fields[fieldHandle].densityScale = value;
    }
    state.gpu.scalarVolumeRenderer?.setDensityScale(fieldHandle, value);
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldTrim(fieldHandle: string, trim: number): void {
    if (state.settings.volumes.fields[fieldHandle]) {
      state.settings.volumes.fields[fieldHandle].trim = trim;
    }
    state.gpu.scalarVolumeRenderer?.setTrim(fieldHandle, trim);
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldExposure(fieldHandle: string, exposure: number): void {
    if (state.settings.volumes.fields[fieldHandle]) {
      state.settings.volumes.fields[fieldHandle].exposure = exposure;
    }
    state.gpu.scalarVolumeRenderer?.setExposure(fieldHandle, exposure);
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldPalette(fieldHandle: string, id: ScalarFieldPaletteId): void {
    if (state.settings.volumes.fields[fieldHandle]) {
      state.settings.volumes.fields[fieldHandle].paletteId = id;
    }
    state.gpu.scalarVolumeRenderer?.setFieldPalette(fieldHandle, id);
    state.subsystems.scheduler.requestRender();
  }

  function listVolumeFields(): string[] {
    return state.gpu.scalarVolumeRenderer?.listHandles() ?? [];
  }

  function getVolumeFieldsState(): ReadonlyArray<{
    handle: string;
    label: string;
    enabled: boolean;
    intensity: number;
    contrast: number;
    densityScale: number;
    paletteId: ScalarFieldPaletteId;
    trim: number;
    exposure: number;
  }> {
    const handles = state.gpu.scalarVolumeRenderer?.listHandles() ?? [];
    return handles.map((h) => {
      const field = state.settings.volumes.fields[h];
      const defaults = getVolumeFieldDefaults(h);
      return {
        handle: h,
        label: defaults.label ?? h,
        enabled: field?.enabled ?? true,
        intensity: field?.intensity ?? DEFAULT_VOLUME_FIELD_INTENSITY,
        contrast: field?.contrast ?? defaults.contrast,
        densityScale: field?.densityScale ?? defaults.densityScale,
        paletteId: field?.paletteId ?? DEFAULT_VOLUME_PALETTE_ID,
        trim: field?.trim ?? defaults.trim,
        exposure: field?.exposure ?? defaults.exposure,
      };
    });
  }

  async function connectSpaceMouse(): Promise<boolean> {
    const result = await state.subsystems.spaceMouse.connect();
    return result.ok;
  }

  function disconnectSpaceMouse(): void {
    state.subsystems.spaceMouse.disconnect();
    state.subsystems.scheduler.requestRender();
  }

  function isSpaceMouseConnected(): boolean {
    return state.subsystems.spaceMouse.isConnected();
  }

  function setSpaceMouseSensitivity(value: number): void {
    state.subsystems.spaceMouse.setSensitivity(value);
  }

  function destroy(): void {
    // Every subsystem and every GPU renderer now satisfies `Destroyable`
    // (see `@types/Destroyable.d.ts` and the `_EnforceDestroyable`
    // compile-time guard at the bottom of `EngineSubsystemHandles.d.ts`).
    // That uniformity lets this function read top-to-bottom as a flat
    // list of `.destroy()` calls instead of the previous mosaic of
    // ad-hoc `cancelRender()` / `detach()` / `destroy()` invocations.
    //
    // The ordering below is load-bearing for the first two groups
    // (scheduler before everything; DOM listeners before subsystems
    // that may fire from them).  Past that, teardown order is free —
    // subsystems and renderers are independent of each other for
    // destroy() purposes.

    // 1. Cancel the render loop first — every subsequent destroy() must
    //    be safe to call after the loop has stopped.
    state.subsystems.scheduler.destroy();

    // 2. Detach DOM-level listeners next (before subsystems that may
    //    fire from those listeners are torn down).
    state.subsystems.inputBindings?.destroy();
    state.subsystems.inputBindings = null;
    detachControlsRef.current?.();
    detachControlsRef.current = null;

    // 3. Walk every other subsystem. Order doesn't matter past this
    //    point — all subsystems are independent of each other for
    //    teardown.
    state.subsystems.selection.destroy();
    state.subsystems.tweens.destroy();
    state.subsystems.biasCorrection.destroy();
    state.subsystems.youAreHere.destroy();
    state.subsystems.labelDirector.destroy();
    state.subsystems.pois.destroy();
    // Teardown order across the three impostor subsystems matters:
    // texturedImpostors subscribes to galaxyAtlas's eviction handler
    // (so destroy it first), proceduralDisks is independent, and
    // galaxyAtlas releases its GPU texture last among the three.
    state.subsystems.texturedImpostors?.destroy();
    state.subsystems.texturedImpostors = null;
    state.subsystems.proceduralDisks?.destroy();
    state.subsystems.proceduralDisks = null;
    state.subsystems.galaxyAtlas?.destroy();
    state.subsystems.galaxyAtlas = null;
    state.subsystems.spaceMouse.destroy();
    state.subsystems.clickResolver?.destroy();
    state.subsystems.clickResolver = null;
    state.subsystems.loadProgress?.destroy();
    state.subsystems.loadProgress = null;

    // 4. GPU renderers — every one satisfies Destroyable too.  WebGPU
    //    buffers/textures do NOT release via JS GC alone, so destroy()
    //    is mandatory for each.  The point renderer (state.gpu.renderer)
    //    owns the largest allocations in the app (per-source vertex
    //    buffers, ~14 MB GPU + ~14 MB CPU mirror per SDSS deck).
    state.gpu.pickRenderer?.destroy();
    state.gpu.pickRenderer = null;
    state.gpu.postProcess?.destroy();
    state.gpu.postProcess = null;
    state.gpu.volumeOffscreen?.destroy();
    state.gpu.volumeOffscreen = null;
    state.gpu.filamentRenderer?.destroy();
    state.gpu.filamentRenderer = null;
    state.gpu.labelRenderer?.destroy();
    state.gpu.labelRenderer = null;
    state.gpu.markerLineRenderer?.destroy();
    state.gpu.markerLineRenderer = null;
    state.gpu.texturedQuadRenderer?.destroy();
    state.gpu.texturedQuadRenderer = null;
    state.gpu.texturedDiskRenderer?.destroy();
    state.gpu.texturedDiskRenderer = null;
    state.gpu.proceduralDiskRenderer?.destroy();
    state.gpu.proceduralDiskRenderer = null;
    state.gpu.milkyWayRenderer?.destroy();
    state.gpu.milkyWayRenderer = null;
    state.gpu.scalarVolumeRenderer?.destroy();
    state.gpu.scalarVolumeRenderer = null;
    state.gpu.volumeUpsample?.destroy();
    state.gpu.volumeUpsample = null;
    state.gpu.timingService.destroy();
    state.gpu.timingService = createDisabledGpuTimingService();
    state.gpu.renderer?.destroy();
    state.gpu.renderer = null;

    // 5. Drop remaining strong references to aid GC.
    state.sources.catalogs.clear();
    state.cam = null;
  }

  // ── Handle literal — eleven sub-handle clusters + destroy + slots ──
  //
  // Each sub-handle is a thin forwarder onto the local function or the
  // table-driven `boringSetters` resolved above.  No logic is
  // duplicated; this literal is the only public surface.
  const handle: EngineHandle = {
    points: {
      setSize: (sizePx) => boringSetters.setPointSize(sizePx),
      setBrightness: (value) => boringSetters.setBrightness(value),
      setDepthFade: (enabled) => boringSetters.setDepthFadeEnabled(enabled),
      setHighlightFallback: (enabled) => boringSetters.setHighlightFallback(enabled),
      setRealOnly: (enabled) => boringSetters.setRealOnlyMode(enabled),
    },
    tonemap: {
      setExposure: (value) => boringSetters.setExposure(value),
      setCurve: (curve) => boringSetters.setToneMapCurve(curve),
    },
    camera: {
      setAutoRotate: (enabled) => boringSetters.setAutoRotate(enabled),
      reset: resetCamera,
      focusOn,
      focusOnHome,
      focusOnMilkyWay,
      logState: logCameraStateFn,
    },
    selection: {
      clear: clearSelection,
      selectFamous,
      selectByAlias,
      loadAliases: loadPgcAliasesFn,
    },
    sources: {
      setLodMode,
      setVisible: setSourceVisible,
      setTier,
      getCloud,
      getCloudObjIds,
    },
    bias: {
      setMode: setBiasMode,
      setAbsMagLimit: (absMag) => boringSetters.setAbsMagLimit(absMag),
    },
    thumbnails: {
      setEnabled: (enabled) => boringSetters.setGalaxyTexturesEnabled(enabled),
    },
    milkyWay: {
      // Drive the FadeRegistry alongside the boolean flip so the user
      // sees a smooth ramp on toggle. milkyWayPass.enabled accepts
      // EITHER the boolean OR a non-zero overlay opacity, so we can
      // flip the setting first and let the gate keep the pass alive
      // through the ~100 ms fade-out tail.
      setEnabled: (enabled) => {
        boringSetters.setMilkyWayEnabled(enabled);
        void state.subsystems.fades.fadeTo(
          { kind: 'overlay', id: 'milkyWay' },
          enabled ? 1 : 0,
          enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
        );
        state.subsystems.scheduler.requestRender();
      },
    },
    filaments: {
      // Drive the FadeRegistry alongside the boolean flip so the user
      // sees a smooth ramp on toggle. The pass.enabled gate in
      // filamentsPass.ts accepts EITHER the boolean OR a non-zero
      // fade opacity, so we can flip the setting first and let the
      // gate keep the pass alive through the ~100 ms fade-out tail.
      setEnabled: (enabled) => {
        boringSetters.setFilamentsEnabled(enabled);
        void state.subsystems.fades.fadeTo(
          { kind: 'filaments' },
          enabled ? 1 : 0,
          enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
        );
        state.subsystems.scheduler.requestRender();
      },
      setIntensity: (value) => boringSetters.setFilamentIntensity(value),
    },
    labels: {
      // Forward the per-category toggle into the POI subsystem (which
      // owns the canonical visibility record used by `produceLabels`)
      // AND mirror the same change into `state.settings` so the
      // engine-side settings bag stays the source of truth for
      // serialisation / debugging.  The echo carries a fresh copy of
      // the full record so subscribers can treat each emission as an
      // immutable snapshot — same idiom as the camera-snapshot echo.
      setCategoryVisible: (category, visible) => {
        state.subsystems.pois.setCategoryVisible(category, visible);
        state.settings.labelCategoryVisibility = {
          ...state.settings.labelCategoryVisibility,
          [category]: visible,
        };
        cb.labels?.onCategoryVisibilityChange?.({
          ...state.settings.labelCategoryVisibility,
        });
        state.subsystems.scheduler.requestRender();
      },
    },
    volumes: {
      setMasterEnabled: setVolumesEnabled,
      add: addVolumeField,
      remove: removeVolumeField,
      setEnabled: setVolumeFieldEnabled,
      setIntensity: setVolumeFieldIntensity,
      setContrast: setVolumeFieldContrast,
      setDensityScale: setVolumeFieldDensityScale,
      setTrim: setVolumeFieldTrim,
      setExposure: setVolumeFieldExposure,
      setPalette: setVolumeFieldPalette,
      list: listVolumeFields,
      getState: getVolumeFieldsState,
    },
    input: {
      spaceMouse: {
        connect: connectSpaceMouse,
        disconnect: disconnectSpaceMouse,
        isConnected: isSpaceMouseConnected,
        setSensitivity: setSpaceMouseSensitivity,
      },
    },
    // ── Debug sub-handle (observability, not knobs) ──────────────────────
    //
    // Getter rather than a copied reference: `state.gpu.timingService` is
    // assigned by the async `initGpu` IIFE AFTER this handle literal is
    // constructed.  A copied value would be `null` forever; the getter
    // reads the live slot whenever the React shell asks for it.  See
    // `EngineDebugHandle.d.ts` for the H5-sub-handle rationale.
    debug: {
      get timingService() {
        return state.gpu.timingService;
      },
    },

    destroy,

    // ── Asset-slot registry (dev-panel surface) ──────────────────────────
    //
    // `allSlots` is declared at outer scope and populated by the GPU init
    // IIFE.  Exposing the same Map reference here means the dev panel
    // observes new slots as they appear.  Read-only at the type level so
    // misuse from the React side (mutating the slot bag directly) trips
    // the typechecker.
    assetSlots: allSlots,
  };

  // Publish the handle to the bootstrap deps so `wireInput`'s onDoubleClick
  // closure can resolve `handle.focusOn(...)` lazily.  The handle literal
  // above is fully constructed at this point; the bootstrap IIFE may still
  // be in flight (resolves async), but by the time the user can physically
  // double-click the canvas, the orbit controls are wired and `handleRef`
  // is non-null.
  handleRef.current = handle;

  return handle;
}
