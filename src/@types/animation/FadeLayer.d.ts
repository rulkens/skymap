/**
 * FadeLayer — one row of the fade-ownership manifest.
 *
 * The manifest is a closure-row table: each `FadeLayer<Item>` describes
 * one visibility layer as a small bundle of closures, and a single
 * generic loop consumes the whole table. This is the deliberate
 * alternative to a flat `switch` over layer kinds.
 *
 * Why a closure-row table rather than a switch: the layers are
 * *heterogeneous* in two independent ways, and a switch would have to
 * special-case both axes at every site that walks the layers. First, the
 * cardinality differs — `milkyWay`/`filament`/`flow` are singletons,
 * while surveys fan out per `GalaxyCatalogId`, structures per
 * `StructureId`, and volumes per `VolumeFieldId`. Second, the *seed*
 * differs — some layers seed their fade from settings (a toggle that is
 * already on must register at opacity 1.0), while demand-loaded layers
 * must seed at 0 so they fade *in* when their data arrives. A naive
 * `settings ? 1 : 0` rule would erase that fade-in: a demand-loaded layer
 * whose setting is on would pop to full opacity instead of dissolving in.
 *
 * Pushing both axes into per-row closures (`expand` for cardinality,
 * `seed` for the initial opacity) lets the consuming loop stay one
 * generic pass: for each row, `expand(state)` yields the row's items, and
 * for each item `handle(item)` names its `FadeId` and `seed(settings,
 * item)` gives its starting opacity. No branching on layer kind anywhere
 * in the loop.
 *
 * Why `handle()` is the sole translation point: a `VisibilityLayerKey`
 * (the intent-addressing name in `key`) is not a `FadeId` — the registry
 * keys on `FadeId` kinds, and several keys collapse onto, or split from, a
 * single kind. `handle(item)` is the one closure that turns a row's
 * concrete `Item` into the concrete `FadeId` it registers under. Keeping
 * that mapping in exactly one place per row means the intent vocabulary
 * and the registry vocabulary can each evolve without the other leaking
 * into the seed loop.
 *
 * Why the intent fields are optional: the *intent* set (the layers a user
 * or a tour can toggle) is a strict *subset* of the *registration* set
 * (every fadeable layer). Plan A only needs to register and seed — that is
 * `key`/`expand`/`handle`/`seed`, the four required fields. The later
 * intent bridge fills in `intent`/`writeIntent` (read/write the
 * toggle in settings), `post` (side effect after a fade resolves), and
 * `guard` (suppress a fade under some state). Rows that are register-only
 * simply omit them.
 */

import type { VisibilityLayerKey } from './VisibilityLayerKey';
import type { FadeId } from './FadeId';
import type { EngineState } from '../engine/state/EngineState';
import type { EngineSettingsState } from '../settings/EngineSettingsState';
import type { SettingsSnapshot } from '../engine/settings/SettingsSnapshot';

export type FadeLayer<Item> = {
  readonly key: VisibilityLayerKey;
  // The `SettingsSnapshot` cluster this row's `intent`/`writeIntent` read/write.
  // Lets `applyEffect` map a touched cluster to its rows without a parallel
  // table; registration-only rows omit it.
  readonly cluster?: keyof SettingsSnapshot;
  expand(state: EngineState): readonly Item[];
  handle(item: Item): FadeId;
  seed(settings: EngineSettingsState, item: Item): number;
  // Intent rows only (optional, unused by Plan A):
  intent?(settings: EngineSettingsState, item: Item): boolean;
  writeIntent?(settings: EngineSettingsState, item: Item, value: boolean): void;
  post?(state: EngineState, item: Item): void;
  guard?(state: EngineState, item: Item): boolean;
};
