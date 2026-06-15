/**
 * Per-category display metadata for label-bearing sources (cluster,
 * supercluster, void, famousGalaxy, group, milkyWay).  Keyed by `LabelCategory`.
 *
 * Derived from the SOURCE_REGISTRY rows that carry `bearsLabel: true`,
 * which are the canonical home of per-category copy since A1.  Consumers
 * read from `SOURCE_REGISTRY` rows via this accessor so the copy
 * module replaces that table with a registry-derived accessor so the copy
 * lives in exactly one place and new label-bearing sources gain display info
 * automatically from their registry row.
 *
 * Distinct from the presentation style tables (`structureMarkerStyles.ts` +
 * `famousLabelStyle.ts`) — those own *rendering* config (halo/ring colors,
 * pixel sizes, fade bands).  This owns *display* metadata (human labels).
 */

import type { LabelCategory } from '../../@types/engine/data/LabelCategory';
import type { CategoryDisplayInfo } from '../../@types/data/structure/CategoryDisplayInfo';
import { SOURCE_ENTRIES } from '../sourceEntries';

function buildDisplayInfo(): Readonly<Record<LabelCategory, CategoryDisplayInfo>> {
  const result = {} as Record<LabelCategory, CategoryDisplayInfo>;
  for (const entry of SOURCE_ENTRIES.filter((e) => e.bearsLabel)) {
    const { id, detailLabel, shortLabel, plural } = entry;
    if (detailLabel === undefined || shortLabel === undefined || plural === undefined) {
      throw new Error(
        `Source '${id}' has bearsLabel:true but is missing detailLabel/shortLabel/plural — ` +
          'add these fields to its SOURCE_REGISTRY row.',
      );
    }
    result[id as LabelCategory] = { label: detailLabel, shortLabel, plural };
  }
  return result as Readonly<Record<LabelCategory, CategoryDisplayInfo>>;
}

/**
 * Display metadata for each label-bearing source category.  Sourced from
 * `detailLabel` / `shortLabel` / `plural` on the SOURCE_REGISTRY rows where
 * `bearsLabel` is true.
 *
 * Field semantics:
 *   - `label`      — long form for detail surfaces ('Galaxy Cluster')
 *   - `shortLabel` — compact form for chips ('Cluster')
 *   - `plural`     — plural for list/toggle headers ('Clusters')
 */
export const CATEGORY_DISPLAY_INFO: Readonly<Record<LabelCategory, CategoryDisplayInfo>> =
  buildDisplayInfo();
