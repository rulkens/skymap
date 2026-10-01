/**
 * TakeoverSource — which feature owns the scene under `runTakeoverSaga`. Closed on
 * `kind` so a third taker is a compile-time union member, not another flag.
 */

import type { TourId } from '../animation/tour/TourId';
import type { ExhibitId } from '../exhibits/ExhibitId';
import type { Transition } from '../navigation/Transition';

/** An exhibit's `entry` is how it arrived; its overlay times the copy from it. */
export type TakeoverSource =
  | { kind: 'tour'; id: TourId }
  | { kind: 'exhibit'; id: ExhibitId; entry: Transition };
