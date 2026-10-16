import type { ShowKey } from '../../animation/ShowKey';

/**
 * LayerToggleRow — one checkbox a Layer contributes to the "Labels & guides" section (the
 * `labelsAndGuides` slot): the show entry it switches and its label. `selectToggleRows` reads
 * and writes the switch through that entry, so the row names no action or selector.
 */
export type LayerToggleRow = {
  readonly toggle: ShowKey;
  readonly label: string;
};
