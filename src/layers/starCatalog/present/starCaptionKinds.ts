/**
 * STAR_CAPTION_KIND — which `CaptionKind` (if any) each seeded star catalog's
 * rows draw with. `null` means uncaptioned: the S-stars would pile 39 names
 * into a few arcseconds, and Sgr A* already names the place.
 */

import type { SeededStarCatalogId } from '../../../@types/data/starCatalog/SeededStarCatalogId';
import type { CaptionKind } from '../../../services/engine/presentation/captionPriority';

export const STAR_CAPTION_KIND: Readonly<Record<SeededStarCatalogId, CaptionKind | null>> = {
  famousStar: 'star',
  sun: 'sun',
  sStar: null,
};
