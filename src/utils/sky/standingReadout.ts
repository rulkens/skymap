/** standingReadout — the scale slot's lens and spot while standing, else null. */

import type { SkyView } from '../../@types/engine/SkyView';
import type { StandingReadout } from '../../@types/sky/StandingReadout';
import { fieldLabel } from './fieldLabel';
import { spotLatLonLabel } from '../places/spotLatLonLabel';

export function standingReadout(view: SkyView, fovYRad: number): StandingReadout | null {
  return view === null ? null : { field: fieldLabel(fovYRad), spot: spotLatLonLabel(view.spot) };
}
