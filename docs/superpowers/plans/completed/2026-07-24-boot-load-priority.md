# Boot load priority — part 1: prep + the bounded asset queue

**Spec:** [`docs/superpowers/specs/completed/2026-07-24-boot-load-priority.md`](../../specs/completed/2026-07-24-boot-load-priority.md).
The spec is the source of truth for every decision; this plan only sequences the work.

**Part 2:** [`2026-07-24-boot-load-priority-body-atlas.md`](../2026-07-24-boot-load-priority-body-atlas.md)
carries Phase 3 (the body-texture atlas) plus the two closing tasks (entanglement-radar,
verification). This file was split because the combined task list is large and the atlas is a
self-contained second half. Execute part 1 fully, then part 2.

## Goal

A cold boot at tier `medium` fetches ~101.7 MB with no ordering and no bound: `evaluateRows`
fires `slot.load()` for every demanded row in array order, fully parallel, so under HTTP/2
every asset splits one pipe. This part gives the loading system the two things it lacks: a
bounded-concurrency priority queue at the `AssetSlot` fetch layer (N = 2), and an authored
`priority` integer per wiring row. Part 2 then removes the "reached a body before its texture
landed" failure with a universal low-resolution atlas.

## Architecture

`evaluateRows` stops calling `slot.load()` directly and instead enqueues onto one
`PriorityQueue<void>` owned at `state.subsystems.assetQueue`. Three edges, not two:

- `idle && demand(ctx)` enqueues,
- `idle && !demand(ctx)` drops the pending entry,
- `ready && (staleTier || release(ctx))` releases, as today.

The queue's existing dedup-by-key and replace-pending semantics make the per-frame re-run of
`evaluateRows` safe with no extra bookkeeping.

For agentic workers: REQUIRED SUB-SKILL superpowers:subagent-driven-development. Each task is
TDD where it has a test, and ends with its own scoped commit.

## Commit discipline (from the spec's Ground preparation)

Everything rides ONE PR. Prep commits (P1 to P4) land FIRST, then the feature commits, then
part 2's. Prep and feature are never conflated in a single commit even though they share a PR.
Each task below is one commit.

## Contract facts (verified against source, 2026-07-24)

- `PriorityQueue` reads `MAX_CONCURRENT_FETCHES` module-globally at
  `priorityQueue.ts:50` (import) and `:120` (the `tryStart` loop condition). Its only
  production caller is `galaxyAtlasSubsystem.ts:54`, which must stay on the default.
- `popHighestPriority` (`priorityQueue.ts:154-167`) picks the LARGEST `priority` and breaks
  ties by first-encountered map-insertion order.
- `enqueue` (`priorityQueue.ts:78-90`): in-flight key is a no-op, pending key is REPLACED.
- `AssetSlot.load` is `void` at `AssetSlot.d.ts:9` and `AssetSlot.ts:217-225`; it calls
  `void runLoad(req, myGen, controller)`. `runLoad` is already `async` and already returns on
  every terminal path (`AbortError` at `:149`, `gave-up` at `:152` and `:198`, the three
  race-checks at `:166`, `:189`, `:210`, the sleep-abort at `:160`).
- `evaluateRows` is at `reevaluateDemand.ts:86-119`; the load edge is `:97-99`, the evict edge
  `:110-112`, the per-row `try/catch` `:89-117`.
- `ASSET_WIRING` is at `assetWiring.ts:219-343`; `bodyTextureRow` at `:200-217`,
  `starCatalogRow` at `:146-155`, `pointRow` at `:110-123`.
- The engine state literal has NO `createEngineState.ts` file: the `subsystems: { ... }` literal
  lives inline in `engine.ts:385-...`. The spec's "constructed-at-createEngineState" means
  that literal.
- `EngineSubsystemHandles.d.ts:152-156` declares `_EnforceDestroyable`, which documents that
  every subsystem field satisfies `Destroyable` (`destroy(): void`). It is a declared-but-unused
  mapped type, so it does not currently error, but the convention holds: the queue gains a
  `destroy()`.
