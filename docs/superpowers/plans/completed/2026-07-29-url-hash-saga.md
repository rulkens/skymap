# `useUrlSync` → hash read/write sagas — implementation plan

**Spec:** [`specs/2026-07-29-url-hash-saga-design.md`](../specs/2026-07-29-url-hash-saga-design.md)
**Grill:** [`grill-sessions/url-hash-saga-2026-07-28.md`](../../grill-sessions/url-hash-saga-2026-07-28.md)
**Precedent:** PR #507 — [`specs/completed/2026-07-23-keyboard-events-saga-design.md`](../specs/completed/2026-07-23-keyboard-events-saga-design.md)

Two PRs. **Phase A** (T1–T5) is prep + the deep-link clobber fix, against the current
hook. **Phase B** (T6–T13) is the port. Phase A must merge before Phase B opens.

**Green-at-every-commit strategy for Phase B:** the new stack is built _alongside_ the
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

- [x] Test `requestFocus records the pending focus id`
- [x] Test `updateSelectionFocus clears the pending focus id`
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
   slot that never clears. Only the two _commands_ (`requestFocus` / `requestSelect`,
   foreign actions) belong there; the two completions clear their slot inside their own
   reducer via a `resolveRef(slot)` factory, deliberately outside the dedup guard (a
   resolve landing on a structurally-equal ref is still a resolve).
2. **`SelectionSlot = keyof SelectionState` broke.** Widening the state swept `'pending'`
   into the slot union used by `SELECTION_WRITE_BY_SLOT` and `watchSelectionRowsSaga`.
   It now derives the ref-_valued_ keys via a mapped type, so the next non-ref field
   drops out automatically rather than needing a hand-maintained exclusion.

### Task 2: the URL write holds the pending id (the clobber fix)

**Files:** `src/hooks/useUrlSync.ts`, `src/hooks/hashParamSources.ts`,
`tests/hooks/urlSyncPendingClobber.test.ts` (adopt + rename)

**Contract:** the `focus` source's `write` returns `pending.focus` when set, falling back
to the resolved target. `DesiredHashInput` gains a `pendingFocusId: string | null` field —
deliberately throwaway; Phase B deletes the whole type when `write` takes `RootState`.

- [x] Move `tests/hooks/urlSyncPendingClobber.test.ts` →
      `tests/hooks/useUrlSync.test.ts` (merge into the existing describe blocks). Confirm
      it FAILS first: `expected [ '/' ] to deeply equal []`.
- [x] Add the `pendingFocusId` field, thread it from `useAppSelector(selectPendingFocusId)`,
      and return it first in the `focus` source's `write` (`hashParamSources.ts:36-59`).
- [x] Add the dependency-array entry — and note in the commit body that this third list is
      exactly what Phase B deletes.
- [x] `npm test -- useUrlSync` → the regression test passes, the existing cases stay green.
- [x] Commit.

**A second half of the bug, found during implementation: the write's MOUNT pass.**
`pendingFocusId` alone does not fix the clobber. Effect A dispatches `requestFocus` inside
the mount commit, but Effect B in that same commit still holds the render snapshot taken
_before_ those dispatches — every store read is the boot value, so the body composes empty
and the deep link is pushed away regardless of what `pending` holds. Confirmed against the
real store: pushes were `['/', '/#focus=m31']`, which is exactly the two history entries
reported from the browser.

The write effect therefore skips its first run. At mount the store cannot know anything the
URL does not already carry, so the URL is that commit's input, not its output; Effect A's
dispatches re-run the effect immediately with real values. **This is the shape Phase B gets
for free** — a saga write fires only on an action, so there is no start-up pass to suppress.

Both halves are independently pinned: the merged test dispatches `setOrientation` after
mount to force a write _during_ the resolve window, so deleting either the pending read or
the mount gate fails it (verified by mutation).

