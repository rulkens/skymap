/**
 * GET /api/recipe/:id — return the recipe.json for a curated galaxy.
 * Used by the UI to restore sliders + crop when the user re-clicks an
 * already-exported galaxy.
 *
 * Why a dedicated GET route rather than bundling into /api/galaxies?
 * The galaxy list only carries enough metadata to render the sidebar
 * (names, curated flag).  Loading the full recipe is a separate, lazy
 * concern — we don't want to parse and transfer every recipe.json on
 * every page load when only one galaxy is being resumed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { recipePath } from '../paths.ts';
import { parseRecipe, type Recipe } from '../recipe.ts';

export async function handleRecipe(opts: {
  repoRoot: string;
  id: string;
}): Promise<{ recipe: Recipe }> {
  const path = recipePath(opts.repoRoot, opts.id);
  if (!existsSync(path)) {
    throw new Error(`recipe not found for id=${opts.id}`);
  }
  const recipe = parseRecipe(readFileSync(path, 'utf8'));
  return { recipe };
}