- `sceneBodyPartition.ts:44-52` defines residency as "the `bodyTextures` slot's `current()` is
  non-null". `partitionBodiesByPresentation.ts:70-108` takes `isTextureResident` injected and
  is pure; its test injects the predicate directly and is unaffected by P3.
- `texturedBodyRenderer.ts`: shared per-kind placeholders built at `:186-202`, resolved in
  `buildBindGroup` at `:303-306` as `res.maps.get(kind) ?? placeholderMaps.get(kind)!`,
  `setMap` at `:342-369`, `clearMap` at `:390-400`, `destroy` at `:444-456`.
- `earthRenderer.ts`: five per-kind placeholders as separate `let` cells at `:330-346`,
  `buildBindGroup` at `:404`, `setMap` at `:479-548` (its retirement branch destroys the cell
  it replaces), `destroy` at `:565-576`. There is NO `clearMap`.
- Direct `.load()` sites that stay OUT of the queue (spec §1 scope boundary, verified):
  `makeRunTierTransition.ts:65,72,84`, `galaxyCatalogSourceRegistry.ts:156`,
  `AssetSlot.forceReload`, `maybeLazyLoadDebugVolume.ts:31`.

## Tests: exactly four, and a standing refusal

The spec authorises four tests. They appear as tasks P1 (two of them), 1.1, and P2. Plus
repairs to two existing files.

**Do NOT add tests for any of the following. This refusal is deliberate and is part of the
plan, not an oversight** (spec "Testing", `docs/superpowers/conventions/testing.md`):

- the rank table's ordering or any individual `priority` integer (constant restatement; the
  table IS the spec),
- `ASSET_QUEUE_CONCURRENCY === 2` or the `MAX_CONCURRENT_FETCHES` default (same),
- atlas pixel correctness (needs a GPU; covered by the visual check in part 2),
- `BODY_ATLAS_LAYOUT` covering every registry body (enforced by its `Record<BodyTextureId,
  number>` type; a test would restate a compiler check),
- `atlasTileRect`'s arithmetic (a three-line formula that cannot break independently of its
  inputs).

A future implementer who adds one of these should delete it again.

---

## Phase 0 — prep

### P1: per-instance concurrency limit on `PriorityQueue`

**Files:** `src/utils/concurrency/priorityQueue.ts` (modify),
`tests/utils/concurrency/priorityQueue.test.ts` (modify)

**Contract:**

```ts
class PriorityQueue<T = ImageBitmap | null> {
  constructor(limit?: number); // defaults to MAX_CONCURRENT_FETCHES
}
```

Store the limit on the instance and read it in `tryStart` (`:120`) instead of the module
import. Keep the module import as the default value so `galaxyAtlasSubsystem.ts:54` is
untouched. Update the class docstring's "Behaviour" bullet (`:25-29`) so it stops asserting
the module constant is the bound; state that the bound is per instance and why (the asset
queue wants 2 for big one-shot boot fetches, thumbnails want 4 for many small streaming
fetches).

- [x] Repair: the existing `runs at most MAX_CONCURRENT_FETCHES tasks simultaneously` test
      (`priorityQueue.test.ts:6-30`) keeps working under the defaulted arg, but the limit is
      its subject, so construct it explicitly: `new PriorityQueue(MAX_CONCURRENT_FETCHES)`.
      The other three cases (`:32`, `:83`, `:97`) keep the bare constructor.
- [x] **Spec test 1.** Add `runs at most the constructed limit simultaneously` to the same
      file: enqueue 6 tasks on `new PriorityQueue(2)`, each gated on a promise the test
      resolves, tracking `inFlight` / `maxInFlight` the way the existing test does. Release the
      gates, `await queue.drain()`, assert `maxInFlight === 2`. Exactly 2, not
      `toBeLessThanOrEqual`: a silently-unbounded queue is the failure mode this test exists
      for, and a `<=` assertion also passes when the queue serialises everything.
