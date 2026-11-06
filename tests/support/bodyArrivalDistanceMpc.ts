import { arrivalFraming } from '../../src/services/engine/camera/framing/arrivalFraming';
import { BODY_FOCUS } from '../../src/data/selection/bodyFocus';

/** Where a focus arrival at a near-field body of `radiusMpc` lands, in Mpc from its centre. */
export function bodyArrivalDistanceMpc(radiusMpc: number, fovYRad: number): number {
  return arrivalFraming({ type: 'body', positionMpc: [0, 0, 0], radiusMpc }, BODY_FOCUS, fovYRad)
    .distance;
}
