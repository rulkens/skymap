/** GRS80 (EPSG:25832's ellipsoid) and UTM zone 32N's projection constants. */
const A_M = 6378137;
const F = 1 / 298.257222101;
const K0 = 0.9996;
const LON0_RAD = (9 * Math.PI) / 180;
const FALSE_EASTING_M = 500000;
const DEG = Math.PI / 180;

/**
 * lonLatToUtm32 — WGS84/GRS80 lon/lat to EPSG:25832 metres (UTM zone 32N).
 *
 * Snyder's transverse-Mercator series (Map Projections §8), truncated at e'⁶:
 * the residual is under a millimetre anywhere in Denmark, which is four
 * orders below the 0.4 m DHM post spacing this positions samples on. It exists
 * because the DHM tile grid is named in UTM kilometres while the height
 * lattice is in degrees — no proj dependency for one formula.
 */
export function lonLatToUtm32(
  lonDeg: number,
  latDeg: number,
): {
  readonly easting: number;
  readonly northing: number;
} {
  const e2 = F * (2 - F);
  const ep2 = e2 / (1 - e2);

  const phi = latDeg * DEG;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);

  const n = A_M / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const t = tanPhi * tanPhi;
  const c = ep2 * cosPhi * cosPhi;
  const a = (lonDeg * DEG - LON0_RAD) * cosPhi;

  const m =
    A_M *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256) * phi -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * e2 * e2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));

  const easting =
    FALSE_EASTING_M +
    K0 *
      n *
      (a + ((1 - t + c) * a ** 3) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * ep2) * a ** 5) / 120);

  const northing =
    K0 *
    (m +
      n *
        tanPhi *
        ((a * a) / 2 +
          ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 +
          ((61 - 58 * t + t * t + 600 * c - 330 * ep2) * a ** 6) / 720));

  return { easting, northing };
}
