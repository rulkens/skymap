# `useUrlSync` → hash read/write sagas — design

Grill session: [`docs/grill-sessions/url-hash-saga-2026-07-28.md`](../../grill-sessions/url-hash-saga-2026-07-28.md) (Q1–Q12, all resolved).
Sibling precedent: [`2026-07-23-keyboard-events-saga-design.md`](completed/2026-07-23-keyboard-events-saga-design.md) (PR #507).

---

## 1. What we're building

`useUrlSync` is the last React hook holding a bidirectional DOM↔store bridge. It owns
`window.location.hash`: dispatching on `hashchange`, writing via `pushState` on store
change. This promotes both directions into the store, deletes the hook, and reshapes
`HASH_PARAM_SOURCES` so a hash param is genuinely one table row.

### Goals

- The store owns `location.hash` in both directions; `App.tsx` calls no URL hook.
- One table (`HASH_PARAM_SOURCES`) is the sole authority on what the hash contains,
  what wakes a write, whether a param counts as a deep link, and what its absence means.
- Fix the deep-link clobber (§6, confirmed reproduction) — a cold `#focus=<galaxy>` load
  no longer wipes the hash while the id defers.
- Back/forward restores every param, not only `focus`.
- Saga tests replace `renderHook` + jsdom; the file drops its jsdom dependency.

### Non-goals (deferred, named)

- **The `?` query-gate consolidation.** Four live gates (`cinema`, `perf`, `gpuTimings`,
  `tour`) read through five helpers at four different moments, twice during render.
  Real work, unrelated blast radius (render path, `initGpu`, recorder + perf hooks).
  Backlog item; agreed shape recorded in the grill Q9.
- **Consolidating `watchRequestFocusSaga` / `watchRequestSelectSaga`.** Exact structural
  twins, but the feature no longer forces the edit (§6 lands in the reducer). Backlog.
- **Making `uiSlice`'s module-load `buildInitialUiState()` lazy.** Backlog.

---

## 2. Decisions summary

| #   | Decision                                                                            |
| --- | ----------------------------------------------------------------------------------- |
| Q1  | Write wakes on an enumerated `writesOn` per source, **not** `takeEvery('*')`        |
| Q2  | Deep-link detection derived from the table, not a literal `'#focus='` match         |
| Q3  | Sources return `readonly Action[]`; the saga is a pure pump                         |
| Q4  | DOM touches live in `services/url/`, reached by `call`                              |
| Q5  | `selection.pending` so the URL writes intent (fixes the clobber)                    |
| Q6  | Prose discipline against `writesOn` drift; slice-prefix form where free             |
| Q7  | Two sagas under one parent fork                                                     |
| Q8  | Absent param uniformly restores that param's default; `isInitial` moves to the pass |
| Q9  | `?` gates out of scope                                                              |
| Q10 | `watchHashSaga` / `watchHashReadSaga` / `watchHashWriteSaga` in `src/state/url/`    |
| Q11 | Real-store harness with `services/url/` mocked; no jsdom                            |
| Q12 | Two PRs: prep + fix, then port                                                      |

---

## 3. Architecture — data delta first

### 3.1 The `HashParamSource` row

```ts
// src/@types/state/url/HashParamSource.d.ts   (moved from @types/hooks/)
export type HashParamSource = {
  readonly key: string;

  /** Does this param's presence mean "the visitor came here for something specific"?
   *  Consumed by hasDeepLink to suppress the splash. focus/t yes, orientation no —
   *  a pole preference is a view setting, not an intent. */
  readonly deepLink: boolean;

  /** Which dispatched actions can change this row's `write` output. A predicate for
   *  whole-slice coverage, a list for surgical coverage. See §3.3 for the contract.
   *
   *  CORRECTED during T6: this said `ActionCreator[]`, which does not compile. No such
   *  type exists in this repo, and redux's same-named `ActionCreator<A, P>` carries no
   *  `.match`, so §3.3's `s.writesOn.some((c) => c.match(action))` would be a type error.
   *  RTK has the right shape internally as `HasMatchFunction` but does not export it, so
   *  the capability is declared locally in `@types/state/url/ActionMatcher.d.ts`. RTK
   *  action creators satisfy it structurally.
   *
   *  CORRECTED AGAIN, post-T13: the union collapsed to a LIST OF PREDICATES, and
   *  `ActionMatcher.d.ts` was deleted with it. A creator's `.match` already IS
   *  `(action) => boolean`, so the two forms were never distinct — they only cost the
   *  write saga a `typeof` fork and, more importantly, forbade a row from MIXING named
   *  actions with a computed test. `focus` needs exactly that mix: see §3.2. */
  readonly writesOn: readonly ((action: Action) => boolean)[];

  /** Serialize from the store. `null` omits the param entirely. */
  readonly write: (state: RootState) => string | null;

  /** Deserialize a PRESENT value into actions. Never called with an empty value. */
  readonly read: (value: string) => readonly Action[];

  /** Restore this param's default when it is ABSENT from a hashchange. Never called
   *  on the initial pass — the store already boots at defaults. */
  readonly readAbsent: () => readonly Action[];
};
```

Three fields are new (`deepLink`, `writesOn`, `readAbsent`); `write` takes `RootState`
instead of a hand-assembled `DesiredHashInput`; `read` returns actions instead of taking
`dispatch`, and loses its `isInitial` parameter.

`DesiredHashInput` and `DesiredHashOutput` are deleted. They existed as a manual
projection of `RootState` that had to be kept in sync with the hook's `useAppSelector`
calls and its dependency array — three lists saying the same thing, where a missing
fourth entry composed correctly and silently never wrote.

### 3.2 The table

```ts
// src/state/url/hashParamSources.ts   (moved from src/hooks/)
const focusSource: HashParamSource = {
  key: 'focus',
  deepLink: true,
  // setSelectionRow is the SOLE writer of selectionRows.focus, which is the only
  // input to selectFocusedFocusable — every resolution path (late catalog, star-count
  // pulse, direct ref write) funnels through it, so upstream actions need no listing.
  //
  // CORRECTED post-T13: narrowed to the FOCUS SLOT. setSelectionRow writes all three
  // derived rows, and the hover row is rewritten once per GPU pick readback for as long
  // as the pointer moves — so the slot-blind action re-admitted, through the derived
  // cache, the very `selection/*` hot stream §3.3 chose a named list to exclude.
  writesOn: [requestFocus.match, clearSelection.match, isFocusSlotRow],
  write: (state) => { /* pending id, else resolved target via URL_HASH_FOR; Earth ⇒ null */ },
  read: (value) => [requestSelect(value), requestFocus(value)],
  readAbsent: () => [clearSelection()],
};

