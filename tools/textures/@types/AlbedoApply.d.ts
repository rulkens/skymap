import type { AlbedoRecipe } from './AlbedoRecipe';

/** The pixel pipeline's half of the recipe. `sunFit` only ever reaches the
 *  fitted field, never a pixel, so this type cannot carry a second copy of
 *  it; `version` is a file-format tag the pipeline has no use for. */
export type AlbedoApply = Omit<AlbedoRecipe, 'version' | 'sunFit'>;
