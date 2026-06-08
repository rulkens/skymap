import type { LabelCategory } from '../@types/engine/data/LabelCategory';
import { SOURCE_ENTRIES } from './sourceEntries';

/**
 * LABEL_CATEGORIES — every source that renders a text label in the 3D scene,
 * in registry order.
 *
 * Two kinds of sources bear labels:
 *   - 'famousGalaxy' — the curated atlas entry carries a name that floats above
 *     the dot on a leader line (the 'galaxyNames' layer).
 *   - Structure categories (cluster, supercluster, void, group) — each ring
 *     carries a name on the 'structure' label layer.
 *
 * This is the label-visibility axis: settings toggles, fade registration, and
 * the SettingsPanel label-on/off rows all iterate this set. Bulk surveys
 * (SDSS, GLADE, 2MRS, Milliquas) do not bear labels and are excluded.
 *
 * Companion to STRUCTURE_CATEGORIES, which is the narrower structure-only axis
 * (used where 'famousGalaxy' is irrelevant, e.g. the structure store and
 * marker producer).
 */
export const LABEL_CATEGORIES = SOURCE_ENTRIES.filter((e) => e.bearsLabel).map((e) => e.id);

/**
 * LABEL_LAYER_BY_CATEGORY — which fade layer each label-bearing category's
 * labels live on, keyed by category id.
 *
 * Routes the per-category label-visibility setter without a `=== 'famousGalaxy'`
 * special-case: the registry row's `labelLayer` field ('galaxyNames' for the
 * curated atlas, 'structure' for cluster/supercluster/void/group) is the single
 * source of truth, so a new label-bearing source picks its layer from its row.
 */
function buildLabelLayers(): Readonly<Record<LabelCategory, 'galaxyNames' | 'structure'>> {
  const result = {} as Record<LabelCategory, 'galaxyNames' | 'structure'>;
  for (const entry of SOURCE_ENTRIES.filter((e) => e.bearsLabel)) {
    const { id, labelLayer } = entry;
    if (labelLayer === undefined) {
      throw new Error(
        `Source '${id}' has bearsLabel:true but no labelLayer — add 'galaxyNames' or ` +
          "'structure' to its SOURCE_REGISTRY row.",
      );
    }
    result[id as LabelCategory] = labelLayer;
  }
  return result as Readonly<Record<LabelCategory, 'galaxyNames' | 'structure'>>;
}

export const LABEL_LAYER_BY_CATEGORY: Readonly<Record<LabelCategory, 'galaxyNames' | 'structure'>> =
  buildLabelLayers();
