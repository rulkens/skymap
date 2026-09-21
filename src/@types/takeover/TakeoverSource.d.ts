/**
 * TakeoverSource — which feature owns the scene under `runTakeover`. Closed on
 * `kind` so a third taker is a compile-time union member, not another flag.
 */

import type { TourId } from '../animation/tour/TourId';
import type { ExhibitId } from '../exhibits/ExhibitId';

export type TakeoverSource = { kind: 'tour'; id: TourId } | { kind: 'exhibit'; id: ExhibitId };
