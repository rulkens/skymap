/**
 * blackHoleMarkerPass — the far-field marker's brightness across the lens band,
 * and the pick stamp that follows the marker OR the caption (P5): inside the
 * band the marker is gone but the caption still invites the click.
 */

import { describe, it, expect, vi } from 'vitest';

import { blackHoleMarkerPass } from '../../../../src/layers/blackHoles/passes/blackHoleMarkerPass';
import { BLACK_HOLES } from '../../../../src/layers/blackHoles/data/blackHoles';
import { SGR_A_STAR_ENTRY } from '../../../../src/layers/blackHoles/sources/sgrAStar';
import { GALACTIC_CENTRE_ANCHOR } from '../../../../src/data/places/galacticCentre';
import { Source } from '../../../../src/data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../src/data/selectionEncoding';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { BlackHolesRuntime } from '../../../../src/layers/blackHoles/@types/BlackHolesRuntime';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

vi.mock('../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn(
    (): ReadonlyMap<string, BodyState> =>
      new Map([
        [
          GALACTIC_CENTRE_ANCHOR.id,
          {
            positionMpc: GALACTIC_CENTRE_ANCHOR.positionMpc,
            orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1] as BodyState['orientation'],
            meanAnomalyRad: 0,
          },
        ],
      ]),
  ),
}));

const ANCHOR = GALACTIC_CENTRE_ANCHOR.positionMpc as Vec3;
const HOLE_ID = packSelection(Source.SgrAStar, 0 + PICK_SENTINEL_OFFSET);
// From Earth: R₀ from the anchor, far outside the lens band.
const FROM_EARTH: Vec3 = [0, 0, 0];
// 50 AU out: inside the band's full edge (100 AU), where the lens has taken over.
const INSIDE_BAND: Vec3 = [ANCHOR[0] + 50 * SCALE_UNITS.AU_TO_MPC, ANCHOR[1], ANCHOR[2]];

function makeCtx(camPos: Vec3): FrameView {
  return {
    cam: { distance: 1e-6 },
    drawCamPos: camPos,
    drawPxPerRad: 600,
  } as unknown as FrameView;
}

function makeView(camPos: Vec3): SlabView {
  return {
    slab: makeSlab({ vp: Float64Array.from({ length: 16 }, (_, i) => i + 0.5) }),
    vp: new Float32Array(16),
    camPos,
    viewportPx: [1280, 720],
  };
}

function makeState(labelEnabled: boolean) {
  const drawPoints = vi.fn();
  const state = {
    gpu: { bodyPickRenderer: { drawPoints } },
    settings: { blackHoles: { items: { [SGR_A_STAR_ENTRY.id]: { labelEnabled } } } },
  } as unknown as EngineState;
  return { state, drawPoints };
}

function makePass() {
  const markerRenderer = { draw: vi.fn(), destroy: vi.fn() };
  const pass = blackHoleMarkerPass({ markerRenderer } as unknown as BlackHolesRuntime);
  return { pass, markerRenderer };
}

const PASS_STUB = {} as GPURenderPassEncoder;

function stampedIds(camPos: Vec3, labelEnabled: boolean): number[] {
  const { pass } = makePass();
  const { state, drawPoints } = makeState(labelEnabled);
  const ctx = makeCtx(camPos);
  if (!pass.pickEnabled!(state, ctx, makeView(camPos))) return [];
  pass.drawPick!(PASS_STUB, makeView(camPos), ctx, state);
  return drawPoints.mock.calls.flatMap(([, args]) =>
    (args as { points: { packedId: number }[] }).points.map((point) => point.packedId),
  );
}

describe('blackHoleMarkerPass', () => {
  it('marker brightness is full far out and zero inside the lens band', () => {
    const { state } = makeState(true);
    const far = makePass();
    far.pass.draw(PASS_STUB, makeView(FROM_EARTH), makeCtx(FROM_EARTH), state);
    const [, instances, count] = far.markerRenderer.draw.mock.calls[0]!;
    expect(count).toBe(1);
    expect(instances[6]).toBeCloseTo(BLACK_HOLES[0]!.glintBaseIntensity, 6);
    expect(Array.from(instances.slice(3, 6))).toEqual(
      BLACK_HOLES[0]!.glintTint.map((c) => Math.fround(c)),
    );

    const near = makePass();
    expect(near.pass.enabled(state, makeCtx(INSIDE_BAND), makeView(INSIDE_BAND))).toBe(false);
    near.pass.draw(PASS_STUB, makeView(INSIDE_BAND), makeCtx(INSIDE_BAND), state);
    expect(near.markerRenderer.draw).not.toHaveBeenCalled();
  });

  it('pick stamp persists inside the band while the caption shows', () => {
    expect(stampedIds(INSIDE_BAND, true)).toEqual([HOLE_ID]);
    expect(stampedIds(INSIDE_BAND, false)).toEqual([]);
  });

  it('far-field pick follows the marker with the label off', () => {
    expect(stampedIds(FROM_EARTH, false)).toEqual([HOLE_ID]);
  });
});
