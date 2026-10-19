import VoyageContainer from '../ui/VoyageContainer';
import { voyageHoldSaga } from '../sagas/voyageHoldSaga';
import { voyagePose } from './voyagePose';
import type { ExhibitSectionKind } from '../../../@types/exhibits/ExhibitSectionKind';
import type { VoyageSection } from '../@types/VoyageSection';

/** The voyage's notes section; its hold runs the trip's clock, its camera row rides the ship. */
export const voyageKind: ExhibitSectionKind<VoyageSection> = {
  Component: VoyageContainer,
  hold: voyageHoldSaga,
  cameraDriver: {
    id: 'voyage',
    ridesWheelTarget: true,
    // As the mission row (58): above the follow rows (55), below tween (60). One under it, as no
    // two rows may tie, though only one exhibit runs at a time.
    priority: 57,
    epoch: 'aim',
    // Bakes the pose on screen, so the scene restored on exit eases from it.
    commitsOnEdge: 'displayed',
    pose: voyagePose,
  },
};
