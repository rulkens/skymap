/**
 * Per-category display metadata for label-bearing sources (galaxy-cluster,
 * supercluster, void, famousGalaxy, galaxy-group, …).  Human-readable copy only —
 * distinct from the rendering style tables (`structureMarkerStyles`,
 * `famousLabelStyle`), which own halo/ring colours and pixel sizes.
 */
export type CategoryDisplayInfo = {
  /** Long form for detail surfaces ('Galaxy Cluster', 'Famous Galaxy'). */
  label: string;
  /** Compact form for previews and chips ('Galaxy cluster', 'Galaxy'). */
  shortLabel: string;
  /** Plural form for list/toggle headers ('Galaxy clusters', 'Famous Galaxies'). */
  readonly plural: string;
};
