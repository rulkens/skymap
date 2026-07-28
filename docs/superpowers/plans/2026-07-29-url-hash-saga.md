# `useUrlSync` → hash read/write sagas — implementation plan

**Spec:** [`specs/2026-07-29-url-hash-saga-design.md`](../specs/2026-07-29-url-hash-saga-design.md)
**Grill:** [`grill-sessions/url-hash-saga-2026-07-28.md`](../../grill-sessions/url-hash-saga-2026-07-28.md)
**Precedent:** PR #507 — [`specs/completed/2026-07-23-keyboard-events-saga-design.md`](../specs/completed/2026-07-23-keyboard-events-saga-design.md)

Two PRs. **Phase A** (T1–T5) is prep + the deep-link clobber fix, against the current
hook. **Phase B** (T6–T13) is the port. Phase A must merge before Phase B opens.

**Green-at-every-commit strategy for Phase B:** the new stack is built *alongside* the
hook (new type + table in `state/url/`, old ones untouched in `hooks/`), unforked, until
T12's atomic cutover forks it and deletes the old. This is #507's shape — its saga landed
with "Not yet forked into rootSaga — that atomic cutover is a later task." Accept the
momentary two-table duplication; T12 resolves it in one commit.

A reproduction already exists at `tests/hooks/urlSyncPendingClobber.test.ts` (fails on
`main`: `pushState` called with `"/"` while `selection.focus` is null). T2 adopts it.

---

## Phase A — prep + clobber fix (PR 1)

### Task 1: `selection.pending` — slot-keyed focus/select intent

**Files:** `src/@types/store/SelectionState.d.ts`, `src/state/selection/selectionSlice.ts`,
`src/state/selection/selectors.ts`, `tests/state/selection/selectionSlice.test.ts`

**Type delta:**

```ts
readonly pending: { readonly select: string | null; readonly focus: string | null };
```

**Selectors:** `selectPendingFocusId(state): string | null`, `selectPendingSelectId` — same
route pattern as the existing ref selectors (`selectors.ts:51-` base selectors).

**Behaviour:** `pending` is state derived from the action stream, so it lands entirely in
`extraReducers` — no saga touches it. `requestFocus` / `requestSelect` set their slot;
`updateSelectionFocus` / `updateSelectionSelect` clear theirs; `clearSelection` nulls both
beside the two ref slots it already nulls (`selectionSlice.ts:33-36`).

- [ ] Test `requestFocus records the pending focus id`
- [ ] Test `updateSelectionFocus clears the pending focus id`
- [x] Test `a newer requestFocus replaces the pending id` — this is what makes
      `takeLatest`'s stale-deferral abort need no explicit handling
- [x] Test `clearSelection nulls both pending slots`
- [x] Test `requestSelect and requestFocus track independently` — the two slots must not
      alias; a select-only request leaves `pending.focus` null
- [x] Implement via `extraReducers` on `selectionSlice`.
- [x] `npm test -- selection` → green.
- [x] Commit. → `630216e7`

**Two corrections found during implementation — the sketch above was wrong:**

1. **`extraReducers` cannot handle the slice's OWN actions.** RTK builds
   `finalCaseReducers` with the `reducers` entry applied LAST, so an `extraReducers`
   case for an own action type is **silently dropped** — no warning, just a `pending`
   slot that never clears. Only the two *commands* (`requestFocus` / `requestSelect`,
   foreign actions) belong there; the two completions clear their slot inside their own
   reducer via a `resolveRef(slot)` factory, deliberately outside the dedup guard (a
   resolve landing on a structurally-equal ref is still a resolve).
2. **`SelectionSlot = keyof SelectionState` broke.** Widening the state swept `'pending'`
   into the slot union used by `SELECTION_WRITE_BY_SLOT` and `watchSelectionRowsSaga`.
   It now derives the ref-*valued* keys via a mapped type, so the next non-ref field
   drops out automatically rather than needing a hand-maintained exclusion.

### Task 2: the URL write holds the pending id (the clobber fix)

**Files:** `src/hooks/useUrlSync.ts`, `src/hooks/hashParamSources.ts`,
`tests/hooks/urlSyncPendingClobber.test.ts` (adopt + rename)

