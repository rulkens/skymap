/**
 * EngineState — type-shape smoke tests. The module is pure types, so
 * `tsc --noEmit` does most of the verification; these runtime tests pin
 * the assertable subset:
 *
 *   1. A literal compiles when populated with realistic values.
 *   2. Building the same shape from `data/defaults.ts` typechecks.
 *   3. Sub-bag fields are mutable — the type isn't accidentally
 *      `Readonly<>` where the engine wants to assign.
 *
 * `EngineSettingsState` is a flat list of sub-bags; the user-facing
 * `mode` and `absMagLimit` live inside `settings.bias`.  (Bake-derived
 * per-galaxy weights aren't engine state at all — `biasCorrectionSubsystem`
 * splices them straight into the vertex buffer.)
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import type { GalaxyCatalogSourceType } from '../../src/@types/data/galaxyCatalog/GalaxyCatalogSourceType';

import type { EngineState } from '../../src/@types/engine/state/EngineState';
import { createEngineData } from '../../src/services/engine/data/createEngineData';
import type { EngineSettingsState } from '../../src/@types/settings/EngineSettingsState';
import type { EnginePickingState } from '../../src/@types/engine/state/EnginePickingState';
import type { SelectionState } from '../../src/@types/store/SelectionState';
import type { SelectionRowsState } from '../../src/@types/store/SelectionRowsState';

import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_EXPOSURE,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
  DEFAULT_HIGHLIGHT_FALLBACK,
  DEFAULT_MILKY_WAY_ENABLED,
  DEFAULT_MILKY_WAY_LABEL_ENABLED,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_REAL_ONLY_MODE,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VOLUMES_ENABLED,
  DEFAULT_FLOW,
} from '../../src/data/defaults';
import { createCameraClock } from '../../src/services/engine/camera/cameraClock';
import { createRenderScheduler } from '../../src/services/engine/subsystems/renderScheduler';
import { createBiasCorrectionSubsystem } from '../../src/services/engine/subsystems/biasCorrectionSubsystem';
import { createLabelDirectorSubsystem } from '../../src/services/engine/subsystems/labelDirectorSubsystem';
import { createStructureFocusSubsystem } from '../../src/services/engine/subsystems/structureFocusSubsystem';
import { createClipPlayer } from '../../src/services/engine/subsystems/clipPlayer';
import { createClipPathInspector } from '../../src/services/engine/subsystems/clipPathInspector';
import { createFadeRegistry } from '../../src/services/animation/fadeRegistry';
import { createDisabledGpuTimingService } from '../../src/services/gpu/timing/gpuTimingService';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../src/store/rootReducer';

function makeRegistry() {
  return createFadeRegistry({ requestRender: () => {} });
}
import { Source, SOURCE_REGISTRY } from '../../src/data/sources';

// No-op rAF/cAF pair so the scheduler factory doesn't reach for
// `window.requestAnimationFrame` in the Vitest node environment. No
// frames fire here — the scheduler is built only to give the
// EngineState literal a real (typed) value.
const noopRaf: typeof requestAnimationFrame = () => 0;
const noopCaf: typeof cancelAnimationFrame = () => {};

describe('EngineState type', () => {
  it('accepts a literal populated with realistic values', () => {
    // Build each sub-bag separately so a future field addition forces
    // an explicit update here — easier to spot than in a single
    // 30-line literal.
    const settings: EngineSettingsState = {
      galaxyCatalogs: {
        enabled: true,
        sizePx: 2.5,
        brightness: 1.0,
        depthFade: true,
        highlightFallback: false,
        realOnly: false,
        items: {
          synthetic: { enabled: true, labelEnabled: true },
          sdss: { enabled: true, labelEnabled: true },
          '2mrs': { enabled: true, labelEnabled: true },
          glade: { enabled: true, labelEnabled: true },
          famousGalaxy: { enabled: true, labelEnabled: true },
          milliquas: { enabled: true, labelEnabled: true },
        },
      },
      tonemap: { exposure: 3.0, curve: DEFAULT_TONE_MAP_CURVE },
      bias: { mode: DEFAULT_BIAS_MODE, absMagLimit: -19 },
      thumbnails: { enabled: true },
      milkyWay: { enabled: true, labelEnabled: true },
      filaments: { enabled: false, intensity: 1 },
      volumes: { enabled: false, items: {} },
      flow: {
        enabled: false,
        mode: 'advect',
        intensity: 0.7,
        count: 40000,
        trail: 0.003,
        flowSpeed: 0.06,
        densityBias: 1,
        wander: 0.15,
        boundaryFadeWidth: 0.1,
      },
      labels: { focusedOnly: false },
      debug: {
        showPickBuffer: false,
        showDiskRadiusRing: false,
        disabledPasses: {},
        clipPathInspect: {
          clipId: null,
          scrub01: 0,
          align: 1.35,
          rampSec: 1.4,
          linger: 0.7,
          lingerSec: 1.4,
          spline: 'causalHermite',
          turnDelay: 1.1,
          lookAhead: 1.3,
          passByOffset: 4,
          passByDir: 'outsideBend',
          active: {
            align: false,
            rampSec: false,
            linger: false,
            spline: false,
            passBy: false,
          },
        },
      },
      structures: {
        enabled: true,
        items: {
          cluster: { enabled: true, labelEnabled: true },
          supercluster: { enabled: true, labelEnabled: true },
          void: { enabled: true, labelEnabled: true },
          group: { enabled: true, labelEnabled: true },
        },
      },
    };
    const picking: EnginePickingState = {
      pickInFlight: false,
      pointerDown: false,
      lastFrameUniformBytes: null,
    };

    // Forward-declare so the bias-correction subsystem's narrow
    // closures (getMode / getLoadedClouds / requestRender) can capture
    // the live ref before `state` is assigned.
    // eslint-disable-next-line prefer-const
    let stateRef: { current: EngineState | null } = { current: null };
    const fixtureStore1 = configureStore({ reducer: rootReducer });
    const fixtureClock1 = createCameraClock();
    const state: EngineState = {
      settings,
      // `state.tier` delegates to the root tier slice in the engine; in this
      // plain literal it's a direct value (the type is `Tier`, not a getter).
      tier: 'medium',
      // `state.selection`/`selectionRows` delegate to the store in the real engine;
      // here they're direct values representing the initial (all-null) Redux state.
      selection: { hover: null, select: null, focus: null },
      selectionRows: { hover: null, select: null, focus: null },
      data: createEngineData(),
      picking,
      gpu: {
        renderer: null,
        pickRenderer: null,
        milkyWayPickRenderer: null,
        fadeBgl: null,
        sourceBgl: null,
        focusBgl: null,
        focusUniform: null,
        postProcess: null,
        volumeOffscreen: null,
        filamentRenderer: null,
        labelRenderer: null,
        markerLineRenderer: null,
        debugLineRenderer: null,
        selectionRingRenderer: null,
        structureMarkerRenderer: null,
        texturedDiskRenderer: null,
        proceduralDiskRenderer: null,
        milkyWayRenderer: null,
        milkyWayCloud: null,
        milkyWayCloudRenderer: null,
        horizonShellRenderer: null,
        volumeFieldRenderer: null,
        flowFieldRenderer: null,
        volumeUpsample: null,
        pickDebugOverlay: null,
        diskRadiusRing: null,
        timingService: createDisabledGpuTimingService(),
      },
      subsystems: {
        galaxyAtlas: null,
        proceduralDisks: null,
        texturedDisks: null,
        hiResFamous: null,
        hiResFamousTexture: null,
        loadProgress: null,
        biasCorrection: createBiasCorrectionSubsystem({
          getMode: () => stateRef.current!.settings.bias.mode,
          getLoadedClouds: () => stateRef.current!.data.galaxies.catalogs,
          requestRender: () => stateRef.current!.subsystems.scheduler.requestRender(),
        }),
        labelDirector: createLabelDirectorSubsystem(),
        structureFocus: createStructureFocusSubsystem({ requestRender: () => {} }),
        clipPlayer: createClipPlayer({
          store: fixtureStore1,
          requestRender: () => {},
          clock: fixtureClock1,
          getEngineState: () => stateRef.current!,
        }),
        clipPathInspector: createClipPathInspector(),
        clickResolver: null,
        inputBindings: null,
        scheduler: createRenderScheduler({ onFrame: () => {}, rafImpl: noopRaf, cafImpl: noopCaf }),
        fades: makeRegistry(),
      },
      cam: null,
      cameraRuntime: {
        clock: createCameraClock(),
        projection: { fovYRad: 1, aspect: 1, near: 0.01, far: 50000 },
        lastPose: { current: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 } },
        prevActiveId: { current: 'resting' },
      },
      assetSlots: {
        points: new Map(),
        filaments: null,
        famousMeta: null,
        structureCatalog: null,
        pgcAlias: null,
        cf4Density: null,
        mcpm: null,
        flow: null,
      },
      requests: new Set(),
    };
    stateRef.current = state;

    expect(state.settings.galaxyCatalogs.sizePx).toBe(2.5);
    expect(state.settings.galaxyCatalogs.enabled).toBe(true);
    expect(state.settings.galaxyCatalogs.items.sdss.enabled).toBe(true);
    expect(state.settings.galaxyCatalogs.items.famousGalaxy.labelEnabled).toBe(true);
    expect(state.settings.bias.mode).toBe(DEFAULT_BIAS_MODE);
    // The data tier lives in its own root slice, surfaced on `state.tier`
    // (cross-cutting: galaxy catalogs / MCPM volume / filaments all fetch by it).
    expect(state.tier).toBe('medium');
    // Hover/select/focus live in the Redux `selection` slice, not the picking bag.
    expect(state.selection.hover).toBeNull();
    expect(state.gpu.renderer).toBeNull();
  });

  it('builds the settings + bias sub-bags directly from data/defaults.ts', () => {
    // Mirror the engine's startup construction — if a default's type
    // drifts (e.g. `DEFAULT_BIAS_MODE` becomes a string), this fails to
    // compile here rather than inside engine.ts.
    const settings: EngineSettingsState = {
      galaxyCatalogs: {
        enabled: true,
        sizePx: DEFAULT_POINT_SIZE_PX,
        brightness: DEFAULT_BRIGHTNESS,
        depthFade: DEFAULT_DEPTH_FADE_ENABLED,
        highlightFallback: DEFAULT_HIGHLIGHT_FALLBACK,
        realOnly: DEFAULT_REAL_ONLY_MODE,
        items: {
          synthetic: { enabled: true, labelEnabled: true },
          sdss: { enabled: true, labelEnabled: true },
          '2mrs': { enabled: true, labelEnabled: true },
          glade: { enabled: true, labelEnabled: true },
          famousGalaxy: { enabled: true, labelEnabled: true },
          milliquas: { enabled: true, labelEnabled: true },
        },
      },
      tonemap: { exposure: DEFAULT_EXPOSURE, curve: DEFAULT_TONE_MAP_CURVE },
      bias: { mode: DEFAULT_BIAS_MODE, absMagLimit: DEFAULT_ABS_MAG_LIMIT },
      thumbnails: { enabled: DEFAULT_GALAXY_TEXTURES_ENABLED },
      milkyWay: {
        enabled: DEFAULT_MILKY_WAY_ENABLED,
        labelEnabled: DEFAULT_MILKY_WAY_LABEL_ENABLED,
      },
      filaments: {
        enabled: SOURCE_REGISTRY[Source.Filaments].visible,
        intensity: SOURCE_REGISTRY[Source.Filaments].intensity,
      },
      volumes: { enabled: DEFAULT_VOLUMES_ENABLED, items: {} },
      flow: { ...DEFAULT_FLOW },
      labels: { focusedOnly: false },
      debug: {
        showPickBuffer: false,
        showDiskRadiusRing: false,
        disabledPasses: {},
        clipPathInspect: {
          clipId: null,
          scrub01: 0,
          align: 1.35,
          rampSec: 1.4,
          linger: 0.7,
          lingerSec: 1.4,
          spline: 'causalHermite',
          turnDelay: 1.1,
          lookAhead: 1.3,
          passByOffset: 4,
          passByDir: 'outsideBend',
          active: {
            align: false,
            rampSec: false,
            linger: false,
            spline: false,
            passBy: false,
          },
        },
      },
      structures: {
        enabled: true,
        items: {
          cluster: { enabled: true, labelEnabled: true },
          supercluster: { enabled: true, labelEnabled: true },
          void: { enabled: true, labelEnabled: true },
          group: { enabled: true, labelEnabled: true },
        },
      },
    };
    expect(settings.galaxyCatalogs.sizePx).toBe(DEFAULT_POINT_SIZE_PX);
    expect(settings.bias.absMagLimit).toBe(DEFAULT_ABS_MAG_LIMIT);
    // The "You are here" label axis defaults on, independently of the disk.
    expect(settings.milkyWay.labelEnabled).toBe(true);
  });

  it('allows in-place mutation of every sub-bag field', () => {
    // The engine mutates fields directly (e.g.
    // `state.settings.galaxyCatalogs.brightness = v`), so the type must NOT be
    // Readonly. Exercise one representative mutation per bag.
    // eslint-disable-next-line prefer-const
    let stateRef: { current: EngineState | null } = { current: null };
    const fixtureStore2 = configureStore({ reducer: rootReducer });
    const fixtureClock2 = createCameraClock();
    const state: EngineState = {
      settings: {
        galaxyCatalogs: {
          enabled: true,
          sizePx: 1,
          brightness: 1,
          depthFade: true,
          highlightFallback: false,
          realOnly: false,
          items: {
            synthetic: { enabled: true, labelEnabled: true },
            sdss: { enabled: true, labelEnabled: true },
            '2mrs': { enabled: true, labelEnabled: true },
            glade: { enabled: true, labelEnabled: true },
            famousGalaxy: { enabled: true, labelEnabled: true },
            milliquas: { enabled: true, labelEnabled: true },
          },
        },
        tonemap: { exposure: 1, curve: DEFAULT_TONE_MAP_CURVE },
        bias: { mode: DEFAULT_BIAS_MODE, absMagLimit: 0 },
        thumbnails: { enabled: true },
        milkyWay: { enabled: true, labelEnabled: true },
        filaments: { enabled: false, intensity: 1 },
        volumes: { enabled: false, items: {} },
        flow: { ...DEFAULT_FLOW },
        labels: { focusedOnly: false },
        debug: {
          showPickBuffer: false,
          showDiskRadiusRing: false,
          disabledPasses: {},
          clipPathInspect: {
            clipId: null,
            scrub01: 0,
            align: 1.35,
            rampSec: 1.4,
            linger: 0.7,
            lingerSec: 1.4,
            spline: 'causalHermite',
            turnDelay: 1.1,
            lookAhead: 1.3,
            passByOffset: 4,
            passByDir: 'outsideBend',
            active: {
              align: false,
              rampSec: false,
              linger: false,
              spline: false,
              passBy: false,
            },
          },
        },
        structures: {
          enabled: true,
          items: {
            cluster: { enabled: true, labelEnabled: true },
            supercluster: { enabled: true, labelEnabled: true },
            void: { enabled: true, labelEnabled: true },
            group: { enabled: true, labelEnabled: true },
          },
        },
      },
      // `state.tier` delegates to the root tier slice in the engine; in this
      // plain literal it's a direct value (the type is `Tier`, not a getter).
      tier: 'medium',
      // `state.selection`/`selectionRows` delegate to the store in the real engine;
      // here they're direct values representing the initial (all-null) Redux state.
      selection: { hover: null, select: null, focus: null },
      selectionRows: { hover: null, select: null, focus: null },
      data: createEngineData(),
      picking: {
        pickInFlight: false,
        pointerDown: false,
        lastFrameUniformBytes: null,
      },
      gpu: {
        renderer: null,
        pickRenderer: null,
        milkyWayPickRenderer: null,
        fadeBgl: null,
        sourceBgl: null,
        focusBgl: null,
        focusUniform: null,
        postProcess: null,
        volumeOffscreen: null,
        filamentRenderer: null,
        labelRenderer: null,
        markerLineRenderer: null,
        debugLineRenderer: null,
        selectionRingRenderer: null,
        structureMarkerRenderer: null,
        texturedDiskRenderer: null,
        proceduralDiskRenderer: null,
        milkyWayRenderer: null,
        milkyWayCloud: null,
        milkyWayCloudRenderer: null,
        horizonShellRenderer: null,
        volumeFieldRenderer: null,
        flowFieldRenderer: null,
        volumeUpsample: null,
        pickDebugOverlay: null,
        diskRadiusRing: null,
        timingService: createDisabledGpuTimingService(),
      },
      subsystems: {
        galaxyAtlas: null,
        proceduralDisks: null,
        texturedDisks: null,
        hiResFamous: null,
        hiResFamousTexture: null,
        loadProgress: null,
        biasCorrection: createBiasCorrectionSubsystem({
          getMode: () => stateRef.current!.settings.bias.mode,
          getLoadedClouds: () => stateRef.current!.data.galaxies.catalogs,
          requestRender: () => stateRef.current!.subsystems.scheduler.requestRender(),
        }),
        labelDirector: createLabelDirectorSubsystem(),
        structureFocus: createStructureFocusSubsystem({ requestRender: () => {} }),
        clipPlayer: createClipPlayer({
          store: fixtureStore2,
          requestRender: () => {},
          clock: fixtureClock2,
          getEngineState: () => stateRef.current!,
        }),
        clipPathInspector: createClipPathInspector(),
        clickResolver: null,
        inputBindings: null,
        scheduler: createRenderScheduler({ onFrame: () => {}, rafImpl: noopRaf, cafImpl: noopCaf }),
        fades: makeRegistry(),
      },
      cam: null,
      cameraRuntime: {
        clock: createCameraClock(),
        projection: { fovYRad: 1, aspect: 1, near: 0.01, far: 50000 },
        lastPose: { current: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 } },
        prevActiveId: { current: 'resting' },
      },
      assetSlots: {
        points: new Map(),
        filaments: null,
        famousMeta: null,
        structureCatalog: null,
        pgcAlias: null,
        cf4Density: null,
        mcpm: null,
        flow: null,
      },
      requests: new Set(),
    };
    stateRef.current = state;

    state.settings.galaxyCatalogs.brightness = 2.5;
    state.settings.bias.absMagLimit = -20;
    // The data tier lives in its own root slice, surfaced on `state.tier`; the
    // action layer copies-on-write, but the field itself is assignable.
    state.tier = 'large';
    // Hover/select/focus live in the Redux selection slice, not `state.picking`.
    // In the plain literal the `selection` field itself is mutable; individual
    // slots inside SelectionState are readonly, so replace the whole object.
    state.selection = {
      hover: { type: 'galaxyCatalog', source: 1 as GalaxyCatalogSourceType, index: 42 },
      select: null,
      focus: null,
    };
    state.picking.pickInFlight = true;

    expect(state.settings.galaxyCatalogs.brightness).toBe(2.5);
    expect(state.settings.bias.absMagLimit).toBe(-20);
    expect(state.tier).toBe('large');
    expect(state.selection.hover).toEqual({ type: 'galaxyCatalog', source: 1, index: 42 });
    expect(state.picking.pickInFlight).toBe(true);
  });

  it('carries selection: SelectionState and selectionRows: SelectionRowsState', () => {
    // Type-level proof that the two new getter-backed fields are on EngineState
    // with the right types. The actual delegation (`store.getState().selection`)
    // is proven by `npm run typecheck` on engine.ts; this pins the declared
    // surface on the shared type so mis-typed fields fail here rather than
    // silently in the per-frame readers added in later tasks.
    expectTypeOf<EngineState['selection']>().toEqualTypeOf<SelectionState>();
    expectTypeOf<EngineState['selectionRows']>().toEqualTypeOf<SelectionRowsState>();
  });
});
