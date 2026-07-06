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
import { localGroup } from '../tours/grandTour/localGroup';
import { neighbourhoodReveal } from '../tours/grandTour/neighbourhoodReveal';
import { neighbourhoodFlythrough } from '../tours/grandTour/neighbourhoodFlythrough';
import { approachVirgo } from '../tours/grandTour/approachVirgo';
import { cosmicWeb, cosmicWebDwell } from '../tours/grandTour/cosmicWeb';
import { cosmicFlows } from '../tours/grandTour/cosmicFlows';
import { emptiness } from '../tours/grandTour/emptiness';
import { deepField } from '../tours/grandTour/deepField';
import { theEdge } from '../tours/grandTour/theEdge';
import { homeAgain } from '../tours/grandTour/homeAgain';

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

export const tourLocalGroup: Clip = {
  id: 'tourLocalGroup',
  label: 'Grand tour 03 — the local group',
  data: localGroup,
};

export const tourNeighbourhoodReveal: Clip = {
  id: 'tourNeighbourhoodReveal',
  label: 'Grand tour 04 — neighbourhood reveal',
  data: neighbourhoodReveal,
};

export const tourNeighbourhood: Clip = {
  id: 'tourNeighbourhood',
  label: 'Grand tour 05 — neighbourhood flythrough',
  data: neighbourhoodFlythrough,
};

export const tourApproachVirgo: Clip = {
  id: 'tourApproachVirgo',
  label: 'Grand tour 06 — approach Virgo',
  data: approachVirgo,
};

export const tourCosmicWeb: Clip = {
  id: 'tourCosmicWeb',
  label: 'Grand tour 07 — cosmic web',
  data: cosmicWeb,
};

export const tourCosmicWebDwell: Clip = {
  id: 'tourCosmicWebDwell',
  label: 'Grand tour 07 — web pull-back dwell',
  data: cosmicWebDwell,
};

export const tourCosmicFlows: Clip = {
  id: 'tourCosmicFlows',
  label: 'Grand tour 08 — cosmic flows',
  data: cosmicFlows,
};

export const tourEmptiness: Clip = {
  id: 'tourEmptiness',
  label: 'Grand tour 09 — the emptiness',
  data: emptiness,
};

export const tourDeepField: Clip = {
  id: 'tourDeepField',
  label: 'Grand tour 10 — deep field',
  data: deepField,
};

export const tourTheEdge: Clip = {
  id: 'tourTheEdge',
  label: 'Grand tour 11 — the edge',
  data: theEdge,
};

export const tourHomeAgain: Clip = {
  id: 'tourHomeAgain',
  label: 'Grand tour 12 — home again',
  data: homeAgain,
};
