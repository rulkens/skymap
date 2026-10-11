import { eqCartToRaDecDist } from '../utils/math/eqCartToRaDecDist';
import { structureCutoutFovDeg } from './structureCutoutFovDeg';
import type { StructureInfo } from '../../src/@types/data/structure/StructureInfo';

/** Twice the 204 px shot, so the downsample has detail to keep. */
const CUTOUT_PX = 408;

/**
 * The CDS hips2fits request for a DSS2 colour cutout centred on a structure.
 * RA/Dec come back out of `worldPos` (equatorial Cartesian), the frame the
 * seed's coordinates were converted into, so the cutout is centred on exactly
 * the point the app flies to.
 */
export function structureCutoutUrl(s: StructureInfo): string {
  const { raHours, decDeg, distMpc } = eqCartToRaDecDist(s.worldPos);
  const params = new URLSearchParams({
    hips: 'CDS/P/DSS2/color',
    ra: String(raHours * 15),
    dec: String(decDeg),
    fov: String(structureCutoutFovDeg(s.physicalRadiusMpc, distMpc)),
    width: String(CUTOUT_PX),
    height: String(CUTOUT_PX),
    format: 'jpg',
  });
  return `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?${params}`;
}
