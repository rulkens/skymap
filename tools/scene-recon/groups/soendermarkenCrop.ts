/**
 * Søndermarken at full frame resolution — the same anchor as `SOENDERMARKEN`,
 * so the two groups' ENU coordinates are directly comparable, over a ~258 ×
 * 183 m box around the Cisterner lawn.
 *
 * Its reason to exist is `groundMmPerPx`: the whole-frame harvest lands at
 * ~740 mm/px, which is what makes those splats blurry. Cropping each frame to
 * this box first buys back most of the ~100 mm/px the COGs actually hold.
 * `minPointSpacingM` drops to 0.5 m because a box this small can afford the
 * LiDAR at full density.
 */
import type { SceneGroupDefinition } from '../@types/SceneGroupDefinition';

export const SOENDERMARKEN_CROP: SceneGroupDefinition = {
  id: 'soendermarken-crop',
  name: 'Søndermarken (crop)',
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
  // The box spans UTM32 E 721543-721739, N 6174853-6175120 (`cct`), so only
  // the 721 easting column and both northing rows of the 1 km grid touch it.
  dhmTiles: ['punktsky_1km_6174_721', 'punktsky_1km_6175_721'],
  skraafoto: { collection: 'skraafotos2025', groundMmPerPx: 200 },
  sourceSrs: 'EPSG:25832',
  minPointSpacingM: 0.5,
  dropClassifications: [7, 18],
};
