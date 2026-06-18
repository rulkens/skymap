# Grill Session: Folding Selection into the Intent Store — 2026-06-18

Source: follow-up to [ADR 0007](../adrs/0007-intent-centric-state-and-effects.md) (intent-centric
state). The user asked to fold the selection subsystem into the centralized store and clean up the
stray `engine.ts` entry points (`selectFamous`, `selectByAlias`, `focusOn`).

Goal: make selection (hover → select → focus) Intent under one write path, killing the
subsystem-closure + React-`useState`-mirror + echo-callback shape, and collapsing the
resolve-then-focus entry points. Design lands in
[`specs/2026-06-18-selection-into-intent-store-design.md`](../superpowers/specs/2026-06-18-selection-into-intent-store-design.md).

---

## Q1: Is selection Intent a reference or a resolved target?

**The question:** The store can hold either the fully-resolved `FocusableTarget`
(`GalaxyInfo`/`StructureInfo`, as the closure does today) or a lightweight `SelectionRef`, with the
resolved object derived on read. This is the root decision — it determines whether the stray entry
points collapse, whether the race-defence survives, and what "derived" means downstream.

**Considerations:**
- **Option A (resolved target):** store the snapshot. Pro: robust across tier swaps for free (the
  snapshot is self-contained); no resolver needed. Con: keeps the `commitGalaxyFocus` race-defence
  (pre-built `GalaxyInfo` to avoid a blank InfoCard); keeps the React mirror; the snapshot is a big
  derived object stored as Intent.
- **Option B (reference):** store `SelectionRef`; resolve at read. Pro: the URL hash is *already* a
  reference, so the resolved target + URL are two encodings of one Intent — holding the ref collapses
  the duplication; the race-defence dissolves (resolve-on-read returns null until ready, then
  re-resolves); minimal serializable Intent. Con: resolution moves to read time (must memoize); a
  consumer could see a one-frame "resolving…" gap.

**Verification:** mapped the tween data-deps. `tweenToGalaxy` already takes a structural `TweenTarget`
(reads only `x,y,z,diameterKpc`); `tweenToStructure` reads only `worldPos`/`radiusMpc`;
`resolveGalaxyInfo(cloud, idx, source, famousMeta)` already exists; the only async input
(`famousMeta`) already degrades gracefully. **No path needs a pre-built object at dispatch time.**

**Decision:** Reference (Option B). The decisive evidence is that the system already treats a
reference as canonical (the URL round-trip) and that nothing in the tween/InfoCard path requires the
pre-built object — so the race-defence is a workaround for storing a snapshot, not load-bearing.

---

## Q2: Session-local `(source, index)` or a durable id?

**The question:** Within "reference," what identity does the galaxy ref carry? The pick yields
`(source, index)`; the URL encodes a durable id (`famous`/`objID`/`PGC`/`pos`). Which is stored?

**Considerations:**
- **Option A (durable id in the ref):** uniform durability; URL == ref. Con: every hot-path resolve
  (halo per-frame, hover per-move) needs a durable-id → index reverse lookup/scan; the pick gives
  `index`, so storing durable forces a round-trip.
- **Option B (session-local `(source, index)`):** matches the pick + `resolveGalaxyInfo`; O(1)
  hot-path. Con: `index` drifts across tier swaps (the `resolveGalaxyInfo` bounds-check exists for
  exactly this); not durable across rebuilds — so URL/tour need a separate durable encoding.

**Verification:** the tier-swap trace confirmed today's selection survives a swap only because the
snapshot is self-contained; a bare `(source, index)` would resolve to the *wrong* galaxy after a
swap unless re-anchored. The URL deliberately uses durable ids because `index` isn't stable.

**Decision:** Session-local `(source, index)` (Option B), with the durable focus-id as a **boundary
projection** (URL out, tier-swap re-anchor) — *not* stored in the ref. Keeps the hot path trivial and
pushes durability to the two rare boundaries where the codec already lives. "Serializable" (plain
`(source, index)`) and "durable across rebuilds" are two different properties; conflating them would
be the complecting error.

**Type shaped along the way:** `source: GalaxyCatalogSourceType` (numeric galaxy-only narrowing of
`SourceType` — zero conversions; `GalaxyCatalogId` is the string settings key, wrong space); galaxy
arm `index: number` (positional, ephemeral), structure arm `id: string` (durable instance key, via
`StructureStore.byId`) — different names because they teach opposite durability lessons.

---

## Q3: Where does resolution live — getters or consumers?

**The question:** Do the selection getters/selectors return a resolved `FocusableTarget`, or expose
the raw ref and make each consumer resolve?

