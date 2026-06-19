/**
 * EngineCallbacks — the seam between the imperative WebGPU engine and the
 * React UI. The engine calls these functions only when values actually change,
 * so React's setState can be passed in directly without spurious re-renders.
 */

import type { EngineStatus } from './EngineStatus';
import type { FocusableTarget } from './FocusableTarget';
import type { ScaleInfo } from './ScaleInfo';
import type { SourceType } from '../data/SourceType';
import type { LoadProgressState } from '../loading/LoadProgressState';
import type { StructureId } from '../data/structure/StructureId';
import type { AppStore, SetSagaContext } from '../../store/types';

/**
 * Callbacks the engine uses to push state changes into the UI layer.
 *
 * All callbacks are called synchronously from the engine's internal code,
 * except where noted. They are called only when the value actually changes,
 * so React's `setState` can be passed in directly.
 *
 * ### Events only
 *
 * Every member here is an EVENT — something the engine *did* that the
 * UI must learn about (a status transition, a selection change, a
 * camera-snapshot tick, a catalog arrival, a load-progress update).
 * Settings VALUES do NOT live here: they're owned by the engine settings
 * store and read React-side via `useStore` selectors, so there is no
 * echo-mirror protocol to maintain.
 *
 * ### Nested-only shape
 *
 * Each sub-bag groups its callbacks by the engine sub-system they
 * concern (lifecycle / selection / camera / sources).
 * There are no flat siblings — every fire site lives at its
 * nested address.
 *
 * Why namespacing at all (rather than sibling lambdas)?  The grouping
 * mirrors the engine's *internal* `EngineState` sub-bags so the public
 * callback surface reads as a parallel projection of the state tree.
 * Consumers can destructure a cluster at a time
 * (`const { camera } = ...`), and adding a new event lands in the
 * cluster it belongs to instead of bloating a flat record.
 *
 * Required-ness rules: sub-bags whose members include any required
 * callback are themselves required (`lifecycle`, `selection`).
 * Bags that are entirely optional (`camera`, `sources`, …) keep their
 * `?:` marker so subscribers can omit them without needing to declare
 * an empty object.
 */
export type EngineCallbacks = {
  /**
   * The injected Redux store created once at the app root (`main.tsx`) and
   * shared with React via `<Provider>`.  The engine reads settings from it
   * (`store.getState().settings`) and dispatches the write path through it,
   * so the engine and React drive one authoritative instance with no mirror.
   */
  store: AppStore;

  /**
   * Registers the engine's saga runner into the store's saga context.  The
   * engine builds `runTierTransition` (closed over the live `EngineState`) and
   * hands it to the running root saga through this setter, which the store
   * factory exposes alongside the store.  It can't ride the `<Provider>`
   * because it's a SIBLING of the store (the factory returns
   * `{ store, setSagaContext }`), so it's threaded down as a callback instead.
   * Required: without it the tier saga's `getContext('runTierTransition')`
   * stays a no-op and a tier change never reaches the engine's GPU resources.
   */
  setSagaContext: SetSagaContext;

  /**
   * Engine lifecycle callbacks.  `onStatusChange` is required — every
   * engine consumer needs to observe the initializing → loading →
   * ready transitions (the React shell hides the loading overlay on
   * `ready`).
   */
  lifecycle: {
    /** Fired whenever the engine status advances (initializing → loading → ready). */
    onStatusChange: (s: EngineStatus) => void;
  };

  /**
   * Selection-state callbacks.  Carry the resolved `FocusableTarget`
   * (galaxy or structure) so consumers don't need to branch on a separate
   * id callback — they receive the full GalaxyInfo / StructureInfo
   * directly.  Both required: every engine consumer needs hover /
   * select fan-out (InfoCard text, halo, hover preview).
   */
  selection: {
    /** Fired when the pinned/selected entity changes. */
    onSelectChange: (target: FocusableTarget | null) => void;
    /** Fired when the entity under the cursor changes (null = empty sky). */
    onHoverChange: (target: FocusableTarget | null) => void;
  };

  /**
   * Camera-state callbacks.  All entries optional — App.tsx and the
   * scale-bar subscribe, but headless / test consumers can omit.
   */
  camera?: {
    /**
     * Fired when the camera-focus target changes — i.e. the engine has
     * started a tween toward (or away from) a specific galaxy or structure.
     *
     * Selection (`onSelectChange`) and focus are separate concepts:
     *   - Selection is the pin state — InfoCard, halo highlight.  A bare
     *     canvas click fires `onSelectChange` only.
     *   - Focus is a user-deliberate camera commitment — the Focus button
     *     on the InfoCard, the `f` shortcut, a palette pick, or a deep-
     *     link resolve.  Each of those fires `onFocusChange` *in
     *     addition to* `onSelectChange`.
     *
     * The deep-link URL hook subscribes to focus, not selection, so a
     * casual click doesn't pollute browser history with hash entries —
     * only deliberate focus actions do.  The `FocusableTarget` union
     * means one callback covers both galaxy and structure focus; consumers
     * branch on the `target.type` discriminant.
     */
    onFocusChange?: (target: FocusableTarget | null) => void;
    /**
     * Reserved.  Scale-bar derivation happens React-side from
     * `onCameraChange` snapshots; the slot stays for future overlays
     * that want a typed `ScaleInfo` echo.
     */
    onScaleChange?: (info: ScaleInfo) => void;
    /**
     * Fired once per frame the camera state may have changed.  The
     * snapshot carries the two camera scalars React needs to derive
     * zoom-dependent values (scale bar today; potentially other
     * overlays later).  Anything more elaborate should read state
     * through its own subsystem rather than fattening this payload.
     *
     * Why a snapshot rather than the live `OrbitCamera` ref?  React
     * consumers should treat each emission as an immutable value to
     * compare against the previous one — passing the live object
     * would leak mutation semantics across the engine→React boundary
     * and defeat `setState` equality checks.
     */
    onCameraChange?: (snapshot: { distance: number; fovYRad: number }) => void;
  };

  /**
   * Source-state callbacks — per-source readiness and aggregated load
   * progress. (Tier is not echoed here: it lives in the `tier` root slice,
   * read React-side via `selectTier`.)
   *
   * `onCatalogReady` is granular per-source because the three .bin
   * files run as parallel fetches with very different sizes (2MRS
   * ~2 MB, SDSS ~23 MB, GLADE ~96 MB), so they land minutes apart on
   * slow connections.  Showing each as it arrives lets the user
   * explore data progressively instead of staring at a blank canvas.
   * Fires for the synthetic fallback too (with `source = Source.
   * Synthetic`) so subscribers don't need a separate code path.
   *
   * `onLoadProgress` aggregates byte counts across in-flight slots;
   * `null` means "no fetches in flight" (the UI fades the bar out).
   *
   * `onStructureCountsChange` reports the number of structures published per
   * marker category (cluster / supercluster / void) after each structure
   * rebuild — the structure analogue of the per-galaxy-catalog
   * `onCatalogReady` count, so the Structures panel can show "Clusters
   * 573" the way the Galaxy catalogs panel shows "SDSS 1,234,567".  Fired with
   * the full snapshot (not a delta) because the three groups settle
   * together when the bulk `.ccat` lands.
   */
  sources?: {
    onCatalogReady?: (source: SourceType, count: number) => void;
    onLoadProgress?: (progress: LoadProgressState | null) => void;
    onStructureCountsChange?: (counts: Partial<Record<StructureId, number>>) => void;
  };
};
