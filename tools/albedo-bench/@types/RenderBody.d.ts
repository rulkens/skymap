import type { AlbedoRecipe } from '../../textures/@types/AlbedoRecipe';
import type { LonLatBounds } from '../../../src/layers/body/surfaceTiles/format/@types/LonLatBounds';
import type { RenderLight } from './RenderLight';

/** `original` is the raw imagery, so only `adjusted` carries a recipe. */
export type RenderBody = {
  readonly box: LonLatBounds;
  readonly px: number;
  readonly light?: RenderLight;
} & (
  | { readonly variant: 'original' }
  | {
      readonly variant: 'adjusted';
      readonly recipe: AlbedoRecipe;
      readonly manualG?: readonly [number, number];
    }
);
