import { galaxyTypeFromColor } from '../utils/galaxyTypeFromColor';
import { galaxyTypeFromBminusJ } from '../utils/galaxyTypeFromBminusJ';
import { galaxyTypeFromJminusK } from '../utils/galaxyTypeFromJminusK';
import type { GalaxyTypeColour } from '../../../../@types/data/galaxyCatalog/GalaxyTypeColour';
import type { GalaxyTypeInfo } from '../@types/GalaxyTypeInfo';

/** The classifier calibrated for each colour an entry's `typeColour` may name. */
export const GALAXY_TYPE_CLASSIFIERS: Readonly<
  Record<GalaxyTypeColour['thresholds'], (index: number) => GalaxyTypeInfo>
> = {
  'u-r': galaxyTypeFromColor,
  'B-J': galaxyTypeFromBminusJ,
  'J-K': galaxyTypeFromJminusK,
};
