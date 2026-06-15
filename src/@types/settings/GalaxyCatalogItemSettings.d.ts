/**
 * GalaxyCatalogItemSettings — per-item settings for one galaxy catalog source (held in
 * `settings.galaxyCatalogs.items`, keyed by galaxy catalog id).
 *
 * A galaxy catalog adds a label axis on top of the universal visibility axis: some
 * galaxy catalogs bear text labels (the famous-galaxy layer today). Rather than park
 * galaxy catalog label visibility in a separate parallel record, it co-locates with
 * the galaxy catalog's `enabled` row as `labelEnabled` — one place to read both the
 * points-on/off and the labels-on/off state for a given galaxy catalog. That mirrors
 * how a structure category co-locates its ring and its text
 * (`StructureItemSettings`); the two types are intentionally the same shape
 * because both extend the base with the same single label axis.
 *
 * Galaxy catalogs that don't render labels still carry the field; defaults seed it and
 * the producer simply never reads it. The alternative — making `labelEnabled`
 * optional, or splitting label-bearing and label-free galaxy catalogs into two types —
 * would force every reader to branch on which kind of galaxy catalog it has, for no
 * gain over a seeded-but-unread boolean.
 */

import type { DataItemSettings } from './DataItemSettings';

export type GalaxyCatalogItemSettings = DataItemSettings & {
  /** Whether this galaxy catalog's text labels are shown (famous-galaxy names today). */
  labelEnabled: boolean;
};
