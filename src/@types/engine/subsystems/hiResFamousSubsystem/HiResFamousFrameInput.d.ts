import type { GalaxyCatalog } from '../../../data/galaxyCatalog/GalaxyCatalog';
import type { OrbitCamera } from '../../../camera/OrbitCamera';
import type { FamousGalaxyMetaEntry } from '../../../loading/FamousGalaxyMetaEntry';
import type { SourceType } from '../../../data/SourceType';

export type HiResFamousFrameInput = {
  readonly cam: OrbitCamera;
  readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  readonly visibleSourceMask: number;
  readonly pxPerRad: number;
  readonly famousGalaxiesMeta: readonly FamousGalaxyMetaEntry[];
};