- [x] **Spec test 4.** Add `pops the highest priority pending entry when a slot frees` to the
      same file: on `new PriorityQueue(2)`, enqueue 2 gated blockers to saturate it, then
      enqueue `low` (priority 1), `high` (priority 10), `mid` (priority 5) out of rank order,
      recording each fetcher's key into a `started: string[]` **at fetcher invocation** (not in
      `onResult`, so the assertion is about START order, which is what the scheduler
      controls). Release one blocker, `await queue.drain()`, assert
      `started.filter(k => !k.startsWith('blocker')) === ['high', 'mid', 'low']`.
- [x] Implement the constructor arg.
- [x] `npm test -- priorityQueue` green.
- [x] Commit (prep P1): the two files above.

### P2: `AssetSlot.load()` returns `Promise<void>` resolving after commit

**Files:** `src/@types/loading/AssetSlot.d.ts` (modify, `:9`),
`src/services/loading/AssetSlot.ts` (modify, `:217-225` and `:239-241`),
`tests/services/loading/AssetSlot.test.ts` (modify)

**Contract:**

```ts
// src/@types/loading/AssetSlot.d.ts
/** Resolves AFTER commit completes (or after any terminal early exit). Never rejects. */
load(req: Req): Promise<void>;
```

The change is `void runLoad(...)` becoming `return runLoad(...)`. This makes an existing fact
visible rather than adding behaviour: the work is already async and the slot merely declines to
say so.

**The trap this task must not miss.** The promise MUST resolve on EVERY terminal path, or an
abandoned load pins its queue slot forever and the concurrency bound becomes a permanent
deadlock rather than a scheduler. Walk each `return` in `runLoad` and confirm it resolves the
returned promise:

| Path | Line | Resolves? |
|---|---|---|
| `AbortError` from `fetchFn` | `AssetSlot.ts:149` | must |
| `give-up` from the retry policy | `:152` | must |
| sleep aborted by supersession | `:160` | must |
| first race-check (post-fetch) | `:166` | must |
| third race-check (post-wait) | `:189` | must |
| `AbortError` / `gave-up` from `commit` | `:197-199` | must |
| second race-check (post-commit) | `:210` | must |
| normal completion | `:212` | must |

Because they are all plain `return` statements inside one `async function`, returning the
promise satisfies every row. The task is to VERIFY that and record it in the docblock, not to
add machinery.

Also: `forceReload()` (`:239-241`) calls `this.load(lastRequest)`, which now returns a promise
it ignores. Mark it `void this.load(lastRequest)` so the fire-and-forget is explicit. Same for
any caller in the scope-boundary list above that has no reason to await.

- [x] **Spec test 3.** Add `load() resolves after commit, not after fetch` to
      `AssetSlot.test.ts`. Build a slot whose `fetch` resolves immediately and whose `commit`
      returns a promise the test controls. Call `load(...)`, attach
      `.then(() => { settled = true; })`, flush microtasks
      (`await new Promise((r) => setTimeout(r, 0))`), assert `settled === false` AND that
      `commit` has been entered (so the test is pinned on commit, not on a race that has not
      started). Resolve the commit deferred, `await` the load promise, assert
      `settled === true`. Without this the queue would free a slot mid GPU upload and the bound
      would be a lie under load.
- [x] Change the type and the implementation; extend the `load` docblock in the `.d.ts` with
      the resolve-on-every-terminal-path contract.
- [x] `npm test -- AssetSlot` green; `npm run typecheck` clean (no test asserts `load()`
      returns `undefined`; verified 2026-07-24, but re-check).
- [x] Commit (prep P2): the three files above.

### P3: residency is a rendering fact, not a loading fact

**Files:** `src/@types/rendering/TexturedBodyRenderer.d.ts` (modify),
`src/services/gpu/renderers/bodies/texturedBodyRenderer.ts` (modify),
`src/services/engine/frame/sceneBodyPartition.ts` (modify)

**Contract:**

```ts
// src/@types/rendering/TexturedBodyRenderer.d.ts
/** True iff this (body, kind) has ANY texture bound other than the shared 1x1 placeholder. */
hasMap(bodyId: BodyTextureId, kind: TextureKind): boolean;
```

