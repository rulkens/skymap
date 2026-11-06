import type { AlbedoRecipe } from '../../textures/AlbedoRecipe';
import type { HeightSource } from '../../textures/@types/HeightSource';
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';
import type { SunField } from '../../textures/SunField';
import type { SurfaceImagerySource } from '../../textures/@types/SurfaceImagerySource';

export type RenderDeps = {
  readonly imagery: SurfaceImagerySource;
  readonly height: HeightSource;
  readonly radiusM: number;
  readonly getField: (region: LonLatBounds, sunFit: AlbedoRecipe['sunFit']) => Promise<SunField>;
};
