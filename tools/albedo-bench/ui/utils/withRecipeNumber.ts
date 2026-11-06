import type { AlbedoRecipe } from '../../../textures/@types/AlbedoRecipe';
import type { RecipeNumberPath } from '../../@types/RecipeNumberPath';

/** A copy of `recipe` with one numeric leaf replaced; the input is never mutated. */
export function withRecipeNumber(
  recipe: AlbedoRecipe,
  path: RecipeNumberPath,
  value: number,
): AlbedoRecipe {
  const [group, key, channel] = path;
  const fields = recipe[group] as Record<string, number | readonly number[]>;
  const next =
    channel === undefined
      ? value
      : (fields[key] as readonly number[]).map((c, i) => (i === channel ? value : c));
  return { ...recipe, [group]: { ...fields, [key]: next } };
}
