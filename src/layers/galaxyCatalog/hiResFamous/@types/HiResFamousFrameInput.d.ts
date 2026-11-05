import type { GalaxyCatalog } from '../../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { OrbitCamera } from '../../../../@types/camera/orbitCamera/OrbitCamera';
import type { FamousGalaxyMetaEntry } from '../../../../@types/loading/FamousGalaxyMetaEntry';
import type { GalaxyCatalogId } from '../../@types/GalaxyCatalogId';
import type { SourceType } from '../../../../@types/data/SourceType';

export type HiResFamousFrameInput = {
  readonly cam: OrbitCamera;
  readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  readonly visibleCatalogs: ReadonlySet<GalaxyCatalogId>;
  readonly pxPerRad: number;
  readonly famousGalaxiesMeta: readonly FamousGalaxyMetaEntry[];
};
