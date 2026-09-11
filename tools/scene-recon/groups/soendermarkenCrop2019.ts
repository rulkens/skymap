/**
 * `SOENDERMARKEN_CROP`'s box and anchor over the **2019** flight instead of
 * 2025 — a 23 June midsummer capture against 27 April's bare-ish canopy,
 * directly comparable in the same ENU metres.
 *
 * A different camera flew it (UltraCam Osprey, ~0.10 m GSD, 7700 × 10300 px
 * sensor), which the pose code reads per-item from `pers:` rather than from
 * anything stated here. `groundMmPerPx` 100 asks for that GSD in full; since
 * `frameWindow` clamps `scale` at 1 it is a ceiling, not a request, so the
 * obliques land softer than the nadirs.
 */
import type { SceneGroupDefinition } from '../@types/SceneGroupDefinition';

export const SOENDERMARKEN_CROP_2019: SceneGroupDefinition = {
  id: 'soendermarken-crop-2019',
  name: 'Søndermarken (crop, 2019 leaf-on)',
  anchor: {
    kind: 'geodetic',
    latDeg: 55.67,
    lonDeg: 12.53,
    heightMDvr90: 18.53,
    headingDeg: 0,
  },
  bounds: {
    west: 12.523153691713421,
    south: 55.66885675064212,
    east: 12.526068161278298,
    north: 55.67117280997111,
  },
  dhmTiles: ['punktsky_1km_6174_721', 'punktsky_1km_6175_721'],
  skraafoto: { collection: 'skraafotos2019', groundMmPerPx: 100 },
  sourceSrs: 'EPSG:25832',
  minPointSpacingM: 0.5,
  dropClassifications: [7, 18],
};