const timeSource: HashParamSource = {
  key: 't',
  deepLink: true,
  // All six timeSlice reducers re-anchor, so the whole slice is the trigger set.
  // Prefix form is drift-proof by construction: a seventh reducer is covered free.
  writesOn: [(action) => action.type.startsWith(`${timeRoute}/`)],
  write: (state) => { /* manual mode ⇒ anchor simDays as ISO; live ⇒ null */ },
  read: (value) => { /* parseable ISO ⇒ manualPausedAtActions(date); else [] */ },
  readAbsent: () => [goLive({ simDays: /* now */, nowMs: performance.now() })],
};

const orientationSource: HashParamSource = {
  key: 'orientation',
  deepLink: false,
  // mergeSnapshot is the bulk settings restore (tour scene-restore) — the same action
  // watchFadesSaga carries a dedicated second arm for. Prefix form is NOT usable here:
  // settings/* would fire on every slider drag.
  writesOn: [setOrientation.match, mergeSnapshot.match],
  write: (state) => { /* non-default frame, else null */ },
  read: (value) => (isOrientationFrameId(value) ? [setOrientation(value)] : []),
  readAbsent: () => [setOrientation(DEFAULT_ORIENTATION)],
};

// Append-only: composeHashParams emits in table order, so existing deep links stay
// byte-stable.
export const HASH_PARAM_SOURCES: readonly HashParamSource[] = [
  focusSource, timeSource, orientationSource,
];
```

**`writesOn` completeness contract** (the one thing prose has to carry, per Q6, in the
house style of `watchSelectionRowsSaga`): _every action that can change a row's `write`
output MUST be covered by its `writesOn`, or the URL goes stale until the next covered
action._ A miss is self-healing — the write recomposes the entire body from scratch — so
the failure is "stale until the next focus/time/orientation change", never "wrong".
Prefer the slice-prefix form wherever it does not pull in a hot stream.

### 3.3 The sagas

```ts
// src/state/url/watchHashSaga.ts — the grouped parent; ONE fork line in mainSaga
export function* watchHashSaga() {
  yield* all([watchHashReadSaga(), watchHashWriteSaga()]);
}

