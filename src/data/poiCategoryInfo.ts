/**
 * Per-category display metadata for points of interest (cluster, supercluster,
 * void, famousGalaxy, group).  Keyed by `PoiCategory`.  Add fields here when
 * the UI needs more per-category info (icon, accent color for chips, ordering,
 * etc.).
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
  /** Plural form for list/toggle headers ("Clusters"). */
  readonly plural: string;
};

export const POI_CATEGORY_INFO: Readonly<Record<PoiCategory, PoiCategoryInfo>> = {
  cluster: {
    label: 'Galaxy Cluster',
    shortLabel: 'Cluster',
    plural: 'Clusters',
  },
  supercluster: {
    label: 'Supercluster',
    shortLabel: 'Supercluster',
    plural: 'Superclusters',
  },
  void: {
    label: 'Cosmic Void',
    shortLabel: 'Void',
    plural: 'Voids',
  },
  famousGalaxy: {
    label: 'Famous Galaxy',
    shortLabel: 'Galaxy',
    plural: 'Famous galaxies',
  },
  group: {
    label: 'Galaxy Group',
    shortLabel: 'Group',
    plural: 'Groups',
  },
};
