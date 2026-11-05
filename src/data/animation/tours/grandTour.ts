/**
 * grandTour — "The Long Way Out": the full narrated powers-of-ten journey from
 * a park in Copenhagen to the edge of the observable universe and back. Launched
 * from the splash Tour button. See `docs/tour/` (goal, script, stages).
 *
 * Built beat-by-beat in a live-tuning loop — beats are added and their pacing
 * dialled by eye. The opening stands on Earth and the Milky Way beat anchors on
 * the `milkyWay` singleton; neither needs catalog data, so the tour establishes
 * even on an unlinked worktree.
 *
 * This file is the storyboard — beat order, captions, dwell lengths. Each
 * beat's choreography lives in its own clip file under `./grandTour/`, so a
 * beat can be re-blocked without scrolling past every other beat's timeline.
 */

import type { Tour } from '../../../@types/animation/tour/Tour';
import { dwellDrift } from '../../../state/tour/dwellDrift';
import { parkOpening, parkOpeningDwell } from './grandTour/parkOpening';
import { youAreHere, youAreHereDwell } from './grandTour/youAreHere';
import { approachM31, approachM31Dwell } from './grandTour/approachM31';
import { localGroup, localGroupDwell } from './grandTour/localGroup';
import { neighbourhoodReveal } from './grandTour/neighbourhoodReveal';
import { neighbourhoodFlythrough } from './grandTour/neighbourhoodFlythrough';
import { approachVirgo } from './grandTour/approachVirgo';
import { laniakea } from './grandTour/laniakea';
import { cosmicWeb, cosmicWebDwell } from './grandTour/cosmicWeb';
import { cosmicFlows, cosmicFlowsDwell } from './grandTour/cosmicFlows';
import { emptiness } from './grandTour/emptiness';
import { deepField, deepFieldDwell } from './grandTour/deepField';
import { theEdge } from './grandTour/theEdge';
import { homeAgain } from './grandTour/homeAgain';

export const grandTour: Tour = {
  id: 'grandTour',
  label: 'The Long Way Out',
  beats: [
    {
      enterClip: parkOpening,
      caption: {
        title: 'The Long Way Out',
        lines: [
          'From home to the edge of the observable universe, and back.',
          'Night falls, and the band of the Milky Way comes out overhead.',
        ],
      },
      dwellClip: parkOpeningDwell,
    },
    {
      enterClip: youAreHere,
      caption: {
        title: 'You are here',
        lines: [
          'The Milky Way, our home galaxy.',
          'A hundred billion stars, and the Sun is one of them.',
        ],
      },
      dwellClip: youAreHereDwell,
    },
    {
      enterClip: approachM31,
      caption: {
        title: 'Nearest neighbour',
        lines: [
          'This is Andromeda, the nearest large galaxy to ours.',
          'Its light has been travelling toward us for 2.5 million years.',
        ],
      },
      // Lands ~79° off the MW–M31 axis, so the next beat's pull-back
      // separates home and Andromeda instead of stacking them.
      dwellClip: approachM31Dwell,
    },
    {
      enterClip: localGroup,
      caption: {
        title: 'The Local Group',
        lines: [
          'The Milky Way and Andromeda travel together, dozens of dwarf galaxies in tow:',
          'a single family bound by gravity, the Local Group.',
        ],
      },
      // The orbit of the family — its share of the revolution the next
      // beat's drift completes, landing on the flythrough's launch bearing.
      dwellClip: localGroupDwell,
    },
    {
      // No enter clip: the pull-back IS the beat — the caption is about the
      // widening view, so it rides the motion (captions reveal on dwell start).
      caption: {
        title: 'Our neighbourhood',
        lines: [
          'The Local Group is one small family among many.',
          'Our galactic neighbourhood stretches tens of millions of light-years.',
        ],
      },
      dwellClip: neighbourhoodReveal,
    },
    {
      // No enter clip: the flythrough IS the dwell, so the caption reveals at
      // beat entry and rides the whole sweep (captions reveal on dwell start).
      caption: {
        title: 'Meeting the neighbours',
        lines: [
          "Bode's Galaxy, the Pinwheel, the Whirlpool, the Sombrero, Centaurus A:",
          'the bright landmarks of our corner of the universe.',
        ],
      },
      dwellClip: neighbourhoodFlythrough,
    },
    {
      enterClip: approachVirgo,
      caption: {
        title: 'The nearest cluster',
        lines: [
          'Virgo, the nearest big cluster.',
          'Over a thousand galaxies, pulled together by gravity, 50 million light-years away.',
        ],
      },
      dwellClip: dwellDrift(12),
    },
    {
      enterClip: laniakea,
      caption: {
        title: 'Laniakea',
        lines: [
          'Virgo is only the nearest of dozens of clusters, all streaming together as one structure:',
          'Laniakea, our home supercluster, half a billion light-years wide.',
        ],
      },
      dwellClip: dwellDrift(12),
    },
    {
      enterClip: cosmicWeb,
      caption: {
        title: 'The cosmic web',
        lines: [
          'Far enough out, galaxies trace a web:',
          'bright threads and clumps where superclusters gather, ringed by dark voids.',
        ],
      },
      dwellClip: cosmicWebDwell,
    },
    {
      enterClip: cosmicFlows,
      caption: {
        title: 'Everything is flowing',
        lines: [
          "The web isn't still.",
          'Galaxies stream along the threads into the densest places, ours included, pulled toward the Great Attractor.',
        ],
      },
      // The two-step zoom out (local currents → giant streams), captioned.
      dwellClip: cosmicFlowsDwell,
    },
    {
      enterClip: emptiness,
      caption: {
        title: 'The emptiness',
        lines: [
          'Most of the universe is the empty side of that web.',
          'Voids like this one stretch 300 million light-years across.',
        ],
      },
      dwellClip: dwellDrift(12),
    },
    {
      enterClip: deepField,
      caption: {
        title: 'The deep field',
        lines: [
          'Further out shine the quasars, the brilliant cores of distant galaxies,',
          'their light already billions of years old.',
        ],
      },
      // The big log-dolly rides the captioned dwell — the pull IS the beat.
      dwellClip: deepFieldDwell,
    },
    {
      // No enter clip: the final pull rides the captioned dwell.
      caption: {
        title: 'The edge',
        lines: [
          'This is the observable universe, everything light has had time to reach us from.',
          '93 billion light-years, side to side.',
        ],
      },
      dwellClip: theEdge,
    },
    {
      // No enter clip: the rush home rides the captioned dwell, and the
      // tour ends on its settle (snapshot restore + UI chrome return).
      caption: {
        title: 'Home again',
        lines: [
          'Back to where we began.',
          'Everything you just saw is out there to explore.',
        ],
      },
      dwellClip: homeAgain,
    },
  ],
};
