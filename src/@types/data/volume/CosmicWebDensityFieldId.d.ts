import type { SOURCE_REGISTRY } from '../../../data/sources';

type AnyEntry = (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY];

/**
 * CosmicWebDensityFieldId — the closed set of scalar-volume identifiers the
 * renderer accepts. Derived from the `type: 'cosmicWebDensity'` registry
 * rows, so adding a volume entry widens the union automatically — the
 * registry is the single source of truth for "what volumes exist".
 */
export type CosmicWebDensityFieldId = Extract<AnyEntry, { readonly type: 'cosmicWebDensity' }>['id'];
