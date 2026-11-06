import type { AlbedoRecipe } from '../../textures/AlbedoRecipe';
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';
import type { FieldArrow } from './FieldArrow';

export type Api = {
  getRecipe: () => Promise<AlbedoRecipe>;
  saveRecipe: (recipe: AlbedoRecipe) => Promise<AlbedoRecipe>;
  renderPng: (params: RenderBody) => Promise<Blob>;
  getField: (
    box: LonLatBounds,
    sunFit: AlbedoRecipe['sunFit'],
  ) => Promise<{ arrows: FieldArrow[]; coarsened: boolean }>;
};
