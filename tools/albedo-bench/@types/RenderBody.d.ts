import type { AlbedoRecipe } from '../../textures/AlbedoRecipe';
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';
import { RenderLight } from './RenderLight';

export type RenderBody = {
  readonly box: LonLatBounds;
  readonly px: number;
  readonly recipe: AlbedoRecipe;
  readonly variant: 'original' | 'adjusted';
  readonly light?: RenderLight;
  readonly manualG?: readonly [number, number];
};
