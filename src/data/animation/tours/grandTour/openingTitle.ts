/**
 * Opening title — strip the home scene in one instant sweep, snap the rig
 * far out on the Milky-Way bearing, and make the long approach: with every
 * survey hidden and the sprite sub-pixel at the far pose, the first frame
 * is empty space, and home MATERIALIZES as the log dolly closes in. The
 * title card reads on arrival (captions reveal on clip land), so the cold
 * open plays wordless — black, then a galaxy, then the title.
 *
 * The snap is two zero-duration cues, not a baked `start` pose: the clip
 * keeps `start: 'live'`, so playing it from anywhere (the debugger,
 * stepping back to beat 1) re-establishes the same open.
 *
 * The home-scene strip lives IN this clip (not a tour-level setup list):
 * one authoring surface, and stepping back to beat 1 re-establishes its
 * scene. Everything hidden here is a later beat's reveal; the
 * guidedTourSaga snapshot/restore winds it all back on exit.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import {
  aimAlong,
  all,
  dollyTo,
  focusOnId,
  frameTo,
  hide,
  moveTargetId,
  scene,
} from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';
import { setLabelsFocusedOnly } from '../../../../state/settings/settingsSlice';
import { GALACTIC_DISC_FORWARD } from '../../../../services/engine/camera/cameraFraming';
import { FRAME_ROLL_SEC } from './frameRollSec';

const MW = focusId('milkyWay');

// Far enough that the Milky-Way sprite (~0.03 Mpc across) is sub-pixel —
// the open reads as empty space, not a small galaxy.
const FAR_OPEN_MPC = 100;

export const openingTitle: ClipData = {
  start: 'live',
  timeline: [
    // over: 0 snaps — the tour opens on a clean frame, not mid-fade. Bare
    // 'survey' gates every galaxy catalog — each is a later beat's reveal
    // (scoped 'survey:<id>' entries bring them back one at a time as the
    // journey reaches them). Label LAYERS stay on: focusedOnly (below) means
    // only the focused subject is ever named, so each beat's focus() cue is
    // its own label reveal. The Milky-Way label is the one exception — held
    // back so "You are here" lands on beat 2, not under the title card.
    hide(
      [
        'volumesMaster', // the cosmic-web beat's reveal
        'filaments', // hidden for the WHOLE tour — the web beats show the volume only
        'flow', // the flows beat's reveal
        'structureRing', // shown per category as beats reach them
        'label:milkyWay', // "You are here" is beat 2's reveal
        'survey', // catalogs revealed one at a time on the way out
      ],
      0,
    ),
    // Label declutter for the whole tour: only the focused subject's label
    // draws. The snapshot/restore winds it back on exit; a beat that wants
    // many labels at once flips it off with another scene() cue.
    scene(setLabelsFocusedOnly(true)),
    // The tour authors its own pole (docs/tour/implementation-notes.md): the
    // Milky Way reads horizontal under galactic, not the ecliptic default.
    // Ordered before the snap below for robustness (both are 0-duration cues
    // landing in the same tick, so this ordering is inert today — the pinned
    // `clip.frame` and baked aimAlong both resolve before either cue fires),
    // not because the roll is visible either way: the sprite is sub-pixel at
    // this distance regardless of pole.
    frameTo('galactic', { over: FRAME_ROLL_SEC }),
    // Cold open: snap far out on the Milky-Way bearing (zero-duration cues
    // — target, distance, and yaw/pitch are different channels, so one `all`
    // is legal). `aimAlong` snaps to a fixed WORLD sightline rather than a
    // `lookAtId` bearing: the clip starts 'live', so a target-relative bearing
    // would inherit whatever pose the viewer wandered into before starting
    // the tour. Snapping makes every run identical, and the first frame is
    // empty space (the sprite is sub-pixel at this distance), so the jump
    // itself is invisible.
    all([moveTargetId(MW, 0), dollyTo(FAR_OPEN_MPC, 0), aimAlong(GALACTIC_DISC_FORWARD, 0)]),
    // …then the approach. Log-space dolly: three decades in, decelerating
    // onto the framing distance as the sprite swells from nothing.
    focusOnId(MW, 7),
  ],
};
