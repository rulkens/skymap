/**
 * grandTour — "The Long Way Out": the full narrated powers-of-ten journey from
 * the Milky Way to the edge of the observable universe and back. Launched from
 * the splash Tour button. See `docs/tour/` (goal, script, stages).
 *
 * Built beat-by-beat in a live-tuning loop — beats are added and their pacing
 * dialled by eye. The opening beats anchor on the `milkyWay` singleton, which
 * resolves with NO catalog data loaded, so the tour always establishes even on
 * an unlinked worktree.
 */

import type { Tour } from '../../../@types/animation/tour/Tour';
import type { ClipData } from '../../../@types/animation/ClipData';
import { focus, hide, seq, spin } from '../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../utils/animation/focusId';
import { STRUCTURE_IDS } from '../../../data/structure/structureIds';
import {
  setGalaxyCatalogLabelEnabled,
  setGalaxyCatalogVisible,
  setStructureItemEnabled,
  setStructureLabelEnabled,
  setVolumesEnabled,
} from '../../../state/settings/settingsSlice';

const MW = focusId('milkyWay');

/**
 * Opening title — hold the bootstrap Milky-Way framing dead still (no camera
 * move) while the title card reads. A gentle forked yaw drift keeps it alive.
 */
const openingTitle: ClipData = {
  start: 'live',
  timeline: [hide(['flow', 'filaments', 'milkyWayLabel', 'volumesMaster']), focus(MW)],
};

/**
 * You are here — a slow local orbit around the Milky Way for dimensionality.
 */
const youAreHere: ClipData = {
  start: 'live',
  timeline: [focus(MW), seq([spin('yaw', { by: 0.5, over: 10 })])],
};

export const grandTour: Tour = {
  id: 'grandTour',
  label: 'The Long Way Out',
  // Strip the home scene to galaxies + Milky Way; later beats show() each layer
  // as the reveal that earns it. Every toggle here is wound back on tour exit by
  // the guidedTourSaga snapshot/restore, so the user's scene returns untouched.
  setup: {
    effects: [
      // Cosmic-web volume (mcpm) — the scale-5 reveal, off at home.
      setVolumesEnabled(false),
      // Structure rings + labels belong to the cluster/web beats. Hide all four
      // categories now; beats show(['structureRing'/'structureLabel']) on entry.
      ...STRUCTURE_IDS.flatMap((id) => [
        setStructureItemEnabled({ id, enabled: false }),
        setStructureLabelEnabled({ id, enabled: false }),
      ]),
      // Name galaxies as we reach them, not all at once.
      setGalaxyCatalogLabelEnabled({ id: 'famousGalaxy', enabled: false }),
      // Quasars are the deep-field reveal.
      setGalaxyCatalogVisible({ id: 'milliquas', enabled: false }),
    ],
  },
  beats: [
    {
      clip: openingTitle,
      caption: {
        title: 'The Long Way Out',
        body: 'From home to the edge of the observable universe — and back.',
        position: 'bottom-left',
      },
      dwellSec: 8,
    },
    {
      clip: youAreHere,
      caption: {
        title: 'You are here',
        body: 'The Milky Way — a few hundred billion stars, and the one vantage point you are looking out **from**.',
        position: 'bottom-left',
      },
      dwellSec: 7,
    },
  ],
};