One consequence, accepted: a junk `#focus=zzz` is no longer scrubbed off the URL, because
the pending id is republished until something resolves it. That is inherent to publishing
intent and it reads as more honest — the URL shows what was asked for.

### Task 3: `manualPausedAtActions` — action builder split

**Files:** `src/state/time/enterManualPausedAt.ts` (or a new sibling — implementer's call
per the one-symbol-per-file rule if it lands in `utils/`), `tests/state/time/*`

**Signature:** `manualPausedAtActions(instant: Date): readonly Action[]`

**Behaviour:** samples `performance.now()` **once, inside the builder**, and returns
`[setSimDays({ simDays, nowMs }), pause({ nowMs })]`. `enterManualPausedAt(dispatch,
instant)` stays as a thin wrapper so the date-entry popover's call site is untouched.

The shared-`nowMs` invariant is the whole point of the existing docblock
(`enterManualPausedAt.ts:7-15`) — read it before touching this.

- [x] Test `manualPausedAtActions threads one nowMs sample through both actions` —
      assert the two payloads carry the _same_ `nowMs`, with `performance.now` stubbed to
      return increasing values. This is the test that catches a caller-supplied `nowMs`
      regression.
- [x] Test `enterManualPausedAt still dispatches both actions in order`.
- [x] Implement; update the docblock so it describes the builder, not the dispatcher.
- [x] `npm test -- time` → green.
- [x] Commit. → `ef3f5358`

Both symbols stay in `enterManualPausedAt.ts`: the one-symbol-per-file rule is scoped to
`src/utils/` and `src/@types/`, and `src/state/` neighbours already export coherent
clusters. Renaming the file to match the new primary export was the alternative, ruled out
because it would rewrite the import in `hashParamSources.ts` — off-limits while T2 held it.

### Task 4: move `urlHashFor.ts` out of `hooks/`

**Files:** `src/hooks/urlHashFor.ts` → `src/services/url/urlHashFor.ts`

It is a pure codec, not a hook, and it already imports from `services/url/focusUrl.ts`.

- [x] `npm run move-files -- --dry src/hooks/urlHashFor.ts src/services/url/urlHashFor.ts`
      — inspect the rewrite list.
- [x] `npm run move-files -- src/hooks/urlHashFor.ts src/services/url/urlHashFor.ts`
- [x] Grep for `urlHashFor` in non-TS contexts (`.md`, `vi.mock` string literals) —
      ts-morph does not rewrite those. See `reference_move_files_blind_spots`.
- [x] `npm run typecheck` → clean.
- [x] Commit (move only, no behaviour).

The test mirror came along automatically (`tests/hooks/urlHashFor.test.ts` →
`tests/services/url/`), and three of the file's four imports collapsed from `../services/url/`
to `./` — `focusUrl`, `milkyWayFocusId`, `bodyFocusId` and `starFocusId` were already its
neighbours-in-waiting. The only `.md` hits are archival (completed plans, the grill
transcript); those are a historical record and stay as written.

### Task 5: Phase A verification + PR 1

- [x] `npm test` → full suite green (871 files / 5038 tests).
- [x] `npm run typecheck` → clean.
- [x] `npm run format` on touched files only. `tests/state/input/keyboardShortcuts.test.ts`
      is left unformatted on purpose: it was already prettier-dirty on `main` (over-long
      import), and T1's one-line `pending` addition is no reason to bury it in an unrelated
      reformat hunk.
- [x] Open PR 1 (`--base main`). Body: the confirmed clobber trace, and that the
      `computeDesiredHash` change is deliberately throwaway. → #519
- [x] **Ask the user** to confirm a cold `#focus=<galaxy>` load keeps its hash in the
      browser. This is a behaviour fix; the unit test proves the logic, not the boot timing.
      Confirmed 2026-07-29 on `#focus=m31`: no extra history entries. The first two
      confirmations were premature — see Task 5b for why the unit tests could not see it.

### Task 5b: the home seed defers to a still-resolving deep link

