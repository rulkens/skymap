/**
 * tour.integration.test — opacity composition for the `cosmicFlows` clip: the clip
 * channel masks, crossfades and resets, and the DRAWN alpha follows it.
 *
 * Clock model: `clipElapsed` keys on `camera.clip` reference identity, and a tick
 * at nowMs=0 primes it, so `elapsed = nowMs / 1000` seconds. Hence the stamps
 * below — 2000 fires the atSec=2 cues, 4000 the crossfade, and 7000 completes the
 * 3-second fades those started.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { clipStarted } from '../../../src/state/camera/cameraSlice';
import { createClipPlayer } from '../../../src/services/engine/subsystems/clipPlayer';
import { createCameraClock } from '../../../src/services/engine/camera/cameraClock';
import { createFadeRegistry } from '../../../src/services/animation/fadeRegistry';
import { resolveLayerOpacity } from '../../../src/services/engine/presentation/focusRecession';
import { cosmicFlows } from '../../../src/data/animation/clips/cosmicFlows';
import { SOURCE_ENTRIES } from '../../../src/data/sourceEntries';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import { galaxyPointSpritesLayer } from '../../../src/services/engine/frame/passes/galaxyPointSpritesLayer';
import { deriveMilkyWayCloudAlpha } from '../../../src/services/engine/frame/milkyWayCloudLiveness';
import { Source } from '../../../src/data/sources';

import type { ClipPlayer } from '../../../src/@types/engine/subsystems/ClipPlayer';
import type { VisibilityLayerKey } from '../../../src/@types/animation/VisibilityLayerKey';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import type { FadeId } from '../../../src/@types/animation/FadeId';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { SlabView } from '../../../src/@types/engine/frame/SlabView';

// `clipOpacityOf` answers `factor` for every call. Typed rather than bare
// `vi.fn()`, which fails tsc.
function makeClipStub(factor: number): ClipPlayer {
  return {
    tick: vi.fn<(nowMs: number) => void>(),
    stop: vi.fn<() => void>(),
    registerEndResolver: vi.fn<(onEnd: () => void) => void>(),
    clipOpacityOf: vi.fn<(layer: VisibilityLayerKey, nowMs: number) => number>(() => factor),
    destroy: vi.fn<() => void>(),
  };
}

// Only the two fields `resolveLayerOpacity` reads. Cast through `unknown` because
// the picked type still demands the full `EngineSubsystemHandles`.
function makeResolveOpacityState(
  fades: ReturnType<typeof createFadeRegistry>,
  clipPlayer: ClipPlayer,
): Pick<EngineState, 'subsystems'> {
  return { subsystems: { fades, clipPlayer } } as unknown as Pick<EngineState, 'subsystems'>;
}

function makeStore() {
  return configureStore({ reducer: rootReducer });
}

// Carries only what applySceneEffect's show/hide/scene arms reach for: live
// settings, the two fade/scheduler stubs the snap path calls, and stub gpu /
// assetSlots bags for the demand-loaded rows' guard closures.
function makeEngineState(settings: EngineSettingsState): EngineState {
  return {
    settings,
    subsystems: {
      fades: {
        fadeTo: vi.fn<() => Promise<void>>(() => Promise.resolve()),
        setImmediate: vi.fn<() => void>(),
      },
      scheduler: { requestRender: vi.fn<() => void>() },
    },
    gpu: { flowFieldRenderer: { fieldLoaded: () => false } },
    assetSlots: {},
  } as unknown as EngineState;
}

describe('three-way opacity product: intent × focus × clip', () => {
  it('a clip factor of 0 collapses composed alpha regardless of intent', () => {
    const fades = createFadeRegistry({ requestRender: () => {} });
    const handle: FadeId = { kind: 'flow' };
    fades.register(handle, 1); // flow fully visible (intent=1)

    const clipAtZero = makeClipStub(0);
    const stateAtZero = makeResolveOpacityState(fades, clipAtZero);
    // 1 (intent) × 1 (no focus recession for flow) × 0 (clip) = 0
    expect(resolveLayerOpacity(stateAtZero, { focusBlend: 0, nowMs: 0 }, handle)).toBe(0);
  });

  it('a clip factor of 1 is neutral — composed alpha is the bare intent × recession product', () => {
    const fades = createFadeRegistry({ requestRender: () => {} });
    const handle: FadeId = { kind: 'galaxyCatalog', id: 'sdss' };
    fades.register(handle, 0);
    fades.fadeTo(handle, 0.8, 0, 0); // intent = 0.8

    const clipAtOne = makeClipStub(1);
    const state = makeResolveOpacityState(fades, clipAtOne);
    // Hand-computed: intent 0.8 × recession 1 (galaxyCatalog never recedes) × clip 1 = 0.8.
    expect(resolveLayerOpacity(state, { focusBlend: 0, nowMs: 0 }, handle)).toBe(0.8);
  });
});

describe('cosmicFlows clip — clipOpacity end-to-end', () => {
  // The cosmicFlows start pose is concrete, not 'live', so `clipStarted` takes it
  // directly with no `resolveClipStart` call.
  function setupClip() {
    const store = makeStore();
    const clock = createCameraClock();

    // Lazy per-cue closure, so each cue sees the settings state left by the
    // dispatches an earlier cue issued.
    const clipPlayer = createClipPlayer({
      store,
      requestRender: () => {},
      clock,
      getEngineState: () =>
        makeEngineState(store.getState().settings as unknown as EngineSettingsState),
    });

    // The fresh wrapper object is what triggers the clipElapsed reset on tick 1.
    store.dispatch(clipStarted({ data: cosmicFlows.data, frame: DEFAULT_ORIENTATION }));

    return { store, clock, clipPlayer };
  }

  it('the flow mask keeps composed alpha at 0 until the lift', () => {
    const { clipPlayer } = setupClip();

    clipPlayer.tick(0); // prime the clock; no cues fire
    clipPlayer.tick(2_000); // fire mask + scene cues
    clipPlayer.tick(3_000); // between mask and lift

    const flowFactorBeforeLift = clipPlayer.clipOpacityOf('flow', 3_000);
    expect(flowFactorBeforeLift).toBe(0);

    clipPlayer.tick(4_000); // the lift cue fires

    // Still near 0 at the exact lift-start moment: smoothstep at t=0.
    const flowFactorAtLiftStart = clipPlayer.clipOpacityOf('flow', 4_000);
    expect(flowFactorAtLiftStart).toBeCloseTo(0, 5);

    clipPlayer.tick(7_000);

    const flowFactorAfterLift = clipPlayer.clipOpacityOf('flow', 7_000);
    expect(flowFactorAfterLift).toBe(1);

    clipPlayer.destroy();
  });

  it('the crossfade dims galaxies without touching intent', () => {
    const { store, clipPlayer } = setupClip();

    clipPlayer.tick(0);
    clipPlayer.tick(2_000); // mask + scene cues fire
    clipPlayer.tick(4_000); // crossfade cues fire: fade(flow→1,3) + fade(survey→0,3)
    clipPlayer.tick(7_000); // the 3-second survey dim completes

    const surveyClipFactor = clipPlayer.clipOpacityOf('survey', 7_000);
    expect(surveyClipFactor).toBe(0);

    // "Untouched" is the registry entry per id, NOT a blanket `true`:
    // buildInitialSettings seeds each catalog from SOURCE_REGISTRY's `visible`,
    // and DesiDeep boots false.
    const settings = store.getState().settings;
    const catalogItems = settings.galaxyCatalogs.items as Record<string, { enabled: boolean }>;
    for (const [id, item] of Object.entries(catalogItems)) {
      const entry = SOURCE_ENTRIES.find((e) => e.id === id);
      expect(entry).toBeDefined();
      expect(item.enabled).toBe(entry!.visible);
    }

    clipPlayer.destroy();
  });

  it('clip end restores composed alpha to the steady state', () => {
    const { clipPlayer } = setupClip();

    clipPlayer.tick(0);
    clipPlayer.tick(2_000);
    clipPlayer.tick(4_000); // crossfade fires; survey → 0, flow → rising

    const surveyMid = clipPlayer.clipOpacityOf('survey', 5_000);
    expect(surveyMid).toBeGreaterThanOrEqual(0);
    expect(surveyMid).toBeLessThan(1);

    clipPlayer.stop();

    const surveyAfterStop = clipPlayer.clipOpacityOf('survey', 5_000);
    const flowAfterStop = clipPlayer.clipOpacityOf('flow', 5_000);
    expect(surveyAfterStop).toBe(1);
    expect(flowAfterStop).toBe(1);

    const fades = createFadeRegistry({ requestRender: () => {} });
    const flowHandle: FadeId = { kind: 'flow' };
    fades.register(flowHandle, 0);
    fades.fadeTo(flowHandle, 1, 0, 0); // intent = 1

    const clipAtOne = makeClipStub(1); // factor 1 = clip is gone
    const state = makeResolveOpacityState(fades, clipAtOne);
    const composed = resolveLayerOpacity(state, { focusBlend: 0, nowMs: 0 }, flowHandle);
    // 1 (intent) × 1 (no recession for flow) × 1 (clip gone) = 1
    expect(composed).toBe(1);

    clipPlayer.destroy();
  });

  // The two tests below prove the renderer READS the clip channel, not just that
  // the channel carries the cue: a cue that moves `clipOpacityOf` but not the value
  // the layer hands the GPU is silently inert.
  //
  // Two camera distances, each chosen so its site's OWN scale band reads
  // exactly 1 — the drawn alpha then starts at the intent value and any drop is
  // attributable to the clip channel alone. 5 Mpc clears surveyDeepZoom's full
  // edge (~0.23 Mpc); 1 Mpc keeps the Milky-Way disc above its 12-px
  // apparent-size edge, which 5 Mpc would not.
  const SURVEY_CAM_POS = [0, 0, 5] as Readonly<[number, number, number]>;
  const MW_CAM_POS = [0, 0, 1] as Readonly<[number, number, number]>;
  const FOV_Y_RAD = (60 * Math.PI) / 180;
  const CANVAS = { width: 1280, height: 720 };

  function makeDrawCtx(
    nowMs: number,
    camPos: Readonly<[number, number, number]>,
    drawSpy: ReturnType<typeof vi.fn>,
  ): ReadyFrameContext {
    return {
      nowMs,
      focusBlend: 0,
      drawCamPos: camPos,
      fovYRad: FOV_Y_RAD,
      canvasSize: CANVAS,
      drawPxPerRad: CANVAS.height / (2 * Math.tan(FOV_Y_RAD / 2)),
      visibleSourceMask: 0xffffffff,
      galaxyPointRenderer: { draw: drawSpy },
    } as unknown as ReadyFrameContext;
  }

  function makeDrawState(
    fades: ReturnType<typeof createFadeRegistry>,
    clipPlayer: ClipPlayer,
  ): EngineState {
    return {
      subsystems: { fades, clipPlayer },
      settings: {
        milkyWay: { enabled: true },
        galaxyCatalogs: {},
        bias: {},
      },
      selection: { select: null, hover: null, focus: null },
      gpu: { focusUniform: { bindGroup: {} } },
    } as unknown as EngineState;
  }

  // Captured off the `fadeOpacityOf` callback in the draw settings — the value the
  // shader multiplies into every point's alpha.
  function drawnSurveyOpacity(state: EngineState, nowMs: number): number {
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const ctx = makeDrawCtx(nowMs, SURVEY_CAM_POS, drawSpy);
    const view = {
      vp: new Float32Array(16),
      viewportPx: [CANVAS.width, CANVAS.height],
      camPos: SURVEY_CAM_POS,
    } as unknown as SlabView;
    galaxyPointSpritesLayer.draw({} as unknown as GPURenderPassEncoder, view, ctx, state);
    const settings = drawSpy.mock.calls[0]![3] as { fadeOpacityOf: (source: number) => number };
    return settings.fadeOpacityOf(Source.SDSS);
  }

  it('a playing fade([survey], 0, …) cue reduces the drawn survey point opacity', () => {
    const { clipPlayer } = setupClip();
    // Unregistered handles read 1.0 from the registry, so intent is pinned at
    // full for the whole run — the clip channel is the only moving part.
    const fades = createFadeRegistry({ requestRender: () => {} });
    const state = makeDrawState(fades, clipPlayer);

    clipPlayer.tick(0);
    clipPlayer.tick(2_000); // mask + scene cues fire; survey untouched
    const beforeCue = drawnSurveyOpacity(state, 2_000);
    expect(beforeCue).toBe(1);

    clipPlayer.tick(4_000); // beat A crossfade fires: fade(['survey'], 0, 3)
    clipPlayer.tick(7_000); // the 3-second dim completes

    const afterCue = drawnSurveyOpacity(state, 7_000);
    expect(afterCue).toBeLessThan(beforeCue);
    expect(afterCue).toBe(0);

    clipPlayer.destroy();
  });

  it('a milkyWayDisk clip factor of 0.4 scales the drawn Milky-Way cloud alpha', () => {
    // The mirror of the assertion above for the cloud's own site. Driven by the
    // ClipPlayer STUB rather than cosmicFlows: `fade` cues contribute zero
    // awaited seconds, so that 26 s-authored timeline compiles to durationSec 20
    // with beat D's `milkyWayDisk` cue at atSec 20 — it fires on the completion
    // tick and the reset wipes it one tick later. A clip-authoring bug, filed;
    // no played cue can reach this site until it is fixed.
    const fades = createFadeRegistry({ requestRender: () => {} });

    const unmasked = deriveMilkyWayCloudAlpha(
      makeDrawState(fades, makeClipStub(1)),
      makeDrawCtx(0, MW_CAM_POS, vi.fn()),
    );
    expect(unmasked).toBe(1);

    const masked = deriveMilkyWayCloudAlpha(
      makeDrawState(fades, makeClipStub(0.4)),
      makeDrawCtx(0, MW_CAM_POS, vi.fn()),
    );
    expect(masked).toBeCloseTo(0.4, 6);
  });
});