// src/state/url/watchHashReadSaga.ts
export function* watchHashReadSaga() {
  const channel = yield* call(createHashChangeChannel);
  yield* call(applyHash, yield* call(readHashBody), true); // initial pass
  try {
    while (true) {
      yield* call(applyHash, yield* take(channel), false);
    }
  } finally {
    channel.close();
  }
}

function* applyHash(body: string, isInitial: boolean) {
  const params = parseHashParams(body);
  for (const source of HASH_PARAM_SOURCES) {
    const value = params.get(source.key);
    // isInitial appears ONCE, here — a property of the pass, not of every row.
    const actions = value ? source.read(value) : isInitial ? [] : source.readAbsent();
    for (const action of actions) yield* put(action);
  }
}

// src/state/url/watchHashWriteSaga.ts
const WRITE_TRIGGER = (action: Action) =>
  HASH_PARAM_SOURCES.some((s) => s.writesOn.some((triggers) => triggers(action)));

export function* watchHashWriteSaga() {
  // CORRECTED post-T13: `takeEvery` here was wrong, and the browser found it.
  // `applyHash` above dispatches ONE ROW AT A TIME and every one of those
  // actions is a write trigger, so applying a two-param URL published the
  // half-applied store — `focus=body-mars` while `orientation` was still the
  // default — and then corrected itself. Both are `pushState`s, and a push
  // during a Back navigation truncates the forward stack. `write` composes the
  // WHOLE body, so it is only ever right on a settled store; the publish
  // belongs on the trailing edge of the burst, not on each trigger.
  yield* debounce(0, WRITE_TRIGGER, function* () {
    yield* call(writeHashBody, hashBodyFor(yield* select((s: RootState) => s)));
  });
}
```

Nothing in the 60Hz `commitCameraPose` / `engineBodyDistanceReported` /
`engineScaleChanged` stream matches `WRITE_TRIGGER`, so the frame path is untouched.
The debounce does not change that and is not a substitute for it: a 0 ms trailing
edge is shorter than a frame, so a hot trigger stream would still compose once per
event. Coalescing bounds a burst; the enumerated trigger is what excludes a stream.

`hashBodyFor(state)` is the table walk that replaces `computeDesiredHash`, minus the
`matches` half — the compare-and-skip moves into `writeHashBody`, which owns the URL.

### 3.4 `services/url/` — the DOM seam

Same layering as `services/input/createKeyboardListener.ts` ↔
`state/input/watchKeyboardEventsSaga.ts`. Three functions, one `typeof window` guard
each, none in the sagas.

```ts
createHashChangeChannel(): EventChannel<string>   // emits the hash BODY; no-op channel with no window
readHashBody(): string                            // '' with no window
writeHashBody(body: string): void                 // pushState + compare-and-skip; no-op with no window
```

~~`writeHashBody` caches the last body it wrote and compares against that, reading
`window.location.hash` only when the desired body differs. A `hashchange` invalidates
the cache (the read side already observes it).~~

**CORRECTED during T7 — there is no cache.** `writeHashBody` compares against the live
`readHashBody()` on every call. `window.location` already _is_ that cache: `pushState`
updates it synchronously and it is never stale, so a remembered copy is a second source of
truth whose only gain is skipping one property read.

The invalidation listener the cache needs is the hole. Back, Forward and a hand-edited
address bar all move the URL without this module's knowledge, and a module-level
`hashchange` subscription registered on first use has no owner and no teardown — unlike the
read saga's channel, which closes in a `finally`. Under vitest it would bind to whichever
jsdom `window` existed at first call and survive module-registry resets.

The cache also had a live failure: URL bare, cache `''`, visitor types `#orientation=zzz`.
The read rejects the junk frame and returns no actions, the write recomposes `''`, hits the
cache fast-path, and the junk hash is never scrubbed. The live read scrubs it.

