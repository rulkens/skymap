import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { FamousGalaxyMetaEntry } from '../../../@types/loading/FamousGalaxyMetaEntry';
import type { SourceType } from '../../../@types/data/SourceType';

export type HiResFamousFrameInput = {
  readonly cam: OrbitCamera;
  readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  readonly sourceMask: number;
  readonly pxPerRad: number;
  readonly famousGalaxiesMeta: readonly FamousGalaxyMetaEntry[];
};
