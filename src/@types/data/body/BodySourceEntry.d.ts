import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Body-typed row of the SOURCE_REGISTRY — a true-scale near-field object in
 * the final descent (Earth, the Solar-System planets).
 *
 * One `type` across all of them because they share every axis that matters to
 * the registry: seeded in code (a body's identity is its stable seed id, never
 * persisted), drawn by their own content layers, pickable on the NEAR0 pick
 * pass via `drawPick`, and captioned through the foreground-labels layer. What
 * differs between them — texture sets, orbital elements, lighting — lives in
 * the body store, not here. Splitting them into separate registry types bought
 * nothing but repeated copies of this shape, and cost the uniform
 * `settings.bodies.items[id]` accessor the other source-type clusters have.
 */
export type BodySourceEntry = SourceEntryBase & {
  readonly type: 'body';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
};
