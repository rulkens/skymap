import type { AlbedoRecipe } from '../../textures/@types/AlbedoRecipe';

/** `recipe` is undefined until the committed file has loaded. */
export type RecipeEditState = {
  readonly recipe: AlbedoRecipe | undefined;
  readonly loadError: string | undefined;
  readonly saveStatus: string;
};
