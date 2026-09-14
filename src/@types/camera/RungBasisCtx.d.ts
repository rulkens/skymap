import type { BodyId } from '../data/body/BodyId';
import type { BodyState } from '../scene/BodyState';
import type { Mat3 } from '../math/Mat3';

/**
 * The geometry every rung reader needs, gesture-time facts excluded (see D1
 * in the frame-ladder prep plan). `host`, `toParent`, `fromParent` and the
 * free fold functions take only this; `RungCtx` adds the input-path fields.
 */
export type RungBasisCtx = {
  readonly bodies: ReadonlyMap<BodyId, BodyState>;
  readonly poseBasis: Readonly<Mat3>;
  readonly upBasis: Readonly<Mat3>;
};