Nothing was being optimised. `timeSlice` has no tick action — all six reducers are user
intent — and `writesOn` already excludes the frame path, so writes fire on selection, clock
and orientation actions only, never per frame.

**The guards are load-bearing, not SSR insurance.** `createAppStore` runs `mainSaga`, and
`tests/state/ui/*.test.ts` call it under `environment: 'node'`. `watchHashReadSaga` reads
the hash _at saga start_, not lazily on an action, so without the guards the existing
suite breaks. (`createKeyboardListener` gets away with no guard only because hotkeys-js
self-guards.)

**Why `pushState`, not `replaceState`** — unchanged from the hook: focusing is a
navigational act, and Back should return to the previous selection. `pushState` fires
neither `hashchange` nor `popstate`, so the write can never feed the read.

### 3.5 Deep-link detection (Q2)

`hasDeepLink`'s hash half becomes table-derived:

```ts
const DEEP_LINK_HASH_KEYS = new Set(HASH_PARAM_SOURCES.filter((s) => s.deepLink).map((s) => s.key));
```

It currently hand-matches the literal `'#focus='` (`hasDeepLink.ts:45`) and has already
drifted twice: `#t=…` and `#orientation=…` both show the splash over a link expressing
specific intent. `?tour` stays a literal (`DEEP_LINK_QUERY_KEYS`) per the §1 non-goal.

Also delete the stale docblock line naming `?debug`, `?volumes`, `?anchors` as gates —
verified: none are read anywhere.

Verified no import cycle: `uiSlice → buildInitialUiState → hashParamSources →
{selection, settings, time slices + selectors}`, and none import back into `state/ui/`.

---

## 4. Deletions / rewiring

| File                                    | Action                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `src/hooks/useUrlSync.ts`               | **Delete** — hook, `computeDesiredHash`, `DesiredHashInput`, `DesiredHashOutput` |
| `src/@types/hooks/HashParamSource.d.ts` | **Move** → `@types/state/url/`                                                   |
| `src/hooks/hashParamSources.ts`         | **Move** → `state/url/`                                                          |
| `src/hooks/urlHashFor.ts`               | **Move** → `services/url/` (prep — it is not a hook)                             |
| `src/components/App/App.tsx`            | Drop the `useUrlSync()` call + import                                            |
| `src/store/rootSaga.ts`                 | Fork `watchHashSaga()`; add its docblock line                                    |
| `tests/hooks/useUrlSync.test.ts`        | **Delete**; coverage restructures into §7                                        |

Unchanged: `utils/url/parseHashParams.ts`, `composeHashParams.ts`, `searchHasGate.ts`,
and the gate helpers.

---

## 5. Behaviour changes (deliberate, both need pinning tests)