`sceneBodyPartition.ts:49-52` currently infers "this body has a texture" from the `bodyTextures`
slot's `current()`. Part 2's atlas makes the two diverge (texture present, slot idle), and the
naive `atlasReady || slotReady` fix would be a second branch on one discriminant. Repoint the
predicate at the renderer:

```ts
isTextureResident: (id) =>
  state.gpu.texturedBodyRenderer?.hasMap(id as BodyTextureId, 'surface') ?? false,
```

Rewrite the `sceneBodyPartition` module docblock's residency paragraph (`:11-16`) accordingly:
the fact is "is a real texture bound on the renderer", and the loading system is no longer
consulted for it.

At this point `hasMap` reflects only `res.maps`, so behaviour is unchanged (a committed slot
is exactly a body with a committed map). Part 2 widens what counts as "bound" to include the
atlas tile, and this predicate picks that up for free.

- [x] No new test. `partitionBodiesByPresentation` is pure and injects the predicate, so its
      existing test is untouched; `sceneBodyPartition` is a two-line adapter whose only
      behaviour is the wiring a compiler check already covers.
- [x] Implement `hasMap` (it reads the per-body `maps` map; after P4a it reads the committed
      layer OR a per-body placeholder override, which is the point).
- [x] `npm test -- partitionBodiesByPresentation` green; `npm run typecheck` clean.
- [x] Commit (prep P3): the three files above.

### P4a: per-(body, kind) placeholder resolver in `texturedBodyRenderer`

**Files:** `src/services/gpu/renderers/bodies/texturedBodyRenderer.ts` (modify),
`tests/services/gpu/renderers/bodies/texturedBodyRenderer.test.ts` (repair only if broken)

> ⚠️ **Needs the user's eyes** as part of part 2's visual pass. The mock-device tests prove
> the bind-group plumbing; they cannot prove a planet still looks right.

Today `placeholderMaps` is keyed by KIND only (`:186`) and resolved in `buildBindGroup` as a
two-term chain `res.maps.get(kind) ?? placeholderMaps.get(kind)!` (`:305`). Part 2's atlas
tile is per-BODY, and the naive fix is a third term in that chain. Replace the shared map with
a per-(body, kind) resolver so the chain stays two-term:

```
res.maps.get(kind) ?? placeholderFor(bodyId, kind)
```

**Shape:**

- Keep the shared 1x1 per-kind textures as the DEFAULT layer (built exactly as now, `:186-202`).
- Add a per-body override layer: a `placeholders: Map<TextureKind, GPUTexture>` on
  `BodyResources` (alongside `maps`), empty by default.
- `placeholderFor(bodyId, kind)` returns the body's override if present, else the shared 1x1.
- `buildBindGroup` needs the body id. It is currently called with a `Pick<BodyResources, ...>`
  (`:291-293`) from both `resourcesFor` (`:328`) and the three swap paths (`:368`, `:399`,
  `:424`). Thread `bodyId` through as a parameter.
- `destroy` (`:444-456`) must free the per-body override textures too, or part 2 leaks 13 of
  them per engine teardown.

**Why this is prep and not part of the feature.** It makes eviction correct BY CONSTRUCTION:
`clearMap` (`:390-400`) already rebuilds the bind group after deleting the committed map, so
once part 2 seeds an override, a cleared kind falls back through the resolver to the atlas tile
rather than 1x1 grey. The known landmine (a slot reading `ready` while its GPU texture has been
destroyed) cannot reproduce. The same two-layer shape is what prevents an out-of-order atlas
commit overwriting an already-landed hi-res map, with no slot-state peek in the commit path.

- [x] No new test: this task changes no observable behaviour (no override is ever seeded yet).
      The public entry point that seeds one lands in part 2 with its own visual check.
- [x] Refactor to the two-layer resolver; update the module header's "Placeholder posture"
      paragraph (`:19-28`) to describe the per-(body, kind) resolver and why the chain stays
      two-term.
