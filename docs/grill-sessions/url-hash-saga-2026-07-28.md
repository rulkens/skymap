# Grill Session: `useUrlSync` → hash sagas — 2026-07-28

Source: user request following PR #507 (`feat(input): global shortcuts → shared
keyboard-events saga`), which promoted `useKeyboardShortcuts` + `watchTourKeyboardSaga`
into one declarative table plus an always-on saga. The ask: do the same for
`useUrlSync`.

`useUrlSync` is the last React hook holding a bidirectional bridge between the DOM
and the store. It owns `window.location.hash`, dispatching on `hashchange` and
writing via `pushState` on store change. This session works out what that becomes
when the hook is deleted and the store owns both directions.

---

## Q1: What triggers the URL write?

**The question:** The read side is a straightforward `eventChannel` drain, the same
shape as `createKeyboardListener`. The write side is not. `useEffect(..., [focused,
time, orientation])` gets "run on change" free from React's dependency diffing; a
saga has no equivalent. So what wakes the write?

**Considerations:**

- **Option A (drain every action):** `while (true) { yield* take('*') }`, recompute
  the desired body, skip if unchanged. The existing `matches` check already makes
  the write idempotent, so correctness never depends on triggering precisely.
  Deletes three parallel hand-maintained lists (`DesiredHashInput`'s fields, the
  `useAppSelector` calls, the dependency array) in favour of `HASH_PARAM_SOURCES`
  as sole authority. Cost: roughly 5–6 allocations and one DOM property read per
  dispatched action, on a path that carries 2–4 actions per frame during camera
  motion (`commitCameraPose` at `runFrame.ts:348`, `engineBodyDistanceReported`,
  `engineScaleChanged`). The `t` row's `new Date(...).toISOString()` and the
  `window.location.hash` read are the expensive parts. Mitigable by memoizing each
  row's `write` with `createSelector`, but that is machinery bought to pay for a
  design choice.
- **Option B (sources declare their triggers):** each row carries a `writesOn` list
  of action creators (or a predicate); the saga uses `takeEvery(predicate)`.
- **Option C (selector channel):** a `store.subscribe`-backed `eventChannel` emitting
  when a derived tuple changes, faithfully rebuilding React's dependency diffing.
  New reusable util, needs the store in saga context, and still requires a list of
  values to diff — the dependency array relocated, with the same silent-failure mode
  as B.

**Initial (wrong) analysis, recorded so it is not repeated:** B was first rejected
on the grounds that `selectFocusedFocusable` is derived two slices and three
indirections deep (selection refs → `watchSelectionRowsSaga` → selectionRows →
memoized selector), so enumerating its triggers meant listing `catalogLoaded`,
`engineSourceCountReported`, and every selection-slice write, with any omission
yielding a silently stale URL.

That trace ran upstream past a funnel. `selectFocusedFocusable` derives from
`selectionRows.focus` **only**, and the sole writer of that slot is
`setSelectionRow` (`watchSelectionRowsSaga.ts:46`). Every resolution path — late
catalog, star-count pulse, direct ref write — reaches the URL _through_ it. The
enumeration collapses to three entries.

There is also direct house precedent: `watchSelectionRowsSaga` is itself keyed on an
explicit enumerated set and owns the tradeoff in its docblock ("Keyed on the COMPLETE
resolvability set … so the cache can't hand-sync-drift"; "Every action that writes a
selection ref MUST appear here, or its slot's row goes stale").

The resulting sets are small and closed:

```ts
focus: [requestFocus, clearSelection, setSelectionRow];
t: (a) => a.type.startsWith(`${timeRoute}/`); // all six reducers re-anchor
orientation: [setOrientation, mergeSnapshot]; // mergeSnapshot = tour scene restore
```

**Decision:** Option B. `takeEvery('*')` reads as a code smell, and the actions that
change the URL are in fact known. Nothing in the 60Hz `commitCameraPose` /
`engineBodyDistanceReported` stream matches the predicate, so the frame path is
untouched and the whole memoization question disappears with it. Each `writesOn`
list lives in the row next to the `write` it guards, so adding a hash param is still
one table row.

---

## Q2: Should "is this a deep link?" be derived from the source table?

**The question:** `buildInitialUiState` runs at store construction and calls
`hasDeepLink({ hash, search })` to decide whether to suppress the splash. That is a
second, hand-rolled reading of the same hash the saga is about to parse — and it
knows only about `focus`.

Concretely, `hasDeepLink.ts:45` matches the literal `'#focus='`. It has already
drifted twice: arriving on `#t=2026-01-01T00:00:00Z` or `#orientation=galactic` shows
the splash over a link expressing perfectly specific intent.

