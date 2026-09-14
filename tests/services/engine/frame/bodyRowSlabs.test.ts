/**
 * bodyRowSlabs — which slab rows a `BodyRowSource` line expands over.
 *
 * The out-of-band case is the load-bearing one: an empty list is what lets
 * `mergeAdjacent` fold the two `(hdr, NEAR0)` lines back into a single render
 * step, so the assertion runs the real expansion rather than stopping at `[]`.
 * Both sources answer `[]` far more often than not, so both empties are pinned.
 */

import { describe, it, expect, vi } from 'vitest';

// The draw list's own cull + `inside` maths is atmosphereDrawList.test.ts's;
// what is under test here is which entry this module picks and how it maps to a
// painter-order row.
vi.mock('../../../../src/services/engine/frame/atmosphereDrawList', () => ({
  atmosphereDrawList: vi.fn<() => readonly AtmosphereDrawEntry[]>(() => []),
}));
import { atmosphereDrawList } from '../../../../src/services/engine/frame/atmosphereDrawList';

import { bodyRowSlabs } from '../../../../src/services/engine/frame/bodyRowSlabs';
import { expandFrameOrder } from '../../../../src/services/engine/frame/expandFrameOrder';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';
import { SGR_A_STAR } from '../../../../src/data/bodies/sceneSgrAStar';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { AtmosphereDrawEntry } from '../../../../src/@types/engine/frame/AtmosphereDrawEntry';
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

const MARS_SLAB_INDEX = 2;
const EARTH_SLAB_INDEX = 3;
const MARS_SLAB = makeSlab({
  index: MARS_SLAB_INDEX,
  frame: { kind: 'body-m', bodyId: 'mars' as BodyId },
});
const EARTH_SLAB = makeSlab({
  index: EARTH_SLAB_INDEX,
  frame: { kind: 'body-m', bodyId: 'earth' as BodyId },
});

const drawListMock = vi.mocked(atmosphereDrawList);

/** Only `body.id` and `inside` are read; the rest of the entry never loads. */
function makeEntry(bodyId: string, inside: boolean): AtmosphereDrawEntry {
  return { body: { id: bodyId }, inside } as unknown as AtmosphereDrawEntry;
}

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

  it('resolves the INSIDE entry’s own body-m row, not the first entry’s', () => {
    // Two atmosphere bodies on screen with only the second one enclosing the
    // camera: picking by position in the list, or handing back the position in
    // `ctx.slabs` instead of the row's own `index`, both fog the wrong body.
    drawListMock.mockReturnValue([makeEntry('mars', false), makeEntry('earth', true)]);
    const ctx = makeCtx(camAtAuFromSgrAStar(900), [makeSlab(), MARS_SLAB, EARTH_SLAB]);

    expect(bodyRowSlabs(STATE, ctx).insideAtmosphere).toEqual([EARTH_SLAB_INDEX]);
  });

  it('resolves nothing while the camera is outside every shell', () => {
    drawListMock.mockReturnValue([makeEntry('earth', false)]);
    const ctx = makeCtx(camAtAuFromSgrAStar(900), [makeSlab(), EARTH_SLAB]);

    expect(bodyRowSlabs(STATE, ctx).insideAtmosphere).toEqual([]);
  });
});