**Contract:** the `focus` source's `write` returns `pending.focus` when set, falling back
to the resolved target. `DesiredHashInput` gains a `pendingFocusId: string | null` field —
deliberately throwaway; Phase B deletes the whole type when `write` takes `RootState`.

- [ ] Move `tests/hooks/urlSyncPendingClobber.test.ts` →
      `tests/hooks/useUrlSync.test.ts` (merge into the existing describe blocks). Confirm
      it FAILS first: `expected [ '/' ] to deeply equal []`.
- [ ] Add the `pendingFocusId` field, thread it from `useAppSelector(selectPendingFocusId)`,
      and return it first in the `focus` source's `write` (`hashParamSources.ts:36-59`).
- [ ] Add the dependency-array entry — and note in the commit body that this third list is
      exactly what Phase B deletes.
- [ ] `npm test -- useUrlSync` → the regression test passes, the existing cases stay green.
- [ ] Commit.

### Task 3: `manualPausedAtActions` — action builder split

**Files:** `src/state/time/enterManualPausedAt.ts` (or a new sibling — implementer's call
per the one-symbol-per-file rule if it lands in `utils/`), `tests/state/time/*`

**Signature:** `manualPausedAtActions(instant: Date): readonly Action[]`

**Behaviour:** samples `performance.now()` **once, inside the builder**, and returns
`[setSimDays({ simDays, nowMs }), pause({ nowMs })]`. `enterManualPausedAt(dispatch,
instant)` stays as a thin wrapper so the date-entry popover's call site is untouched.

The shared-`nowMs` invariant is the whole point of the existing docblock
(`enterManualPausedAt.ts:7-15`) — read it before touching this.

- [ ] Test `manualPausedAtActions threads one nowMs sample through both actions` —
      assert the two payloads carry the *same* `nowMs`, with `performance.now` stubbed to
      return increasing values. This is the test that catches a caller-supplied `nowMs`
      regression.
- [ ] Test `enterManualPausedAt still dispatches both actions in order`.
- [ ] Implement; update the docblock so it describes the builder, not the dispatcher.
- [ ] `npm test -- time` → green.
- [ ] Commit.

### Task 4: move `urlHashFor.ts` out of `hooks/`

**Files:** `src/hooks/urlHashFor.ts` → `src/services/url/urlHashFor.ts`

It is a pure codec, not a hook, and it already imports from `services/url/focusUrl.ts`.

- [ ] `npm run move-files -- --dry src/hooks/urlHashFor.ts src/services/url/urlHashFor.ts`
      — inspect the rewrite list.
- [ ] `npm run move-files -- src/hooks/urlHashFor.ts src/services/url/urlHashFor.ts`
- [ ] Grep for `urlHashFor` in non-TS contexts (`.md`, `vi.mock` string literals) —
      ts-morph does not rewrite those. See `reference_move_files_blind_spots`.
- [ ] `npm run typecheck` → clean.
- [ ] Commit (move only, no behaviour).

### Task 5: Phase A verification + PR 1

- [ ] `npm test` → full suite green.
- [ ] `npm run typecheck` → clean.
- [ ] `npm run format` on touched files only.
- [ ] Open PR 1 (`--base main`). Body: the confirmed clobber trace, and that the
      `computeDesiredHash` change is deliberately throwaway.
- [ ] **Ask the user** to confirm a cold `#focus=<galaxy>` load keeps its hash in the
      browser. This is a behaviour fix; the unit test proves the logic, not the boot timing.

---

## Phase B — the port (PR 2)

### Task 6: reshape `HashParamSource` + the table, in `state/url/`

**Files:** `src/@types/state/url/HashParamSource.d.ts` (new),
`src/state/url/hashParamSources.ts` (new), `tests/state/url/hashParamSources.test.ts` (new)

Old `hooks/` copies stay in place and keep serving the hook until T12.

**Type:** exactly as spec §3.1 — `key`, `deepLink`, `writesOn`, `write(state)`,
`read(value)`, `readAbsent()`. One type per file, per `feedback_one_type_per_file`.

**Rows:** spec §3.2. Carry the `writesOn` completeness contract into the module docblock in
the house style of `watchSelectionRowsSaga.ts:15-21` — a miss is self-healing (stale until
the next covered action), never wrong.

