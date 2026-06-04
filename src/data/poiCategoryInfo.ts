/**
 * Per-category display metadata for points of interest (cluster, supercluster,
 * void, famousGalaxy).  Keyed by `PoiCategory`.  Add fields here when the UI
 * needs more per-category info (icon, accent color for chips, ordering, etc.).
 *
 * Distinct from the presentation style tables (`structurePoiStyles.ts` +
 * `famousLabelStyle.ts`) — those own *rendering* config (halo/ring colors,
 * pixel sizes, fade bands).  This owns *display* metadata (human labels and
 * any future copy/iconography).
 */

import type { PoiCategory } from '../@types/engine/data/PoiCategory';

export type PoiCategoryInfo = {
  /** Long form for detail surfaces ("Galaxy Cluster"). */
  label: string;
  /** Compact form for previews and chips ("Cluster"). */
  shortLabel: string;
};

export const POI_CATEGORY_INFO: Readonly<Record<PoiCategory, PoiCategoryInfo>> = {
  cluster: {
    label: 'Galaxy Cluster',
    shortLabel: 'Cluster',
  },
  supercluster: {
    label: 'Supercluster',
    shortLabel: 'Supercluster',
  },
  void: {
    label: 'Cosmic Void',
    shortLabel: 'Void',
  },
  famousGalaxy: {
    label: 'Famous Galaxy',
    shortLabel: 'Galaxy',
  },
};
