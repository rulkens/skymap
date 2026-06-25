/**
 * demoTour — a minimal three-beat guided `Tour` for exercising the tour saga
 * end-to-end from the dev panel.
 *
 * Each beat is a clip + caption + dwell. The first beat targets the Milky Way,
 * which resolves with NO catalog data loaded (it is a singleton in the selection
 * model) — so the tour always advances past beat 1 even on a worktree without
 * linked `public/data/`. Beats 2 and 3 target featured structure anchors built
 * from the committed `structure_anchors.seed.json`.
 *
 * The anchor id scheme is `${category}-${seed.id}` (see
 * `buildStaticAnchorStructures`), so Virgo — a cluster with seed id `virgo-m87`
 * — is `cluster-virgo-m87`, and Laniakea — a supercluster with seed id
 * `laniakea-sc` — is `supercluster-laniakea-sc`. A bare seed id never matches
 * `structures.byId`, so the beat's `waitUntil(clipFociReady)` would poll forever:
 * the category prefix is load-bearing, not cosmetic.
 *
 * Each beat uses `flyAndFocusOnClip` so the InfoCard and isolation highlight
 * appear during the approach rather than only after the camera lands. This
 * gives the viewer context while the clip is still in flight. Richer scripted
 * itineraries (layer fades, scene cues) belong in their own tour definitions
 * (see `webShowcase`); this one stays the bare smoke test.
 */

import type { Tour } from '../../../@types/animation/tour/Tour';
import { flyAndFocusOnClip } from '../../../state/tour/flyAndFocusOnClip';
import { focusId } from '../../../utils/animation/focusId';

export const demoTour: Tour = {
  id: 'demo',
  label: 'Demo Tour',
  beats: [
    { clip: flyAndFocusOnClip(focusId('milkyWay')), caption: 'Home — the Milky Way', dwellSec: 5 },
    {
      clip: flyAndFocusOnClip(focusId('cluster-virgo-m87')),
      caption: 'The Virgo Cluster',
      dwellSec: 5,
    },
    {
      clip: flyAndFocusOnClip(focusId('supercluster-laniakea-sc')),
      caption: 'Laniakea — our home supercluster',
      dwellSec: 6,
    },
  ],
};
