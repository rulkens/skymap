import type { SOURCE_REGISTRY } from '../../../data/sources';

type AnyEntry = (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY];

/**
 * The closed set of black-hole ids — the key domain for
 * `settings.blackHoles.items`. Derived from the `type: 'blackHole'` registry
 * rows exactly as `BodyId` is, so a second hole widens the union by existing.
 */
export type BlackHoleId = Extract<AnyEntry, { readonly type: 'blackHole' }>['id'];
