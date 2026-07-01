# ADR 0008: The Effects-Layer Vehicle is typed-redux-saga

- **Status:** Accepted
- **Date:** 2026-06-30
- **Deciders:** Alexander Rulkens
- **Tags:** engine, state-management, architecture, effects
- **Resolves:** [ADR 0007](0007-intent-centric-state-and-effects.md) — the "Open question: the effects-layer vehicle" left open there (RTK listener middleware vs. typed-redux-saga).
- **Related:** [`docs/superpowers/conventions/intent.md`](../superpowers/conventions/intent.md) (the lens ADR 0007 made binding); [ADR 0001](0001-fade-ownership.md) (fade-_triggering_ relaxed into the effects layer by ADR 0007).

## Context

ADR 0007 adopted intent-centric state with an **explicit effects layer**: reactive
consequences of Intent — demand-driven loads, GPU uploads, fade-_triggering_,
tier-switch reloads, tour orchestration — live in one effects layer rather than
scattered across setters. It settled the _principle_ (effects react to Intent, in one
home) but explicitly deferred the _vehicle_, naming two candidates:

- **RTK + `createListenerMiddleware`** — zero new dependency beyond RTK, async/await (no
  generators), `cancelActiveListeners` for the `takeLatest` semantics tier-switching
  needs. Lightest machinery; the Redux team's recommended default.
- **typed-redux-saga** — one battle-tested effects system with best-in-class
  cancellation/sequencing and the TS-inference gap closed by the `typed-redux-saga`
  wrapper. Costs a dependency and the generator paradigm.

The effects layer has since been built out incrementally — selection (#350),
settings→RTK (#345), camera (#357), the engine slice (#380), tier-switching, tours — and
in doing so the vehicle question was answered in code. This ADR records the decision
that shipped, closing ADR 0007's open question.

## Decision

**The effects layer's vehicle is `typed-redux-saga` (over `redux-saga`).**

The store wires it the conventional way (`src/store/createAppStore.ts`): a
`redux-saga` middleware created with `createSagaMiddleware()`, concatenated onto RTK's
default middleware, with `sagaMiddleware.run(mainSaga)` starting a single root saga.
Effects are authored as `typed-redux-saga` generators:

- **One root saga composes feature watchers.** `rootSaga.ts`'s `mainSaga` `all([...])`s
  the forked feature watchers; new effects add a watcher to that composition, not a new
  middleware registration.
- **Watchers live beside their slice.** `src/store/effects/` for store-wide effects
  (`watchFadesSaga`, `watchWakeSaga`, `watchBiasBakeSaga`, `watchFlowReseedSaga`) and
  `src/state/<feature>/watch*Saga.ts` for feature-local ones (selection, tier, camera,
  selection-rows). The naming is uniform: a watcher is `watch<Thing>Saga`.
- **Engine handles cross the boundary via saga context, not imports.** Non-serializable
  dependencies (the engine subsystem handles the effects need to drive) are injected
  through `sagaMiddleware.setContext` and read with `getContext`, keeping the store a
  plain state container and Intent serializable per ADR 0007 §5.
- **Cancellation/sequencing uses saga primitives.** `takeLatest`/`takeEvery` for
  watcher fan-out, `race`/`take`/`cancel`/`fork` for tour interruption and pausable
  dwell, `call`/`delay` for timed cues.

House conventions that fell out of this and are now binding for effects code:
unbounded watcher loops use `while (true)`, not `for (;;)`; saga-context reads name the
handle they pull; the `SagaContext` surface is kept as small as possible (effects prefer
reactive Intent — a `put` plus an existing watcher — over a new imperative context
method).

**What this does NOT change:**

- ADR 0007's principle, boundary (Intent vs. derived vs. resource), and the
  one-store/single-write-path rule are untouched; this only names the mechanism.
- The **tour timeline** remains a separate engine-land concern that dispatches Intent
  patches into the store (ADR 0007); its own sequencing happens to be authored in sagas
  too, but that is an independent choice, not mandated by this ADR.
- Fade _opacity_ stays derived per-frame State; only fade-_triggering_ is an effect
  (`watchFadesSaga`), exactly as ADR 0007 amended ADR 0001.

## Consequences

### Positive

- One effects model across the whole state layer — selection, tier, camera, fades,
  wake, bias, flow, and tours all read the same way. No second mechanism to learn or to
  keep consistent with the first.
- Cancellation and sequencing — the hard part of tier-switching (`takeLatest`) and tour
  interruption (`race`/`cancel`) — use a system designed for exactly that, rather than
  hand-rolled abort tracking.
- `typed-redux-saga` closes the historical TS-inference gap that was the main argument
  against plain `redux-saga`, so effects are fully typed at the yield site.

### Negative

- A runtime dependency (`redux-saga` + `typed-redux-saga`) and the generator paradigm as
  a second async model alongside React's async/await. This was the explicit cost ADR
  0007 flagged; it is accepted in exchange for the cancellation/sequencing story.
- Sagas tend to pull orchestration into the store layer. Mitigated by the small-context
  rule (engine handles injected, not imported) and by preferring reactive `put`s over
  imperative context methods — but it remains a force to watch in review.

### Neutral / forward-looking

- The RTK listener-middleware alternative is **not** foreclosed in principle for a future
  isolated effect, but the default for new effects is a saga watcher composed into
  `mainSaga`, for consistency. A second mechanism should clear a real bar (a concrete
  case sagas serve badly), not be reached for by preference.

## References

- [ADR 0007](0007-intent-centric-state-and-effects.md) — Intent-Centric State with an
  Explicit Effects Layer (the open question this ADR closes).
- `src/store/createAppStore.ts`, `src/store/rootSaga.ts` — the middleware wiring + root
  saga composition.
- `src/store/effects/`, `src/state/*/watch*Saga.ts` — the shipped feature watchers.
