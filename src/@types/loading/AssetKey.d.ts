import type { SourceType } from '../data/SourceType';

/**
 * Registry key for every fetchable asset in the engine's asset-wiring layer.
 *
 * `AssetKey` is a superset of `SourceType` (every numeric `Source` value), plus
 * three auxiliary string keys for assets that don't map one-to-one to a single
 * `Source`:
 *
 *   - `'clusterCatalog'` — the `.ccat` seed shared by Cluster, Supercluster,
 *     and Void POIs. All three `Source` codes pull their geometry from one file,
 *     so a per-source fetch key would be wrong: there is no `clusterCatalog`
 *     `Source`, and a single fetch must not trigger three loads.
 *
 *   - `'famousMeta'` — the `famous_meta.json` sidecar that accompanies the
 *     `Famous` `.bin`. It is a distinct network request from the binary, so it
 *     needs its own key in the wiring registry even though its identity source
 *     is `Source.Famous`.
 *
 *   - `'pgcAlias'` — the PGC-alias lookup JSON. It is consumed across survey
 *     sources (primarily 2MRS and GLADE) and has no unique `Source` code.
 *
 * The asymmetry cuts both ways: some `Source`s are NOT fetched individually
 * (Cluster / Supercluster / Void all arrive via `'clusterCatalog'`), and the
 * three string keys are NOT `Source`s. "Source" (stable identity code, persisted
 * to `.bin` + GPU buffers) and "Asset" (fetchable network resource) are
 * different sets; this type is the asset set.
 *
 * See ADR 0005 §2 ("Identity vs wiring layers; AssetKey") for the rationale.
 */
export type AssetKey = SourceType | 'clusterCatalog' | 'famousMeta' | 'pgcAlias';
