/**
 * DebugViewWeights — every debug view's crossfade weight, keyed by kind: one
 * value per `DEBUG_VIEWS` row, built by `debugViewWeights`. Which uniform lane
 * each one lands in is the packer's business, not this record's: three ride
 * io.wesl's `debugView` and the fourth `bubbleView`.
 */

import type { DebugViewKind } from './DebugViewKind';

export type DebugViewWeights = Readonly<Record<DebugViewKind, number>>;