- [x] `npm test -- texturedBodyRenderer` green. Repair only what breaks; add nothing (the
      existing `clearMap frees a body kind and reverts it to the placeholder` and
      `the normal placeholder is the linear flat-normal texel` cases should both still pass).
- [x] Commit (prep P4a): the files above.

### P4b: placeholder layer in `earthRenderer`

**Files:** `src/services/gpu/renderers/bodies/earthRenderer.ts` (modify),
`tests/services/gpu/renderers/bodies/earthRenderer.test.ts` (repair only if broken)

> ⚠️ **Needs the user's eyes** as part of part 2's visual pass.

Earth has no `clearMap` and its texture is never evicted
(`bodyTextureSlotRegistry.ts:43-47`), so this site buys only the out-of-order-arrival
protection, not the eviction correctness P4a buys. It still needs the two-layer split, because
`setMap` (`:479-548`) DESTROYS the cell it replaces: without a separate placeholder layer, an
atlas tile arriving after the hi-res Blue Marble would destroy the real texture.

**Shape:** the five `let` cells at `:330-346` (`texture`, `materialTexture`, `nightTexture`,
`normalTexture`, `cloudTexture`) plus `setMap`'s five-branch retirement ladder (`:531-546`)
collapse into two per-kind maps:

- `committed: Map<TextureKind, GPUTexture>` written by `setMap`,
- `placeholders: Map<TextureKind, GPUTexture>` seeded at construction with the five 1x1s
  `createPlaceholder` already builds.

`buildBindGroup` (`:404`) resolves each binding as `committed.get(kind) ?? placeholders.get(kind)!`.
`setMap` destroys only a prior COMMITTED texture for that kind, never a placeholder. `destroy`
(`:565-576`) frees both maps.

This also deletes the five-branch `if/else` ladder in `setMap` and the parallel five-branch
`label` ternary (`:497-506`); derive the label from `kind`. Keep the binding numbers where
they are (2 surface, 3 material, 4 night, 5 normal, 6 clouds) by driving `buildBindGroup` from
a small kind-to-binding table, mirroring `texturedBodyRenderer`'s `KIND_CFG`.

- [x] No new test (same reasoning as P4a; the seeding entry point lands in part 2).
- [x] Refactor; update the module header's "Untextured behaviour (placeholder texture)"
      section (`:37-61`) to describe the committed-over-placeholder resolution.
- [x] `npm test -- earthRenderer` green; repair only what breaks.
- [x] Commit (prep P4b): the files above.

---

## Phase 1 — the bounded asset queue

### 1.1: `drop(key)` and `destroy()` on `PriorityQueue`

**Files:** `src/utils/concurrency/priorityQueue.ts` (modify),
`tests/utils/concurrency/priorityQueue.test.ts` (modify)

**Contract:**

```ts
class PriorityQueue<T = ImageBitmap | null> {
  /** Remove a PENDING entry by key. An in-flight entry is untouched. No-op if absent. */
  drop(key: string): void;
  /** Clear every pending entry and resolve any outstanding drain(). In-flight tasks run out. */
  destroy(): void;
}
```

`drop` is a `pending.delete(key)`. It must NOT touch `inFlight`: responses are not resumable
and the spec's "never preempt" decision (Q11) is explicit. `destroy()` exists because
`EngineSubsystemHandles` fields satisfy `Destroyable`
(`EngineSubsystemHandles.d.ts:152-156`); it must also fire `drainResolvers` so a pending
`drain()` cannot hang past teardown.

- [x] **Spec test 2.** Add `a dropped entry never starts` to `priorityQueue.test.ts`: on
      `new PriorityQueue(2)`, enqueue 2 gated blockers to saturate it, enqueue a third entry
      whose fetcher is a `vi.fn<() => Promise<null>>()`, `queue.drop('third')`, release the
      blockers, `await queue.drain()`, assert the third fetcher was never called. Silent and
      easy to regress, and it is what stops a body texture fetching minutes after the camera
      left.
