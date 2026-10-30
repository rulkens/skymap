/**
 * STAR_CAPTION_STYLES — how each label-bearing seeded star catalog captions, keyed by its item
 * of the `label:starCatalog` entry: a catalog that gains or drops `bearsLabel` fails the build
 * until this table agrees. The S-stars bear no label: they would pile 39 names into a few
 * arcseconds, and Sgr A* already names the place.
 */

import type { LabelItemOf } from '../../../@types/animation/LabelItemOf';
import type { StarCaptionStyle } from '../@types/StarCaptionStyle';
import { STAR_MAP_CAPTION_BAND } from '../data/starMapCaptionBand';

export const STAR_CAPTION_STYLES: Readonly<Record<LabelItemOf<'starCatalog'>, StarCaptionStyle>> = {
  famousStar: { kind: 'star', revealBand: STAR_MAP_CAPTION_BAND },
  // One star at the solar system's anchor: its entry band already keys on its own distance.
  sun: { kind: 'sun' },
};
