/**
 * skyArmCtxSaga — the arm geometry `offsetMs` from now, read fresh from the orientation and the
 * clock (both may change while standing, R15). Datum-only ground: no saga reaches terrain, so
 * the sky legs resolve the live ground at play time instead (D12).
 */
import { select } from 'typed-redux-saga';

import { selectOrientation } from '../settings/selectors';
import { selectTimeState } from '../time/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { datumOnlyTerrainHeight } from '../../utils/camera/terrain/datumOnlyTerrainHeight';
import { deriveBodyStates } from '../../services/engine/frame/deriveBodyStates';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import type { CameraArmBasisCtx } from '../../@types/camera/arms/CameraArmBasisCtx';

export function* skyArmCtxSaga(offsetMs: number) {
  const basis = ORIENTATION_FRAMES[yield* select(selectOrientation)];
  const time = yield* select(selectTimeState);
  const ctx: CameraArmBasisCtx = {
    bodies: deriveBodyStates(deriveSimDays(time, performance.now() + offsetMs)),
    poseBasis: basis,
    upBasis: basis,
    terrainHeightAt: datumOnlyTerrainHeight,
  };
  return ctx;
}
