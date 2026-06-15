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
 * `mode` and `absMagLimit` live inside `settings.bias`, while
 * `EngineBiasState` holds only the bake-output sentinels
 * (`apparentMagLimit`, `schechterMStar`, `schechterAlpha`).
 */

import { describe, it, expect } from 'vitest';
import type { SourceType } from '../../src/@types/data/SourceType';
import type { GalaxyInfo } from '../../src/@types/engine/GalaxyInfo';

import type { EngineState } from '../../src/@types/engine/state/EngineState';
import { createEngineData } from '../../src/services/engine/data/createEngineData';
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
import { ALL_VISIBLE_MASK } from '../../src/utils/allVisibleMask';
import { createTweenManager } from '../../src/services/engine/camera/tweenManager';
import { createSpaceMouseSubsystem } from '../../src/services/engine/subsystems/spaceMouseSubsystem';
import { createRenderScheduler } from '../../src/services/engine/subsystems/renderScheduler';
import { createSelectionSubsystem } from '../../src/services/engine/subsystems/selectionSubsystem';
import { createBiasCorrectionSubsystem } from '../../src/services/engine/subsystems/biasCorrectionSubsystem';
import { createLabelDirectorSubsystem } from '../../src/services/engine/subsystems/labelDirectorSubsystem';
import { createStructureFocusSubsystem } from '../../src/services/engine/subsystems/structureFocusSubsystem';
import { createFadeRegistry } from '../../src/services/animation/fadeRegistry';
import { createDisabledGpuTimingService } from '../../src/services/gpu/timing/gpuTimingService';

function makeRegistry() {
  return createFadeRegistry({ requestRender: () => {} });
}
import type { EngineCallbacks } from '../../src/@types/engine/EngineCallbacks';
import { Source, SOURCE_REGISTRY } from '../../src/data/sources';