**Considerations:**

- **Option A (derive from the table):** each source declares whether its presence
  counts as user intent — `focus: true`, `t: true`, `orientation: false` (a pole
  preference is a view setting, not "I came here for this"). `hasDeepLink`'s hash half
  becomes `parseHashParams(body)` intersected with the intent-bearing keys. A new hash
  param declares its splash behaviour in the same row that declares everything else
  about it.
- **Option B (leave it alone):** cheapest, but keeps a second hash parser that drifts
  every time a source is added, as it already has.
- **Option C (delete `hasDeepLink`; let the saga tell the splash):** the saga reads
  the hash and also dispatches `deepLinkDetected()`. Wrong shape: the splash decision
  must be made in `preloadedState` before React renders, and the saga's first read
  happens after store construction. Result would be a splash flash.

**Decision:** Option A. Same move as Q1 — one table, no parallel list. C is ruled out
by boot ordering; B is the status quo that has already failed twice.

**Implementation risk to verify:** `state/ui/buildInitialUiState.ts` importing
`state/url/hashParamSources.ts` pulls the action and selector graph into store
construction. `uiSlice` self-seeds from `buildInitialUiState()`, so check for an
import cycle (`uiSlice` → `buildInitialUiState` → `hashParamSources` → the other
slices) before committing to the direct import.

---

## Q3: Does a source dispatch, or return actions?

**The question:** `HashParamSource.read` currently takes `dispatch` and returns
`void`. Its docblock defends this explicitly: "the set of dispatches a source needs
(`requestFocus` vs `clearSelection`) is per-source, so returning a single shape would
over-constrain future rows."

**Considerations:**

- **Option A (return `readonly Action[]`):** PR #507 faced identical variability in
  `KEYBOARD_SHORTCUTS` — `escape` dispatches two actions, gated keys dispatch zero —
  and answered it with `run(state) => Action | Action[] | null` plus `asArray`. So the
  stated objection is empirically falsified: `Action[]` covers one, two, and zero.
  Makes the saga a pure pump and every source a pure function testable without a mock
  dispatch.
- **Option B (keep `dispatch`):** zero churn, but leaves a `void`-returning table in a
  codebase that just standardised the opposite shape for the sibling table.

**The apparent obstacle, and why it isn't one:** the `t` row calls
`enterManualPausedAt(dispatch, instant)`, which samples `performance.now()` once and
threads it through two dispatches. Its docblock calls that invariant "structurally
impossible for a caller to break" precisely because the sample is inside the helper.
Returning actions preserves it exactly:

```ts
export function manualPausedAtActions(instant: Date): readonly Action[] {
  const nowMs = performance.now(); // still sampled once, still inside
  return [setSimDays({ simDays: unixMsToJulianDays(instant.getTime()), nowMs }), pause({ nowMs })];
}
export const enterManualPausedAt = (dispatch: AppDispatch, instant: Date) =>
  manualPausedAtActions(instant).forEach(dispatch); // date-entry popover keeps its call site
```

**Decision:** Option A. The honest limit — a future source needing a genuine side
effect (calling an engine handle) cannot express it as an action — has a known answer
from #507: `logCameraState` became a reducer-less command action plus
`watchLogCameraStateSaga`. Better shape than widening the row type.

---

## Q4: How does the saga reach `window.location` / `window.history`?

**The question:** Where do the DOM touches live, and how are they made testable?

A constraint became load-bearing here. `createAppStore` runs `mainSaga`, and
`tests/state/ui/selectors.test.ts` + `persistSplashVersion.test.ts` call it under
`environment: 'node'` with no `window`. Today that survives because
`createKeyboardListener` leans on hotkeys-js, which self-guards. A URL saga forked
into `mainSaga` reads `window.location.hash` _at saga start_, not lazily on an action.
So the `typeof window === 'undefined'` guard that `useUrlSync`'s docblock calls cheap
insurance for an SSR we do not do becomes the thing keeping the existing suite green.

**Considerations:**

