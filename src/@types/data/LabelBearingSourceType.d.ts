/**
 * LabelBearingSourceType — the `SOURCE_REGISTRY` types whose rows can carry
 * `bearsLabel: true`.
 *
 * A hand-curated subset of `SourceEntry['type']` rather than a derivation,
 * because the derivation would have to run over the registry VALUES (which
 * types can't see) — `bearsLabel` is a per-row flag, not a per-type one.
 *
 * The pairing is enforced from both ends. `SOURCE_TYPE_BY_LABEL_CATEGORY`
 * annotates its entries as `[LabelCategory, LabelBearingSourceType]`, so
 * flipping `bearsLabel: true` on a row whose type is absent from this union
 * fails the build there; and `LABEL_HOME_BY_SOURCE_TYPE` is a total `Record`
 * over the union, so widening it here fails the build until the new type gets
 * a home. Neither half works alone: the total Record without the annotation
 * would let a homeless type slip through to a runtime lookup of `undefined`.
 *
 * `milkyWay` is a member in its own right, not an escape hatch — its label is
 * produced by the Milky-Way registry row like any other category. It differs
 * only in WHERE its bit is stored (a singleton scalar, no `items` record),
 * which is exactly what its `LabelHome` row encapsulates.
 */

export type LabelBearingSourceType =
  | 'structure'
  | 'galaxyCatalog'
  | 'starCatalog'
  | 'body'
  | 'milkyWay'
  | 'zoneOfAvoidance';