- [x] Implement `drop` + `destroy`.
- [x] `npm test -- priorityQueue` green.
- [x] Commit (feature): the two files above.

### 1.2: `ASSET_QUEUE_CONCURRENCY` + the `assetQueue` subsystem field

**Files:** `src/utils/concurrency/assetQueueConcurrency.ts` (new),
`src/@types/engine/handles/EngineSubsystemHandles.d.ts` (modify),
`src/services/engine/engine.ts` (modify, the `subsystems: { ... }` literal at `:385`)

**Contract:**

```ts
// src/utils/concurrency/assetQueueConcurrency.ts  (one symbol per file)
export const ASSET_QUEUE_CONCURRENCY = 2;

// src/@types/engine/handles/EngineSubsystemHandles.d.ts
assetQueue: PriorityQueue<void>;
```

Non-null, constructed eagerly in the state literal alongside `scheduler` / `fades` (no GPU
dep, and `evaluateRows` can fire before the GPU IIFE finishes). Add it to the eager list in
that file's "Why some fields are null at construction" docblock (`:11-14`).

The constant's own docblock carries the N = 2 rationale from the spec (Q12): under HTTP/2 a
lower N is better for time-to-first-visible; N = 1 idles the wire during `.bin` parse, N = 4
reintroduces the pipe-splitting being removed. State that this is a DIFFERENT number from
`MAX_CONCURRENT_FETCHES` on purpose (a handful of big one-shot boot fetches vs many small
streaming thumbnail fetches) and that the two queues are deliberately not coordinated (spec
"Assumed, not enforced": at the Earth boot view the galaxy point clouds are faded out, so the
thumbnail queue is idle exactly when boot contention matters).

Wire `state.subsystems.assetQueue.destroy()` into `engine.destroy()` next to
`state.subsystems.scheduler.destroy()` (`engine.ts:753`).

- [x] No test (a constant and a field assignment; `ASSET_QUEUE_CONCURRENCY === 2` is exactly
      the constant restatement the spec rules out).
- [x] `npm run typecheck` clean.
- [x] Commit (feature): the three files above.

### 1.3: `evaluateRows` enqueues instead of loading, and drops on lost demand

**Files:** `src/services/engine/wiring/reevaluateDemand.ts` (modify, `:86-119`),
`tests/services/engine/wiring/reevaluateDemand.test.ts` (repair)

**The load edge becomes:**

```ts
// idle && demand(ctx)
queue.enqueue({
  key: String(row.key),
  priority: -row.priority,
  fetcher: async () => {
    if (slot.state().kind !== 'idle') return;
    await slot.load(row.req(state.tier));
  },
  onResult: () => {},
});

// idle && !demand(ctx)
queue.drop(String(row.key));
```

**Four traps. A task that misses any one of them ships a silently broken feature.**

1. **The negation is load-bearing.** `popHighestPriority` pops the LARGEST `priority`
   (`priorityQueue.ts:154-167`) while the rank table reads lower-is-first, so the enqueue site
   negates: `priority: -row.priority`. Getting this backwards fetches the whole 101.7 MB in
   exactly reverse order with every test still green. Do NOT hide the negation inside the
   queue: it still serves thumbnails, where larger-on-screen-first is the natural reading.
   Put a comment at the negation saying so.
2. **The drop edge is a THIRD edge, not a variant of the evict edge.** A queued-but-unstarted
   slot is still `idle`, so `release()` is never called for it and the existing `ready`-gated
   branch (`:110-112`) cannot see it. Without the drop, a body texture queued as the camera
   approached still fetches minutes after the camera left. A real `release()` on a `ready` slot
   reaches the same drop on the next pass, since it returns the slot to `idle` with demand
   false. Structure the loop as `if (idle && demand) … else if (idle) drop … else if (ready
   && …) release`.
3. **The idle guard is re-evaluated at START time.** `evaluateRows` checks it to decide whether
   to enqueue; the closure checks it AGAIN because the queue introduces a gap during which a
   direct `.load()` (a tier transition, a companion load) may have claimed the slot. This is
   one predicate evaluated at two moments, not two copies of a policy. Say that in the comment.
