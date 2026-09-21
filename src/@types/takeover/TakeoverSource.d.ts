/**
 * TakeoverSource — which feature currently owns the scene under `runTakeover`:
 * a running tour or an open view. Closed on `kind` so a future third taker
 * (if one ever arrives) is a compile-time-visible union member, not a new
 * boolean flag beside this one.
 */

import type { TourId } from '../animation/tour/TourId';
import type { ViewId } from '../views/ViewId';

export type TakeoverSource = { kind: 'tour'; id: TourId } | { kind: 'view'; id: ViewId };
