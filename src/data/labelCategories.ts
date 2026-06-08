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
