/**
 * projectLabelCategoryVisibility — pure projection of the per-category label
 * visibility into the flat `Record<LabelCategory, boolean>` the SettingsPanel
 * reads for its label checkboxes.
 *
 * Each label-bearing source type keeps its label bit beside that source's other
 * visibility axis, so the bits live in several authoritative homes. This
 * projection merges them into the single record the panel wants, routing each
 * category through
 * `LABEL_HOME_BY_SOURCE_TYPE[SOURCE_TYPE_BY_LABEL_CATEGORY[cat]]` — two
 * id-keyed lookups, since `SOURCE_REGISTRY` itself is keyed by numeric pick
 * code. The React prop shape is therefore a derived view, not one more stored
 * copy that could drift.
 *
 * ### Why milkyWay is a scalar in the bundle, not an items row
 *
 * The other homes are uniform per-record item Records. `milkyWay` is a
 * singleton-overlay axis with no per-record catalog (one disk, one "You are
 * here" label), so it has no item row to read — it carries a single
 * `labelEnabled` boolean. Passing that boolean directly, rather than
 * synthesising a one-entry `items` record to force uniformity, keeps the
 * singleton-vs-per-record difference honest instead of pretending the overlay
 * is a catalog. Its `LabelHome` row absorbs the difference.
 *
 * ### Why a LabelHomes bundle (not EngineSettingsState)
 *
 * Every field of the bundle is the stable reference a selector returns, so the
 * React side feeds it from `useMemo` and the record is rebuilt exactly when a
 * label home changes. Reading through the whole settings bag would rebuild on
 * every unrelated write — Immer hands out a fresh identity each time.
 */

import type { LabelCategory } from '../../@types/engine/data/LabelCategory';
import type { LabelHomes } from '../../@types/settings/LabelHomes';
import { LABEL_CATEGORIES } from '../../data/structure/labelCategories';
import { LABEL_HOME_BY_SOURCE_TYPE } from '../../data/labels/labelHomeBySourceType';
import { SOURCE_TYPE_BY_LABEL_CATEGORY } from '../../data/labels/sourceTypeByLabelCategory';

export function projectLabelCategoryVisibility(homes: LabelHomes): Record<LabelCategory, boolean> {
  return Object.fromEntries(
    LABEL_CATEGORIES.map((c) => [
      c,
      LABEL_HOME_BY_SOURCE_TYPE[SOURCE_TYPE_BY_LABEL_CATEGORY[c]].read(homes, c),
    ]),
  ) as Record<LabelCategory, boolean>;
}
