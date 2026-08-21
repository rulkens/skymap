/**
 * produceConstellationCaptions — candidate math for the true-3D constellation
 * stick-figure names.
 *
 * Cases moved from `foregroundLabelsLayer.test.ts` (Task 4, spec §12): the
 * producer emits EVERY figure every frame, so the (former) layer-`enabled`
 * demand test now reads the emitted candidates' `fadeAlpha` instead of a
 * boolean gate.
 */

import { describe, it, expect } from 'vitest';

import { produceConstellationCaptions } from '../../../../src/services/engine/presentation/produceConstellationCaptions';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/solarSystemLabelMaxDistance';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';

import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const PC = SCALE_UNITS.PC_TO_MPC;

// Two figures at parsec-scale anchors — the names are the caption ids. Moved
// verbatim from `foregroundLabelsLayer.test.ts`.
const CONSTELLATION_ARTIFACT = {
  version: 1 as const,
  constellations: [
    {
      name: 'Orion',
      labelAnchorPc: [200, -50, 100] as Vec3,
      segments: [{ aPc: [1, 2, 3] as Vec3, aAppMag: 0.5, bPc: [4, 5, 6] as Vec3, bAppMag: 1.2 }],
    },
    {
      name: 'Ursa Major',
      labelAnchorPc: [-30, 80, 12] as Vec3,
      segments: [{ aPc: [7, 8, 9] as Vec3, aAppMag: 2, bPc: [10, 11, 12] as Vec3, bAppMag: 2.4 }],
    },
  ],
};

function makeCtx(camPos: Vec3, distance: number): ReadyFrameContext {
  return {
    cam: { distance },
    drawCamPos: camPos,
    focusBlend: 0,
    nowMs: 0,
  } as unknown as ReadyFrameContext;
}

function makeState(opts: { layerFade: number; ready?: boolean }): EngineState {
  return {
    assetSlots: {
      constellations:
        (opts.ready ?? true)
          ? { state: () => ({ kind: 'ready' as const, value: CONSTELLATION_ARTIFACT }) }
          : null,
    },
    subsystems: {
      fades: { opacityOf: () => opts.layerFade },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
  } as unknown as EngineState;
}

describe('produceConstellationCaptions', () => {
  // A camera distance PAST the body-caption gate but still inside the
  // constellation band — the exact window a director-registered producer
  // could never reach through the COSMO near plane.
  const pastBodyGate =
    (SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC + SCALE_FADE_BANDS.constellations.goneAt) / 2;

  it('reads the fade-registry opacity, not a band-only `1`, for constellation demand', () => {
    // A prior version of this gate passed `constellationLayerOpacity` the
    // constant `1` (the band-only cull) and never the registry's actual
    // toggle opacity, so a constellations-layer switch-off couldn't drop the
    // row on its own. With the toggle opacity at 0 the product is 0 despite
    // the distance band being favourable — every figure is still EMITTED
    // (the zero-target landmine), just at target 0.
    const out = produceConstellationCaptions(
      makeState({ layerFade: 0 }),
      makeCtx([pastBodyGate, 0, 0], pastBodyGate),
    );
    expect(out.labels.length).toBe(CONSTELLATION_ARTIFACT.constellations.length);
    for (const l of out.labels) expect(l.fadeAlpha).toBe(0);
  });

  it('emits a caption per figure at its centroid, fading with band × registry', () => {
    // Eye inside the full-alpha band edge so the distance factor is 1 and the
    // target reduces to the fade-registry opacity alone.
    const camPos: Vec3 = [5e-4, 0, 0];
    const out = produceConstellationCaptions(makeState({ layerFade: 0.5 }), makeCtx(camPos, 5e-4));

    const orion = out.labels.find((l) => l.id === 'Orion')!;
    expect(orion).toBeDefined();
    // Direct emit: the caption sits at its camera-relative centroid with NO
    // leader-line lift — a body caption would carry a `lift` field.
    expect(orion.worldPos).toEqual([200 * PC - camPos[0], -50 * PC, 100 * PC]);
    expect(orion.lift).toBeUndefined();
    expect(orion.fadeAlpha).toBeCloseTo(0.5);
  });
});
