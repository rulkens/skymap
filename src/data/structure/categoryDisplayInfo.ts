/**
 * Per-category display metadata for label-bearing sources (cluster,
 * supercluster, void, group, famousGalaxy, famousStar, earth, planet, sun,
 * milkyWay).  Keyed by `LabelCategory`.
 *
 * Derived from the SOURCE_REGISTRY rows that carry `bearsLabel: true` — the
 * canonical home of per-category copy.  A hand-maintained table beside the
 * registry would be a second place to edit and a second place to forget; this
 * accessor keeps the copy in exactly one place, so a new label-bearing source
 * gains display info from its own registry row and cannot be added without it
 * (`buildDisplayInfo` throws on a row missing the three copy fields).
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