- [ ] Tests: each row's `read(value)` action output, including `orientation` rejecting a
      junk frame via `isOrientationFrameId` and `t` no-oping on an unparseable ISO string.
- [ ] Tests: each row's `readAbsent()` output. Freeze time for `t` — `readAbsent` builds
      `goLive({ simDays, nowMs })` and so reads the wall clock.
- [ ] Tests: `focus.write` returns the pending id while pending, the encoded target once
      resolved, and `null` for home-Earth (`EARTH_REF`) — the omit rule that keeps a fresh
      load on a bare URL.
- [ ] Do NOT test the table's contents as a registry mirror (`conventions/testing.md`).
- [ ] `npm test -- hashParamSources` → green.
- [ ] Commit.

### Task 7: `services/url/` — the DOM seam

**Files:** `src/services/url/createHashChangeChannel.ts`, `readHashBody.ts`,
`writeHashBody.ts` (all new), tests

**Signatures:**

```ts
createHashChangeChannel(): EventChannel<string>   // emits the hash BODY (no leading '#')
readHashBody(): string
writeHashBody(body: string): void
```

**Guards are load-bearing, not SSR insurance** — see spec §3.4. `createAppStore` runs
`mainSaga` under `environment: 'node'` in existing tests, and T10's saga reads the hash at
saga *start*. Without the guards the suite breaks.

`writeHashBody` owns compare-and-skip: caches the last body it wrote, reads
`window.location.hash` only when the desired body differs, and a `hashchange` invalidates
the cache. Uses `pushState` (not `replaceState`) — rationale in spec §3.4.

- [ ] Test `writeHashBody skips a pushState when the body is unchanged`.
- [ ] Test `writeHashBody drops the '#' entirely for an empty body` — the bare-URL form.
- [ ] Test that each function no-ops with no `window` (the node-env path).
- [ ] `npm test -- services/url` → green.
- [ ] Commit.

### Task 8: `hashBodyFor(state)`

**Files:** `src/state/url/hashBodyFor.ts` (new), tests

**Signature:** `hashBodyFor(state: RootState): string`

Replaces `computeDesiredHash` minus its `matches` half (that moved into `writeHashBody`).
Walks `HASH_PARAM_SOURCES` in table order — order is load-bearing for byte-stable links.

- [ ] Test the empty case, single-param cases, and a multi-param compose asserting **table
      order** (`focus=…&t=…&orientation=…`).
- [ ] Commit.

### Task 9: `watchHashWriteSaga`

**Files:** `src/state/url/watchHashWriteSaga.ts` (new),
`tests/state/url/watchHashWriteSaga.test.ts` (new)

Harness mirrors `tests/store/effects/reconcileSagaHarness.ts` — real RTK store + saga
middleware, `environment: 'node'`, `services/url/writeHashBody` mocked via `vi.mock`. Fork
only this saga (not `mainSaga`) so the test is scoped.

`WRITE_TRIGGER` shape in spec §3.3. **This is where Q6's residual risk lives** — one test
per trigger, dispatching the real action:

- [ ] `requestFocus writes the pending id to the hash`
- [ ] `setSelectionRow writes the resolved target` — `setSelectionRow` is the sole writer
      of `selectionRows.focus`, so it stands for every resolution path
- [ ] `clearSelection empties the hash`
- [ ] `a time-slice action writes t` — assert via the prefix predicate, not a literal
      action, so a seventh reducer stays covered
- [ ] `setOrientation writes a non-default frame`
- [ ] `mergeSnapshot writes the restored orientation` — the tour scene-restore path
- [ ] `commitCameraPose does NOT trigger a write` — pins the frame-path exclusion that the
      whole `writesOn` design exists to buy
- [ ] Commit.

### Task 10: `watchHashReadSaga` + the `watchHashSaga` parent

**Files:** `src/state/url/watchHashReadSaga.ts`, `src/state/url/watchHashSaga.ts` (new), tests

Shape in spec §3.3. `isInitial` appears exactly once, in `applyHash` — it is a property of
the pass, not of any row.

Still unforked from `mainSaga`; T12 does that.

