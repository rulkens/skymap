import { describe, expect, it, vi } from 'vitest';
import { placeLiveSelection } from '../../../../src/services/engine/frame/placeLiveSelection';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import type { SelectionKindRow } from '../../../../src/@types/engine/layer/SelectionKindRow';
import type { SelectionRef } from '../../../../src/@types/engine/SelectionRef';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
import type { TransientBodyId } from '../../../../src/@types/scene/TransientBodyId';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const POSE_ID: TransientBodyId = 'transient:satellite-25544';
const REF: SelectionRef = { type: 'satellite', noradId: 25544 };
const AT = CONST_J2000 + 3;
const PLACED: Vec3 = [1e-5, 2e-5, 3e-5];
const base = deriveBodyStates(AT);

const movingRow = (positionMpc: Vec3): SelectionRow =>
  ({
    type: 'satellite',
    positionMpc,
    driver: {
      poseId: POSE_ID,
      boundingRadiusM: 50,
      footprintRadiusM: 50_000,
      groundRadiusM: null,
      standoffRadii: 2,
      followsSimClock: true,
    },
  }) as unknown as SelectionRow;

const kindRow = (extracted: SelectionRow | null) => {
  const extractRow = vi.fn((_ref: SelectionRef, _simDays: number) => extracted);
  return { row: { type: 'satellite', extractRow } as unknown as SelectionKindRow, extractRow };
};

describe('placeLiveSelection', () => {
  it('returns the same Map when no slot follows the sim clock', () => {
    const earth = asSceneBodyId('earth');
    const bodyRow = {
      type: 'body',
      driver: { poseId: earth, boundingRadiusM: 1, footprintRadiusM: 1, groundRadiusM: 1 },
    } as unknown as SelectionRow;
    const { row } = kindRow(movingRow(PLACED));
    const out = placeLiveSelection(
      base,
      [{ ref: { type: 'body', id: earth }, row: bodyRow }],
      [row],
      AT,
    );
    expect(out).toBe(base);
  });

  it('places a followsSimClock focus row under its poseId at simDays', () => {
    const { row, extractRow } = kindRow(movingRow(PLACED));
    const out = placeLiveSelection(
      base,
      [
        { ref: null, row: null },
        { ref: REF, row: movingRow([0, 0, 0]) },
      ],
      [row],
      AT,
    );
    expect(extractRow).toHaveBeenCalledWith(REF, AT);
    expect(out.get(POSE_ID)!.positionMpc).toEqual(PLACED);
    expect(base.has(POSE_ID)).toBe(false);
  });

  it('leaves out a ref whose extractRow returns null', () => {
    const { row } = kindRow(null);
    const out = placeLiveSelection(base, [{ ref: REF, row: movingRow(PLACED) }], [row], AT);
    expect(out.has(POSE_ID)).toBe(false);
  });

  it('places select and focus of the same ref once', () => {
    const { row, extractRow } = kindRow(movingRow(PLACED));
    const slot = { ref: REF, row: movingRow(PLACED) };
    placeLiveSelection(base, [slot, slot], [row], AT);
    expect(extractRow).toHaveBeenCalledTimes(1);
  });
});
