import ExhibitTimelineContainer from '../../containers/ExhibitTimelineContainer';
import { missionHoldSaga } from '../../../state/exhibits/missionHoldSaga';
import type { ExhibitSectionKind } from '../../../@types/exhibits/ExhibitSectionKind';
import type { ExhibitTimelineSection } from '../../../@types/exhibits/ExhibitTimelineSection';

/** A scrubbable mission timeline; its hold runs the mission camera and clock. */
export const missionTimelineKind: ExhibitSectionKind<ExhibitTimelineSection> = {
  id: 'missionTimeline',
  Component: ExhibitTimelineContainer,
  hold: missionHoldSaga,
};
