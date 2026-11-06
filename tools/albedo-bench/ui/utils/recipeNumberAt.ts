import type { AlbedoRecipe } from '../../../textures/@types/AlbedoRecipe';
import type { RecipeNumberPath } from '../../@types/RecipeNumberPath';

export function recipeNumberAt(recipe: AlbedoRecipe, path: RecipeNumberPath): number {
  const [group, key, channel] = path;
  const value = (recipe[group] as Record<string, number | readonly number[]>)[key]!;
  return channel === undefined ? (value as number) : (value as readonly number[])[channel]!;
}
