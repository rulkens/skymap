import type { AlbedoRecipe } from '../../textures/AlbedoRecipe';

export type PreviewSunFit = {
  readonly sunFit: AlbedoRecipe['sunFit'];
  readonly coarsened: boolean;
};
