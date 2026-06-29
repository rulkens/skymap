# ADR 0007: Intent-Centric State with an Explicit Effects Layer

- **Status:** Accepted (direction); the effects-layer _vehicle_ open sub-decision (see "Open question") is now resolved by [ADR 0008](0008-effects-layer-vehicle.md) — `typed-redux-saga`.
- **Date:** 2026-06-17
- **Deciders:** Alexander Rulkens
- **Tags:** engine, settings, state-management, architecture, effects, tours
- **Supersedes (in part):**
  - The engine-owned **zustand** settings store and its implicit **"avoid Redux / fewer layers"** stance (spec `2026-06-10-engine-owned-settings-store-design.md`) — the _engine-owned, single-source-of-truth_ framing stands; the technology choice and the anti-action-store rationale do not.
  - The **tour capture/restore snapshot** design (`SettingsSnapshot`, `captureSettings`/`restoreSettings`/`applyEffect`, the `mergeSettingsSnapshot` round-trip) — replaced by an ephemeral-Intent-overlay model.
- **Amends (does not reverse):**
  - [ADR 0001](0001-fade-ownership.md) — fade _opacity_ remains derived per-frame State (never in the dispatch store); only the **"fades never via middleware"** clause is relaxed: fade-_triggering_ may move into the effects layer.
- **Related:** [`docs/superpowers/conventions/intent.md`](../superpowers/conventions/intent.md) (the lens this ADR makes binding); [`simplicity.md`](../superpowers/conventions/simplicity.md); [ADR 0005](0005-engine-data-layer-and-asset-loading.md) (demand model — the validation step this ADR names); [ADR 0006](0006-volume-field-settings-in-settings-layer.md) (settings-are-the-home precedent).

## Context

The settings store was migrated to a single engine-owned zustand store
(2026-06-10) for a specific reason recorded at the time: the system had grown
**many places each holding their own state**, and **stale state** between those
places was a recurring source of bugs. Centralising settings was the first move
toward one source of truth.

That migration fixed _settings_. It did not fix the broader problem. A review of
the whole system (state inventory, features, orchestration, data/GPU, prior
decisions) found the scattered-authoritative-state pattern alive everywhere
_except_ settings:

- **Subsystem closures own authoritative state** — selection (hover/select/focus),
  tweens, structure-focus, the LOD planners, load-progress. Each is an island of
  truth.
- **React mirrors engine state in `useState`** — `selected`/`focused`/`hovered`,
  the scale legend, load progress, filament counts, and an explicitly-temporary
  `flow` optimistic copy. These are stale-state bugs waiting to happen.
- **In-place mutation bypasses the write path** — `settings.<cluster>.items[id]`
  writes mutate in place, and `restoreSettings`/`applyEffect` mutate the store
  object directly (bypassing the notifying setter), leaving React subscribers
  stale. This last one is a known latent bug, deferred at the time of writing.

Separately, the project's architecture turns out to _already_ be an
Intent → continuous-validation → View system in the sense Steven Wittens describes
("I is for Intent", "Climbing Mt Effect", "Reconcile All The Things", "Live"):
`state.settings` is Intent; the per-frame demand re-evaluation + `deriveSourceMasks`

- the fade bridge are the continuous, non-destructive validation; the GPU draw is
  the View. It simply was never _named_ one, so the discipline wasn't applied
  uniformly — which is why the non-settings state drifted.

The prior ADRs that touch this area were each scoped narrowly:

- The engine-owned-zustand decision was scoped to the _settings_ store and argued
  against an action-dispatch store on a "fewer layers / simpler mental model"
  basis. That basis was sound for settings-in-isolation but does not address the
  scattered non-settings state, and it pre-judged the action-store discipline that
  is the most direct cure for "many places holding their own state."
- ADR 0001 made fades a subsystem (a timing primitive + GPU-resource cache) and
  declared they must not be a store middleware effect. The "fade state is not
  store state" half is correct and stays. The "fade-triggering must never be a
  reactive effect of an Intent change" half conflicts with consolidating _all_
  reactive consequences-of-Intent in one place.
- The tour design captured settings clusters into a `SettingsSnapshot`, mutated
  the live settings during playback, and restored the snapshot afterward. The
  capture/restore round-trip is itself the source of the in-place-mutation
  staleness bug, and a worse model than an ephemeral overlay.

We are **not** doing a foundational rewrite. We are naming the architecture we
already have, extending its discipline to all app-facing state, and superseding
the prior decisions that were scoped too narrowly to see the whole.

## Decision

Adopt **intent-centric state** as the binding architecture, per
[`intent.md`](../superpowers/conventions/intent.md):

1. **One Intent store, single write path.** App-facing _Intent_ — settings,
   the selection/attention ladder (hover/select/focus), and tour intent — lives
   in one centralized store and is changed only by dispatching a patch. No
   subsystem closure and no React component holds an authoritative copy; no nested
   in-place mutation. The store enforces the single write path structurally, which
   is the direct cure for "many places holding their own state."

2. **The principled boundary** (Intent vs. derived vs. resource) is binding:
   - **Intent → the store:** the items above.
   - **Derived State → computed/memoized, never stored:** source masks, fade
     _opacities_, scale legend, demand decisions, load progress, member counts.
     Anything React currently mirrors in `useState` becomes a selector.
   - **Resource → imperative, engine-owned:** GPU buffers/textures/pipelines, and
     the **live camera orbit pose** (immutable-ref-with-mutable-register; only the
     camera _target_/auto-rotate/focus are Intent).
   - Smell test: _if dispatching it 60×/second would be absurd, it is not Intent._

