/**
 * ANTIQUE_EARTH_TITLE_REGIONS — Earth's titles past the world map, deepest
 * level first: Holland, then the Seventeen Provinces, then the continents, each
 * once the ground is magnified far enough. Boxes are rough on purpose: a title fades out near a box edge, so
 * the plate reads blank, not wrong, over a border sea.
 */

import type { AntiqueTitleRegion } from '../../@types/rendering/AntiqueTitleRegion';

const CONTINENT = [10, 7] as const;

export const ANTIQUE_EARTH_TITLE_REGIONS: readonly (readonly AntiqueTitleRegion[])[] = [
  [{ key: 'hollandia', boxes: [[3.3, 7.3, 51.2, 53.7]], kmPerUnit: [0.5, 0.3], marginDeg: 0.5 }],
  [{ key: 'belgium', boxes: [[2.4, 7.3, 49.4, 53.7]], kmPerUnit: [2.5, 1.5], marginDeg: 0.8 }],
  [
    { key: 'europa', boxes: [[-25, 40, 35, 72]], kmPerUnit: CONTINENT, marginDeg: 4 },
    {
      key: 'asia',
      boxes: [
        [40, 180, 0, 78],
        [34, 60, 12, 40],
      ],
      kmPerUnit: CONTINENT,
      marginDeg: 4,
    },
    { key: 'africa', boxes: [[-20, 52, -36, 35]], kmPerUnit: CONTINENT, marginDeg: 4 },
    {
      key: 'americaSeptentrionalis',
      boxes: [[-170, -50, 12, 75]],
      kmPerUnit: CONTINENT,
      marginDeg: 4,
    },
    {
      key: 'americaMeridionalis',
      boxes: [[-92, -30, -56, 12]],
      kmPerUnit: CONTINENT,
      marginDeg: 4,
    },
  ],
];
