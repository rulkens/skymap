/**
 * grandTourBeats — the grand-tour beat choreographies wrapped as registry
 * Clips, so each beat can be played and tuned in isolation from the debug
 * panel's clip sections without sitting through the whole tour.
 *
 * The tour storyboard (`tours/grandTour.ts`) stays the source of truth: these
 * wrappers reference the SAME ClipData objects the tour plays, so inspector
 * tuning always exercises the real beat. One file rather than one-per-clip
 * because there is nothing here but the id/label envelope — the choreography
 * lives in `tours/grandTour/`.
 *
 * Caveat for standalone playback: outside `guidedTourSaga` there is no
 * settings snapshot/restore, so a beat's scene cues (the opening hide sweep,
 * focusedOnly flips) persist after the clip ends — wind them back via the
 * settings panel or a reload.
 */

import type { Clip } from '../../../@types/animation/Clip';
import { openingTitle } from '../tours/grandTour/openingTitle';
import { youAreHere, youAreHereDwell } from '../tours/grandTour/youAreHere';
import { approachM31 } from '../tours/grandTour/approachM31';
import { neighbourhoodFlythrough } from '../tours/grandTour/neighbourhoodFlythrough';
import { approachVirgo } from '../tours/grandTour/approachVirgo';
import { cosmicWeb } from '../tours/grandTour/cosmicWeb';

export const tourOpeningTitle: Clip = {
  id: 'tourOpeningTitle',
  label: 'Grand tour 00 — opening title',
  data: openingTitle,
};

export const tourYouAreHere: Clip = {
  id: 'tourYouAreHere',
  label: 'Grand tour 01 — you are here',
  data: youAreHere,
};

export const tourYouAreHereDwell: Clip = {
  id: 'tourYouAreHereDwell',
  label: 'Grand tour 01 — push-in dwell',
  data: youAreHereDwell,
};

export const tourApproachM31: Clip = {
  id: 'tourApproachM31',
  label: 'Grand tour 02 — approach M31',
  data: approachM31,
};

export const tourNeighbourhood: Clip = {
  id: 'tourNeighbourhood',
  label: 'Grand tour 03 — neighbourhood flythrough',
  data: neighbourhoodFlythrough,
};

export const tourApproachVirgo: Clip = {
  id: 'tourApproachVirgo',
  label: 'Grand tour 04 — approach Virgo',
  data: approachVirgo,
};

export const tourCosmicWeb: Clip = {
  id: 'tourCosmicWeb',
  label: 'Grand tour 05 — cosmic web',
  data: cosmicWeb,
};