Found by the browser check, which still showed two history entries after T2. The clobber
had **three** independent causes, not two — each one alone was enough to lose the deep
link, so fixing any subset left the symptom unchanged. That is why the unit test passed
while the browser did not: nothing in the test path ran `wireInput`'s home seed.

The third: the seed guard (`wireInput.ts:211-215`) read the resolved ref slots alone, and a
galaxy/star id parks in `resolveFocusRefDeferring` for the whole boot window with both refs
null. The guard seeded Earth, `resolveRef` cleared `pending.focus` as a side effect, and the
write pushed the bare home hash. The guard was right when every deep link resolved
statically; it had no way to see a deferred one until T1 added `selection.pending`.

- [x] `selectHasSelectionIntent(state)` over all four slots — both refs, both pending ids.
      A named selector rather than a four-way conjunction inlined at the call site.
- [x] `wireInput`'s guard becomes `if (!selectHasSelectionIntent(rootState))`.
- [x] Selector test: false on virgin state, true when only `pending.focus` is set.
- [x] Regression at BOTH levels. The `useUrlSync` integration test replicates the guard
      expression inline, so it cannot catch a change to the real guard; the
      `wireInput.test.ts` case calls the actual function. Both mutation-verified —
      ref-only guard ⇒ `expected [ '/' ] to deeply equal []` and
      `expected { type: 'body', id: 'earth' } to be null`.
- [x] Commit. → `98fc216b`

Accepted consequence: a junk `#focus=zzz` parks forever and so suppresses the Earth seed for
that session. The seed cannot distinguish "still resolving" from "never will". Consistent
with T2's accepted consequence (junk ids are no longer scrubbed off the URL).