**Considerations:**
- **Option A (getter resolves, memoized):** ~65 read sites (runFrame, ring pass, halo, InfoCard) keep
  reading a resolved target unchanged; blast radius collapses to the write path + getter + mirror
  deletion. Memo keyed on `(ref, cloud-identity)`. Within a frame `select` is read 3×, `focus` 1× —
  all hit the cache.
- **Option B (consumers resolve):** more honest about layering but rewrites every read site and
  scatters resolution — the opposite of consolidating.

**Decision:** Getter resolves, memoized (Option A) — the textbook `intent.md` shape ("derived State
is computed on read or memoized, never stored as a second authoritative copy"). The memo lives
engine-side (it needs catalog data); React reads through it.

---

## Q★: Selectors that need out-of-store resources (the general problem)

**The question:** A pure store selector can't resolve a ref — resolution needs the catalogs, which
are heavy resources that must stay out of the store. How does a pure, memoized derivation combine
Intent (store) with a resource (point cloud), and how does React re-render when the *resource*
changes? This is the general boundary problem (also volumes↔SCFD, InfoCard↔thumbnails, labels↔atlas).

**Considerations:**
- **Anti-patterns:** copy the resource into the store (a mirror → staleness); reach into a mutable
  singleton inside the selector (breaks purity + memoization).
- **Option A (descriptor-token bridge):** store Intent + a serializable *descriptor* of the resource
  (generation/version/readiness), never the bytes; dereference at the resolver's edge; invalidation
  flows through the descriptor. RTK-Query / entity-adapter shape. Preserves serializability + replay.
- **Option B (independently-observable resource layer):** compose two subscriptions. Honest, but
  Redux-dogma-awkward and every consumer needs both.
- **Option C (atoms/signals):** automatic dependency tracking; the lightweight cousin of the deferred
  reconciler. Ruled out earlier for Intent (defeats snapshot/replay), though fine for resources.

**Decision:** (A) descriptor-token bridge — fits the stated constraints (serializable Intent, replay,
no signals), and skymap already has the raw material (AssetSlot generation counters). The deep-link
re-render is not a special case but this principle applied: catalog readiness becomes a store
descriptor (`dataStatus.catalogGen`), so resolution-changes-without-ref-changes become ordinary store
events. **Written into `intent.md` as a new durable section.**

---

## Q4: Store shape — nested slices or flat?

**The question:** Where does `selection` live in the store, and what `RootState` do the selectors
type against?

**Considerations:**
- **Option A (nested slices):** `RootState = { settings, selection, … }`. Pro: `settings` and
  `selection` have different lifecycles — `restoreSettings`/tour-capture snapshot the *settings*
  slice; nesting structurally prevents it sweeping selection. `useSettingsStore` scopes to `.settings`
  internally → existing settings consumers untouched.
- **Option B (flat):** `selection` as a key on `EngineSettingsState`. Smaller type diff, but complects
  "settings" with ephemeral attention and entangles the tour-snapshot boundary with selection.

**Decision:** Nested (A). The user added: **promote `tier` out of `settings` too** — same
settings-overwrite hazard (a restore must not clobber the data-resolution level). Final:
`RootState = { tier, settings, selection, dataStatus }`.

---

## Q5: Dedup on write — bespoke or generic?

**The question:** Today `targetEq` (identity-key equality) dedups slot writes. Where does that go, and
is it per-type?

**Considerations:**
- **Option A (bespoke `refEq` in the reducer):** a per-type switch. Con: exactly the plumbing the ref
  was meant to remove.
- **Option B (generic `shallowEqual` in the reducer):** `SelectionRef` is flat primitives, so shallow
  == structural — a stock `shallowEqual` is correct, no per-type code. One guard stops notify +
  re-render + wake at the source; consumers stay on default `===` (ref identity stable when unchanged).
- **Option C (no reducer dedup; `shallowEqual` at consumers):** dead-simple reducer, but two call
  sites must remember the equality arg.

**Decision:** Generic `shallowEqual` in the reducer via a `setIfChanged` helper (B). Deletes
`targetEq.ts` *and* `targetIdentityKey.ts` with no bespoke replacement. (Reference `===` is wrong —
fresh ref objects every pick would always miss; interning is more plumbing.) Dedup is a cleanliness
choice, not a perf one, since hover doesn't wake.

---

## Q6: Entry-point collapse — and do we even need `FocusTarget`?

**The question:** `selectFamous` / `selectByAlias` / `focusOn` are resolve-then-focus differing only
in the identifier. How do they collapse, and is a separate durable `FocusTarget` type needed?

**Considerations:**
- **Two doors:** `focus(ref)` (callers with a ref) + `focusByFocusId(string)` (callers with a durable
  id). `selectByAlias` is already a ref → `focus(ref)`; `selectFamous` routes through the durable-id
  door; `focusOn` → `focus(ref)`.
- **`FocusTarget` type:** the user pushed — why a separate type at all? The durability gap is
  **galaxy-only** (structure `id` and milkyWay are already durable). So `SelectionRef` is the one
  type; the durable form is just its **string** serialization at the boundary, handled by two
  galaxy-only codecs (`focusIdOf` / `resolveFocusId`). The `famous|pgc|sdss|pos` discrimination
  becomes an internal detail of `resolveFocusId` (with `pos` a query, not a ref).

**Decision:** Two doors; `FocusTarget` **deleted**; `SelectionRef` everywhere; durable form is a
boundary string codec. `selectFamous` + `selectByAlias` + `focusOn` + the `useUrlSync` drain + the
`FocusTarget` type all dissolve.

---

## Q6b: Where does the deep-link "pending" live?

**The question:** A deep-link can name a galaxy before its cloud loads. My first draft put
`state.pendingFocus = focusId` in the engine. The user objected: why is there state here?

**Considerations:**
- **Option A (engine `pendingFocus` field):** reinvents `useUrlSync`'s existing drain as engine
  closure state — the scattered-state smell.
- **Option B (consumer's effect on `catalogGen`):** `focusByFocusId` is stateless (resolve-or-noop);
  the "retry when loaded" is the consumer's effect keyed on the descriptor. `useUrlSync` already owns
  the URL's pending; under the bridge its drain becomes one `useEffect` on `[focusId, gen]`.

**Decision:** (B) — no engine pending. Deferral is always the consumer's effect (URL today, tours
later), never a field on the engine. The descriptor (`catalogGen`) is what makes it retry.

---

## Q7: The render-wake — bridge, setter, or middleware?

**The question:** `select`/`focus` must wake the render-on-demand loop; `hover` must not. Where does
the wake live now that the setters are gone?

**Considerations:**
- **Option A (explicit bridge, `syncVisibilityFades`-style):** matches the existing fades precedent
  and the `fades-not-zustand-middleware` decision.
- **Option B (in the setter):** violates the render-wake-consolidation rule ("slots never wake
  themselves").
- **Option C (store middleware / listener seam):** the effects layer `intent.md` #5 calls for; maps
  1:1 onto RTK `createListenerMiddleware`.

**Decision:** The user chose **(C) — a listener seam, explicitly reverting the no-middleware stance**,
because the target is RTK with an effects layer: standing up the seam now means one effects pattern
that migrates cleanly, not a bridge rewritten later. Consequences named: the store layer now couples
to `requestRender`; `syncVisibilityFades` is a temporary odd-one-out (converges at the vehicle
migration). The reversal supersedes `fades-not-zustand-middleware` and amends ADR 0001 — recorded.

---

## Q8: Tier-swap behaviour — and can it be an effect?

**The question:** A stored `(source, index)` goes stale across a tier swap (wrong galaxy or null).
What happens to the selection, and can the fix be an effect on the seam?

**Considerations:**
- **Option A (re-anchor by durable id):** capture the focus-id before eviction, re-resolve after the
  new cloud loads (null clears a dropped-out galaxy). More correct than today (which persists a haloed
  "ghost" not in the new tier).
- **Option B (clear on swap):** ~3 lines, but a real UX regression.
- **Can it be an effect?** The capture must run *before* eviction; a listener keyed on `catalogGen`
  fires *after* (can't capture). **But** a `requestTier` *Intent action* + an effect reacting to the
  tier-intent change fires *before* eviction (the effect itself triggers the eviction) — dissolving
  the capture-before-eviction asymmetry. The user then noted typed-redux-saga makes this cleaner
  (request/change actions, `takeLatest` cancellation, `select`, `take`-loop deferral).

**Decision:** (A) re-anchor, expressed as **`requestTier` Intent action + a transition effect** —
capture (pre-eviction) → run the existing `setTier` body (reused as `runTierTransition`) → re-anchor
`select`/`focus` (`hover` cleared, structures/milkyWay untouched). `tier` becomes a proper Intent
(consistent with promoting it to `RootState`). Shown both as a zustand/RTK listener and as a saga; the
**vehicle stays open (ADR 0008)** — saga earns its keep on the orchestrated edges (tier, deep-link,
tours), not the common click path.

---

## Q9 (meta): Do we even have RTK?

**The question:** All the example code used RTK idiom, but the store is zustand-vanilla today.

**Decision:** The design is **vehicle-agnostic** and lands on the current zustand store. The RTK
(+ possibly typed-redux-saga) migration is a separate, later, orthogonal effort — bundling them would
complect "selection architecture" with "store technology." The chosen shapes (slices, selectors,
actions-as-setters, descriptor slice, listener seam) are RTK-ready by construction, so that migration
is mechanical. This is exactly ADR 0007's "incremental migration; selection is the first fold; vehicle
deferred."
