import type { AlbedoRecipe } from '../../textures/@types/AlbedoRecipe';
import type { LonLatBounds } from '../../../src/layers/body/surfaceTiles/format/@types/LonLatBounds';

export type FieldBody = {
  readonly box: LonLatBounds;
  readonly sunFit: AlbedoRecipe['sunFit'];
};
