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
};
