/**
 * grandTour — "The Long Way Out": the full narrated powers-of-ten journey from
 * the Milky Way to the edge of the observable universe and back. Launched from
 * the splash Tour button. See `docs/tour/` (goal, script, stages).
 *
 * Built beat-by-beat in a live-tuning loop — beats are added and their pacing
 * dialled by eye. The opening beats anchor on the `milkyWay` singleton, which
 * resolves with NO catalog data loaded, so the tour always establishes even on
 * an unlinked worktree.
 *
 * This file is the storyboard — beat order, captions, dwell lengths. Each
 * beat's choreography lives in its own clip file under `./grandTour/`, so a
 * beat can be re-blocked without scrolling past every other beat's timeline.
 */

import type { Tour } from '../../../@types/animation/tour/Tour';
import { dwellDrift } from '../../../state/tour/dwellDrift';
import { openingTitle } from './grandTour/openingTitle';
import { youAreHere } from './grandTour/youAreHere';
import { approachM31 } from './grandTour/approachM31';

export const grandTour: Tour = {
  id: 'grandTour',
  label: 'The Long Way Out',
  beats: [
    {
      enterClip: openingTitle,
      caption: {
        title: 'The Long Way Out',
        body: 'From home to the edge of the observable universe — and back.',
        position: 'bottom-left',
      },
      dwellClip: dwellDrift(8, (Math.PI * 2) / 120),
    },
    {
      enterClip: youAreHere,
      caption: {
        title: 'You are here',
        body: 'The Milky Way — a few hundred billion stars, and the one vantage point you are looking out **from**.',
        position: 'bottom-left',
      },
      dwellClip: dwellDrift(7),
    },
    {
      enterClip: approachM31,
      caption: {
        title: 'Nearest neighbour',
        body: 'Andromeda, the nearest large galaxy to ours. Its light has been travelling toward us for 2.5 million years.',
        position: 'bottom-left',
      },
      dwellClip: dwellDrift(10, (Math.PI * 2) / 30),
    },
  ],
};
