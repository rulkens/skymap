# `useStructureMemberCount` honest invalidation

> **Backlog item** · `deferred` · area: Engine & State
> **Promote to:** folds into the per-type stores / demand-driven loading work (memory `project_data_layer_redesign`).

## Problem

`src/hooks/useStructureMemberCount.ts` takes `sourceCounts` + `tier` but its body never reads them — they're pure **memo tripwires** standing in for "the engine's catalog buffers changed." Its real dependency is `handle.sources.getCloud(source)` — _live GPU catalog state_, not store state — which is why it can't be a plain selector.

## Current state (verified 2026-06-29)

The hook still lists `[selected, tier, sourceCounts, visibleSourceMask, engineHandleRef]` as its memo deps; `sourceCounts` is read from the engine slice via `selectSourceCounts`, and the docblock explicitly calls them "intentional recompute triggers" while the body reads live catalogs through `handle.sources.getCloud`. The engine-state-into-store pass made the _inputs_ store-derived (shedding App-level prop-threading) but did **not** make the tripwire honest.

## Direction

Invalidate on a real catalog-generation signal (or fold the count into a selector/saga). This belongs to the per-type stores / demand-driven loading work — the catalog _contents_ need to live in the store before the proxy can be replaced. Deliberately kept out of the 2026-06-28 state-relocation pass to avoid braiding two independent refactors.
