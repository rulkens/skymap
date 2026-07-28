import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * A star catalog streamed from disk — the survey-wide Gaia bin today.
 *
 * Its presentation defaults live in-row (like `VolumeSourceEntry`) rather than
 * in a separate settings table, so the draw budget and the crossfade band that
 * hands off to the procedural Milky-Way cloud sit next to the `binBaseName`
 * they govern. Leaf stars ARE pickable — `drawPick` stamps a resolved star's
 * identity into the NEAR0 pick pass — and the `code` tags the source in that
 * pick encoding, but a star's identity is its record index and is never
 * persisted to the `.bin`.
 */
export type SurveyStarCatalogSourceEntry = SourceEntryBase & {
  readonly type: 'starCatalog';
  /** Stable numeric tag; registry key only — not persisted, not packed. */
  readonly code: number;
  /** Filename stem under public/data/; loader appends `-<tier>.bin`. */
  readonly binBaseName: string;
  /** Ships per-tier `.bin` variants (always true for this source). */
  readonly tiered: boolean;
  /** Per-frame drawn-point budget: typical + hard cap. */
  readonly drawBudget: { readonly typical: number; readonly hardCap: number };
  /** Camera-distance crossfade band to the procedural MW cloud, parsecs. */
  readonly crossfadePc: { readonly inner: number; readonly outer: number };
};
