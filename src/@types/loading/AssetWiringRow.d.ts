/**
 * AssetWiringRow — declarative row shape for the asset-wiring registry.
 *
 * The wiring registry is a flat array of `AssetWiringRow` entries — one per
 * fetchable asset — that `wireSlots` iterates to construct the engine's full
 * slot table. Each row fully describes one asset's lifecycle contract:
 *
 *   - `key`     — stable identity (which asset is this?).
 *   - `factory` — how to build the slot (construction-purity contract, see below).
 *   - `req`     — how to derive the current request from the active tier.
 *   - `demand`  — whether the slot should be loading right now.
 *   - `built`   — `'external'` marks a slot the registry does NOT build (see below).
 *
 * ### Externally-built slots (built)
 *
 * Per-source point slots are minted in `initGpu` (via
 * `wireGalaxyCatalogSourceSlot`, right after the renderer they commit into),
 * NOT by the wiring registry. They still need a row here so the demand loop
 * can trigger their already-minted slots with the right `req(tier)`, but the
 * slot-construction pass must skip them — building twice would register a
 * second fade handle and a duplicate commit subscriber. `built: 'external'`
 * is that skip marker. Such rows' `factory` is a guard that throws if the
 * builder ever calls it, since the row exists for demand+req only.
 *
 * The alternative — omitting point rows from the registry and keeping their
 * load policy inline in `initGpu` — would re-scatter the very load logic this
 * table consolidates, and the synthetic-fallback gate (which reads survey
 * slot states) would have no single place to express its demand. One table,
 * one marker, wins.
 *
 * ### Construction-purity contract (factory)
 *
 * `factory` builds and subscribes the slot, then RETURNS it. It must NOT
 * write `state.assetSlots` and must NOT call `slot.load()`. Those two
 * responsibilities belong to the `wireSlots` orchestrator, which:
 *   1. writes each slot to `state.assetSlots` once it holds the reference, and
 *   2. calls `slot.load(row.req(tier))` conditionally after evaluating `demand`.
 *
 * Separating construction from installation and loading keeps each factory
 * a pure builder: it does one thing (allocate + wire), which makes it
 * independently testable without a full engine context.
 *
 * ### Request derivation (req)
 *
 * `req(tier)` maps the current data-volume tier to a typed request value.
 * Tier-agnostic assets (filaments, PGC aliases, etc.) can ignore the
 * argument and return a constant. Tier-aware assets (galaxy catalogs, MCPM
 * volume) embed `tier` directly in the returned object.
 *
 * ### Load predicate (demand)
 *
 * `demand(ctx)` returns true when the slot should be actively loading.
 * Centralising each asset's load policy as a predicate avoids spreading
 * conditional `slot.load()` calls across dozens of engine-handle setters —
 * every policy lives here, next to the row it concerns. See `DemandCtx` for
 * the four read surfaces available to predicates.
 */

import type { AssetKey } from './AssetKey';
import type { AssetSlot } from './AssetSlot';
import type { SlotDeps } from './SlotDeps';
import type { DemandCtx } from './DemandCtx';
import type { Tier } from '../data/Tier';

export type AssetWiringRow<T = unknown, R = unknown> = {
  key: AssetKey;
  /**
   * Pure constructor: builds + subscribes + RETURNS the slot. Does NOT
   * write `state.assetSlots` and does NOT call `slot.load()`.
   */
  factory: (deps: SlotDeps) => AssetSlot<T, R>;
  /** Build the request from the current tier (void/empty for tier-agnostic). */
  req: (tier: Tier) => R;
  demand: (ctx: DemandCtx) => boolean;
  /**
   * `'external'` when the slot is minted outside the registry (point sources,
   * built in `initGpu`). The slot-construction pass skips these; the demand
   * loop still evaluates their `demand`/`req`. Absent ⇒ registry builds it.
   *
   * This is an optional flag rather than a discriminated union over
   * buildable-vs-external rows: the union would let the compiler force external
   * rows to omit a real `factory`, but it splits every consumer's row handling
   * in two. The single registry file enforces the invariant by construction
   * (external rows use a throwing `factory`), so the flag stays a flag.
   */
  built?: 'external';
};
