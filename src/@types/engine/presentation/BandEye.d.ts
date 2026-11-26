import type { ReadyFrameContext } from '../frame/ReadyFrameContext';
import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';

/** The eye a band is measured from: a view, or the frame camera at admission. */
export type BandEye = {
  drawCamPos: Readonly<Vec3>;
  snapshot: Pick<ReadyFrameContext, 'bodyStates'>;
};
