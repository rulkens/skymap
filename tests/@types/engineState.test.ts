/**
 * EngineState — type-shape smoke tests.
 *
 * The module is pure types, so most verification is "does the project
 * still typecheck after the engine.ts refactor?" — answered by
 * `npx tsc --noEmit` and the rest of the test suite continuing to
 * pass.  These tests pin down the subset of behaviour that *can* be
 * asserted at runtime:
 *
 *   1. A literal of the type compiles when populated with realistic
 *      values.
 *   2. Building the same shape using only `data/defaults.ts` constants
 *      typechecks (catches accidental drift in the defaults' types).
 *   3. The sub-bag fields stay accessible after assignment — i.e. the
 *      type isn't accidentally `Readonly<>` anywhere we want mutation.
 *
 * If these three pass and `tsc --noEmit` is clean, the type is wired
 * correctly.  Anything subtler shows up in the engine's own behaviour
 * tests (which exercise it transitively).
 *
 * ### Post-H5 (2026-05-11) shape
 *
 * `EngineSettingsState` is a flat list of eight cluster sub-bags
 * (`points`, `tonemap`, `camera`, `bias`, `thumbnails`, `milkyWay`,
 * `filaments`, `volumes`).  `EngineBiasState` holds only the
 * bake-output sentinels (`apparentMagLimit`, `schechterMStar`,
 * `schechterAlpha`); the user-facing `mode` and `absMagLimit` live
 * inside `settings.bias`.
 */

import { describe, it, expect } from 'vitest';

import type { EngineState } from '../../src/@types/engine/state/EngineState';
import type { EngineSettingsState } from '../../src/@types/settings/EngineSettingsState';
import type { EngineBiasState } from '../../src/@types/engine/state/EngineBiasState';
import type { EngineSourceState } from '../../src/@types/engine/state/EngineSourceState';
import type { EnginePickingState } from '../../src/@types/engine/state/EnginePickingState';

import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_AUTO_ROTATE,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_EXPOSURE,
  DEFAULT_FILAMENTS_ENABLED,
  DEFAULT_FILAMENT_INTENSITY,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
  DEFAULT_HIGHLIGHT_FALLBACK,
  DEFAULT_LOD_MODE,
  DEFAULT_MILKY_WAY_ENABLED,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_REAL_ONLY_MODE,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VISIBLE_SOURCE_MASK,
  DEFAULT_VOLUMES_ENABLED,
} from '../../src/data/defaults';
import { createTweenManager } from '../../src/services/engine/camera/tweenManager';
import { createSpaceMouseSubsystem } from '../../src/services/engine/subsystems/spaceMouseSubsystem';
import { createRenderScheduler } from '../../src/services/engine/subsystems/renderScheduler';
import { createSelectionSubsystem } from '../../src/services/engine/subsystems/selectionSubsystem';
import { createBiasCorrectionSubsystem } from '../../src/services/engine/subsystems/biasCorrectionSubsystem';
import { createYouAreHereSubsystem } from '../../src/services/engine/subsystems/youAreHereSubsystem';
import { createLabelDirectorSubsystem } from '../../src/services/engine/subsystems/labelDirectorSubsystem';
import { createPoiSubsystem } from '../../src/services/engine/subsystems/poiSubsystem';
import { createDisabledGpuTimingService } from '../../src/services/gpu/timing/gpuTimingService';
import type { EngineCallbacks } from '../../src/@types/engine/EngineCallbacks';
import { Source } from '../../src/data/sources';

// A no-op callback bag suitable for the selection subsystem fixture.
// `onHoverChange` / `onSelectChange` are the only fields the subsystem
// actually reads; the rest are typed-required-only.
const noopCb = {
  onStatusChange: () => {},
  onHoverChange: () => {},
  onSelectChange: () => {},
} as unknown as EngineCallbacks;

// Inject a no-op rAF/cAF pair so the scheduler factory doesn't reach
// for `window.requestAnimationFrame` in the Vitest node environment.
// We never fire frames in these tests — the scheduler is built only so
// the EngineState literal has a real (typed) value to point at.
const noopRaf: typeof requestAnimationFrame = () => 0;
const noopCaf: typeof cancelAnimationFrame = () => {};

