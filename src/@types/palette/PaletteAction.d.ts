/** PaletteAction — what a palette row or card asks the container to do on selection, discriminated on `kind`. */

import type { ExhibitId } from '../exhibits/ExhibitId';
import type { TourId } from '../animation/tour/TourId';

export type PaletteAction =
  | { kind: 'focus'; focusId: string }
  | { kind: 'exhibit'; exhibitId: ExhibitId }
  | { kind: 'tour'; tourId: TourId }
  | { kind: 'flyTo'; lonDeg: number; latDeg: number; altKm: number };
