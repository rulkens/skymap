/**
 * Opening title — strip the home scene in one instant sweep, fly to the
 * Milky-Way framing, and hold while the title card reads.
 *
 * The home-scene strip lives IN this clip (not a tour-level setup list):
 * one authoring surface, and stepping back to beat 1 re-establishes its
 * scene. Everything hidden here is a later beat's reveal; the
 * guidedTourSaga snapshot/restore winds it all back on exit.
 */

import type { ClipData } from '../../../../@types/animation/ClipData';
import { focusOnId, hide, scene } from '../../../../services/engine/animation/effectHelpers';
import { focusId } from '../../../../utils/animation/focusId';
import { setLabelsFocusedOnly } from '../../../../state/settings/settingsSlice';

const MW = focusId('milkyWay');

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
        'filaments', //      〃
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
    focusOnId(MW, 2),
  ],
};
