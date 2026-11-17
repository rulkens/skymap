import type { RecipeNumberPath } from './RecipeNumberPath';

export type RecipeSliderRow = {
  readonly section: string;
  readonly label: string;
  readonly path: RecipeNumberPath;
  readonly min: number;
  readonly max: number;
  readonly step: number;
};
