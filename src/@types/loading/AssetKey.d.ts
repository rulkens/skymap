import type { SourceType } from '../data/SourceType';
import type { BodyTextureSlotKey } from '../data/BodyTextureSlotKey';

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
 *   - `'famousGalaxiesMeta'` — the `famous_galaxies_meta.json` sidecar that
 *     accompanies the `Famous` `.bin`. It is a distinct network request from
 *     the binary, so it needs its own key in the wiring registry even though
 *     its identity source is `Source.FamousGalaxy`.
 *
 *   - `'famousStarsMeta'` — the `famous_stars_meta.json` sidecar, the star
 *     twin of `'famousGalaxiesMeta'`. Unlike the famous galaxies, famous stars are a
 *     SEEDED star catalog (compiled in, no `.bin` fetch), so there is no
 *     sibling asset to key off — the sidecar is its own eager, tier-agnostic
 *     load rather than a companion join.
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
 *   - `'constellations'` — the true-3D constellation stick-figure artifact
 *     (`constellations.json`), a single tier-agnostic overlay asset. Opt-in
 *     (defaults off), demand-loaded on the layer's master gate; it has no
 *     point-`Source` code, so its slot lives as a named field on
 *     `state.assetSlots` and needs a string asset key to route through
 *     `slotFor`.
 *
 *   - `'bodyTextureAtlas'` — the low-resolution all-bodies surface atlas
 *     (`body-atlas.webp`), one 512×256 tile per textured body in a single
 *     ~180 KB image. A singleton sidecar with a named `EngineAssetSlots` field,
 *     like the three above, but its commit fans ONE decoded bitmap out to 15
 *     placeholder seeds (Earth's renderer plus the fourteen shared bodies) rather
 *     than committing to a single consumer. Distinct from the per-body
 *     `BodyTextureSlotKey` family below in every dimension that matters: one
 *     network request instead of one per body, tier-agnostic instead of
 *     tier-clamped, and demanded unconditionally at boot instead of
 *     proximity-gated — it is the fallback those proximity-gated maps upgrade.
 *
 *   - `BodyTextureSlotKey` — the keyed `bodyTextures` slot family: one asset per
 *     `(bodyId, kind)` map, encoded as the composite `\`${bodyId}:${kind}\``
 *     string (`'earth:surface'`, `'mars:surface'`, the Saturn ring strip
 *     `'saturn-ring:surface'`, and — with the feature PRs — Earth's
 *     `'earth:night'` / `'earth:clouds'`). Unlike the single sidecar assets
 *     above, these do NOT live as named fields — they share the keyed
 *     `state.assetSlots.bodyTextures` Map (mirroring the per-source `points`
 *     map), and `slotFor` routes a family key through it via `isBodyTextureKey`.
 *     Each is proximity-gated on its own load radius and released on retreat
 *     (two-way demand), and re-fetched at the clamped current tier when the
 *     data-volume tier changes. The asset set widens with the body textures:
 *     Earth's former bespoke `'earthTexture'` key is gone — Earth's day map loads
 *     through this family as key `'earth:surface'`.
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
  | 'famousGalaxiesMeta'
  | 'famousStarsMeta'
  | 'pgcAlias'
  | 'filaments'
  | 'cf4Density'
  | 'mcpm'
  | 'flow'
  | 'constellations'
  | 'bodyTextureAtlas'
  | BodyTextureSlotKey;
