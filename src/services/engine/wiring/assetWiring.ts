/**
 * ASSET_WIRING — the flat registry of every fetchable asset's lifecycle
 * contract (`key` + `factory` + `req` + `demand`), iterated by `wireSlots`
 * to construct the engine's slot table and by `reevaluateDemand` to decide
 * which slots should be loading right now.
 *
 * ### The unifying idea: "is this asset required?"
 *
 * Before this table, each asset's load policy lived wherever its toggle was
 * handled — `setSourceVisible` fired the point load, `setFilamentsEnabled`
 * fired the filament load, the boot loop fired everything once, the
 * tier-change loop fired the tier-aware subset, and a separate counter+flag
 * pair gated the synthetic fallback. The same question — *should this asset
 * be loading, given the current state?* — was answered in a dozen scattered
 * places, each easy to forget when a new edge appeared (tier flip while a
 * survey is hidden, a settings toggle mid-flight, etc.).
 *
 * Every row's `demand(ctx)` collapses one asset's entire load policy into a
 * single pure predicate over the `DemandCtx` read surfaces. The demand
 * loop re-runs the whole table on any state change, so "is it required?" has
 * exactly one answer per asset, in one place, re-evaluated uniformly.
 *
 * ### Two corrections to the original demand table (bug fixes)
 *
 *   - **filaments** gates on `settings.filaments.enabled` — the real master
 *     toggle, so a disabled filament overlay never fetches the skeleton.
 *   - **structureCatalog** gates on structure-category visibility: it loads when
 *     ANY of the cluster / supercluster / void categories is visible in either
 *     the marker or the label overlay. There is no `settings.structures.enabled`
 *     flag — structures are controlled per-category via the two visibility
 *     records (`markerCategoryVisibility` / `labelCategoryVisibility`). With
 *     every category visible by default, the catalog still loads at boot
 *     (behaviour-preserving); only a user who hides every structure category in
 *     both overlays skips the fetch. This is the structures-enabled proxy.
 *
 * ### What is NOT a row here
 *
 *   - **Cluster / Supercluster / Void** `Source`s — they have no individual
 *     fetch; their geometry arrives via the single `'structureCatalog'` row.
 *   - **DEV synthetic volumes** (`debug-gaussian` / `-cartesian` / `-spherical`)
 *     — minted only under `import.meta.env.DEV` via `createSyntheticVolumeSlots`
 *     and triggered there. Keeping them out of the production table lets Vite
 *     tree-shake the procedural generators; they are not demand-driven.
 *
 * ### Point-source rows are `built: 'external'`
 *
 * The six point slots (5 surveys + Synthetic) are minted in `initGpu` by
 * `wireGalaxyCatalogSourceSlot`, alongside the renderer their commit uploads
 * into. They appear here ONLY so the demand loop can trigger their
 * already-minted slots with the right `req(tier)`; the slot-construction pass
 * skips them (`built: 'external'`). Their `factory` is a guard that throws if
 * the builder ever calls it — the row is demand+req only. See `AssetWiringRow`
 * for the rationale on this marker over the alternatives.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { StructureCategory } from '../../../@types/engine/data/StructureCategory';
import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import { createFilamentSlot } from '../../loading/slots/filamentSlot';
import { createFamousMetaSlot } from '../../loading/slots/famousMetaSlot';
import { createStructureCatalogSlot } from '../../loading/slots/structureCatalogSlot';
import { createCf4DensitySlot } from '../../loading/slots/cf4DensitySlot';
import { createFlowFieldSlot } from '../../loading/slots/flowFieldSlot';
import { createMcpmSlot } from '../../loading/slots/mcpmSlot';
import { createPgcAliasSlot } from '../../loading/slots/pgcAliasSlot';
import type { SourceType } from '../../../@types/data/SourceType';

/**
 * The categories backed by the bulk `.ccat` catalog — their visibility
 * gates the structure-catalog fetch. `famousGalaxy` is excluded (Famous
 * `.bin` + meta sidecar), and `group` is excluded (seed-only, no `.ccat`
 * — adding it here would trigger a pointless fetch when group visibility
 * toggles). Spelled as `StructureCategory` members so a type error
 * surfaces here rather than silently skipping a category on rename.
 */
const BULK_CATALOG_CATEGORIES: readonly StructureCategory[] = ['cluster', 'supercluster', 'void'];

/**
 * Volume-field handle ids, read from the registry rather than re-spelled, so
 * the demand predicates can't drift from the strings the renderer + settings
 * actually key on.
 */
const CF4_FIELD = SOURCE_REGISTRY[Source.Cf4Density].handle;
const MCPM_FIELD = SOURCE_REGISTRY[Source.Mcpm].handle;

