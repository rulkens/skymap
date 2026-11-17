import type { AlbedoRecipe } from '../../textures/@types/AlbedoRecipe';

type Group = Exclude<keyof AlbedoRecipe, 'version'>;
type PathIn<G extends Group> = {
  [K in keyof AlbedoRecipe[G]]: AlbedoRecipe[G][K] extends number
    ? readonly [G, K]
    : readonly [G, K, 0 | 1 | 2];
}[keyof AlbedoRecipe[G]];

/** One numeric leaf of an `AlbedoRecipe`: `[group, key]`, or
 *  `[group, key, channel]` for the grade's RGB tuples. */
export type RecipeNumberPath = { [G in Group]: PathIn<G> }[Group];
