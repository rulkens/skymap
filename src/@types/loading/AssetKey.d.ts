import type { SourceType } from '../data/SourceType';

/**
 * Registry key for every fetchable asset in the engine's asset-wiring layer.
 *
 * `AssetKey` is a superset of `SourceType` (every numeric `Source` value), plus
 * a set of auxiliary string keys for assets that don't map one-to-one to a
 * single `Source`:
 *
 *   - `'structureCatalog'` — the `.ccat` seed shared by Cluster, Supercluster,
 *     and Void structures. All three `Source` codes pull their geometry from one file,
 *     so a per-source fetch key would be wrong: there is no `structureCatalog`
 *     `Source`, and a single fetch must not trigger three loads.
 *
 *   - `'famousMeta'` — the `famous_meta.json` sidecar that accompanies the
 *     `Famous` `.bin`. It is a distinct network request from the binary, so it
 *     needs its own key in the wiring registry even though its identity source
 *     is `Source.FamousGalaxy`.
 *
 *   - `'pgcAlias'` — the PGC-alias lookup JSON. It is consumed across galaxy catalog
 *     sources (primarily 2MRS and GLADE) and has no unique `Source` code.
 *
 *   - `'filaments'` — the cosmic-web skeleton (`filaments.bin`). A derived
 *     global asset with its own renderer target; no per-galaxy-catalog `Source`.
 *
 *   - `'cf4Density'`, `'mcpm'` — the two production scalar-volume cubes. These
 *     DO have `Source` codes (`Source.Cf4Density`, `Source.Mcpm`) for identity,
 *     but their slots live as named fields on `state.assetSlots` (not in the
 *     numeric `points` map), so they need string asset keys to route through
 *     `slotFor`. The DEV-only `debug-*` synthetic volumes are deliberately
 *     absent: they live in `assetSlots.syntheticVolumes` (a record of slots,
 *     minted only under `import.meta.env.DEV`) and are not part of the
 *     demand-driven asset set.
 *
 *   - `'flow'` — the CF4++ velocity flow field (`flowfield.scfd`), a single
 *     tier-agnostic asset with its own (Phase C) renderer target. Default-off /
 *     demand-loaded, like `cf4Density`: it has no point-`Source` code, so its
 *     slot lives as a named field on `state.assetSlots` and needs a string
 *     asset key to route through `slotFor`.
 *
 * The asymmetry cuts both ways: some `Source`s are NOT fetched individually
 * (Cluster / Supercluster / Void all arrive via `'structureCatalog'`), and the
 * string keys are NOT all `Source`s. "Source" (stable identity code, persisted
 * to `.bin` + GPU buffers) and "Asset" (fetchable network resource) are
 * different sets; this type is the asset set.
 *
 * See ADR 0005 §2 ("Identity vs wiring layers; AssetKey") for the rationale.
 */
export type AssetKey =
  | SourceType
  | 'structureCatalog'
  | 'famousMeta'
  | 'pgcAlias'
  | 'filaments'
  | 'cf4Density'
  | 'mcpm'
  | 'flow';
