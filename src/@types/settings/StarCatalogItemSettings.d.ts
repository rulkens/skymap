/**
 * StarCatalogItemSettings — per-item settings for one star catalog source (held
 * in `settings.starCatalogs.items`, keyed by star catalog id).
 *
 * A star catalog adds a label axis on top of the universal visibility axis:
 * some star catalogs bear text labels (the curated famous-star names, a future
 * catalog). Rather than park star-catalog label visibility in a separate
 * parallel record, it co-locates with the star catalog's `enabled` row as
 * `labelEnabled` — one place to read both the points-on/off and the labels-on/
 * off state for a given star catalog. That mirrors how a galaxy catalog
 * co-locates its points and its name label (`GalaxyCatalogItemSettings`); the
 * two types are intentionally the same shape because both extend the base with
 * the same single label axis.
 *
 * Star catalogs that don't render labels still carry the field; defaults seed
 * it and the producer simply never reads it (the survey-wide Gaia bin carries
 * `labelEnabled` inertly today). The alternative — making `labelEnabled`
 * optional, or splitting label-bearing and label-free star catalogs into two
 * types — would force every reader to branch on which kind of star catalog it
 * has, for no gain over a seeded-but-unread boolean.
 */

import type { DataItemSettings } from './DataItemSettings';

export type StarCatalogItemSettings = DataItemSettings & {
  /** Whether this star catalog's text labels are shown (famous-star names, a future catalog). */
  labelEnabled: boolean;
};
