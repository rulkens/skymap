/**
 * recipe.ts — GET/POST /api/recipe: the committed recipe file, the one
 * artefact the whole bench exists to tune. POST validates through
 * `parseAlbedoRecipe` before touching disk, so a malformed Save can't
 * corrupt the file the bake reads (design §10); the recipe path is
 * injected so a test writes to a temp file, never the real committed one.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { AlbedoRecipe } from '../../../textures/AlbedoRecipe.ts';
import { parseAlbedoRecipe } from '../../../textures/parseAlbedoRecipe.ts';

export function handleGetRecipe(opts: { readonly recipePath: string }): AlbedoRecipe {
  return parseAlbedoRecipe(readFileSync(opts.recipePath, 'utf8'));
}

export type SetRecipeResult =
  | { readonly status: 200; readonly recipe: AlbedoRecipe }
  | { readonly status: 400; readonly error: string };

export function handleSetRecipe(opts: {
  readonly body: unknown;
  readonly recipePath: string;
}): SetRecipeResult {
  let recipe: AlbedoRecipe;
  try {
    // Reuses the one validator both the bench's Save and the bake's read go
    // through, rather than re-implementing the schema check here.
    recipe = parseAlbedoRecipe(JSON.stringify(opts.body));
  } catch (err) {
    return { status: 400, error: (err as Error).message };
  }
  writeFileSync(opts.recipePath, `${JSON.stringify(recipe, null, 2)}\n`, 'utf8');
  return { status: 200, recipe };
}
