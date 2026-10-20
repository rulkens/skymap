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

export function actionsForPaletteAction(action: PaletteAction): UnknownAction[] {
  switch (action.kind) {
    case 'focus':
      return [
        requestSelect(action.focusId),
        requestFocus({ id: action.focusId, transition: 'fly' }),
      ];
    case 'exhibit':
      return [openExhibit({ id: action.exhibitId, entry: 'fly' })];
    case 'tour':
      return [startTour(action.tourId)];
    case 'flyTo':
      return [
        flyToLonLat({
          lonDeg: action.lonDeg,
          latDeg: action.latDeg,
          body: 'earth',
          altKm: action.altKm,
        }),
      ];
  }
}
