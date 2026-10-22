/**
 * visibleBodyRows — a host whose own disc the frustum gate drops still gets its
 * row while a mesh body riding it is in view.
 */

import { describe, expect, it } from 'vitest';

import { visibleBodyRows } from '../../../../src/services/engine/frame/visibleBodyRows';
import { visibleSlabBodies } from '../../../../src/services/engine/frame/visibleSlabBodies';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { orbitForwardOf } from '../../../../src/utils/camera/orbitForwardOf';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { frameViewsAt } from '../../../helpers/frame/frameViewsAt';

describe('visibleBodyRows', () => {
  it('re-admits the host of a mesh body in view', () => {
    // Beside Hubble, looking straight away from Earth.
    const states = deriveBodyStates(CONST_J2000);
    const earth = states.get('earth')!.positionMpc;
    const hubble = states.get('hubble')!.positionMpc;
    const out = normalize3([hubble[0] - earth[0], hubble[1] - earth[1], hubble[2] - earth[2]]);
    const back = 20 * SCALE_UNITS.M_TO_MPC;
    const [view] = frameViewsAt({
      eyeMpc: [hubble[0] - out[0] * back, hubble[1] - out[1] * back, hubble[2] - out[2] * back],
      forward: out,
      distanceMpc: 1e-12,
    });
    const gate = {
      camPosMpc: view!.drawCamPos,
      camForwardMpc: orbitForwardOf(view!.cam),
      frustum: view!.frustum,
      pxPerRad: view!.drawPxPerRad,
    };
    const ownCull = visibleSlabBodies({
      ...gate,
      bodyStates: view!.snapshot.bodyStates,
      rows: view!.snapshot.slabBodyCandidates,
    });
    expect(ownCull.map((row) => row.anchorId)).not.toContain('earth');
    expect(visibleBodyRows(view!.snapshot, gate).map((row) => row.anchorId)).toContain('earth');
  });
});
