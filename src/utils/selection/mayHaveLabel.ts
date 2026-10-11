/**
 * mayHaveLabel — whether a subject's kind can carry an on-screen caption, so a
 * hover onto or off it may change pixels (the label whitens). The question is
 * deliberately coarse: hover lands at pointer-pick rate, and the case to keep
 * frame-free is the pointer sweeping survey stars and galaxies, which never
 * have captions. A frame drawn for a labelled kind whose caption happens to be
 * hidden is harmless. A structure is "yes" also because its ring brightens.
 */

import { Source } from '../../data/source';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../data/bodies/seededStarCatalogsBySource';
import type { SelectionRef } from '../../@types/engine/SelectionRef';

export function mayHaveLabel(ref: SelectionRef | null): boolean {
  if (ref === null) return false;
  switch (ref.type) {
    case 'galaxyCatalog':
      return ref.source === Source.FamousGalaxy;
    case 'starCatalog':
      return SEEDED_STAR_CATALOGS_BY_SOURCE.has(ref.source);
    case 'zoneOfAvoidance':
      return false;
    case 'structure':
    case 'body':
    case 'blackHole':
    case 'milkyWay':
      return true;
  }
}
