import type { SelectionKindFacts } from '../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';

export const galaxyCatalogSelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'galaxyCatalog' }>
>[] = [
  {
    type: 'galaxyCatalog',
    focus: {
      // 8 × the diameter away at 60°: the whole disc with a comfortable margin.
      arrivalSize: 1 / (16 * Math.tan(Math.PI / 6)),
      // A dwarf never fills the view so far that its surroundings vanish.
      minDistanceMpc: 0.15,
      flyInto: false,
      // Twice the diameter, so the ring clears the disc.
      ring: { radii: 4, slab: 'cosmo' },
    },
  },
];