4. **`req` is computed at START time too.** `state` is live, so a tier change while an entry
   sits pending yields the request for the tier in force when it actually runs, not the one
   current when it was queued.

**Key space:** `String(row.key)`. `AssetKey` is a union of numeric `Source` codes and string
keys; no string `AssetKey` is a bare numeral, so the two spaces cannot collide.

Update the `reevaluateDemand` module docblock: the "single place that turns the declarative
wiring registry into actual `slot.load()` calls" now turns it into ENQUEUES, and the docblock
should carry the drop-edge rationale (trap 2) since that is the non-obvious part.

**Repairs to `reevaluateDemand.test.ts`** (verified against the current file, 2026-07-24):

- `makeState` (`:75-90`) and `makeBodyState` (`:261-273`) build a cast `EngineState` with no
  `subsystems` bag. `state.subsystems.assetQueue` would throw, be swallowed by the per-row
  `try/catch`, and turn every assertion into a silent failure. Both helpers must add
  `subsystems: { assetQueue: new PriorityQueue<void>(ASSET_QUEUE_CONCURRENCY) }`, constructed
  PER CALL so tests do not share a queue.
- The `row()` helper (`:93-100`) and the `earthRow` / `uranusRow` literals (`:245-258`) must
  gain `priority` now that the field is required (Phase 2 makes it required; if Phase 2 lands
  after this task, add it here anyway so the two orders both compile). Any value; use `0`.
- Every test currently drives at most 2 demanded rows, so the first N closures still start
  synchronously inside `enqueue` (the closure runs up to its first `await`, and `slot.load(...)`
  is invoked before that `await`). The existing synchronous `expect(slot.load).toHaveBeenCalled…`
  assertions therefore hold unchanged. Verify this rather than assuming it; if any case ever
  drives more than `ASSET_QUEUE_CONCURRENCY` demanded rows, make it `async` and
  `await state.subsystems.assetQueue.drain()` before asserting.
- Add nothing else to this file. The enqueue-vs-load substitution is covered by the existing
  cases; the queue's own behaviour is covered by P1 and 1.1.

- [x] Repair the two state helpers and the row literals; confirm the suite is green BEFORE the
      production change (it should be, since the queue is unused).
- [x] Implement the three-edge loop.
- [x] `npm test -- reevaluateDemand` green.
- [x] Commit (feature): the two files above — plus four further test files the plan did not
      anticipate. `demandTable`, `createSyntheticFallback`, `engineSliceDispatches` and
      `wireSlots` all drive `reevaluateDemand` over a cast `EngineState` with no `subsystems`
      bag, and all but the last also assert on `load` spies synchronously across more than
      `ASSET_QUEUE_CONCURRENCY` demanded rows. Each gained a per-state queue and, where the
      assertion counts rows rather than concurrency, an `await …assetQueue.drain()`.
      `demandTable`'s `firedKeys` additionally re-runs the loop to a fixpoint, because
      `famousMeta` demands on the Famous row having STARTED and the queue defers that start
      past the pass that enqueued it — the frame loop picks it up next frame in production.

---

## Phase 2 — the `priority` field

### 2.1: `priority` on `AssetWiringRow` plus the concrete integers

**Files:** `src/@types/loading/AssetWiringRow.d.ts` (modify),
`src/services/engine/wiring/assetWiring.ts` (modify, `:110-343`)

**Contract:**

```ts
// src/@types/loading/AssetWiringRow.d.ts
/** Fetch rank. LOWER is fetched first. Payload size is folded in by the author. */
priority: number;
```

Required, not optional: a new row must state a rank rather than silently inheriting one. The
docblock should carry the spec's axis (relevance to the target scale rung, with payload size
folded in by hand because a declared `expectedBytes` would go stale the moment a tier shifts)
and point at the enqueue site's negation so a reader of the type is not surprised by
lower-is-first.

**The authored integers.** Every row in `ASSET_WIRING` gets exactly one:

