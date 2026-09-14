import type { BodyId } from '../data/body/BodyId';
import type { BodyState } from '../scene/BodyState';
import type { Mat3 } from '../math/Mat3';

/** The geometry every rung reader needs; the gesture-time fields live on `RungCtx` (prep plan, D1). */
export type RungBasisCtx = {
  readonly bodies: ReadonlyMap<BodyId, BodyState>;
  readonly poseBasis: Readonly<Mat3>;
  readonly upBasis: Readonly<Mat3>;
};
