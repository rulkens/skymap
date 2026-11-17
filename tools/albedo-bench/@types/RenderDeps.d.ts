import type { AlbedoRecipe } from '../../textures/@types/AlbedoRecipe';
import type { HeightSource } from '../../textures/@types/HeightSource';
import type { LonLatBounds } from '../../../src/layers/body/surfaceTiles/format/@types/LonLatBounds';
import type { SunField } from '../../textures/@types/SunField';
import type { SurfaceImagerySource } from '../../textures/@types/SurfaceImagerySource';

export type RenderDeps = {
  readonly imagery: SurfaceImagerySource;
  readonly height: HeightSource;
  readonly radiusM: number;
  readonly getField: (region: LonLatBounds, sunFit: AlbedoRecipe['sunFit']) => Promise<SunField>;
};
