import type { GalaxyCatalog } from '../../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { OrbitCamera } from '../../../../@types/camera/orbitCamera/OrbitCamera';
import type { GalaxyCatalogId } from '../../@types/GalaxyCatalogId';
import type { SourceType } from '../../../../@types/data/SourceType';

export type HiResFamousFrameInput = {
  readonly cam: OrbitCamera;
  readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  readonly visibleCatalogs: ReadonlySet<GalaxyCatalogId>;
  readonly pxPerRad: number;
  /** Each view's six frustum planes about `cam.position` (`frustumPlanesFromViewProj`); empty culls nothing. */
  readonly viewPlanes: Float32Array;
};