describe('EngineState type', () => {
  it('accepts a literal populated with realistic values', () => {
    // Build each sub-bag separately so a future field addition forces
    // an explicit update here too — easier to spot the drift than a
    // single 30-line literal.
    const settings: EngineSettingsState = {
      points: {
        sizePx: 2.5,
        brightness: 1.0,
        depthFade: true,
        highlightFallback: false,
        realOnly: false,
      },
      tonemap: { exposure: 3.0, curve: DEFAULT_TONE_MAP_CURVE },
      camera: { autoRotate: false },
      bias: { mode: DEFAULT_BIAS_MODE, absMagLimit: -19 },
      thumbnails: { enabled: true },
      milkyWay: { enabled: true },
      filaments: { enabled: false, intensity: 1 },
      volumes: { masterEnabled: false, fields: {} },
    };
    const bias: EngineBiasState = {
      apparentMagLimit: 0,
      schechterMStar: 0,
      schechterAlpha: 0,
    };
    const sources: EngineSourceState = {
      visibleMask: DEFAULT_VISIBLE_SOURCE_MASK,
      lodMode: DEFAULT_LOD_MODE,
      clouds: new Map(),
      famousMeta: [],
      famousXrefs: {},
      tier: 'medium',
    };
    const picking: EnginePickingState = {
      latestMouseCss: null,
      lastPickedMouseCss: null,
      pickInFlight: false,
      pointerDown: false,
    };

    // Forward-declare so the bias-correction subsystem's narrow
    // closures (getMode / getLoadedClouds / requestRender) can capture
    // the live ref before `state` is assigned.
    // eslint-disable-next-line prefer-const
    let stateRef: { current: EngineState | null } = { current: null };
    const state: EngineState = {
      settings,
      bias,
      sources,
      picking,
      gpu: {
        renderer: null,
        pickRenderer: null,
        postProcess: null,
        volumeOffscreen: null,
        filamentRenderer: null,
        labelRenderer: null,
        markerLineRenderer: null,
        texturedQuadRenderer: null,
        texturedDiskRenderer: null,
        proceduralDiskRenderer: null,
        milkyWayRenderer: null,
        scalarVolumeRenderer: null,
        volumeUpsample: null,
        timingService: createDisabledGpuTimingService(),
      },
      subsystems: {
        galaxyAtlas: null,
        proceduralDisks: null,
        texturedImpostors: null,
        loadProgress: null,
        spaceMouse: createSpaceMouseSubsystem({
          cancelTween: () => {},
          onConnectionChange: () => {},
          onAxes: () => {},
        }),
        tweens: createTweenManager(),
        selection: createSelectionSubsystem({
          cb: noopCb,
          getCloud: () => undefined,
          getFamousMeta: () => [],
          getFamousXrefs: () => ({}),
        }),
        biasCorrection: createBiasCorrectionSubsystem({
          getMode: () => stateRef.current!.settings.bias.mode,
          getLoadedClouds: () => stateRef.current!.sources.clouds,
          requestRender: () => stateRef.current!.subsystems.scheduler.requestRender(),
        }),
        youAreHere: createYouAreHereSubsystem(),
        labelDirector: createLabelDirectorSubsystem(),
        pois: createPoiSubsystem(),
        clickResolver: null,
        inputBindings: null,
        scheduler: createRenderScheduler({ onFrame: () => {}, rafImpl: noopRaf, cafImpl: noopCaf }),
      },
      cam: null,
      initialCamSnapshot: null,
      assetSlots: {
        points: new Map(),
        filaments: null,
        famousMeta: null,
        pgcAlias: null,
        cf4Density: null,
        mcpm: null,
      },
    };
    stateRef.current = state;

    expect(state.settings.points.sizePx).toBe(2.5);
    expect(state.settings.bias.mode).toBe(DEFAULT_BIAS_MODE);
    expect(state.sources.visibleMask).toBe(DEFAULT_VISIBLE_SOURCE_MASK);
    // hover/selection moved off `state.picking` and onto
    // `state.subsystems.selection` in Spec D.3.
    expect(state.subsystems.selection.hovered()).toBeNull();
    expect(state.gpu.renderer).toBeNull();
    expect(state.subsystems.tweens.isActive()).toBe(false);
  });

  it('builds the settings + bias + sources sub-bags directly from data/defaults.ts', () => {
    // Mirror the construction the engine itself uses on startup — if
    // any default's type drifts (e.g. `DEFAULT_BIAS_MODE` becomes a
    // string), this test fails to compile and we catch it here rather
    // than inside the 1500-line engine.ts.
    const settings: EngineSettingsState = {
      points: {
        sizePx: DEFAULT_POINT_SIZE_PX,
        brightness: DEFAULT_BRIGHTNESS,
        depthFade: DEFAULT_DEPTH_FADE_ENABLED,
        highlightFallback: DEFAULT_HIGHLIGHT_FALLBACK,
        realOnly: DEFAULT_REAL_ONLY_MODE,
      },
      tonemap: { exposure: DEFAULT_EXPOSURE, curve: DEFAULT_TONE_MAP_CURVE },
      camera: { autoRotate: DEFAULT_AUTO_ROTATE },
      bias: { mode: DEFAULT_BIAS_MODE, absMagLimit: DEFAULT_ABS_MAG_LIMIT },
      thumbnails: { enabled: DEFAULT_GALAXY_TEXTURES_ENABLED },
      milkyWay: { enabled: DEFAULT_MILKY_WAY_ENABLED },
      filaments: { enabled: DEFAULT_FILAMENTS_ENABLED, intensity: DEFAULT_FILAMENT_INTENSITY },
      volumes: { masterEnabled: DEFAULT_VOLUMES_ENABLED, fields: {} },
    };
    const bias: EngineBiasState = {
      apparentMagLimit: 0,
      schechterMStar: 0,
      schechterAlpha: 0,
    };
    const sources: Pick<EngineSourceState, 'visibleMask' | 'lodMode'> = {
      visibleMask: DEFAULT_VISIBLE_SOURCE_MASK,
      lodMode: DEFAULT_LOD_MODE,
    };

    expect(settings.points.sizePx).toBe(DEFAULT_POINT_SIZE_PX);
    expect(settings.bias.absMagLimit).toBe(DEFAULT_ABS_MAG_LIMIT);
    expect(bias.apparentMagLimit).toBe(0);
    expect(sources.lodMode).toBe(DEFAULT_LOD_MODE);
  });

  it('allows in-place mutation of every sub-bag field', () => {
    // The engine mutates fields directly (e.g.
    // `state.settings.points.brightness = v`), so the type must NOT
    // be Readonly.  We exercise a representative mutation per bag to
    // lock that contract.
    // eslint-disable-next-line prefer-const
    let stateRef: { current: EngineState | null } = { current: null };
    const state: EngineState = {
      settings: {
        points: {
          sizePx: 1,
          brightness: 1,
          depthFade: true,
          highlightFallback: false,
          realOnly: false,
        },
        tonemap: { exposure: 1, curve: DEFAULT_TONE_MAP_CURVE },
        camera: { autoRotate: false },
        bias: { mode: DEFAULT_BIAS_MODE, absMagLimit: 0 },
        thumbnails: { enabled: true },
        milkyWay: { enabled: true },
        filaments: { enabled: false, intensity: 1 },
        volumes: { masterEnabled: false, fields: {} },
      },
      bias: {
        apparentMagLimit: 0,
        schechterMStar: 0,
        schechterAlpha: 0,
      },
      sources: {
        visibleMask: 0,
        lodMode: DEFAULT_LOD_MODE,
        clouds: new Map(),
        famousMeta: [],
        famousXrefs: {},
        tier: 'medium',
      },
      picking: {
        latestMouseCss: null,
        lastPickedMouseCss: null,
        pickInFlight: false,
        pointerDown: false,
      },
      gpu: {
        renderer: null,
        pickRenderer: null,
        postProcess: null,
        volumeOffscreen: null,
        filamentRenderer: null,
        labelRenderer: null,
        markerLineRenderer: null,
        texturedQuadRenderer: null,
        texturedDiskRenderer: null,
        proceduralDiskRenderer: null,
        milkyWayRenderer: null,
        scalarVolumeRenderer: null,
        volumeUpsample: null,
        timingService: createDisabledGpuTimingService(),
      },
      subsystems: {
        galaxyAtlas: null,
        proceduralDisks: null,
        texturedImpostors: null,
        loadProgress: null,
        spaceMouse: createSpaceMouseSubsystem({
          cancelTween: () => {},
          onConnectionChange: () => {},
          onAxes: () => {},
        }),
        tweens: createTweenManager(),
        selection: createSelectionSubsystem({
          cb: noopCb,
          getCloud: () => undefined,
          getFamousMeta: () => [],
          getFamousXrefs: () => ({}),
        }),
        biasCorrection: createBiasCorrectionSubsystem({
          getMode: () => stateRef.current!.settings.bias.mode,
          getLoadedClouds: () => stateRef.current!.sources.clouds,
          requestRender: () => stateRef.current!.subsystems.scheduler.requestRender(),
        }),
        youAreHere: createYouAreHereSubsystem(),
        labelDirector: createLabelDirectorSubsystem(),
        pois: createPoiSubsystem(),
        clickResolver: null,
        inputBindings: null,
        scheduler: createRenderScheduler({ onFrame: () => {}, rafImpl: noopRaf, cafImpl: noopCaf }),
      },
      cam: null,
      initialCamSnapshot: null,
      assetSlots: {
        points: new Map(),
        filaments: null,
        famousMeta: null,
        pgcAlias: null,
        cf4Density: null,
        mcpm: null,
      },
    };
    stateRef.current = state;

    state.settings.points.brightness = 2.5;
    state.settings.bias.absMagLimit = -20;
    state.sources.visibleMask = 0xff;
    // hovered/selected aren't on `state.picking` anymore — exercise the
    // subsystem's setter instead.
    state.subsystems.selection.setHovered({ source: 1 as Source, localIdx: 42 });
    state.picking.pickInFlight = true;

    expect(state.settings.points.brightness).toBe(2.5);
    expect(state.settings.bias.absMagLimit).toBe(-20);
    expect(state.sources.visibleMask).toBe(0xff);
    expect(state.subsystems.selection.hovered()).toEqual({ source: 1, localIdx: 42 });
    expect(state.picking.pickInFlight).toBe(true);
  });
});
