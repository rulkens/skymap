import { describe, expect, it } from 'vitest';
import { proposedLiftPx } from '../../../src/utils/labels/proposedLiftPx';
import {
  LEADER_LIFT_FACTOR,
  MIN_LABEL_CLEARANCE_PX,
} from '../../../src/services/engine/presentation/leaderLineStyle';

describe('proposedLiftPx', () => {
  it('floors a point-sized subject at the clearance and scales a disc by the lift factor', () => {
    expect(proposedLiftPx(0, 1)).toBe(MIN_LABEL_CLEARANCE_PX);
    expect(proposedLiftPx(400, 1)).toBe(LEADER_LIFT_FACTOR * 400);
  });

  it('holds the clearance floor in CSS px: twice the device px at dpr 2', () => {
    expect(proposedLiftPx(0, 2)).toBe(2 * MIN_LABEL_CLEARANCE_PX);
  });
});