- [ ] Test `the initial pass dispatches read actions for present params`.
- [ ] Test `the initial pass dispatches nothing for absent params` — the mount suppression
      that stops a bare load clobbering the engine's Earth seed (`wireInput.ts:204-215`).
- [ ] Test `a hashchange to a bare hash dispatches readAbsent for every param` — Q8's
      behaviour change. Assert `setOrientation(DEFAULT_ORIENTATION)` specifically.
- [ ] Test `the channel is closed on cancellation` (the `finally` arm).
- [ ] Commit.

### Task 11: `hasDeepLink` derives its hash keys from the table

**Files:** `src/utils/url/hasDeepLink.ts`, tests

Derive from `HASH_PARAM_SOURCES.filter((s) => s.deepLink)`. `?tour` stays a literal —
query gates are out of scope (spec §1).

No import cycle: verified `uiSlice → buildInitialUiState → hashParamSources → {selection,
settings, time slices}` and none import back into `state/ui/`. Re-verify after T6 lands.

- [ ] Test `#t=<iso> counts as a deep link` — currently false; this is the drift Q2 fixes.
- [ ] Test `#orientation=galactic does NOT count` — `deepLink: false`, a view preference.
- [ ] Delete the stale docblock line naming `?debug`, `?volumes`, `?anchors` as gates
      (verified 2026-07-28: none are read anywhere).
- [ ] Commit.

### Task 12: atomic cutover — fork, delete the hook

**Files:** `src/store/rootSaga.ts`, `src/components/App/App.tsx`,
`src/hooks/useUrlSync.ts` (delete), `src/hooks/hashParamSources.ts` (delete),
`src/@types/hooks/HashParamSource.d.ts` (delete), `tests/hooks/useUrlSync.test.ts` (delete)

- [ ] Fork `watchHashSaga()` into `mainSaga`; add its line to the `rootSaga` docblock
      (`rootSaga.ts:6-23` — the prose list is hand-maintained; a backlog item tracks that).
- [ ] Drop `useUrlSync()` + its import from `App.tsx:47,94`. Check whether anything else in
      `App.tsx` existed only to feed it, as #507's cutover found for the keyboard hook.
- [ ] Delete the hook, the old table, the old `@types` file, and the old test file.
- [ ] Grep for `useUrlSync` / `computeDesiredHash` / `DesiredHashInput` across `src/`,
      `tests/`, and `docs/` — #507 needed a follow-up commit for six comments still naming
      a deleted symbol. Fix the comments in **this** commit. Known sites:
      `buildStaticAnchorStructures.ts:14`, `wireStructureProjection.ts:65`,
      `wireInput.ts:169,207`, `parseHashParams.ts:5`, `hasDeepLink.ts:12`.
- [ ] `npm test` → full suite green.
- [ ] Commit.

### Task 13: entanglement-radar + Phase B verification

- [ ] Run the `entanglement-radar` skill over the Phase B diff. Specifically check: does
      any row still carry a field only one row uses, and did `writesOn` end up restating
      something a selector already knows?
- [ ] `npm test` → green. `npm run typecheck` → clean. `npm run format` on touched files.
- [ ] Confirm no `src/hooks/` file remains that is not a hook.
- [ ] Open PR 2 (`--base main`, after PR 1 merges).
- [ ] **Ask the user** for a visual pass: cold `#focus=<galaxy>` load; share a link with a
      paused clock and confirm the instant restores; `#orientation=galactic` then Back, and
      confirm the frame returns to default (Q8's new behaviour).
- [ ] `/feature-done` audit BEFORE merge — it gates on the DoD, then relocates this plan
      and the spec to `plans/completed/` + `specs/completed/`.

---

## Notes for the implementer

- **No backlog item to sweep** — this work had none (verified 2026-07-28). Four *new*
  backlog items were filed as adjacent findings; leave them alone.
- **Behaviour changes are exactly two** (spec §5): the clobber fix (Phase A) and
  back/forward restoring all params (Q8, T10). Everything else must be neutral — if you
  find yourself changing observable behaviour anywhere else, stop and report.
- **`readAbsent` is not uniformly pure.** `t`'s reads the wall clock. That asymmetry is
  known and accepted; do not "fix" it by threading a clock parameter through every row.