/**
 * Guard factory for `built: 'external'` rows. Reaching it means the slot
 * builder forgot to honour the skip marker — a wiring bug, not a runtime path.
 */
const externalFactory = (): never => {
  throw new Error(
    'assetWiring: point-source slots are minted in initGpu (built: "external"); the registry must not build them',
  );
};

/** One demand+req row for a point source, marked as externally built. */
function pointRow(source: SourceType): AssetWiringRow {
  return {
    key: source,
    built: 'external',
    factory: externalFactory,
    req: (tier) => ({ source, tier }),
    demand: (ctx) => ctx.isVisible(source),
  };
}

export const ASSET_WIRING: readonly AssetWiringRow[] = [
  // ── Point sources (demand+req only; slots minted in initGpu) ──────
  pointRow(Source.SDSS),
  pointRow(Source.TwoMRS),
  pointRow(Source.Glade),
  pointRow(Source.Milliquas),
  pointRow(Source.FamousGalaxy),
  {
    // Synthetic fallback: loads only when armed by `createSyntheticFallback`,
    // which runs the precise gate (count-aware, hidden-at-boot-aware) at the
    // slot-subscription level and trips the `'syntheticFallback'` request flag.
    // A pure ctx predicate can't express that gate — see createSyntheticFallback.
    key: Source.Synthetic,
    built: 'external',
    factory: externalFactory,
    req: (tier) => ({ source: Source.Synthetic, tier }),
    demand: (ctx) => ctx.request('syntheticFallback'),
  },

  // ── Famous-galaxy meta sidecar ───────────────────────────────────
  // Companion join: loads once the Famous slot leaves `idle` (i.e. the
  // .bin fetch has begun), so the InfoCard text rides in alongside the
  // binary rather than racing ahead of it.
  {
    key: 'famousMeta',
    factory: (deps) => createFamousMetaSlot(deps.state, deps.cb),
    req: (tier) => ({ tier }),
    demand: (ctx) => ctx.slotState(Source.FamousGalaxy) !== 'idle',
  },

  // ── Cosmic-web filament skeleton ─────────────────────────────────
  // Bug-fix pin: gates on the real master toggle.
  {
    key: 'filaments',
    factory: (deps) => createFilamentSlot(deps.state, deps.cb),
    req: (tier) => ({ tier }),
    demand: (ctx) => ctx.settings.filaments.enabled,
  },

  // ── MCPM Cosmic Web volume ───────────────────────────────────────
  // Tier-aware. Field id read from the registry; access is optional-chained
  // because `state.settings.volumes.items` has no entry for a field until it is seeded.
  {
    key: 'mcpm',
    factory: (deps) => createMcpmSlot(deps.state, deps.cb),
    req: (tier) => ({ tier }),
    demand: (ctx) => ctx.volumeField(MCPM_FIELD)?.enabled === true,
  },

  // ── CF-4 DM density volume ───────────────────────────────────────
  // Void request (the cube isn't tiered or per-source). Default-off field.
  {
    key: 'cf4Density',
    factory: (deps) => createCf4DensitySlot(deps.state, deps.cb),
    req: () => undefined,
    demand: (ctx) => ctx.volumeField(CF4_FIELD)?.enabled === true,
  },

  // ── CF4++ velocity flow field ────────────────────────────────────
  // Default-off, single tier-agnostic .scfd. Loads on first enable
  // (the flow layer's master gate), like cf4Density. Flow is a singleton
  // overlay layer, so its gate lives in `settings.flow.enabled` alongside
  // filaments/milkyWay — no bespoke DemandCtx surface. The GPU upload +
  // renderer handoff land in Phase C.
  {
    key: 'flow',
    factory: (deps) => createFlowFieldSlot(deps.state, deps.cb),
    req: () => undefined,
    demand: (ctx) => ctx.settings.flow.enabled,
  },

  // ── Cluster/supercluster bulk coverage ───────────────────────────
  // Bug-fix pin (structures-enabled proxy): loads when ANY structure
  // category is visible in either the marker or label overlay. Empty
  // request — the .ccat is a standalone boot asset.
  {
    key: 'structureCatalog',
    factory: (deps) => createStructureCatalogSlot(deps.state, deps.cb),
    req: () => ({}),
    demand: (ctx) =>
      BULK_CATALOG_CATEGORIES.some(
        (cat) =>
          ctx.settings.markerCategoryVisibility[cat] || ctx.settings.labelCategoryVisibility[cat],
      ),
  },

  // ── PGC alias map ────────────────────────────────────────────────
  // Lazy: only the one-shot `paletteOpened` request triggers it.
  {
    key: 'pgcAlias',
    factory: (deps) => createPgcAliasSlot(deps.state, deps.cb),
    req: () => undefined,
    demand: (ctx) => ctx.request('paletteOpened'),
  },
];
