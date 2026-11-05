import type { IsmMapDustCdfScan } from './IsmMapDustCdfScan';
import type { IsmMapGenerator } from './IsmMapGenerator';
import type { IsmMapOrientation } from './IsmMapOrientation';
import type { IsmMapPlaceArmCloud } from './IsmMapPlaceArmCloud';
import type { IsmMapPlaceArmSpurCloud } from './IsmMapPlaceArmSpurCloud';
import type { IsmMapPlaceDigVeil } from './IsmMapPlaceDigVeil';
import type { IsmMapPlaceDust } from './IsmMapPlaceDust';
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
