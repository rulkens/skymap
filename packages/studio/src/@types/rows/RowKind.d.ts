/** A row's kind: an Effect arm, the clip's Start, or one flyPath waypoint. Keys the registry. */
import type { EffectKind } from './EffectKind';

export type RowKind = EffectKind | 'start' | 'waypoint';