- **Option A (a `services/url/` service, reached by `call`):** exactly the layering
  #507 used — `services/input/createKeyboardListener.ts` ↔
  `state/input/watchKeyboardEventsSaga.ts`. Three functions
  (`createHashChangeChannel`, `readHashBody`, `writeHashBody`), one guard each, none
  in the saga. `yield* call(writeHashBody, desired)` is assertable as a declarative
  effect, so a test can check what _would_ be written with no DOM.
- **Option B (a `UrlPort` via `getContext('url')`):** mirrors `ReconcileEffects`. But
  `ReconcileEffects` exists to enforce a layering rule (`state/` must not import
  `services/engine/`); no such rule exists between `state/` and `services/url/`, and
  `state/input/watchKeyboardEventsSaga` already imports straight from
  `services/input/`. Buys swappability nobody needs, costs a context key every future
  test harness must remember to set.
- **Option C (touch `window` inline):** scatters guards through control flow and gives
  up `call`-assertability, which is most of the reason to move to a saga.

**Decision:** Option A. New files land in `src/services/url/` alongside the existing
`focusUrl.ts`.

---

## Q5: What stops the write from clobbering an unresolved deep link?

**The question:** Traced while working out saga structure; believed to be a live bug
on `main`.

Cold load on `#focus=m31`:

1. Read dispatches `requestSelect('m31')` + `requestFocus('m31')`
   (`hashParamSources.ts:61-63`).
2. `watchRequestFocusSaga` **defers** — `resolveFocusRefDeferring` waits on
   `catalogLoaded` / `engineSourceCountReported`. The deferral loop is saga-local;
   nothing in the store says an intent is in flight.
3. `selectFocusRef` is still null → `selectFocusRow` null → `selectFocusedFocusable`
   null.
4. Write runs with `focused: null`. All three sources return null →
   `desiredHashBody === ''` → `matches === false` → `pushState` to the **bare URL**.
5. Seconds later the catalog pulses, `m31` resolves, and the write puts `#focus=m31`
   back.

Net: a junk history entry, a URL flicker, and a window in which reload loses the link.
`useUrlSync.ts:23` documents the removal of the old gating — "No pending-slot gating —
the saga owns deferral" — but the saga owning deferral is exactly why the store cannot
see it. No test covers this.

**The port makes it worse.** Under a saga the read runs at store construction and the
write fires on the read's own `requestFocus` dispatch, so a race that today depends on
React effect ordering becomes deterministic.

**Considerations:**

- **Option A (put the intent in the store):** `requestFocus` sets
  `selection.pendingFocusId`; `updateSelectionFocus` and `clearSelection` clear it.
  The `focus` write returns the pending id when set, so `#focus=m31` stays put from
  arrival through resolution. The URL is an intent surface, so writing intent is the
  honest thing. Also fixes the symmetric non-URL case: command-palette "fly to M31"
  before the catalog lands. Cost: one slice field plus clearing discipline (resolve,
  `clearSelection`, `takeLatest` abort).
- **Option B (abstain while pending):** same field, but `write` gains a third return
  meaning — `undefined` = "do not touch the URL" vs `null` = "omit my param". Two
  kinds of nothing in one signature; the asymmetry-paragraph smell that
  `simplicity.md` flags as a decomplection trigger.
- **Option C (out of scope, file a backlog item):** defensible port discipline, but
  knowingly ships a change upgrading an intermittent bug to a deterministic one.
- **Option D (saga-local memory of the id read):** no slice change, but two owners of
  the same truth and nothing else can observe it.

**Decision:** Option A, as _ground preparation_ in the refactor-ground sense: the
joint the feature needs (store-visible focus intent) does not exist yet.

**CONFIRMED 2026-07-28.** Reproduced in `tests/hooks/urlSyncPendingClobber.test.ts`
(jsdom, real `createAppStore` + `mainSaga` + the real hook, with `resolveDeps`
returning empty catalogs and empty `famousMeta` so `resolveFocusId('m31', deps)`
misses via the famous branch and the saga parks on `take([catalogLoaded, …])`).

On mount with `location.hash = '#focus=m31'`, `history.pushState` is called with
`"/"` — the bare URL — while `state.selection.focus` is still `null`. The trace above
holds exactly as written.

That test is the seed for PR 1's regression test; it currently asserts the fixed
behaviour and therefore fails on `main`.

---

## Q6: How do we keep `writesOn` from drifting?

**The question:** Q1's decision means a missed `writesOn` entry yields a silently
stale URL — no crash, no test failure.

**Considerations:**

- **Option A (prose discipline):** a docblock in the house style of
  `watchSelectionRowsSaga`. Zero cost, existing convention, relies on the next author
  reading it.