3. **An explicit effects layer.** Reactive consequences of Intent — demand-driven
   loads, GPU uploads, fade-_triggering_ — live in one effects layer, not
   scattered across setters. Fade _opacity_ stays derived per-frame State; only
   the decision to _start_ a fade is an effect. This amends ADR 0001's
   no-middleware clause.

4. **Tours are an ephemeral Intent overlay.** A tour layers ephemeral Intent over
   committed Intent; validation reads the merged result; ending the tour resets
   the overlay to empty, revealing the untouched committed Intent. This supersedes
   the capture/restore snapshot design and dissolves the in-place-mutation
   staleness class.

5. **Intent stays serializable.** Plain data only — no `Set`s
   (`debug.disabledPasses` → `Record<string, true>`), no class instances, no GPU
   handles — so tours can be recorded/replayed, views deep-linked, and state
   inspected.

**What we are explicitly NOT deciding here:**

- **The effects-layer vehicle** (RTK + listener middleware vs. typed-redux-saga) —
  see "Open question." The _principle_ (effects react to Intent, in one home) is
  settled; the mechanism is not.
- **A reconciler runtime.** Considered and **deferred** (see "Alternatives").
- **The migration order.** Incremental; sequenced in a follow-up spec/plan. This
  ADR does not commit a big-bang change.
- **The demand model and per-type data stores** (ADR 0005) — unaffected; they are
  the validation step and the Resource/data layer, respectively, and this ADR
  builds on them.

## Open question: the effects-layer vehicle

> **Resolved by [ADR 0008](0008-effects-layer-vehicle.md):** the vehicle is
> `typed-redux-saga`. The two candidates below are retained for the rationale.

The reactive effects layer will land as one of two mechanisms. Both satisfy the
principle; the choice is a follow-up decision.

- **RTK + `createListenerMiddleware`.** Zero new dependency beyond RTK, first-class
  TS inference, async/await (no generators), `cancelActiveListeners` covers the
  `takeLatest` semantics tier-switching needs. Lightest machinery; the Redux
  team's recommended default for reactive logic.
- **typed-redux-saga.** A single, familiar, battle-tested effects system with
  best-in-class cancellation/sequencing and the TS-inference gap closed by
  `typed-redux-saga`. Costs a dependency and the generator paradigm as a second
  React-side model, and tends to pull orchestration into the store layer.

Either way, the **tour timeline is a separate engine-land concern** that dispatches
Intent patches into the store; the store's effects layer reacts to those the same
as any user action. The tour's own sequencing (timed cues, interruption) is not
the store's effects layer and may adopt its own machinery (a sequencer, or a
statechart) independently.

## Alternatives considered

- **Keep zustand, enforce discipline by convention.** Rejected as the primary
  vehicle: convention is exactly what let the current in-place-mutation and
  React-mirror staleness in. A structurally-enforced single write path is the
  point. (Zustand-with-discipline remains the fallback if the action-store
  migration is judged too costly.)
- **Headless-React / "Live" reconciler (Use.GPU model).** This is the _deepest_
  fix for the stated pain: derived State lives in call-site-keyed fibers,
  memoization is the default, the execution trace is the dependency graph, so a
  mirror cannot form by construction. It fits skymap's shape (a few dozen
  orchestration nodes on top; data-parallel millions of points underneath, never
  mounted). **Deferred, not rejected:** it is a foundational rewrite of the engine
  orchestration onto a niche runtime, with manual-dependency-array footguns and a
  team learning cost, immediately after a large engine rewrite. It is recorded as
  the **north-star** should we ever go foundational; until then we adopt its
  principles (see `intent.md`), not its runtime.

## Consequences

### Positive

- One structurally-enforced home and write path for Intent kills the
  "many places holding their own state" class — the reason the store migration
  started.
- Derived-everywhere (no `useState` mirrors, no closure truths) removes the
  stale-derived-state class, including the known `restoreSettings`/`applyEffect`
  in-place-mutation bug.
- Ephemeral-overlay tours make "more tours later" cheap and cannot desync
  committed Intent.
- Serializable Intent unlocks tour record/replay and deep-linking as
  near-free consequences.
- The architecture is finally _named_, so the discipline applies uniformly instead
  of just to settings.

### Negative

- A non-trivial, multi-area migration (selection, the React mirrors, the item
  writes, the effects layer, tours) — sequenced incrementally, not big-bang.
- Adopting an action-dispatch store (and an effects vehicle) is more machinery than
  the current zustand setup — accepted deliberately, because the enforcement is the
  feature.
- Reverses the recent, deliberate anti-Redux framing; this ADR owns that reversal
  and its rationale (the framing was scoped to settings-in-isolation).

### Neutral / forward-looking

- No on-disk format change; Intent is not persisted to `.bin`.
- Establishes that _all_ app-facing user state is Intent under one write path —
  future state (search, bookmarks, camera bookmarks) follows the same boundary.
- Leaves a clean seam to adopt the reconciler later if the orchestration layer ever
  warrants it, without re-litigating the Intent/derived/resource boundary.

## References

- [`docs/superpowers/conventions/intent.md`](../superpowers/conventions/intent.md)
  — the Intent / derived-State / View / Resource lens and its prescriptions.
- [ADR 0001](0001-fade-ownership.md) — fade ownership (amended here).
- [ADR 0005](0005-engine-data-layer-and-asset-loading.md) — demand-driven loading
  (the validation step this ADR names).
- [ADR 0006](0006-volume-field-settings-in-settings-layer.md) — settings-are-the-home
  precedent.
- Steven Wittens, acko.net: "I is for Intent", "Climbing Mt Effect", "Reconcile All
  The Things", "Live" — the Intent / effect / reconciliation arc this distils.
