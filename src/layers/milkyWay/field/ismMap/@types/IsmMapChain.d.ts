import type { IsmMapDustCdfScan } from '../../dustCdf/@types/IsmMapDustCdfScan';
import type { IsmMapGenerator } from './IsmMapGenerator';
import type { IsmMapOrientation } from './IsmMapOrientation';
import type { IsmMapPlaceArmCloud } from '../../placement/@types/IsmMapPlaceArmCloud';
import type { IsmMapPlaceArmSpurCloud } from '../../placement/@types/IsmMapPlaceArmSpurCloud';
import type { IsmMapPlaceDigVeil } from '../../placement/@types/IsmMapPlaceDigVeil';
import type { IsmMapPlaceDust } from '../../placement/@types/IsmMapPlaceDust';
import type { IsmMapRingReduce } from './IsmMapRingReduce';

export type IsmMapChain = {
  readonly generator: IsmMapGenerator;
  readonly orientation: IsmMapOrientation;
  readonly ringReduce: IsmMapRingReduce;
  readonly dustCdfScan: IsmMapDustCdfScan;
  readonly digCdfScan: IsmMapDustCdfScan;
  readonly placeDust: IsmMapPlaceDust;
  readonly placeArmSpurCloud: IsmMapPlaceArmSpurCloud;
  readonly placeArmCloud: IsmMapPlaceArmCloud;
  readonly placeDigVeil: IsmMapPlaceDigVeil;
  dispose(): void;
};
