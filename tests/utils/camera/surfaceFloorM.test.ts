/**
 * surfaceFloorM — the metre-space descent floor must land on the same ground as
 * the Mpc-space zoom floor `pivotFraming` computes (spec §10). Sgr A* is where
 * they used to disagree by a factor of two: `pivotFraming` honoured the seed's
 * 2 r_s override while the descent floor always applied the Earth-tuned global
 * (spec §3.7).
 */

import { describe, it, expect } from 'vitest';

import { surfaceFloorM } from '../../../src/utils/camera/surfaceFloorM';
import { bodyStandoffRadii } from '../../../src/utils/scene/bodyStandoffRadii';
import { pivotFraming } from '../../../src/services/engine/camera/pivotRadiusMpc';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { SGR_A_STAR } from '../../../src/data/bodies/sceneSgrAStar';
import type { SelectionRow } from '../../../src/@types/engine/SelectionRow';

const SGR_A_STAR_ROW: SelectionRow = {
  type: 'body',
  id: SGR_A_STAR.id,
  label: SGR_A_STAR.label,
  positionMpc: [0, 0, 0],
};

describe('surfaceFloorM', () => {
  it('the descent floor at Sgr A* matches pivotFraming’s zoom floor', () => {
    expect(
      surfaceFloorM(SGR_A_STAR.surface.datumRadiusM, bodyStandoffRadii(SGR_A_STAR)) *
        SCALE_UNITS.M_TO_MPC,
    ).toBe(pivotFraming(SGR_A_STAR_ROW).floorMpc);
  });
});
