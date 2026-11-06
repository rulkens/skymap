import type { AlbedoRecipe } from '../../textures/@types/AlbedoRecipe';
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';

export type FieldBody = {
  readonly box: LonLatBounds;
  readonly sunFit: AlbedoRecipe['sunFit'];
};