- **Option B (dev-mode drift detector):** production takes the allowlist; in dev a
  second `takeEvery('*')` recomputes and warns when it disagrees.
- **Option C (both).**

B was proposed and then withdrawn under challenge. Two reasons it does not hold up.
First, the failure mode was inflated: the write recomposes the **entire** body from
scratch, so the next watched action repairs a stale URL. The blast radius is "stale
until the user next changes focus, time, or orientation", not "wrong". Second, a
dev-only saga is a dev/prod divergence, which is itself an untested code path, plus a
`console.warn` nobody reads.

**Decision:** Option A, prose discipline, plus one structural preference: **use the
slice-prefix form wherever it does not cost a hot stream.** `t`'s
`a.type.startsWith('time/')` is drift-proof by construction — a seventh time reducer
is covered automatically. `focus` and `orientation` cannot have it: `selection/*`
would pull in `updateSelectionHover` (pointer-rate) and `settings/*` every slider
drag. Explicit lists for those two, prefix for `t`, comment saying which and why.

---

## Q7: One saga or two?

**The question:** Read is a channel drain; write is a `takeEvery` on a trigger
predicate. Different directions, different triggers, no shared state.

**Considerations:**

- **Option A (two flat forks in `mainSaga`):** #507 made exactly this split when it
  pulled `watchLogCameraStateSaga` out of `watchKeyboardEventsSaga` — "a distinct,
  surface-agnostic concern … the keyboard saga is left as a pure channel-drain."
- **Option B (one saga, two internal `all([...])` arms):** preserves the "single owner
  of `location.hash`" framing, but that ownership is now a property of `services/url/`
  (Q4), not of a saga.

**Decision:** Two sagas, forked from a single parent that `all([...])`s them, with one
fork line in `mainSaga`. The grouping is deliberate: the parent makes the relatedness
visible at the `rootSaga` level, while each arm keeps its own file and test.

Q5's fix is what makes the split safe with no coordination between arms: the read's
own `requestFocus` dispatch triggers the write, which reads `pendingFocusId` and
rewrites the same id it just read.

---

## Q8: What does an _absent_ param mean on the read side?

**The question:** Porting exposed three different answers, one per row:

| row           | absent on `hashchange` | absent on mount             |
| ------------- | ---------------------- | --------------------------- |
| `focus`       | `clearSelection()`     | nothing (`isInitial` guard) |
| `t`           | nothing                | nothing                     |
| `orientation` | nothing                | nothing                     |

We `pushState` on every change, so every history entry claims a view state. Back
should restore it. Today only `focus` honours that: visit `#orientation=galactic`,
navigate away, press Back, and the frame stays galactic. Same for the clock. The
history entries exist and lie.

**Considerations:**

- **Option A (uniform "absent ⇒ restore this param's default", initial pass
  suppressed wholesale):** the row gains `readAbsent()` — `focus` →
  `[clearSelection()]`, `t` → `[goLive(…)]`, `orientation` →
  `[setOrientation(DEFAULT_ORIENTATION)]`. `isInitial` stops being a per-row parameter
  and becomes a property of the pass, appearing once in the saga:

  ```ts
  const actions = value ? source.read(value) : isInitial ? [] : source.readAbsent();
  ```

  Mount suppression is correct uniformly because the store already boots at defaults,
  so applying them would be a no-op at best and would clobber the engine's Earth seed
  at worst.

- **Option B (keep the three rules):** strict port discipline, zero behaviour change.
  Cost: `isInitial` stays in every row's signature to serve one row, and two of three
  params keep lying about their history entries.

**Decision:** Option A. The per-row `isInitial` flag is exactly the "subtlety each row
must remember to handle" shape, and it exists only because absence had no uniform
meaning. Accepted behaviour change: back/forward now restores clock and orientation.

**Wrinkle to carry into the plan:** `t`'s `readAbsent()` must build
`goLive({ simDays, nowMs })`, so it reads the wall clock — the same impurity as
`manualPausedAtActions`. Tests will need to freeze time, and `readAbsent` is therefore
not uniformly pure across rows.

---

## Q9: Is the `?` query-gate consolidation in scope?

