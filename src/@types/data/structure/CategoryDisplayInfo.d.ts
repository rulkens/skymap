/**
 * Per-category display metadata for label-bearing sources (cluster,
 * supercluster, void, famousGalaxy, group).  Human-readable copy only —
 * distinct from the rendering style tables (`structureMarkerStyles`,
 * `famousLabelStyle`), which own halo/ring colours and pixel sizes.
 */
export type CategoryDisplayInfo = {
  /** Long form for detail surfaces ('Galaxy Cluster', 'Famous Galaxy'). */
  label: string;
  /** Compact form for previews and chips ('Cluster', 'Galaxy'). */
  shortLabel: string;
  /** Plural form for list/toggle headers ('Clusters', 'Famous Galaxies'). */
  readonly plural: string;
};
