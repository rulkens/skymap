import type { SOURCE_REGISTRY } from '../../../data/sources';

type AnyEntry = (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY];

/**
 * The closed set of body ids — the key domain for `settings.bodies.items`.
 * Derived from the `type: 'body'` registry rows, so a new near-field body
 * widens the union automatically. The runtime iterable companion is
 * `BODY_IDS` in `data/bodies/bodyIds`.
 */
export type BodyId = Extract<AnyEntry, { readonly type: 'body' }>['id'];
