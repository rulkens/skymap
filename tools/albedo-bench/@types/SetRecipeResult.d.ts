import type { AlbedoRecipe } from '../../textures/@types/AlbedoRecipe';

export type SetRecipeResult =
  | { readonly status: 200; readonly recipe: AlbedoRecipe }
  | { readonly status: 400; readonly error: string };
