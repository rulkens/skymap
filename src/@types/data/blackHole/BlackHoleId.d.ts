import type { APP_SOURCE_REGISTRY } from '../../../compositions/appSources';

type AnyEntry = (typeof APP_SOURCE_REGISTRY)[keyof typeof APP_SOURCE_REGISTRY];

/**
 * The closed set of black-hole ids — the key domain for
 * `settings.blackHoles.items`. Derived from the `type: 'blackHole'` registry
 * rows exactly as `BodySourceId` is, so a second hole widens the union by existing.
 */
export type BlackHoleId = Extract<AnyEntry, { readonly type: 'blackHole' }>['id'];
