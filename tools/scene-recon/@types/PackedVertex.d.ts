import type { Vec2 } from '../../../src/@types/math/Vec2';

/** One output vertex of a pack — xatlas splits vertices along chart seams, so `xref` is the only
 *  link back to the source mesh (spec §3). */
export type PackedVertex = {
  readonly xref: number; // index into the SOURCE mesh's vertices
  readonly uvPx: Vec2; // destination texels, not normalized
  readonly chartIndex: number; // -1 ⇔ orphan (see ChartPlacement)
};
