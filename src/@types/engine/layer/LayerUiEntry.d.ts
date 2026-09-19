import type { LayerUiSlots } from './LayerUiSlots';

/** One Layer contribution to one `LayerUiSlots` slot, tagged by slot name. */
export type LayerUiEntry = {
  [K in keyof LayerUiSlots]: { readonly slot: K; readonly content: LayerUiSlots[K] };
}[keyof LayerUiSlots];
