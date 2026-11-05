import { eqCartToRaDecDist } from '../utils/math/eqCartToRaDecDist';
import { structureCutoutFovDeg } from './structureCutoutFovDeg';
import { STRUCTURE_CUTOUT_MARGIN } from './structureCutoutMargin';
import { STRUCTURE_CUTOUT_OVERRIDES } from './structureCutoutOverrides';
import type { StructureId } from '../../src/@types/data/structure/StructureId';
import type { StructureInfo } from '../../src/@types/data/structure/StructureInfo';

/** Twice the 204 px shot, so the downsample has detail to keep. */
const CUTOUT_PX = 408;
const DEFAULT_HIPS = 'CDS/P/DSS2/color';

function marginFor(category: StructureId): number {
  const margin = STRUCTURE_CUTOUT_MARGIN[category];
  if (margin === undefined) throw new Error(`no cutout margin for category '${category}'`);
  return margin;
}

/**
 * The CDS hips2fits request for a sky cutout centred on a structure (DSS2
 * colour unless `STRUCTURE_CUTOUT_OVERRIDES` names it). RA/Dec come back out
 * of `worldPos` (equatorial Cartesian), the frame the seed's coordinates were
 * converted into, so the cutout is centred on exactly the point the app flies to.
 */
export function structureCutoutUrl(s: StructureInfo): string {
  const { raHours, decDeg, distMpc } = eqCartToRaDecDist(s.worldPos);
  const override = STRUCTURE_CUTOUT_OVERRIDES[s.id];
  const fovDeg =
    override?.fovDeg ?? structureCutoutFovDeg(s.physicalRadiusMpc, distMpc, marginFor(s.category));
  const params = new URLSearchParams({
    hips: override?.hips ?? DEFAULT_HIPS,
    ra: String(raHours * 15),
    dec: String(decDeg),
    fov: String(fovDeg),
    width: String(CUTOUT_PX),
    height: String(CUTOUT_PX),
    format: 'jpg',
  });
  return `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?${params}`;
}
