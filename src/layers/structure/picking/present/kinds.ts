import type { SelectionKindFacts } from '../../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../../@types/engine/SelectionRef';
import type { SelectionRow } from '../../../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../../../@types/engine/FocusableTarget';

export const structureSelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'structure' }>,
  Extract<SelectionRow, { type: 'structure' }>,
  Extract<FocusableTarget, { type: 'structure' }>
>[] = [
  {
    type: 'structure',
    focus: {
      // Overflows the screen ~2.2:1, so the marker ring and label have just crossed their
      // close-approach fade-out and the interior is clear (`markerMaxApparentRadiusPx`).
      arrivalSize: 2.2,
      // Further out a huge structure shrinks to a few pixels and reads as "I didn't move".
      maxDistanceMpc: 800,
      flyInto: true,
      // Its ring is the cluster marker pass's, not a selection halo.
      ring: null,
    },
    // Its ring brightens on hover, captioned or not.
    mayHaveLabel: () => true,
    toFocusable: (row) => ({ ...row, ref: { type: 'structure', id: row.id } }),
    displayName: (target) => target.name,
  },
];
