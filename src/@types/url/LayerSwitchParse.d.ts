import type { LayerSwitch } from './LayerSwitch';

/** A `layers=` value read: the switches it names, in token order, and what it named wrongly. */
export type LayerSwitchParse = {
  readonly switches: readonly LayerSwitch[];
  /** Tokens naming no composed entry, or an item the entry does not list, as written. */
  readonly unknown: readonly string[];
};
