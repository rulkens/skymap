/**
 * tour.integration.test — opacity composition for the `cosmicFlows` clip: the clip
 * channel masks, crossfades and resets, and the DRAWN alpha follows it.
 *
 * Clock model: the clip epoch starts on the first tick (nowMs=0), so
 * `elapsed = nowMs / 1000` seconds. Hence the stamps below — 2000 fires the
 * atSec=2 cues, 4000 the crossfade, and 7000 completes the 3-second fades those
 * started.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { clipStarted } from '../../../src/state/camera/cameraSlice';
import { createClipPlayer } from '../../../src/services/engine/subsystems/clipPlayer';
import { UNSTARTED_EPOCHS } from '../../../src/services/engine/camera/cameraEpochs';
import { createFadeRegistry } from '../../../src/services/animation/fadeRegistry';
import { cosmicFlows } from '../../../src/data/animation/clips/cosmicFlows';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import { galaxyPointSpritesPass } from '../../../src/layers/galaxyCatalog/passes/galaxyPointSpritesPass';
import { deriveMilkyWayCloudAlpha } from '../../../src/layers/milkyWay/present/milkyWayCloudLiveness';
import { Source } from '../../../src/data/sources';
import { APP_VISIBILITY } from '../../../src/compositions/appVisibility';
import { gatePassByFade } from '../../../src/services/engine/layer/gatePassByFade';
import { resolveFadeValue } from '../../../src/services/engine/presentation/resolveFadeValue';

import type { ClipPlayer } from '../../../src/@types/engine/subsystems/ClipPlayer';
import type { VisibilityAddress } from '../../../src/@types/animation/VisibilityAddress';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../src/@types/engine/frame/SlabView';
import { makeGalaxyCatalogItems } from '../../fixtures/makeGalaxyCatalogItems';

// `clipOpacityOf` answers `factor` for every call. Typed rather than bare
// `vi.fn()`, which fails tsc.
function makeClipStub(factor: number): ClipPlayer {
  return {
    tick: vi.fn<ClipPlayer['tick']>((clipEpoch) => ({ clipEpoch })),
    stop: vi.fn<() => void>(),
    registerEndResolver: vi.fn<(onEnd: () => void) => void>(),
    clipOpacityOf: vi.fn<(address: VisibilityAddress, nowMs: number) => number>(() => factor),
    destroy: vi.fn<() => void>(),
  };
}

function makeStore() {
  return configureStore({ reducer: rootReducer });
}

// applySceneEffect's show/hide/scene arms only dispatch: the live settings are all they read.
function makeEngineState(settings: EngineSettingsState): EngineState {
  return { settings } as unknown as EngineState;
}

describe('cosmicFlows clip — clipOpacity end-to-end', () => {
  // The cosmicFlows start pose is concrete, not 'live', so `clipStarted` takes it
  // directly with no `resolveClipStart` call.
  function setupClip() {
    const store = makeStore();

    // Lazy per-cue closure, so each cue sees the settings state left by the
    // dispatches an earlier cue issued.
    const clipPlayer = createClipPlayer({
      store,
      requestRender: () => {},
      getEngineState: () =>
        makeEngineState(store.getState().settings as unknown as EngineSettingsState),
    });

    // The fresh wrapper object is what starts the clip epoch on tick 1.
    store.dispatch(clipStarted({ data: cosmicFlows.data, frame: DEFAULT_ORIENTATION }));

    // Threads the epoch across ticks, as `runFrame` does through the runtime.
    let clipEpoch = UNSTARTED_EPOCHS.clip;
    const tick = (nowMs: number): void => {
      clipEpoch = clipPlayer.tick(clipEpoch, nowMs).clipEpoch;
    };

    return { store, clipPlayer, tick };
  }

  it('the flow mask keeps composed alpha at 0 until the lift', () => {
    const { clipPlayer, tick } = setupClip();

    tick(0); // prime the clock; no cues fire
    tick(2_000); // fire mask + scene cues
    tick(3_000); // between mask and lift

    const flowFactorBeforeLift = clipPlayer.clipOpacityOf('flow', 3_000);
    expect(flowFactorBeforeLift).toBe(0);

    tick(4_000); // the lift cue fires

    // Still near 0 at the exact lift-start moment: smoothstep at t=0.
    const flowFactorAtLiftStart = clipPlayer.clipOpacityOf('flow', 4_000);
    expect(flowFactorAtLiftStart).toBeCloseTo(0, 5);

    tick(7_000);

    const flowFactorAfterLift = clipPlayer.clipOpacityOf('flow', 7_000);
    expect(flowFactorAfterLift).toBe(1);

    clipPlayer.destroy();
  });

  it('the crossfade dims galaxies without touching intent', () => {
    const { store, clipPlayer, tick } = setupClip();

    tick(0);
    tick(2_000); // mask + scene cues fire
    tick(4_000); // crossfade cues fire: fade(flow→1,3) + fade(survey→0,3)
    tick(7_000); // the 3-second survey dim completes

    const surveyClipFactor = clipPlayer.clipOpacityOf('survey', 7_000);
    expect(surveyClipFactor).toBe(0);

    // "Untouched" is the boot value per id, NOT a blanket `true`: the
    // galaxy catalog cluster boots each catalog from its own Layer literal,
    // and DesiDeep boots false.
    const settings = store.getState().settings;
    const catalogItems = settings.galaxyCatalogs.items as Record<string, { enabled: boolean }>;
    const bootItems = INITIAL_SETTINGS.galaxyCatalogs.items as Record<string, { enabled: boolean }>;
    for (const [id, item] of Object.entries(catalogItems)) {
      expect(item.enabled).toBe(bootItems[id]?.enabled);
    }

    clipPlayer.destroy();
  });

  it('clip end restores composed alpha to the steady state', () => {
    const { clipPlayer, tick } = setupClip();

    tick(0);
    tick(2_000);
    tick(4_000); // crossfade fires; survey → 0, flow → rising

    const surveyMid = clipPlayer.clipOpacityOf('survey', 5_000);
    expect(surveyMid).toBeGreaterThanOrEqual(0);
    expect(surveyMid).toBeLessThan(1);

    clipPlayer.stop();

    const surveyAfterStop = clipPlayer.clipOpacityOf('survey', 5_000);
    const flowAfterStop = clipPlayer.clipOpacityOf('flow', 5_000);
    expect(surveyAfterStop).toBe(1);
    expect(flowAfterStop).toBe(1);

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

  // `galaxyPointRenderer` rides `state.gpu` now (D13), not this ctx.
  function makeDrawCtx(nowMs: number, camPos: Readonly<[number, number, number]>): FrameView {
    return {
      snapshot: { nowMs, focusBlend: 0 },
      drawCamPos: camPos,
      fovYRad: FOV_Y_RAD,
      canvasSize: CANVAS,
      drawPxPerRad: CANVAS.height / (2 * Math.tan(FOV_Y_RAD / 2)),
    } as unknown as FrameView;
  }

  function makeDrawState(
    fades: ReturnType<typeof createFadeRegistry>,
    clipPlayer: ClipPlayer,
  ): EngineState {
    return {
      subsystems: { fades, clipPlayer },
      // The composed entries core resolves the handed value from.
      visibilityEntries: APP_VISIBILITY,
      settings: {
        milkyWay: { enabled: true },
        galaxyCatalogs: { items: makeGalaxyCatalogItems() },
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
    // The pass closes over its Layer's runtime, so the spy rides a stub runtime
    // rather than `state.gpu`.
    const runtime = { pointRenderer: { draw: drawSpy } } as never;
    const ctx = makeDrawCtx(nowMs, SURVEY_CAM_POS);
    const view = {
      vp: new Float32Array(16),
      viewportPx: [CANVAS.width, CANVAS.height],
      camPos: SURVEY_CAM_POS,
    } as unknown as SlabView;
    // Through core's gate, which resolves the value the pass is handed.
    gatePassByFade(galaxyPointSpritesPass(runtime), state).draw(
      {} as unknown as GPURenderPassEncoder,
      view,
      ctx,
      state,
    );
    const settings = drawSpy.mock.calls[0]![3] as { fadeOpacityOf: (source: number) => number };
    return settings.fadeOpacityOf(Source.SDSS);
  }

  it('a playing fade([survey], 0, …) cue reduces the drawn survey point opacity', () => {
    const { clipPlayer, tick } = setupClip();
    // Unregistered handles read 1.0 from the registry, so intent is pinned at
    // full for the whole run — the clip channel is the only moving part.
    const fades = createFadeRegistry({ requestRender: () => {} });
    const state = makeDrawState(fades, clipPlayer);

    tick(0);
    tick(2_000); // mask + scene cues fire; survey untouched
    const beforeCue = drawnSurveyOpacity(state, 2_000);
    expect(beforeCue).toBe(1);

    tick(4_000); // beat A crossfade fires: fade(['survey'], 0, 3)
    tick(7_000); // the 3-second dim completes

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

    const alphaWith = (clipFactor: number): number | null => {
      const state = makeDrawState(fades, makeClipStub(clipFactor));
      const ctx = makeDrawCtx(0, MW_CAM_POS);
      return deriveMilkyWayCloudAlpha(ctx, resolveFadeValue(state, ctx.snapshot, 'milkyWayDisk'));
    };
    const unmasked = alphaWith(1);
    expect(unmasked).toBe(1);

    const masked = alphaWith(0.4);
    expect(masked).toBeCloseTo(0.4, 6);
  });
});
