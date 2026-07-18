import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Earth-typed row of the SOURCE_REGISTRY — the textured true-scale planet in
 * the near-field descent. A single seeded body (positions live in the body
 * store, not this row), drawn by its own content-layer.
 *
 * Scene bodies pick on the NEAR0 pick pass — they draw into the pick texture via
 * `drawPick`, tagged with this code, and a body's identity is its stable seed id.
 * They carry no COSMO label/marker, though: their captions ship through the
 * foreground-labels layer rather than the structure/galaxy-name label systems the
 * `bearsLabel`/`bearsMarker` flags drive. So this variant adds only `code` to the
 * base — no on-disk asset stem, and no per-record identity on the row itself (the
 * seed id lives in the body store).
 */
export type EarthSourceEntry = SourceEntryBase & {
  readonly type: 'earth';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
};
