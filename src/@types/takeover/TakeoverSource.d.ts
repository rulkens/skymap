/**
 * TakeoverSource — what is running under `runTakeoverSaga`, the one record of
 * it. Closed on `kind` so another taker is a compile-time union member, not
 * another flag.
 */

import type { TourId } from '../animation/tour/TourId';
import type { ExhibitId } from '../exhibits/ExhibitId';
import type { ClipId } from '../animation/ClipId';
import type { Transition } from '../navigation/Transition';
import type { SkySpot } from '../camera/pose/SkySpot';
import type { SkyRestore } from './SkyRestore';

/** An exhibit's `entry` is how it arrived; its overlay times the copy from it. Sky mode has
 *  no id, so no hash names it (D13), and holds only what the camera frame cannot: the restore. */
export type TakeoverSource =
  | { kind: 'tour'; id: TourId }
  | { kind: 'exhibit'; id: ExhibitId; entry: Transition }
  | { kind: 'clip'; id: ClipId }
  | { kind: 'sky'; spot: SkySpot; restore: SkyRestore };
