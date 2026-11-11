/**
 * standingReadout — the scale slot's lens ("field 60°", or "field 5′" under a degree) and spot
 * while standing, else null.
 */

import type { SkyView } from '../../@types/engine/SkyView';
import type { StandingReadout } from '../../@types/sky/StandingReadout';
import { radToDeg } from '../math/radToDeg';
import { formatLensDeg } from '../format/formatLensDeg';
import { spotLatLonLabel } from '../places/spotLatLonLabel';

export function standingReadout(view: SkyView, fovYRad: number): StandingReadout | null {
  if (view === null) return null;
  return { field: `field ${formatLensDeg(radToDeg(fovYRad))}`, spot: spotLatLonLabel(view.spot) };
}
