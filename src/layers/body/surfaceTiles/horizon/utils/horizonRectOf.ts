import type { Vec4 } from '../../../../../../packages/shared/src/@types/math/Vec4';
import type { StandaloneRect } from '../../plan/@types/StandaloneRect';
import { NO_HORIZON_RECT } from '../../../../../data/gpu/horizonRects';
import { horizonPostRect } from './horizonPostRect';

/** A resolved horizon rect as `lib/horizonLookup.wesl` reads it. Never an ancestor's rect for
 *  'empty': a flat tile under a hilly ancestor stays lit. */
export function horizonRectOf(rect: StandaloneRect): Readonly<Vec4> {
  return rect === null || rect === 'empty' ? NO_HORIZON_RECT : horizonPostRect(rect);
}
