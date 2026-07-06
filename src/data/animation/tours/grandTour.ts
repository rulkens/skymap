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
import { youAreHere, youAreHereDwell } from './grandTour/youAreHere';
import { approachM31, approachM31Dwell } from './grandTour/approachM31';
import { neighbourhoodFlythrough } from './grandTour/neighbourhoodFlythrough';
import { approachVirgo } from './grandTour/approachVirgo';
import { cosmicWeb, cosmicWebDwell } from './grandTour/cosmicWeb';
import { cosmicFlows, cosmicFlowsDwell } from './grandTour/cosmicFlows';
import { emptiness } from './grandTour/emptiness';
import { deepField, deepFieldDwell } from './grandTour/deepField';
import { theEdge } from './grandTour/theEdge';

export const grandTour: Tour = {
  id: 'grandTour',
  label: 'The Long Way Out',
  beats: [
    {
      enterClip: openingTitle,
      caption: {
        title: 'The Long Way Out',
        body: "Let's take a tour from home to the edge of the observable universe, and back.",
        position: 'bottom-left',
      },
      dwellClip: dwellDrift(8, { cruiseRate: (Math.PI * 2) / 120 }),
    },
    {
      enterClip: youAreHere,
      caption: {
        title: 'You are here',
        body: 'The Milky Way, our home. The sun and a few hundred billion stars, and the one vantage point you are looking out **from**.',
        position: 'bottom-left',
      },
      dwellClip: youAreHereDwell,
    },
    {
      enterClip: approachM31,
      caption: {
        title: 'Nearest neighbour',
        body: 'This is Andromeda, the nearest large galaxy to ours. Its light has been travelling toward us for 2.5 million years.',
        position: 'bottom-left',
      },
      // Sized to land facing the M81 Group — the next beat's launch bearing.
      dwellClip: approachM31Dwell,
    },
    {
      // No enter clip: the flythrough IS the dwell, so the caption reveals at
      // beat entry and rides the whole sweep (captions reveal on dwell start).
      caption: {
        title: 'Our neighbourhood',
        body: 'Our galaxy runs with neighbours like M81 and Centaurus A, tens of millions of light-years out.',
        position: 'bottom-left',
      },
      dwellClip: neighbourhoodFlythrough,
    },
    {
      enterClip: approachVirgo,
      caption: {
        title: 'The nearest cluster',
        body: 'Virgo, the nearest big cluster — over a thousand galaxies, pulled together by gravity, 50 million light-years away.',
        position: 'bottom-left',
      },
      dwellClip: dwellDrift(12),
    },
    {
      enterClip: cosmicWeb,
      caption: {
        title: 'The cosmic web',
        body: 'Far enough out, galaxies trace a web: bright threads and clumps where superclusters gather, ringed by dark voids.',
        position: 'bottom-left',
      },
      dwellClip: cosmicWebDwell,
    },
    {
      enterClip: cosmicFlows,
      caption: {
        title: 'Everything is flowing',
        body: "The web isn't still. Galaxies stream along the threads into the densest places, ours included, pulled toward the Great Attractor.",
        position: 'bottom-left',
      },
      // The two-step zoom out (local currents → giant streams), captioned.
      dwellClip: cosmicFlowsDwell,
    },
    {
      enterClip: emptiness,
      caption: {
        title: 'The emptiness',
        body: 'Most of the universe is the empty side of that web. Voids like this one stretch 300 million light-years across.',
        position: 'bottom-left',
      },
      // Short by design — the contrast against the web registers quickly,
      // and the tour never lingers on nothing.
      dwellClip: dwellDrift(6),
    },
    {
      enterClip: deepField,
      caption: {
        title: 'The deep field',
        body: 'Further out shine the quasars, the brilliant cores of distant galaxies, their light already billions of years old.',
        position: 'bottom-left',
      },
      // The big log-dolly rides the captioned dwell — the pull IS the beat.
      dwellClip: deepFieldDwell,
    },
    {
      // No enter clip: the final pull rides the captioned dwell.
      caption: {
        title: 'The edge',
        body: 'This is the observable universe, everything light has had time to reach us from. 93 billion light-years, side to side.',
        position: 'bottom-left',
      },
      dwellClip: theEdge,
    },
  ],
};
