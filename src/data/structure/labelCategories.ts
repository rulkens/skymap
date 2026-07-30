import { SOURCE_ENTRIES } from '../sourceEntries';

/**
 * LABEL_CATEGORIES — every source that renders a text label in the 3D scene,
 * in registry order.
 *
 * Five kinds of sources bear labels:
 *   - 'famousGalaxy' — the curated atlas entry carries a name that floats above
 *     the dot on a leader line (the 'galaxy' layer).
 *   - Structure categories (cluster, supercluster, void, group) — each ring
 *     carries a name on the 'structure' label layer.
 *   - 'famousStar' — the curated near-field star map captions its members on
 *     the final descent (the 'starCatalog' layer, drawn on the NEAR0 slab).
 *   - Near-field bodies ('earth', 'planet', 'sun') — each captions itself on
 *     the final descent (the 'body' layer, also drawn on the NEAR0 slab).
 *   - 'milkyWay' — the Milky Way overlay carries the "You are here" label at the
 *     world origin (the 'milkyWay' label layer), a singleton overlay with no
 *     per-record catalog.
 *
 * This is the label-visibility axis: settings toggles, fade registration, and
 * the SettingsPanel label-on/off rows all iterate this set. Bulk galaxy catalogs
 * (SDSS, GLADE, 2MRS, Milliquas) and the survey-wide Gaia star bin do not bear
 * labels and are excluded.
 *
 * Companion to STRUCTURE_IDS, which is the narrower structure-only axis
 * (used where 'famousGalaxy' is irrelevant, e.g. the structure store and
 * marker producer).
 */
export const LABEL_CATEGORIES = SOURCE_ENTRIES.filter((e) => e.bearsLabel).map((e) => e.id);
