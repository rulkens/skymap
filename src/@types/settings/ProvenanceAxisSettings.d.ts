import type { ProvenanceFilter } from './ProvenanceFilter';

/**
 * ProvenanceAxisSettings — the two independent controls one provenance axis
 * (orientation, size) exposes.
 *
 * `highlight` is a display overlay: estimated galaxies get their ramp colour
 * replaced by the axis's signature colour, everything still draws.  `filter`
 * is a cull: galaxies on the wrong side of the axis never reach the
 * rasteriser.  They are deliberately orthogonal — highlighting the estimates
 * while culling nothing shows the mix, and culling to `estimated` while
 * highlighting shows the estimates isolated *and* colour-coded.
 */
export type ProvenanceAxisSettings = {
  highlight: boolean;
  filter: ProvenanceFilter;
};
