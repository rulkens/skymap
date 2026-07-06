/**
 * Laniakea — the rung between "a cluster" and "the web": Virgo is one of
 * many clusters, and the clusters belong to one immense supercluster.
 *
 * Two reveals, in the order the idea unfolds:
 *
 *   1. ONE OF MANY. Drop Virgo's spotlight (focus(null) — the recession was
 *      saying "this is the subject", the opposite of "one of many") and flip
 *      focusedOnly OFF so the sibling clusters get their names back, then
 *      pull straight out. Fornax, Hydra, Centaurus, Coma swell into frame as
 *      named rings while the caption is still to come — the population read
 *      is wordless, like the flythrough's launch.
 *   2. THEY FORM SUPERCLUSTERS. The supercluster rings fade in, Laniakea
 *      takes the focus (name + ring emphasis, clusters receding to context),
 *      and the camera flies out to hold its 80 Mpc ring in frame.
 *
 * The pull-out distance for stage 1 (MANY_CLUSTERS_MPC) is eye-tuned: wide
 * enough that a handful of neighbouring cluster rings sit in frame at label
 * size, close enough that Virgo still reads as the ring we just left.
 *
 * Laniakea's framing borrows the Local-Group beat's scale trick: the default
 * structure framing deliberately overshoots the ring fade (a focused ring is
 * chrome once it fills the viewport), so a beat whose POINT is the ring
 * multiplies the distance out until the ring sits comfortably inside the
 * fade band with its label.
 *
 * Cluster rings stay ON through this beat — they are stage 1's evidence, and
 * dimmed under Laniakea's recession they keep reading as "the members". The
 * cosmic-web beat hides them on entry (each ring category belongs to the
 * scale that introduced it) and re-establishes focusedOnly for its
 * one-subject shot.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  all,
  dollyTo,
  dollyToId,
  focus,
  hold,
  moveTargetId,
  scene,
  show,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';
import { setLabelsFocusedOnly } from '../../../../state/settings/settingsSlice';

const LANIAKEA = focusId('supercluster-laniakea-sc');

// Stage-1 landing: far enough out from Virgo that its neighbour clusters
// enter frame as named rings, short of the supercluster scale stage 2 owns.
const MANY_CLUSTERS_MPC = 60;

export const laniakea: ClipData = {
  start: 'live',
  timeline: [
    // Stage 1 — one of many.
    scene(setLabelsFocusedOnly(false)),
    focus(null),
    dollyTo(MANY_CLUSTERS_MPC, 6),
    hold(2),
    // Stage 2 — they form superclusters.
    show(['structureRing:supercluster'], 2),
    focus(LANIAKEA),
    hold(1),
    all([moveTargetId(LANIAKEA, 8), dollyToId(LANIAKEA, 8, { scale: 2.75 })]),
  ],
};
