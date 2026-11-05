import type { SelectionKindFacts } from '../../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../../@types/engine/SelectionRef';

export const structureSelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'structure' }>
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
  },
];
