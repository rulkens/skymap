import {
  LIGHT_TIME_APPROACH_BAND,
  LIGHT_TIME_RECEDE_BAND,
} from '../../../data/lightTime/lightTimeFadeBands';
import { fadeWindow } from '../../../utils/math/fadeWindow';

/** Distance-window opacity of one sphere; the toggle fade multiplies on top elsewhere. */
export function lightTimeSphereOpacity(camDistMpc: number, radiusMpc: number): number {
  return fadeWindow([LIGHT_TIME_APPROACH_BAND, LIGHT_TIME_RECEDE_BAND], camDistMpc / radiusMpc);
}