**Decided 2026-07-29 — junk URLs are deliberately not handled. Do not re-open this.** The
boot pose already frames Earth, so a suppressed seed is not a blank screen. The residue is
that the follow-pivot driver never engages, so the globe drifts out of frame as the live
sim clock advances (`wireInput`'s seed comment: "pose alone would drift"). Judged not worth
a resolver timeout or a give-up path for a URL the visitor mistyped.

Latent, NOT fixed here: `updateSelectionFocus` clears `pending` unconditionally, so any
direct ref write retires an in-flight request. Nothing in the boot path does that once the
guard is fixed. Same entanglement as the `twin-request-selection-sagas` backlog item —
direct writes and request resolutions share one action.

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

- [x] Tests: each row's `read(value)` action output, including `orientation` rejecting a
      junk frame via `isOrientationFrameId` and `t` no-oping on an unparseable ISO string.
- [x] Tests: each row's `readAbsent()` output. Freeze time for `t` — `readAbsent` builds
      `goLive({ simDays, nowMs })` and so reads the wall clock.
- [x] Tests: `focus.write` returns the pending id while pending, the encoded target once
      resolved, and `null` for home-Earth (`EARTH_REF`) — the omit rule that keeps a fresh
      load on a bare URL.
- [x] Do NOT test the table's contents as a registry mirror (`conventions/testing.md`).
- [x] `npm test -- hashParamSources` → green.
- [x] Commit. → `05ea588c`

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
saga _start_. Without the guards the suite breaks.

`writeHashBody` owns compare-and-skip: caches the last body it wrote, reads
`window.location.hash` only when the desired body differs, and a `hashchange` invalidates
the cache. Uses `pushState` (not `replaceState`) — rationale in spec §3.4.

- [x] Test `writeHashBody skips a pushState when the body is unchanged`.
- [x] Test `writeHashBody drops the '#' entirely for an empty body` — the bare-URL form.
- [x] Test that each function no-ops with no `window` (the node-env path).
- [x] `npm test -- services/url` → green.
- [x] Commit. → `0e6fa11c`

### Task 8: `hashBodyFor(state)`

**Files:** `src/state/url/hashBodyFor.ts` (new), tests

**Signature:** `hashBodyFor(state: RootState): string`

Replaces `computeDesiredHash` minus its `matches` half (that moved into `writeHashBody`).
Walks `HASH_PARAM_SOURCES` in table order — order is load-bearing for byte-stable links.

- [x] Test the empty case, single-param cases, and a multi-param compose asserting **table
      order** (`focus=…&t=…&orientation=…`).
- [x] Commit. → `213b953a`

### Task 9: `watchHashWriteSaga`

**Files:** `src/state/url/watchHashWriteSaga.ts` (new),
`tests/state/url/watchHashWriteSaga.test.ts` (new)

Harness mirrors `tests/store/effects/reconcileSagaHarness.ts` — real RTK store + saga
middleware, `environment: 'node'`, `services/url/writeHashBody` mocked via `vi.mock`. Fork
only this saga (not `mainSaga`) so the test is scoped.

`WRITE_TRIGGER` shape in spec §3.3. **This is where Q6's residual risk lives** — one test
per trigger, dispatching the real action:

- [x] `requestFocus writes the pending id to the hash`
- [x] `setSelectionRow writes the resolved target` — `setSelectionRow` is the sole writer
      of `selectionRows.focus`, so it stands for every resolution path
- [x] `clearSelection empties the hash`
- [x] `a time-slice action writes t` — assert via the prefix predicate, not a literal
      action, so a seventh reducer stays covered
- [x] `setOrientation writes a non-default frame`
- [x] `mergeSnapshot writes the restored orientation` — the tour scene-restore path.
      **Withdrawn in `04265447`:** `orientation` sits outside `SettingsSnapshot`, so
      `mergeSnapshot` provably cannot move the row's `write` output. The trigger was
      dropped from `writesOn` and the test with it; see
      `docs/backlog/2026-07-29-tour-snapshot-orientation.md`.
- [x] `commitCameraPose does NOT trigger a write` — pins the frame-path exclusion that the
      whole `writesOn` design exists to buy
- [x] Commit. → `efe40a05`, `04265447`

### Task 10: `watchHashReadSaga` + the `watchHashSaga` parent

**Files:** `src/state/url/watchHashReadSaga.ts`, `src/state/url/watchHashSaga.ts` (new), tests

Shape in spec §3.3. `isInitial` appears exactly once, in `applyHash` — it is a property of
the pass, not of any row.

Still unforked from `mainSaga`; T12 does that.

- [x] Test `the initial pass dispatches read actions for present params`.
- [x] Test `the initial pass dispatches nothing for absent params` — the mount suppression
      that stops a bare load clobbering the engine's Earth seed (`wireInput.ts:204-215`).
- [x] Test `a hashchange to a bare hash dispatches readAbsent for every param` — Q8's
      behaviour change. Assert `setOrientation(DEFAULT_ORIENTATION)` specifically.
- [x] Test `the channel is closed on cancellation` (the `finally` arm).
- [x] Commit. → `50f36e20`

### Task 11: `hasDeepLink` derives its hash keys from the table

**Files:** `src/utils/url/hasDeepLink.ts`, tests

Derive from `HASH_PARAM_SOURCES.filter((s) => s.deepLink)`. `?tour` stays a literal —
query gates are out of scope (spec §1).

No import cycle: verified `uiSlice → buildInitialUiState → hashParamSources → {selection,
settings, time slices}` and none import back into `state/ui/`. Re-verify after T6 lands.

- [x] Test `#t=<iso> counts as a deep link` — currently false; this is the drift Q2 fixes.
- [x] Test `#orientation=galactic does NOT count` — `deepLink: false`, a view preference.
- [x] Delete the stale docblock line naming `?debug`, `?volumes`, `?anchors` as gates
      (verified 2026-07-28: none are read anywhere).
- [x] Commit. → `a2bde5cf`

### Task 12: atomic cutover — fork, delete the hook

**Files:** `src/store/rootSaga.ts`, `src/components/App/App.tsx`,
`src/hooks/useUrlSync.ts` (delete), `src/hooks/hashParamSources.ts` (delete),
`src/@types/hooks/HashParamSource.d.ts` (delete), `tests/hooks/useUrlSync.test.ts` (delete)

- [x] Fork `watchHashSaga()` into `mainSaga`; add its line to the `rootSaga` docblock
      (`rootSaga.ts:6-23` — the prose list is hand-maintained; a backlog item tracks that).
- [x] Drop `useUrlSync()` + its import from `App.tsx:47,94`. Check whether anything else in
      `App.tsx` existed only to feed it, as #507's cutover found for the keyboard hook.
      Nothing did: the hook took no arguments and reached the store itself, so App kept no
      prop, selector or memo on its behalf. Two prose mentions of "URL sync" in the header
      and the cinema-branch comment went with it.
- [x] Delete the hook, the old table, the old `@types` file, and the old test file.
      `src/@types/hooks/` is now empty and removed with them.
- [x] Grep for `useUrlSync` / `computeDesiredHash` / `DesiredHashInput` across `src/`,
      `tests/`, and `docs/` — #507 needed a follow-up commit for six comments still naming
      a deleted symbol. Fix the comments in **this** commit. Known sites:
      `buildStaticAnchorStructures.ts:14`, `wireStructureProjection.ts:65`,
      `wireInput.ts:169,207`, `parseHashParams.ts:5`, `hasDeepLink.ts:12`. Two the list
      missed: `urlHashFor.ts:8` (named `computeDesiredHash`) and `CLAUDE.md`'s `hooks/`
      tree line. `hasDeepLink.ts` was already rewritten by T11.
- [x] `npm test` → full suite green.
- [x] Commit. (`53c213dc`)

### Task 13: entanglement-radar + Phase B verification

- [x] Run the `entanglement-radar` skill over the Phase B diff. Specifically check: does
      any row still carry a field only one row uses, and did `writesOn` end up restating
      something a selector already knows?
      **Answer to both: no.** `read`/`write` are inverses over one wire format and cannot
      vary independently; `deepLink` has a genuine third consumer (`hasDeepLink`); and
      `writesOn` states which dispatches can MOVE a value, which no selector encodes.
      The six-field table stands. The radar's own top finding was elsewhere — per-action
      publishing — and is fixed in `b5f3712d`.
- [x] `npm test` → green (882 files / 5829 tests). `npm run typecheck` → clean.
      `npm run format` on touched files.
- [x] Confirm no `src/hooks/` file remains that is not a hook. The port left nothing
      behind; `buildAliasIndex.ts` is a PRE-EXISTING non-hook (extracted 2026-05-06, one
      importer) and is filed to the backlog rather than folded into this diff.
- [x] Open PR 2 (`--base main`, after PR 1 merges). → #525
- [x] **Ask the user** for a visual pass: cold `#focus=<galaxy>` load; share a link with a
      paused clock and confirm the instant restores; `#orientation=galactic` then Back, and
      confirm the frame returns to default (Q8's new behaviour).
      Extended after the radar: the checklist was rebuilt around TWO-param URLs, because a
      one-param check provably cannot see an intermediate publish — every intermediate
      compose equals the final one and compare-and-skip hides it. Confirmed 2026-07-30.
- [x] `/feature-done` audit BEFORE merge — it gates on the DoD, then relocates this plan
      and the spec to `plans/completed/` + `specs/completed/`.

---

## Notes for the implementer

- **No backlog item to sweep** — this work had none (verified 2026-07-28). Four _new_
  backlog items were filed as adjacent findings; leave them alone.
- **Behaviour changes are exactly two** (spec §5): the clobber fix (Phase A) and
  back/forward restoring all params (Q8, T10). Everything else must be neutral — if you
  find yourself changing observable behaviour anywhere else, stop and report.
- **`readAbsent` is not uniformly pure.** `t`'s reads the wall clock. That asymmetry is
  known and accepted; do not "fix" it by threading a clock parameter through every row.
