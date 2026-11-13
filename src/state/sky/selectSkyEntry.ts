/**
 * selectSkyEntry — the spot "Look up from here", `s` and "Sky from here" would stand on, or
 * null when entry is not on offer: above `SKY_ENTRY_MAX_ALT_M`, no terrain under the view
 * centre, already standing (D9), or while any takeover or camera clip owns the camera (a sky
 * takeover is only ever arriving, standing or restoring, so "any" loses nothing).
 */
import type { RootState } from '../../store/types';
import type { SkyEntryFacts } from '../../@types/engine/SkyEntryFacts';
import { SKY_ENTRY_MAX_ALT_M } from '../../data/sky/skyEntryMaxAltM';
import { selectSkyView } from './selectSkyView';
import { selectTakeoverSource } from '../takeover/selectors';
import { selectClipActive } from '../camera/selectors';
import { selectSkyEntryFacts } from './selectSkyEntryFacts';

export const selectSkyEntry = (state: RootState): SkyEntryFacts['spot'] => {
  const { spot, altitudeM } = selectSkyEntryFacts(state);
  const open =
    altitudeM < SKY_ENTRY_MAX_ALT_M &&
    selectSkyView(state) === null &&
    selectTakeoverSource(state) === null &&
    !selectClipActive(state);
  return open ? spot : null;
};
