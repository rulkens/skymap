import { Source } from '../../../data/source';
import { buildGalaxyInfo } from '../../../services/engine/helpers/buildGalaxyInfo';
import type { SelectionKindFacts } from '../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';

export const galaxyCatalogSelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'galaxyCatalog' }>,
  Extract<SelectionRow, { type: 'galaxyCatalog' }>,
  Extract<FocusableTarget, { type: 'galaxyCatalog' }>
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
    // Only famous galaxies carry captions; a survey galaxy is InfoCard text only.
    mayHaveLabel: (ref) => ref.source === Source.FamousGalaxy,
    toFocusable: (row) => ({
      ...buildGalaxyInfo(row),
      ref: { type: 'galaxyCatalog', source: row.source, index: row.index },
    }),
    // Already the card's name ladder, famous name first.
    displayName: (target) => target.displayName,
  },
];
