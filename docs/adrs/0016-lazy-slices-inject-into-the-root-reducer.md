# ADR 0016 — Lazy Chunks Inject Their Slices into the App's Root Reducer

- **Status:** Accepted
- **Date:** 2026-11-10
- **Decision-makers:** project owner, Claude
- **Supersedes:** —
- **Superseded by:** —
- **Related:** `docs/grill-sessions/clip-studio-2026-11-07.md` (Q8, Q26–Q28),
  `docs/superpowers/plans/completed/2026-11-10-clip-studio-package.md` (A3), `packages/studio/README.md`

## Context

The clip studio ships as a lazy chunk behind `#studio=<clipId>` (Q8), written as production code
with an RTK slice from its first commit (Q26). Q26 left open where that state lives. The studio is
a takeover (Q27): it runs under the app's saga middleware, reads the app's saga context (selection
resolver, camera runtime), dispatches the app's takeover and clock actions, and later drives the
engine's seams. Its state must exist only once the chunk loads, and the main chunk must not import
the package to make room for it.

The root reducer was a static `combineReducers` map, so any new route meant an edit in
`src/store/rootReducer.ts` and an import of the slice into the main chunk.

## Decision

**The root reducer is `combineSlices(...)` over the same static routes, and a lazy chunk calls
`rootReducer.inject(slice)` once, when its code first runs.** It reads its state through
`slice.injectInto(rootReducer)` selectors, which return the slice's `initialState` until its first
action lands, so no component or saga ever sees `undefined`.

The app's `RootState` stays `ReturnType<typeof rootReducer>` over the static routes and knows
nothing of injected slices. A lazy chunk owns its state type; its selectors take
`RootState & { [route]?: SliceState }`, which every app `RootState` satisfies, so its components
still read through `src/store/hooks.ts`.

Rejected: a store owned by the chunk. It would need a second saga middleware with its own context
and cross-store syncing for every takeover and clock action, where RTK 2's injection is the stock
answer and `combineSlices` already composes the settings root (`combinedSettingsReducer.ts`).

## Consequences

### Positive
- A lazy chunk adds state with no edit to `src/store/` and no import into the main chunk.
- One store, one saga middleware, one saga context: the chunk's sagas run beside the app's.

### Negative
- An injected slice is invisible to the app's types; reading it means going through its own
  selectors, never `state.<route>` from app code.
- Injection is permanent for the page's life: a closed studio's draft stays in the store (which Q28
  wants, memory-only drafts that survive Close).

### Neutral / forward-looking
- RTK's serializable and immutable dev checks walk injected state and actions too, so a lazy slice
  is held to the same plain-data rule as the static ones.
- Preloaded state and the static routes are unchanged; `createAppStore` needed no edit.

## References

- RTK 2 `combineSlices` and `injectInto`
- `tests/store/rootReducer.test.ts` (an injected slice reads `initialState`, then its own state)
