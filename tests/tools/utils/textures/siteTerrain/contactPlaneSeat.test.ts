import { describe, expect, it } from 'vitest';

import { contactPlaneSeat } from '../../../../../tools/utils/textures/siteTerrain/contactPlaneSeat';

const LIFT_M = 0.9;

describe('contactPlaneSeat', () => {
  it('fits the plane through three contacts: its height at the centre and its up', () => {
    // z = 100 + 0.1·east − 0.05·north, contacts off-centre so the centre is extrapolated.
    const plane = (e: number, n: number) => 100 + 0.1 * e - 0.05 * n;
    const contacts = [
      [1, 1],
      [3, 1],
      [1, 4],
    ].map(([e, n]) => ({ eastM: e!, northM: n!, heightM: plane(e!, n!) }));

    const seat = contactPlaneSeat(contacts, LIFT_M);

    const norm = Math.hypot(0.1, 0.05, 1);
    expect(seat!.up[0]).toBeCloseTo(-0.1 / norm, 12);
    expect(seat!.up[1]).toBeCloseTo(0.05 / norm, 12);
    expect(seat!.up[2]).toBeCloseTo(1 / norm, 12);
    // Plane at the centre, plus the sink of tilting about the lifted origin.
    expect(seat!.heightM).toBeCloseTo(100 + LIFT_M * (norm - 1), 9);
  });

  it('gives no seat for a collinear set, which leaves the cross-slope unconstrained', () => {
    const line = [0, 1, 2].map((e) => ({ eastM: e, northM: 2 * e, heightM: 100 + e }));
    expect(contactPlaneSeat(line, LIFT_M)).toBeNull();
    expect(contactPlaneSeat(line.slice(0, 2), LIFT_M)).toBeNull();
  });
});
