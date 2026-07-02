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
 * The home-scene strip lives IN the opening clip (not a tour-level setup list):
 * one authoring surface, and stepping back to beat 1 re-establishes its scene.
 * Everything hidden there is a later beat's reveal; the guidedTourSaga
 * snapshot/restore winds it all back on exit.
 */

import type { Tour } from '../../../@types/animation/tour/Tour';
import type { ClipData } from '../../../@types/animation/ClipData';
import { focusOn, hide } from '../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../utils/animation/focusId';
import { dwellDrift } from '../../../state/tour/dwellDrift';

const MW = focusId('milkyWay');

/**
 * Opening title — strip the home scene in one instant sweep, fly to the
 * Milky-Way framing, and hold while the title card reads.
 */
const openingTitle: ClipData = {
  start: 'live',
  timeline: [
    // over: 0 snaps — the tour opens on a clean frame, not mid-fade. 'labels'
    // is every text label; bare 'survey' gates every galaxy catalog — each is
    // a later beat's reveal (scoped 'survey:<id>' entries bring them back one
    // at a time as the journey reaches them).
    hide(
      [
        'volumesMaster', // the cosmic-web beat's reveal
        'filaments', //      〃
        'flow', // the flows beat's reveal
        'structureRing', // shown per category as beats reach them
        'labels', // named as we reach each subject
        'survey', // catalogs revealed one at a time on the way out
      ],
      0,
    ),
    focusOn(MW, 2),
  ],
};

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
      dwellClip: dwellDrift(8),
    },
    {
      // No enterClip — beat 1 already framed the Milky Way; the caption reveals at
      // once and the dwell drift carries the local orbit.
      caption: {
        title: 'You are here',
        body: 'The Milky Way — a few hundred billion stars, and the one vantage point you are looking out **from**.',
        position: 'bottom-left',
      },
      dwellClip: dwellDrift(7),
    },
  ],
};
