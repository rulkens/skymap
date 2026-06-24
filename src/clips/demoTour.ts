/**
 * demoTour — a minimal three-beat guided tour for exercising the tour saga
 * end-to-end from the dev panel.
 *
 * Each beat is a focus target + caption + dwell. The first beat targets the
 * Milky Way, which resolves with NO catalog data loaded (it is a singleton in
 * the selection model) — so the tour always advances past beat 1 even on a
 * worktree without linked `public/data/`. Beats 2 and 3 target structure
 * anchors (`virgo-m87`, `laniakea-sc`) baked into `structures.ccat`; the tour
 * driver's `waitUntil(focusReady)` holds on each until its row is resolvable,
 * so a slow catalog load simply delays the fly rather than skipping the beat.
 *
 * No `effects` — this tour only moves the camera and shows captions, the
 * smallest itinerary that still drives the full fly → dwell → restore path.
 * Richer scripted itineraries (layer fades, scene cues) belong in their own
 * tour definitions; this one stays the bare smoke test.
 */

import type { BeatData } from '../@types/tour/BeatData';

export const demoTour: readonly BeatData[] = [
  { focus: { type: 'milkyWay' }, caption: 'Home — the Milky Way', dwellSec: 5 },
  { focus: { type: 'structure', id: 'virgo-m87' }, caption: 'The Virgo Cluster', dwellSec: 5 },
  {
    focus: { type: 'structure', id: 'laniakea-sc' },
    caption: 'Laniakea — our home supercluster',
    dwellSec: 6,
  },
];
