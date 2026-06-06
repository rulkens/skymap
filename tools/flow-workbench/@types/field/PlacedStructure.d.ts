/**
 * PlacedStructure — a catalogued structure mapped into the renderer's world cube.
 *
 * The output of `structureWorld`/`placeStructures`: the name carried through,
 * plus a `world` position in the centred `[-1,1]³` cube the flow trails and the
 * density volume live in. The LabelsOverlay projects `world` through the frame's
 * view-projection to screen space. (Separate from `CatalogStructure` so the
 * pure observational catalog stays free of presentation coordinates.)
 */
import type { Vec3 } from '../../../../src/@types/math/Vec3';

export type PlacedStructure = {
  readonly name: string;
  readonly world: Vec3;
};
