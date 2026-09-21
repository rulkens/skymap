/**
 * TakeoverSource — which feature owns the scene under `runTakeover`. Closed on
 * `kind` so a third taker is a compile-time union member, not another flag.
 */

import type { TourId } from '../animation/tour/TourId';
import type { ViewId } from '../views/ViewId';

export type TakeoverSource = { kind: 'tour'; id: TourId } | { kind: 'view'; id: ViewId };
