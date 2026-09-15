/**
 * bodyRowSlabs — which slab rows a `BodyRowSource` line expands over.
 *
 * The out-of-band case is the load-bearing one: an empty list is what lets
 * `mergeAdjacent` fold the two `(hdr, NEAR0)` lines back into a single render
 * step, so the assertion runs the real expansion rather than stopping at `[]`.
 */

import { describe, it, expect } from 'vitest';

import { bodyRowSlabs } from '../../../../src/services/engine/frame/bodyRowSlabs';
import { expandFrameOrder } from '../../../../src/services/engine/frame/expandFrameOrder';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';
import { SGR_A_STAR } from '../../../../src/data/bodies/sceneSgrAStar';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { ToneMap } from '../../../../src/@types/rendering/ToneMap';

const SIM_DAYS = 0;
const LENS_SLAB_INDEX = 4;

/** The real anchor position, so the band is exercised at its authored edges. */
function camAtAuFromSgrAStar(au: number): Vec3 {
  const anchor = deriveBodyStates(SIM_DAYS).get(SGR_A_STAR.id);
  if (anchor === undefined) throw new Error('deriveBodyStates carries no Sgr A* row');
  const [x, y, z] = anchor.positionMpc;
  return [x + au * SCALE_UNITS.AU_TO_MPC, y, z];
}

/** Only `drawCamPos`, `simDays` and `slabs` are read; the rest never loads. */
function makeCtx(camPos: Vec3, slabs: readonly Slab[]): ReadyFrameContext {
  return { drawCamPos: camPos, simDays: SIM_DAYS, slabs } as unknown as ReadyFrameContext;
}

const STATE = {} as unknown as EngineState;

const SGR_A_STAR_SLAB = makeSlab({
  index: LENS_SLAB_INDEX,
  frame: { kind: 'body-m', bodyId: SGR_A_STAR.id as BodyId },
});

describe('bodyRowSlabs', () => {
  it("resolves Sgr A*'s body-m slab index inside the lensing band", () => {
    const ctx = makeCtx(camAtAuFromSgrAStar(120), [makeSlab(), SGR_A_STAR_SLAB]);

    expect(bodyRowSlabs(STATE, ctx).lens).toEqual([LENS_SLAB_INDEX]);
  });

  it('resolves nothing outside the band, so the two hdr·NEAR0 lines still merge', () => {
    const ctx = makeCtx(camAtAuFromSgrAStar(900), [makeSlab(), SGR_A_STAR_SLAB]);

    const slabs = bodyRowSlabs(STATE, ctx);
    expect(slabs.lens).toEqual([]);

    const tone: ToneMap = { exposure: 1.5, curve: 4, hdrKnee: 0, hdrHeadroom: 0 };
    const program = expandFrameOrder(FRAME_ORDER, CONTENT_PASSES, {
      tone,
      bloomEnabled: true,
      foregroundChain: [NEAR0],
      captureFaces: new Map([['sgrAStar', []]]),
      bodyRowSlabs: slabs,
    });
    const foregroundAt = program.findIndex(
      (step) => step.kind === 'render' && step.target === 'foreground:0',
    );
    const hdrNear0 = program
      .slice(0, foregroundAt)
      .filter((step) => step.kind === 'render' && step.target === 'hdr' && step.slab === NEAR0);

    expect(hdrNear0).toHaveLength(1);
  });

  it('resolves nothing when the band is open but the row missed this frame', () => {
    const ctx = makeCtx(camAtAuFromSgrAStar(120), [makeSlab()]);

    expect(bodyRowSlabs(STATE, ctx).lens).toEqual([]);
  });
});
