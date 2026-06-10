/**
 * StructureItemSettings — per-category settings for one structure category
 * (held in `settings.structures.items`, keyed by structure category).
 *
 * A structure category has two independently-toggled pieces of chrome: the
 * ring/marker and the text label. This type un-braids them onto ONE row —
 * `enabled` drives the ring, `labelEnabled` drives the text — replacing the
 * two parallel flat root records (`markerCategoryVisibility` /
 * `labelCategoryVisibility`) that previously held the same two booleans in
 * different shapes at the settings root. Co-locating them means a reader walks
 * one `items[category]` entry to learn everything about that category's
 * visibility instead of cross-indexing two records by the same key.
 *
 * Same shape as `SurveyItemSettings` on purpose: both extend the base with the
 * single `labelEnabled` axis. They're kept as distinct named types (not one
 * shared alias) because they're keyed and consumed by different source-type
 * clusters — collapsing them would re-braid surveys and structures behind a
 * name that claims they're interchangeable when their producers, ids, and
 * registries differ.
 */

import type { DataItemSettings } from './DataItemSettings';

export type StructureItemSettings = DataItemSettings & {
  /** Whether this category's text label is shown (ring visibility is the base `enabled`). */
  labelEnabled: boolean;
};
