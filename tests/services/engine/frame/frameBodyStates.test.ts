import { describe, expect, it, vi } from 'vitest';
import { frameBodyStates } from '../../../../src/services/engine/frame/frameBodyStates';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { SelectionKindRow } from '../../../../src/@types/engine/layer/SelectionKindRow';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';

const AT = CONST_J2000 + 5;
const REF = { type: 'satellite', noradId: 25544 } as const;
const MOVING = {
  type: 'satellite',
  positionMpc: [1e-5, 0, 0],
  driver: { poseId: 'transient:satellite-25544', followsSimClock: true },
} as unknown as SelectionRow;

describe('frameBodyStates', () => {
  // A pointer sweep would otherwise extract every satellite it crosses, every frame.
  it('never places a hovered satellite', () => {
    const extractRow = vi.fn(() => MOVING);
    const out = frameBodyStates(
      {
        selection: {
          hover: REF,
          select: null,
          focus: null,
          pending: { select: null, focus: null },
        },
        selectionRows: { hover: MOVING, select: null, focus: null },
      },
      [{ type: 'satellite', extractRow } as unknown as SelectionKindRow],
      AT,
    );
    expect(out).toBe(deriveBodyStates(AT));
    expect(extractRow).not.toHaveBeenCalled();
  });
});
