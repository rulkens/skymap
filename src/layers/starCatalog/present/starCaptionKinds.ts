/**
 * STAR_CAPTION_KIND — which `CaptionKind` each label-bearing seeded star catalog draws
 * with, keyed by its item of the `label:starCatalog` entry: a catalog that gains or drops
 * `bearsLabel` fails the build until this table agrees. The S-stars bear no label: they
 * would pile 39 names into a few arcseconds, and Sgr A* already names the place.
 */

import type { LabelItemOf } from '../../../@types/animation/LabelItemOf';
import type { CaptionKind } from '../../../services/engine/presentation/captionPriority';

export const STAR_CAPTION_KIND: Readonly<Record<LabelItemOf<'starCatalog'>, CaptionKind>> = {
  famousStar: 'star',
  sun: 'sun',
};
