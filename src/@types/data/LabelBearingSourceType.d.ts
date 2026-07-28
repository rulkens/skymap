/**
 * LabelBearingSourceType — the `SOURCE_REGISTRY` types whose rows can carry
 * `bearsLabel: true`.
 *
 * A hand-curated subset of `SourceEntry['type']` rather than a derivation,
 * because the derivation would have to run over the registry VALUES (which
 * types can't see) — `bearsLabel` is a per-row flag, not a per-type one. The
 * pairing is enforced instead by `LABEL_HOME_BY_SOURCE_TYPE` being a total
 * `Record` over this union: a new label-bearing type fails the build until it
 * gets a home.
 *
 * `milkyWay` is a member in its own right, not an escape hatch — its label is
 * produced by the Milky-Way registry row like any other category. It differs
 * only in WHERE its bit is stored (a singleton scalar, no `items` record),
 * which is exactly what its `LabelHome` row encapsulates.
 */

export type LabelBearingSourceType = 'structure' | 'galaxyCatalog' | 'milkyWay';
