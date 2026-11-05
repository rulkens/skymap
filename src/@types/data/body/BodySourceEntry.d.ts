import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Body-typed row of the APP_SOURCE_REGISTRY: a true-scale near-field object (Earth, the planets).
 * Identity is the seed id, never persisted; what differs per body lives in the body store
 * and the layers, which keeps the uniform `settings.bodies.items[id]` accessor.
 */
export type BodySourceEntry = SourceEntryBase & {
  readonly type: 'body';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
};
