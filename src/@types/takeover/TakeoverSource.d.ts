/**
 * TakeoverSource — what is running under `runTakeoverSaga`, the one record of
 * it. Closed on `kind` so another taker is a compile-time union member, not
 * another flag.
 */

import type { TourId } from '../animation/tour/TourId';
import type { ExhibitId } from '../exhibits/ExhibitId';
import type { ClipId } from '../animation/ClipId';
import type { Transition } from '../navigation/Transition';

/** An exhibit's `entry` is how it arrived; its overlay times the copy from it. */
export type TakeoverSource =
  | { kind: 'tour'; id: TourId }
  | { kind: 'exhibit'; id: ExhibitId; entry: Transition }
  | { kind: 'clip'; id: ClipId };