1. **The deep-link clobber is fixed** (§6). Confirmed failure on `main`.
2. **Back/forward restores every param, not just `focus`** (Q8). Today `#orientation=galactic`
   → navigate away → Back leaves the frame galactic; same for the clock. `pushState`
   creates history entries claiming view states, and two of three params do not restore.
   `readAbsent` makes every entry honest.

Everything else is behaviour-neutral — a claim PR 1 makes checkable by landing the fix
first.

---

## 6. Ground preparation

Ideal-diff pass run 2026-07-29. Full checkpoint in the grill transcript's successor;
verdicts below.

### Prep (own commits, sequenced first — rides PR 1)

**P1 — `selection.pending` (J1).** The write side has no way to see an in-flight focus
intent: `selection` holds three _resolved-ref_ slots, and the deferral lives inside
`resolveFocusRefDeferring`'s local loop (`resolveFocusRefDeferring.ts:22-25`).

```ts
// SelectionState gains:
readonly pending: { readonly select: string | null; readonly focus: string | null };

// pending is state derived from the action stream, which is a reducer's job — no saga
// edits at all. The two COMMANDS are foreign actions, so they land in extraReducers:
.addCase(requestFocus,  (selection, action) => { selection.pending.focus  = action.payload })
.addCase(requestSelect, (selection, action) => { selection.pending.select = action.payload })

// The two COMPLETIONS are this slice's OWN actions, so their clear rides inside their
// reducer via a resolveRef(slot) factory — NOT a second addCase. See the landmine below.
// clearSelection nulls both pending slots, beside the two ref slots it already nulls.
```

**Landmine, found during implementation (2026-07-29, commit `630216e7`).** RTK's
`createSlice` builds `finalCaseReducers` with the `reducers` entry applied **last**, so an
`extraReducers` case whose action type collides with an own reducer is **silently
dropped** — no warning, no throw, just a `pending` slot that never clears.
`updateSelectionFocus` / `updateSelectionSelect` are own actions, so their clear must live
in the reducer body. It sits deliberately outside `setIfChanged`'s dedup guard: a resolve
landing on a structurally-equal ref is still a resolve, and skipping the clear there would
strand `pending` for the rest of the session.

**Second correction.** `SelectionSlot` was `keyof SelectionState`, which swept `'pending'`
into the slot union consumed by `SELECTION_WRITE_BY_SLOT` and `watchSelectionRowsSaga`. It
now derives the ref-_valued_ keys via a mapped type, so the next non-ref field drops out
automatically rather than needing a hand-maintained `Exclude`.

`takeLatest`'s stale-deferral abort needs no handling: a newer `requestFocus` overwrites
`pending.focus` in the reducer, which is exactly right.

Both slots, not just `focus`: `watchRequestSelectSaga` is a verified exact twin of
`watchRequestFocusSaga`, so a focus-only field makes the pair asymmetric and sets up a
second-field bolt-on later. Two extra reducer lines, no extra concept.

**P2 — `manualPausedAtActions` (J2).** Q3 needs actions returned, not dispatched
(`enterManualPausedAt.ts:26`).

```ts
export function manualPausedAtActions(instant: Date): readonly Action[] {
  const nowMs = performance.now(); // still sampled ONCE, still inside
  return [setSimDays({ simDays: unixMsToJulianDays(instant.getTime()), nowMs }), pause({ nowMs })];
}
export const enterManualPausedAt = (dispatch: AppDispatch, instant: Date) =>
  manualPausedAtActions(instant).forEach(dispatch); // date-entry popover unchanged
```

The shared-`nowMs` invariant its docblock calls "structurally impossible for a caller to
break" survives verbatim — the sample stays inside the builder.

**P3 — move `urlHashFor.ts` → `services/url/` (J3).** Mechanical, via `npm run move-files`.

### Growth / bolt-on verdicts

