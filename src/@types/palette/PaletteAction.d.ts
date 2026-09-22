/** PaletteAction — what a palette row or card asks the container to do on selection, discriminated on `kind`. */

import type { SelectionRef } from '../engine/SelectionRef';
import type { ExhibitId } from '../exhibits/ExhibitId';
import type { TourId } from '../animation/tour/TourId';

export type PaletteAction =
  | { kind: 'focus'; focusId: string }
  /** A Layer's `search` row already names its ref, so it skips the id round-trip. */
  | { kind: 'focusRef'; ref: SelectionRef }
  | { kind: 'exhibit'; exhibitId: ExhibitId }
  | { kind: 'tour'; tourId: TourId }
  | { kind: 'flyTo'; lonDeg: number; latDeg: number; altKm: number };
