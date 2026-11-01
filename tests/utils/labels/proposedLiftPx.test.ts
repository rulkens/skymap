import { describe, expect, it } from 'vitest';
import { proposedLiftPx } from '../../../src/utils/labels/proposedLiftPx';
import {
  LEADER_LIFT_FACTOR,
  MIN_LABEL_CLEARANCE_PX,
} from '../../../src/services/engine/presentation/leaderLineStyle';

describe('proposedLiftPx', () => {
  it('floors a point-sized subject at the clearance and scales a disc by the lift factor', () => {
    expect(proposedLiftPx(0)).toBe(MIN_LABEL_CLEARANCE_PX);
    expect(proposedLiftPx(400)).toBe(LEADER_LIFT_FACTOR * 400);
  });
});
