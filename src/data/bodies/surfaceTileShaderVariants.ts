/**
 * SURFACE_TILE_SHADER_VARIANTS — one fragment entry per `surfaceEffectsKey`,
 * with the fragment-only bindings it declares. Bindings 0/1/2/4 are shared
 * with the vertex stage and every variant; 8 stays a hole (the base globe's
 * normal map). A registry row whose key is missing here fails a test.
 */

import fragmentBare from '../../services/gpu/shaders/bodies/surfaceTile/fragmentBare.wesl?static';
import fragmentEarth from '../../services/gpu/shaders/bodies/surfaceTile/fragmentEarth.wesl?static';

export const SURFACE_TILE_SHADER_VARIANTS: Readonly<
  Record<string, { readonly fragment: string; readonly bindings: readonly number[] }>
> = {
  '': { fragment: fragmentBare, bindings: [5] },
  'cloudShadows+materialMap+nightLights': { fragment: fragmentEarth, bindings: [3, 5, 6, 7, 9] },
};