**The question:** `hasDeepLink.ts` is being touched regardless (Q2 makes its hash half
table-derived). Its query half is a separate literal
(`DEEP_LINK_QUERY_KEYS = new Set(['tour'])`), and behind that sits a five-helper zoo —
`hasUrlGate`, `isCinemaMode`, `isCinemaSearch`, `isPerfMode`, `isPerfSearch` — covering
four live gates (`cinema`, `perf`, `gpuTimings`, `tour`), read at four different
moments including during render at `App.tsx:116` and `TourOverlayContainer.tsx:61`.

**Considerations:**

- **Option A (out of scope; fix only what is already touched):** hash half becomes
  table-derived; `DEEP_LINK_QUERY_KEYS` stays; delete the stale docblock line naming
  `?debug`, `?volumes`, `?anchors` as gates (verified: none are read anywhere). File a
  backlog item for a `URL_GATES` consolidation.
- **Option B (in scope as prep):** one coherent "the URL becomes table-driven" story,
  but roughly doubles the diff and stacks an engine-init change behind a state-layer
  change that does not need it.
- **Option C (its own PR in a stack):** costs a `--base` dance and blocks the saga on
  a review it does not depend on.

**Decision:** Option A. The blast radii are unrelated — the saga touches `state/`,
`services/url/`, `App.tsx`'s hook call and the selection slice; the gate consolidation
touches the React render path, `initGpu`, the recorder hook and the perf hook.
Bundling makes the PR neither reviewable nor bisectable.

**Shape agreed for the future backlog item** (recorded so the design is not
re-derived): keep `?` and `#` as two tables, never one. They differ on every axis —
read-only vs bidirectional, once-at-boot vs continuous, session configuration vs
shareable view state, reload-to-change vs change-at-runtime. A unified `URL_PARAMS`
table would need a `location: 'search' | 'hash'` discriminant with half the fields
`never` for half the rows. Gates need no saga: there is no write side and no event to
drain, so they belong in `preloadedState` via a `readUrlGates(search)` reader over a
`URL_GATES` list.

---

## Q10: What are these called?

**The question:** Naming correctness is a stated project priority, and "URL sync" has
been imprecise throughout — the hook never touched anything but the hash, and "sync"
names neither direction nor surface.

**Considerations:**

- **Option A (`watchHashSaga` / `watchHashReadSaga` / `watchHashWriteSaga` in
  `src/state/url/`):** the sagas own `location.hash` and nothing else — the query
  string is untouched per Q9. Folder says _url_, matching `services/url/` and
  `utils/url/`; saga names say _hash_, matching what they drive. `HASH_PARAM_SOURCES`
  and `hashBodyFor` already spell it that way.
- **Option B (`watchUrlSaga` + arms):** continuous with the familiar `useUrlSync`
  name, but claims a surface it does not own, and reads as wrong the moment the gate
  consolidation lands.
- **Option C (`watchUrlSyncSaga` + arms):** keeps the vaguest word in the current name.

**Decision:** Option A. The rename is the honest completion of a half-renamed concept
rather than churn.

**File inventory that falls out:**

_New_

```
src/services/url/createHashChangeChannel.ts   eventChannel over 'hashchange'
src/services/url/readHashBody.ts              '' when no window
src/services/url/writeHashBody.ts             pushState + compare-and-skip + last-written cache
src/state/url/hashParamSources.ts             moved from hooks/, six fields per row
src/state/url/hashBodyFor.ts                  table walk → body (was computeDesiredHash)
src/state/url/watchHashSaga.ts                parent: all([read, write])
src/state/url/watchHashReadSaga.ts
src/state/url/watchHashWriteSaga.ts
src/@types/state/url/HashParamSource.d.ts     moved from @types/hooks/
```

_Deleted_ — `src/hooks/useUrlSync.ts` entire (hook, `computeDesiredHash`,
`DesiredHashInput`, `DesiredHashOutput`), `src/@types/hooks/HashParamSource.d.ts`, and
`App.tsx`'s `useUrlSync()` call plus its import.

_Also moving_ — `src/hooks/urlHashFor.ts` is not a hook; it is a pure codec and
belongs in `src/services/url/` beside `focusUrl.ts`, which it already imports from.
Via `npm run move-files`.

_Unchanged_ — `src/utils/url/parseHashParams.ts`, `composeHashParams.ts`,
`searchHasGate.ts`, and the gate helpers.

**Resulting row shape:**

```ts
export type HashParamSource = {
  readonly key: string;
  readonly deepLink: boolean; // Q2
  readonly writesOn: readonly ActionCreator[] | ((a: Action) => boolean); // Q1, Q6
  readonly write: (state: RootState) => string | null;
  readonly read: (value: string) => readonly Action[]; // Q3, Q8 — value guaranteed present
  readonly readAbsent: () => readonly Action[]; // Q8
};
```