| Touchpoint                              | Verdict                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `HASH_PARAM_SOURCES`                    | Growth — the table seam exists; the row reshape _is_ the feature         |
| `services/url/`                         | Growth — folder exists (`focusUrl`, `resolveFocusId`, `milkyWayFocusId`) |
| `rootSaga`'s `all([...])`               | Growth — a composition root, not a parallel list                         |
| `parseHashParams` / `composeHashParams` | Growth — unchanged, already generic                                      |
| `selection` slice                       | **Bolt-on without P1** — no store-visible intent to read                 |
| `enterManualPausedAt`                   | **Bolt-on without P2** — dispatch-shaped, not action-shaped              |
| `src/hooks/urlHashFor.ts`               | **Bolt-on without P3** — a codec parked in the hooks folder              |

`asArray` (from #507) was checked and is not needed: `read`/`readAbsent` return arrays
directly.

### Adjacent findings deliberately NOT in scope

All four are filed in `docs/BACKLOG.md`:

- [Twin selection request sagas](../../backlog/2026-07-29-twin-request-selection-sagas.md) —
  `watchRequestFocusSaga` / `watchRequestSelectSaga` are exact structural duplicates.
- [`uiSlice` does boot I/O at module load](../../backlog/2026-07-29-uislice-module-load-boot-reads.md) —
  `uiSlice.ts:36` reads `window.location` + localStorage at import time; §3.5 widens its
  load-time graph (no cycle — verified).
- [`?` query gates have no owner](../../backlog/2026-07-29-url-gates-registry.md) — Q9.
- `rootSaga`'s prose docblock (lines 6-23) restates the `all([...])` array — index line
  only, too small for a detail file.

---

## 7. Testing (what can break)

Harness mirrors `tests/store/effects/reconcileSagaHarness.ts`: real RTK store + saga
middleware, `environment: 'node'`, `services/url/` mocked. No jsdom, no `renderHook`, no
`HashChangeEvent`.

**Wiring — the residual risk Q6 leaves.** One test per `writesOn` trigger (three `focus`,
one `t`, two `orientation`): dispatch the real action, assert `writeHashBody` was called
with the expected body. This is the shape that catches a typo'd trigger list; #507's final
commit added exactly these for `KEYBOARD_SHORTCUTS` after the cutover left them unasserted.

**Pure** — `hashBodyFor(state)` per source combination; each row's `read` / `readAbsent`
action output. No mocks needed now that sources return actions.

**The two pinning tests** (§5):

1. Cold `#focus=m31` with no catalog loaded ⇒ `writeHashBody` is never called with `''`.
   Written first, failing. Seed exists: `tests/hooks/urlSyncPendingClobber.test.ts` already
   reproduces the failure on `main` (pushState called with `"/"` while `selection.focus`
   is null).
2. `hashchange` from `#orientation=galactic` to bare ⇒ `setOrientation(DEFAULT_ORIENTATION)`.

**Not tested** (per `conventions/testing.md`): the table's contents restated as a
registry mirror; `createHashChangeChannel`'s `addEventListener` call; the `typeof window`
guards.

**Time freezing** — `timeSource.readAbsent()` builds `goLive({ simDays, nowMs })` and so
reads the wall clock, the same impurity as `manualPausedAtActions`. `readAbsent` is
therefore not uniformly pure across rows; its tests freeze time.

---

## 8. Delivery

**PR 1 — prep + clobber fix.** P1, P2, P3 as three commits, plus the Q5 regression test
made to pass by fixing `computeDesiredHash` in the _existing_ hook. Verifiable against
the architecture on `main`; independently revertable. Accepted cost, stated rather than
buried: ~15 lines of `computeDesiredHash` change that PR 2 deletes, traded for a clean
bisect and a checkable "the port is behaviour-neutral except Q8" claim.

**PR 2 — the port.** Row reshape, `services/url/`, the three sagas, `hasDeepLink` from
the table, cutover + deletions, Q8's absent-⇒-default change.

No backlog item to sweep — this work had none (verified).
