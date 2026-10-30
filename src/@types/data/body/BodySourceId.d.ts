import type { APP_SOURCE_REGISTRY } from '../../../compositions/appSources';
type AnyEntry = (typeof APP_SOURCE_REGISTRY)[keyof typeof APP_SOURCE_REGISTRY];

/**
 * The closed set of body SOURCE ids — the key domain for `settings.bodies.items`.
 * Derived from the `type: 'body'` registry rows, so a new near-field body
 * widens the union automatically. The runtime iterable companion is
 * `BODY_SOURCE_IDS` in `data/bodies/bodySourceIds`. A scene body's own id is `SceneBodyId`.
 */
export type BodySourceId = Extract<AnyEntry, { readonly type: 'body' }>['id'];
