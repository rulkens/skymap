import type { AlbedoRecipe } from '../../textures/@types/AlbedoRecipe';

export type PreviewSunFit = {
  readonly sunFit: AlbedoRecipe['sunFit'];
  readonly coarsened: boolean;
};
