/**
 * riversSource — the antique Earth map's rivers (line kind 2) from Natural
 * Earth's 1:10m rivers, world plus the European supplement. Each river is
 * chained, oriented source → mouth by ETOPO, simplified to the 1 km Natural
 * Earth's 1:10m scale can actually tell apart, then cut into great-circle
 * pieces short enough not to sag off the globe at its reveal level.
 */

import type { AntiqueMapPiece } from '../@types/AntiqueMapPiece';
import type { BakedStrip } from '../@types/BakedStrip';
import type { HeightSource } from '../../../textures/@types/HeightSource';
import { rawDataPath } from '../../../utils/io/rawDataRegistry';
import { heightLatticeStepDeg } from '../../../utils/textures/heightLatticeStepDeg';
import { EARTH_DATUM_RADIUS_M } from '../../../../src/data/bodies/earthDatumRadiusM';
import { ANTIQUE_MAP_LEVELS } from '../../../../src/layers/body/earth/antiqueMap/data/antiqueEarthMapFormat';
import { buildRiverChains } from '../utils/buildRiverChains';
import { readNaturalEarthRivers } from '../utils/readNaturalEarthRivers';
import { resampleStrip } from '../utils/resampleStrip';
import { riverWidthUnits } from '../utils/riverWidthUnits';
import { simplifyPolylineKm } from '../utils/simplifyPolylineKm';

const LINE_KIND_RIVER = 2;
const RADIUS_KM = EARTH_DATUM_RADIUS_M / 1000;
const SIMPLIFY_KM = 1;
/** Piece length by reveal level: seen whole-globe a 25 km chord's sag is invisible; closer in, 5 km. */
const COARSE_LEVEL_MAX = 2;
const COARSE_MAX_KM = 25;
const FINE_MAX_KM = 5;
/** ~4.9 km posts: fine enough to tell a river's source end from its mouth. */
const ELEVATION_LATTICE_LEVEL = 6;
/** Web-map zoom → reveal level: a map's `detail` runs about 3.2 below the web zoom showing the same ground. */
const levelOfMinZoom = (minZoom: number) =>
  Math.min(ANTIQUE_MAP_LEVELS - 1, Math.max(0, Math.round(minZoom - 3)));

export async function riversSource(heights: HeightSource): Promise<AntiqueMapPiece> {
  const dropped: string[] = [];
  const pieces = [
    ...readNaturalEarthRivers(rawDataPath('naturalearth.rivers-lake-centerlines'), 'world', (n) =>
      dropped.push(n),
    ),
    ...readNaturalEarthRivers(rawDataPath('naturalearth.rivers-europe'), 'europe', (n) =>
      dropped.push(n),
    ),
  ];

  const step = heightLatticeStepDeg(ELEVATION_LATTICE_LEVEL);
  const cols = Math.round(360 / step);
  const rows = cols / 2 + 1;
  const elevation = (await heights.readGrid(ELEVATION_LATTICE_LEVEL, 0, 0, cols, rows))!;
  const elevationAt = (lonDeg: number, latDeg: number) => {
    const i = ((Math.round((lonDeg + 180) / step) % cols) + cols) % cols;
    const j = Math.min(rows - 1, Math.max(0, Math.round((90 - latDeg) / step)));
    const value = elevation[j * cols + i]!;
    return Number.isNaN(value) ? 0 : value;
  };

  const strips: BakedStrip[] = buildRiverChains(pieces, elevationAt, RADIUS_KM).map((chain) => {
    const level = levelOfMinZoom(chain.minZoom);
    return resampleStrip(simplifyPolylineKm(chain.points, SIMPLIFY_KM, RADIUS_KM), {
      maxKm: level <= COARSE_LEVEL_MAX ? COARSE_MAX_KM : FINE_MAX_KM,
      radiusKm: RADIUS_KM,
      kind: LINE_KIND_RIVER,
      level,
      widthAt: (arcKm) => riverWidthUnits(chain.scalerank, chain.upstreamKm + arcKm),
    });
  });
  const named = [...new Set(dropped.filter(Boolean))].sort();
  console.log(
    `rivers: ${pieces.length} pieces kept, ${dropped.length} features dropped (${named.join(', ')})`,
  );
  return { strips };
}
