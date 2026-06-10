/**
 * SurveyItemSettings — per-item settings for one survey source (held in
 * `settings.surveys.items`, keyed by survey id).
 *
 * A survey adds a label axis on top of the universal visibility axis: some
 * surveys bear text labels (the famous-galaxy layer today). Rather than park
 * survey label visibility in a separate parallel record, it co-locates with
 * the survey's `enabled` row as `labelEnabled` — one place to read both the
 * points-on/off and the labels-on/off state for a given survey. That mirrors
 * how a structure category co-locates its ring and its text
 * (`StructureItemSettings`); the two types are intentionally the same shape
 * because both extend the base with the same single label axis.
 *
 * Surveys that don't render labels still carry the field; defaults seed it and
 * the producer simply never reads it. The alternative — making `labelEnabled`
 * optional, or splitting label-bearing and label-free surveys into two types —
 * would force every reader to branch on which kind of survey it has, for no
 * gain over a seeded-but-unread boolean.
 */

import type { DataItemSettings } from './DataItemSettings';

export type SurveyItemSettings = DataItemSettings & {
  /** Whether this survey's text labels are shown (famous-galaxy names today). */
  labelEnabled: boolean;
};
