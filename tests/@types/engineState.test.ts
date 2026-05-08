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
 */

import { describe, it, expect } from 'vitest';

import type {
  EngineState,
  EngineSettingsState,
  EngineBiasState,
  EngineSourceState,
  EnginePickingState,
} from '../../src/@types';

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
} from '../../src/data/defaults';
import { createTweenManager } from '../../src/services/engine/camera/tweenManager';
import { createSpaceMouseSubsystem } from '../../src/services/engine/subsystems/spaceMouseSubsystem';
import { createRenderScheduler } from '../../src/services/engine/subsystems/renderScheduler';
import { createSelectionSubsystem } from '../../src/services/engine/subsystems/selectionSubsystem';
import { createBiasCorrectionSubsystem } from '../../src/services/engine/subsystems/biasCorrectionSubsystem';
import type { EngineCallbacks } from '../../src/@types';
import { Source } from '../../src/data/sources';

// A no-op callback bag suitable for the selection subsystem fixture.
// `onHoverChange` / `onSelectChange` are the only fields the subsystem
// actually reads; the rest are typed-required-only.
const noopCb = {
  onStatusChange: () => {},
  onHoverChange: () => {},
  onSelectChange: () => {},
  onScaleChange: () => {},
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
      pointSizePx: 2.5,
      brightness: 1.0,
      autoRotate: false,
      galaxyTexturesEnabled: true,
      milkyWayEnabled: true,
      filamentsEnabled: false,
      filamentIntensity: 1,
      highlightFallback: false,
      realOnlyMode: false,
      depthFadeEnabled: true,
      exposure: 3.0,
      toneMapCurve: DEFAULT_TONE_MAP_CURVE,
    };
    const bias: EngineBiasState = {
      mode: DEFAULT_BIAS_MODE,
      absMagLimit: -19,
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

    // Forward-declare so the bias-correction subsystem's getState
    // closure can capture the live ref before `state` is assigned.
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
        filamentRenderer: null,
      },
      subsystems: {
        thumbnails: null,
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
          getState: () => stateRef.current!,
        }),
        clickResolver: null,
        inputBindings: null,
        scheduler: createRenderScheduler({ onFrame: () => {}, rafImpl: noopRaf, cafImpl: noopCaf }),
      },
      cam: null,
      initialCamSnapshot: null,
      assetSlots: { points: new Map(), filaments: null, famousMeta: null, pgcAlias: null },
    };
    stateRef.current = state;

    expect(state.settings.pointSizePx).toBe(2.5);
    expect(state.bias.mode).toBe(DEFAULT_BIAS_MODE);
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
      pointSizePx: DEFAULT_POINT_SIZE_PX,
      brightness: DEFAULT_BRIGHTNESS,
      autoRotate: DEFAULT_AUTO_ROTATE,
      galaxyTexturesEnabled: DEFAULT_GALAXY_TEXTURES_ENABLED,
      milkyWayEnabled: DEFAULT_MILKY_WAY_ENABLED,
      filamentsEnabled: DEFAULT_FILAMENTS_ENABLED,
      filamentIntensity: DEFAULT_FILAMENT_INTENSITY,
      highlightFallback: DEFAULT_HIGHLIGHT_FALLBACK,
      realOnlyMode: DEFAULT_REAL_ONLY_MODE,
      depthFadeEnabled: DEFAULT_DEPTH_FADE_ENABLED,
      exposure: DEFAULT_EXPOSURE,
      toneMapCurve: DEFAULT_TONE_MAP_CURVE,
    };
    const bias: EngineBiasState = {
      mode: DEFAULT_BIAS_MODE,
      absMagLimit: DEFAULT_ABS_MAG_LIMIT,
      apparentMagLimit: 0,
      schechterMStar: 0,
      schechterAlpha: 0,
    };
    const sources: Pick<EngineSourceState, 'visibleMask' | 'lodMode'> = {
      visibleMask: DEFAULT_VISIBLE_SOURCE_MASK,
      lodMode: DEFAULT_LOD_MODE,
    };

    expect(settings.pointSizePx).toBe(DEFAULT_POINT_SIZE_PX);
    expect(bias.absMagLimit).toBe(DEFAULT_ABS_MAG_LIMIT);
    expect(sources.lodMode).toBe(DEFAULT_LOD_MODE);
  });

  it('allows in-place mutation of every sub-bag field', () => {
    // The engine mutates fields directly (e.g. `state.settings.brightness = v`
    // inside `setBrightness`), so the type must NOT be Readonly.  We
    // exercise a representative mutation per bag to lock that contract.
    // eslint-disable-next-line prefer-const
    let stateRef: { current: EngineState | null } = { current: null };
    const state: EngineState = {
      settings: {
        pointSizePx: 1,
        brightness: 1,
        autoRotate: false,
        galaxyTexturesEnabled: true,
        milkyWayEnabled: true,
        filamentsEnabled: false,
        filamentIntensity: 1,
        highlightFallback: false,
        realOnlyMode: false,
        depthFadeEnabled: true,
        exposure: 1,
        toneMapCurve: DEFAULT_TONE_MAP_CURVE,
      },
      bias: {
        mode: DEFAULT_BIAS_MODE,
        absMagLimit: 0,
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
        filamentRenderer: null,
      },
      subsystems: {
        thumbnails: null,
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
          getState: () => stateRef.current!,
        }),
        clickResolver: null,
        inputBindings: null,
        scheduler: createRenderScheduler({ onFrame: () => {}, rafImpl: noopRaf, cafImpl: noopCaf }),
      },
      cam: null,
      initialCamSnapshot: null,
      assetSlots: { points: new Map(), filaments: null, famousMeta: null, pgcAlias: null },
    };
    stateRef.current = state;

    state.settings.brightness = 2.5;
    state.bias.absMagLimit = -20;
    state.sources.visibleMask = 0xff;
    // hovered/selected aren't on `state.picking` anymore — exercise the
    // subsystem's setter instead.
    state.subsystems.selection.setHovered({ source: 1 as Source, localIdx: 42 });
    state.picking.pickInFlight = true;

    expect(state.settings.brightness).toBe(2.5);
    expect(state.bias.absMagLimit).toBe(-20);
    expect(state.sources.visibleMask).toBe(0xff);
    expect(state.subsystems.selection.hovered()).toEqual({ source: 1, localIdx: 42 });
    expect(state.picking.pickInFlight).toBe(true);
  });
});