---

## Q11: What replaces the jsdom tests?

**The question:** `tests/hooks/useUrlSync.test.ts` is ~380 lines in two halves: pure
`computeDesiredHash` cases (node) and six `renderHook` + `HashChangeEvent` integration
cases needing `// @vitest-environment jsdom`. After the port most of it becomes pure,
since sources return actions (Q3) and `hashBodyFor(state)` takes a `RootState`. What
covers the _wiring_, which is where Q6 put the residual risk?

**Considerations:**

- **Option A (real-store harness with `services/url/` mocked):** mirrors
  `tests/store/effects/reconcileSagaHarness.ts` — real RTK store plus saga middleware,
  node env, dispatch the real action, assert `writeHashBody` was called with the
  expected body. This is the shape that catches a wrong `writesOn` entry. #507 ended
  with exactly this lesson: its final commit was "assert the trivial key→action
  shortcut mappings" because a wiring typo in `KEYBOARD_SHORTCUTS` would otherwise
  have gone uncaught.
- **Option B (generator-iteration assertions):** fastest and mock-free, but asserts
  the saga's internal step sequence (brittle against reordering) and cannot exercise
  `writesOn` at all, since the trigger predicate never runs.
- **Option C (keep jsdom for the read path):** most faithful, but it is testing that
  `addEventListener` works; `createHashChangeChannel` is four lines and the
  interesting behaviour is downstream.

**Decision:** Option A. Drops the file's jsdom dependency entirely. One test per
`writesOn` trigger — three for `focus`, one for `t`, two for `orientation` — plus pure
tests for `hashBodyFor` and each row's `read` / `readAbsent`.

**Two tests called out as non-negotiable in the plan:**

1. **The Q5 regression, written first and failing:** cold `#focus=m31` with no catalog
   loaded ⇒ `writeHashBody` is never called with `''`.
2. **Q8's new behaviour:** a `hashchange` from `#orientation=galactic` to bare ⇒
   `setOrientation(DEFAULT_ORIENTATION)` is dispatched.

---

## Q12: PR packaging

**The question:** Prep-first in commits is settled by convention; whether prep rides
the same PR is an explicit ask every time.

**Considerations:**

- **Option A (two PRs — bug fix, then port):**
  - _PR 1:_ fix the deep-link clobber in the existing hook. `selection.pendingFocusId`
    - `selectPendingFocusId` + clearing discipline, `computeDesiredHash` reads pending
      before resolved, plus the failing-first regression test. Verifiable against the
      architecture on `main` today, independently revertable.
  - _PR 2:_ the port. `HashParamSource` reshape, `services/url/`, the three sagas,
    `hasDeepLink` from the table, the `urlHashFor` move, cutover and deletions, Q8's
    absent-⇒-default change.
- **Option B (one PR, prep commits first):** fewer round trips, one review context,
  and the prep is genuinely inert alone — `pendingFocusId` does nothing until
  something reads it.
- **Option C (three PRs):** over-segmented; the middle has no standalone meaning.

**Decision:** Option A. Without the split, PR 2's diff mixes a behaviour fix, a
behaviour _change_ (Q8), a type reshape, a file move and a delete-the-hook cutover.
Whether the clobber fix is right is a different review question from whether the port
preserves behaviour. It also makes "the port is behaviour-neutral except Q8" a
checkable claim rather than an assertion.

**Accepted cost, stated rather than buried:** PR 1 fixes the bug _in the hook_, code
that PR 2 then deletes — roughly 15 lines of throwaway work in `computeDesiredHash`,
traded for a clean bisect.

---

## Open items

1. ~~Confirm the Q5 trace empirically.~~ **Done** — see Q5, reproduced in
   `tests/hooks/urlSyncPendingClobber.test.ts`.
2. **Check for an import cycle** from Q2: `uiSlice` → `buildInitialUiState` →
   `hashParamSources` → the other slices.
3. **Run `refactor-ground`** before the spec is written, per the project convention.
   Q5's `pendingFocusId` and Q10's `urlHashFor` move are already-identified prep;
   refactor-ground should confirm there is nothing else.
4. **File the backlog item** for the `URL_GATES` query-gate consolidation (Q9), with
   the two-tables-never-one shape recorded there.
