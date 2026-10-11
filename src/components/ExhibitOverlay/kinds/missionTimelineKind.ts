import ExhibitTimelineContainer from '../../containers/ExhibitTimelineContainer';
import { missionHoldSaga } from '../../../state/exhibits/missionHoldSaga';
import { missionShortcuts } from '../../../state/exhibits/missionShortcuts';
import { missionPose } from '../../../services/engine/camera/missionPose';
import type { ExhibitSectionKind } from '../../../@types/exhibits/ExhibitSectionKind';
import type { MissionTimeline } from '../../../@types/exhibits/MissionTimeline';

/** A scrubbable mission timeline; its hold runs the clock, its camera row follows the craft. */
export const missionTimelineKind: ExhibitSectionKind<MissionTimeline> = {
  id: 'missionTimeline',
  Component: ExhibitTimelineContainer,
  hold: missionHoldSaga,
  shortcuts: missionShortcuts,
  cameraDriver: {
    id: 'mission',
    ridesWheelTarget: true,
    // Above the follow rows (55) so a moving focus cannot pull the camera off the craft, below
    // tween (60) so a visitor's own focus move still wins while the exhibit runs.
    priority: 58,
    epoch: 'aim',
    // Bakes the pose on screen, so the next winner eases from it, not the stale pre-exhibit
    // `base`; its own epoch makes the follow rows a new author.
    commitsOnEdge: 'displayed',
    pose: missionPose,
  },
};
