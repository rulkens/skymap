# `?` query gates — five helpers, four read moments, no owner

Surfaced during the 2026-07-28 URL-hash-saga grill (Q9), which deliberately scoped this
out: the hash saga's blast radius is `state/` + `services/url/`, while the gates reach the
React render path, `initGpu`, and two boot hooks. Recorded here so the agreed shape isn't
re-derived.

## Current state

Four live gates, read through five helpers, at four different moments:

| gate         | helper                           | where                                                                        | when                                          |
| ------------ | -------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| `cinema`     | `isCinemaSearch(search)` (pure)  | `state/ui/buildInitialUiState.ts:42`                                         | store construction                            |
| `cinema`     | `isCinemaMode()` (live `window`) | `state/recorder/installRecorderHook.ts:79`                                   | module load                                   |
| `cinema`     | `isCinemaMode()`                 | `components/App/App.tsx:116`, `containers/TourOverlayContainer.tsx:61`       | **during render**                             |
| `perf`       | `isPerfMode()`                   | `state/perf/installPerfHook.ts:182`, `services/engine/phases/initGpu.ts:469` | module load / engine init                     |
| `gpuTimings` | `hasUrlGate('gpuTimings')`       | `services/engine/phases/initGpu.ts:469`                                      | engine init                                   |
| `tour`       | `hasUrlGate('tour')`             | `components/containers/TopBarContainer.tsx:27`                               | **module load** (`const TOUR_DEBUG_GATE = …`) |

`isCinemaSearch` / `isPerfSearch` are single-gate wrappers over `searchHasGate`;
`isCinemaMode` / `isPerfMode` add the live `window.location.search` read; `hasUrlGate` is
the generic form of the same thing. Five files where one table would do.

Two reads happen during React render (`App.tsx`, `TourOverlayContainer`), and nothing is
in the store, so no gate is reachable by a selector or settable by a test fixture.

## Agreed shape

Keep `?` and `#` as **two tables, never one**. They differ on every axis:

|                   | `?` gates             | `#` params           |
| ----------------- | --------------------- | -------------------- |
| direction         | read-only             | read **and** write   |
| cardinality       | once, at boot         | continuously         |
| meaning           | session configuration | shareable view state |
| change at runtime | requires reload       | expected             |

A unified `URL_PARAMS` table would need a `location: 'search' \| 'hash'` discriminant with
half the fields `never` for half the rows — the asymmetry-paragraph smell.

Gates need **no saga**: there is no write side and no event to drain, so they belong in
`preloadedState`.

```ts
// src/state/url/urlGates.ts
export const URL_GATES = ['cinema', 'perf', 'gpuTimings', 'tour'] as const;
export type UrlGateId = (typeof URL_GATES)[number];
export function readUrlGates(search: string): Record<UrlGateId, boolean> { … }
```

Consumers become `selectGate('cinema')`. Deletes `hasUrlGate`, `isCinemaMode`,
`isCinemaSearch`, `isPerfMode`, `isPerfSearch`, and removes the two render-time `window`
reads.

## Note

`hasDeepLink.ts`'s docblock named `?debug`, `?volumes`, and `?anchors` as gates; verified
2026-07-28 that none are read anywhere. That stale line is deleted by the hash-saga work,
so this item starts from the four real gates above.
