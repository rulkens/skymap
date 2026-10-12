/**
 * actionsForPaletteAction — the store actions a palette pick dispatches, in order. Returned rather than
 * dispatched so a caller outside React runs the same pick as the palette container. `focus` is two actions:
 * `requestSelect` pins the InfoCard, then `requestFocus` flies the camera, so a pick looks like a click plus a fly.
 */
import type { UnknownAction } from '@reduxjs/toolkit';
import { requestFocus } from '../../state/selection/requestFocus';
import { requestSelect } from '../../state/selection/requestSelect';
import { openExhibit } from '../../state/exhibits/exhibitActions';
import { startTour } from '../../state/tour/tourActions';
import { flyToLonLat } from '../../state/camera/flyToLonLatActions';
import type { PaletteAction } from '../../@types/palette/PaletteAction';

const ACTIONS_FOR: Record<PaletteAction['kind'], (action: PaletteAction) => UnknownAction[]> = {
  focus: (action) => {
    if (action.kind !== 'focus') return [];
    return [requestSelect(action.focusId), requestFocus({ id: action.focusId, transition: 'fly' })];
  },
  exhibit: (action) => {
    if (action.kind !== 'exhibit') return [];
    return [openExhibit({ id: action.exhibitId, entry: 'fly' })];
  },
  tour: (action) => {
    if (action.kind !== 'tour') return [];
    return [startTour(action.tourId)];
  },
  flyTo: (action) => {
    if (action.kind !== 'flyTo') return [];
    return [
      flyToLonLat({
        lonDeg: action.lonDeg,
        latDeg: action.latDeg,
        body: 'earth',
        altKm: action.altKm,
      }),
    ];
  },
};

export function actionsForPaletteAction(action: PaletteAction): UnknownAction[] {
  return ACTIONS_FOR[action.kind](action);
}
