/**
 * actionsForPaletteAction — the store actions a palette pick dispatches, in order. Returned rather than
 * dispatched so a caller outside React runs the same pick as the palette container. `focus` is two actions:
 * `requestSelect` pins the InfoCard, then `requestView` asks for the view (`watchRequestViewSaga` decides how).
 * A named spot arrives from wherever the camera is (no ground point); `'here'` is read when it lands.
 */
import type { UnknownAction } from '@reduxjs/toolkit';
import { requestView } from '../../state/selection/requestView';
import { requestSelect } from '../../state/selection/requestSelect';
import { openExhibit } from '../../state/exhibits/exhibitActions';
import { startTour } from '../../state/tour/tourActions';
import { flyToLonLat } from '../../state/camera/flyToLonLatActions';
import { enterSky } from '../../state/sky/enterSky';
import { enterSkyHere } from '../../state/sky/enterSkyHere';
import type { PaletteAction } from '../../@types/palette/PaletteAction';

export function actionsForPaletteAction(action: PaletteAction): UnknownAction[] {
  switch (action.kind) {
    case 'focus':
      return [requestSelect(action.focusId), requestView({ id: action.focusId })];
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
    case 'sky':
      return [
        action.spot === 'here'
          ? enterSkyHere()
          : enterSky({ spot: action.spot, pointLocalM: null }),
      ];
  }
}
