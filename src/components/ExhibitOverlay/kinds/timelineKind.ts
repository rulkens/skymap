import ExhibitTimelineContainer from '../../containers/ExhibitTimelineContainer';
import { timelineHoldSaga } from '../../../state/exhibits/timeline/timelineHoldSaga';
import { timelineShortcuts } from '../../../state/exhibits/timeline/timelineShortcuts';
import { timelinePose } from '../../../utils/camera/timeline/timelinePose';
import type { ExhibitSectionKind } from '../../../@types/exhibits/ExhibitSectionKind';
import type { ExhibitTimelineData } from '../../../@types/exhibits/timeline/ExhibitTimelineData';

/** A scrubbable timeline; its hold runs the clock, its camera row follows the craft. */
export const timelineKind: ExhibitSectionKind<ExhibitTimelineData> = {
  Component: ExhibitTimelineContainer,
  hold: timelineHoldSaga,
  shortcuts: timelineShortcuts,
  cameraDriver: {
    id: 'timeline',
    ridesWheelTarget: true,
    // Above the follow rows (55) so a moving focus cannot pull the camera off the craft, below
    // tween (60) so a visitor's own focus move still wins while the exhibit runs.
    priority: 58,
    epoch: 'aim',
    // Bakes the pose on screen, so the next winner eases from it, not the stale pre-exhibit
    // `base`; its own epoch makes the follow rows a new author.
    commitsOnEdge: 'displayed',
    pose: timelinePose,
  },
};