| `priority` | Row |
|---|---|
| 0 | `'bodyTextureAtlas'` (part 2; not yet a row at this task) |
| 5 | `Source.Synthetic` |
| 10 | every `bodyTextureRow` (all `ALL_BODY_TEXTURE_KEYS`, ring included) |
| 20 | `Source.FamousGalaxy` |
| 21 | `'famousMeta'` |
| 30 | `'structureCatalog'` |
| 31 | `'constellations'` |
| 40 | `Source.TwoMRS` |
| 50 | every `starCatalogRow` |
| 60 | `Source.SDSS` |
| 61 | `Source.Milliquas` |
| 62 | `Source.Glade` |
| 63 | `Source.DesiDeep` |
| 64 | `Source.DesiSgw` |
| 65 | `Source.DesiWedge` |
| 70 | `'mcpm'` |
| 80 | `'filaments'` |
| 81 | `'flow'` |
| 82 | `'cf4Density'` |
| 90 | `'pgcAlias'` |

`pointRow(source)` currently takes only `source` (`:110`); it needs the priority passed in,
since the eight galaxy rows do not share one rank. `bodyTextureRow` and `starCatalogRow` each
return a constant rank, so they can hard-code theirs.

**The rank-6 trap, as an explicit step.** 60 / 61 / 62 / 63 / 64 / 65 must be DISTINCT
integers. `popHighestPriority` breaks ties by first-encountered, and `ASSET_WIRING`'s array
order is SDSS, 2MRS, GLADE, Milliquas, DesiDeep, DesiWedge, DesiSgw (`:221-228`). Equal ranks
would therefore give GLADE (26 MB) before Milliquas (12.8 MB), the exact large-before-small
order the spec's small-to-large intent forbids. Note also that the wiring array's DESI order is
Deep, Wedge, Sgw while the RANK order is Deep (1.6 MB), Sgw (2.4 MB), Wedge (10.3 MB): the two
orders differ on purpose, and the integers are what decide.

Add a short comment block above `ASSET_WIRING` recording the two judgement calls the spec makes
explicit, because both look wrong at a glance:

- Famous galaxies (20) outrank the star catalog (50) because the famous catalog is the only
  exemption from `surveyDeepZoom` in the codebase (`pointSpritesLayer.ts:141-143`, mirrored on
  the pick path), so famous objects stay visible at close-in scales where the bulk surveys are
  gone.
- 2MRS (40) outranks the star catalog (50) even though 2MRS is invisible at the Earth boot view
  while the stars are fully visible. This orders invisible data ahead of visible data, costs
  about a second, and buys local structure being resident the moment the camera pulls back.
  Accepted knowingly.

- [x] No test. The rank table IS the specification; a test asserting its order restates a
      constant (`testing.md`). See the standing refusal at the top of this file.
- [x] Add the field to the type with its docblock.
- [x] Thread `priority` through `pointRow`; set every row's integer per the table.
- [x] `npm run typecheck` clean (the required field makes a missed row a compile error, which
      is the whole point of not making it optional).
- [x] `npm test` full pass.
- [x] Commit (feature): the two files above.

---

## Continue in part 2

[`2026-07-24-boot-load-priority-body-atlas.md`](2026-07-24-boot-load-priority-body-atlas.md)
carries Phase 3 (the body-texture atlas: build emission, generated layout, fetcher, slot wiring,
crop-commit) and the two closing tasks. Do not run the entanglement-radar or verification tasks
until part 2's tasks have landed: they are scoped to the FINISHED diff.

## Out of scope (each already has a backlog entry; see the spec)

- Scale-gated asset demand, the larger win (~68 MB of the ~101.7 MB draws nothing at the Earth
  boot view). This plan reorders what is fetched; that gate reduces what is fetched.
- Filaments and flow scale bands.
- `famous_stars_meta.json`'s unconditional boot fetch.
- The non-blocking font atlas (~300 KB of serial head-of-line delay inside `initGpu`).
- Routing the tier-transition fan-out through the queue.
- Body-texture store consolidation across renderers project-wide.