// No-op callback bag for the selection subsystem fixture.
// `onHoverChange` / `onSelectChange` are the only fields it reads; the
// rest exist only to satisfy the type.
const noopCb = {
  onStatusChange: () => {},
  onHoverChange: () => {},
  onSelectChange: () => {},
} as unknown as EngineCallbacks;

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
      camera: { autoRotate: false },
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
      debug: { showPickBuffer: false, showDiskRadiusRing: false },
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
    const bias: EngineBiasState = {
      apparentMagLimit: 0,
      schechterMStar: 0,
      schechterAlpha: 0,
    };
    const sources: EngineSourceState = {
      pickMask: ALL_VISIBLE_MASK,
      drawMask: ALL_VISIBLE_MASK,
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
        selectionRingRenderer: null,
        structureMarkerRenderer: null,
        texturedDiskRenderer: null,
        proceduralDiskRenderer: null,
        milkyWayRenderer: null,
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
        spaceMouse: createSpaceMouseSubsystem({
          cancelTween: () => {},
          onConnectionChange: () => {},
          onAxes: () => {},
        }),
        tweens: createTweenManager({ requestRender: () => {} }),
        selection: createSelectionSubsystem({
          cb: noopCb,
          requestRender: () => {},
        }),
        biasCorrection: createBiasCorrectionSubsystem({
          getMode: () => stateRef.current!.settings.bias.mode,
          getLoadedClouds: () => stateRef.current!.data.galaxies.catalogs,
          requestRender: () => stateRef.current!.subsystems.scheduler.requestRender(),
        }),
        labelDirector: createLabelDirectorSubsystem(),
        structureFocus: createStructureFocusSubsystem({ requestRender: () => {} }),
        clickResolver: null,
        inputBindings: null,
        scheduler: createRenderScheduler({ onFrame: () => {}, rafImpl: noopRaf, cafImpl: noopCaf }),
        fades: makeRegistry(),
      },
      cam: null,
      initialCamSnapshot: null,
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
      debug: { disabledPasses: new Set<string>() },
    };
    stateRef.current = state;

    expect(state.settings.galaxyCatalogs.sizePx).toBe(2.5);
    expect(state.settings.galaxyCatalogs.enabled).toBe(true);
    expect(state.settings.galaxyCatalogs.items.sdss.enabled).toBe(true);
    expect(state.settings.galaxyCatalogs.items.famousGalaxy.labelEnabled).toBe(true);
    expect(state.settings.bias.mode).toBe(DEFAULT_BIAS_MODE);
    expect(state.sources.pickMask).toBe(ALL_VISIBLE_MASK);
    expect(state.sources.drawMask).toBe(ALL_VISIBLE_MASK);
    // Hover/selection live on `state.subsystems.selection`, not `state.picking`.
    expect(state.subsystems.selection.hovered()).toBeNull();
    expect(state.gpu.renderer).toBeNull();
    expect(state.subsystems.tweens.isActive()).toBe(false);
  });

  it('builds the settings + bias + sources sub-bags directly from data/defaults.ts', () => {
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
      camera: { autoRotate: DEFAULT_AUTO_ROTATE },
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
      debug: { showPickBuffer: false, showDiskRadiusRing: false },
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
    const bias: EngineBiasState = {
      apparentMagLimit: 0,
      schechterMStar: 0,
      schechterAlpha: 0,
    };
    const sources: Pick<EngineSourceState, 'pickMask' | 'drawMask'> = {
      pickMask: ALL_VISIBLE_MASK,
      drawMask: ALL_VISIBLE_MASK,
    };

    expect(settings.galaxyCatalogs.sizePx).toBe(DEFAULT_POINT_SIZE_PX);
    expect(settings.bias.absMagLimit).toBe(DEFAULT_ABS_MAG_LIMIT);
    // The "You are here" label axis defaults on, independently of the disk.
    expect(settings.milkyWay.labelEnabled).toBe(true);
    expect(bias.apparentMagLimit).toBe(0);
    expect(sources.pickMask).toBe(ALL_VISIBLE_MASK);
  });

  it('allows in-place mutation of every sub-bag field', () => {
    // The engine mutates fields directly (e.g.
    // `state.settings.galaxyCatalogs.brightness = v`), so the type must NOT be
    // Readonly. Exercise one representative mutation per bag.
    // eslint-disable-next-line prefer-const
    let stateRef: { current: EngineState | null } = { current: null };
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
        camera: { autoRotate: false },
        bias: { mode: DEFAULT_BIAS_MODE, absMagLimit: 0 },
        thumbnails: { enabled: true },
        milkyWay: { enabled: true, labelEnabled: true },
        filaments: { enabled: false, intensity: 1 },
        volumes: { enabled: false, items: {} },
        flow: { ...DEFAULT_FLOW },
        debug: { showPickBuffer: false, showDiskRadiusRing: false },
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
      bias: {
        apparentMagLimit: 0,
        schechterMStar: 0,
        schechterAlpha: 0,
      },
      sources: {
        pickMask: 0,
        drawMask: 0,
        tier: 'medium',
      },
      data: createEngineData(),
      picking: {
        latestMouseCss: null,
        lastPickedMouseCss: null,
        pickInFlight: false,
        pointerDown: false,
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
        selectionRingRenderer: null,
        structureMarkerRenderer: null,
        texturedDiskRenderer: null,
        proceduralDiskRenderer: null,
        milkyWayRenderer: null,
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
        spaceMouse: createSpaceMouseSubsystem({
          cancelTween: () => {},
          onConnectionChange: () => {},
          onAxes: () => {},
        }),
        tweens: createTweenManager({ requestRender: () => {} }),
        selection: createSelectionSubsystem({
          cb: noopCb,
          requestRender: () => {},
        }),
        biasCorrection: createBiasCorrectionSubsystem({
          getMode: () => stateRef.current!.settings.bias.mode,
          getLoadedClouds: () => stateRef.current!.data.galaxies.catalogs,
          requestRender: () => stateRef.current!.subsystems.scheduler.requestRender(),
        }),
        labelDirector: createLabelDirectorSubsystem(),
        structureFocus: createStructureFocusSubsystem({ requestRender: () => {} }),
        clickResolver: null,
        inputBindings: null,
        scheduler: createRenderScheduler({ onFrame: () => {}, rafImpl: noopRaf, cafImpl: noopCaf }),
        fades: makeRegistry(),
      },
      cam: null,
      initialCamSnapshot: null,
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
      debug: { disabledPasses: new Set<string>() },
    };
    stateRef.current = state;

    state.settings.galaxyCatalogs.brightness = 2.5;
    state.settings.bias.absMagLimit = -20;
    state.sources.pickMask = 0xff;
    state.sources.drawMask = 0xff;
    // Hovered/selected live on the selection subsystem, not `state.picking`.
    // The slot now holds a resolved FocusableTarget directly.
    const hoverTarget = {
      type: 'galaxyCatalog',
      source: 1 as SourceType,
      index: 42,
    } as unknown as GalaxyInfo;
    state.subsystems.selection.setHovered(hoverTarget);
    state.picking.pickInFlight = true;

    expect(state.settings.galaxyCatalogs.brightness).toBe(2.5);
    expect(state.settings.bias.absMagLimit).toBe(-20);
    expect(state.sources.pickMask).toBe(0xff);
    expect(state.sources.drawMask).toBe(0xff);
    expect(state.subsystems.selection.hovered()).toBe(hoverTarget);
    expect(state.picking.pickInFlight).toBe(true);
  });
});
