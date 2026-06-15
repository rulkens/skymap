/**
 * VolumeFieldId — the closed set of scalar-volume identifiers the
 * renderer accepts.
 *
 * Derived from `SOURCE_REGISTRY` entries with `type: 'volume'`, so
 * adding a new volume entry to the registry automatically widens this
 * union. The set covers production cubes (`'cf4-density'`, `'mcpm'`)
 * and DEV-only synthetic fixtures (`'debug-*'`) uniformly — the
 * registry is the single source of truth for "what volumes exist".
 *
 * Lives at the type level rather than as a parallel hand-maintained
 * union so a new volume entry can't drift out of the type. The
 * `Extract` walks every registry entry and keeps only the volume-typed
 * ones; the indexed access then projects out their `id` literals.
 */

import type { SOURCE_REGISTRY } from '../../data/sources';

type AnyEntry = (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY];
type VolumeEntry = Extract<AnyEntry, { readonly type: 'volume' }>;

export type VolumeFieldId = VolumeEntry['id'];
