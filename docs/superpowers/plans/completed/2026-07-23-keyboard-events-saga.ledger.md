# Progress — Keyboard-events saga

Branch: keyboard-events-saga
Plan: docs/superpowers/plans/2026-07-23-keyboard-events-saga.md
Spec: docs/superpowers/specs/2026-07-23-keyboard-events-saga-design.md
Base commit (merge-base main): recorded below per task.

Workflow: SDD. Tasks 1/2/3 parallel (worktree-isolated bg opus implementers);
4→5→6 sequential. Reviewers per task. Main thread runs npm gate + cherry-pick/commit.
One PR, prep (Task 1) commit first (spec §8).

## Base
Branch HEAD at start: RECORD
Branch HEAD at start: 36f95b01

## Task status
Task 2: complete (cherry-picked e8633fc5, review clean — no findings). stepRate util.
Task 1: cherry-picked 5ad29334 (typecheck clean, combined with T2); review dispatched.
  Downstream notes: Action from '@reduxjs/toolkit'; RootState from 'store/types';
  KeyboardShortcut from '@types/state/input/KeyboardShortcut'; getState via
  getContext<() => RootState>('getState'), seeded in createAppStore. Listener still
  routes via emit(handler.key); `run` consumed by the Task 5 saga, not the listener.
Task 3: cherry-picked c2568c29; review dispatched. Helper: logCameraState(cam) at
  src/services/engine/helpers/logCameraState.ts, called logCameraState(state.cam).
Task 1 REVIEW: 2 findings → fix wave:
  - CRITICAL: createAppStore seeds setContext(getState) AFTER run(mainSaga); spec §3.4 says
    BEFORE (my brief was wrong). Task 5 saga reads getContext('getState') as first unguarded
    effect at fork → undefined at boot. FIX: swap the two lines.
  - IMPORTANT: createKeyboardListener hotkeys.filter reimplemented from scratch, drops hotkeys-js
    built-in type-exception list (range/checkbox/…) + readOnly. FIX: compose over captured builtin.
Full combined gate after T1+T2+T3 cherry-picks: typecheck clean, 868 files / 5029 tests green.
PR #507 (draft) opened, base main.

## DESIGN PIVOT (user, 2026-07-24) — drop getState apparatus entirely
preventDefault becomes a static `boolean` on KeyboardShortcut (was boolean|predicate).
Saga reads state via `yield* select()` (repperjs idiom) for run(). REMOVE getState from
saga context: no setContext in createAppStore, no SagaContext.getState. Listener takes
only `shortcuts` and does `if (s.preventDefault) e.preventDefault()`. Ordering landmine MOOT.
Tour keys: OMIT preventDefault (preserves space-activates-button outside tours; drops the
inert during-tour swallow). `/`,`command+k`,`ctrl+k`,`tab`: preventDefault true. Filter-
compose-over-builtin fix STILL applies.
→ Task 1 REDONE (task-1b). Task 3 review: SPEC ✅ approved, 1 Minor (ReconcileEffects.ts
  docblock not updated — defer to final). Task 3 complete.

## ── RESUME MAP (before compaction, 2026-07-26) ──
Branch keyboard-events-saga, HEAD bb489ba3. PR #507 (DRAFT, base main) open.
Gate GREEN at HEAD: typecheck clean, 868 files / 5029 tests.
Commit chain since 36f95b01(merge main): e8633fc5(T2 stepRate) 5ad29334(T1 getState-form)
  c2568c29(T3 logCameraState) bb489ba3(T1 REVISION: boolean preventDefault, getState removed).

DESIGN (locked with user): preventDefault = static boolean (NO predicate). Saga reads state
  via yield* select() for run(). getState apparatus fully REMOVED (no setContext, no
  SagaContext.getState — createAppStore.ts/store/types.ts net-zero). Listener filter COMPOSED
  over hotkeys-js builtin. Tour keys OMIT preventDefault. `/`,cmd+k,ctrl+k,tab = true.

STATUS:
- Task 2 (stepRate): COMPLETE, review clean. commit e8633fc5.
- Task 3 (logCameraState action+reconcile): COMPLETE, review ✅ (1 deferred Minor: ReconcileEffects.ts
  docblock not updated). commit c2568c29.
- Task 1 (prep, revised): commit bb489ba3, gated green. REVIEW IN FLIGHT (agent a3e3e8715502fdba6).
  When it returns: if Critical/Important → ONE bg fix subagent → re-gate → re-review; if clean/Minor → mark
  T1 complete, proceed to Task 4.

NEXT (sequential, all in MAIN checkout, bg opus implementers, review each):
- Task 4: KEYBOARD_SHORTCUTS map + SHORTCUTS_BY_KEY + tests. BRIEF READY (boolean preventDefault
  version): scratchpad/task-4-brief.md. Depends on T1/T2/T3 (all in tree).
- Task 5: watchKeyboardEventsSaga drain (uses yield* select() for run, NOT getContext) + takeEvery(
  logCameraState) arm + asArray util. BRIEF NOT YET WRITTEN — must specify select()-in-saga, no getState.
- Task 6: atomic cutover — rootSaga fork swap (watchTourKeyboardSaga -> watchKeyboardEventsSaga),
  DELETE useKeyboardShortcuts.ts + UseKeyboardShortcutsInput.d.ts + watchTourKeyboardSaga.ts+test,
  rewire App.tsx (remove hook import/call + dead useCallbacks). Full suite gate.
- Task 7: USER manual key sweep. Then FINAL whole-branch review (opus) + /feature-done BEFORE merge.

HOUSEKEEPING:
- Rescued stray change: .superpowers/sdd/rescue-tweenToClip-from-body-sphere-tessellation.patch
  (belongs to body-sphere-tessellation session; git apply it there; do NOT commit on keyboard branch).
- Briefs+reports+diffs for each task in scratchpad/ (task-N-brief.md / task-N-report.md / task-N-review.diff).
- Squash-merge PR #507 via `gh api -X PUT repos/rulkens/skymap/pulls/507/merge -f merge_method=squash`
  after user sign-off. Post-merge: update MEMORY (keyboard-events shipped); NO sync-r2 (no .bin).

## ── POST-COMPACTION RESUME (2026-07-26) ──
Task 1 (prep, revised): COMPLETE. Review (agent a3e3e8715502fdba6) came back CLEAN — spec ✅,
  quality approved, no Critical/Important. 2 Minors both sanctioned by brief (TOUR_SHORTCUTS dead
  `run` field → deleted in T6; useKeyboardShortcuts hand-rolled guard → later-epic target). commit bb489ba3.
→ Dispatching Task 4 (KEYBOARD_SHORTCUTS map). Brief: scratchpad/task-4-brief.md.
Task 5 BRIEF now WRITTEN: scratchpad/task-5-brief.md (overrides spec §3.3 stale getState sketch —
  saga reads via yield* select((s:RootState)=>s); logCameraState arm reads getContext<ReconcileEffects>
  ('reconcile') lazily per-action; asArray util created if none exists). Dispatch AFTER Task 4 lands
  (imports SHORTCUTS_BY_KEY from Task 4; both in main checkout → strictly sequential).
Task 4 (KEYBOARD_SHORTCUTS map): DISPATCHED, agent aad1c4e93eb4c356f (sonnet, bg). Awaiting report.

Task 4 (KEYBOARD_SHORTCUTS map): COMPLETE. commit 3a1034d5. Gate green (tsc clean; full suite
  869 files / 5035 tests). Review (agent ad65719b): SPEC ✅, CODE QUALITY Approved. 2 Minors, both
  non-blocking + forward-looking (watchTourKeyboardSaga local TOUR_SHORTCUTS redundancy → resolved by
  T6 deletion; SHORTCUTS_BY_KEY has no consumer yet → T5 consumes it). 2 LSP diagnostics were phantom
  (tsc exit 0).
→ Dispatching Task 5 (watchKeyboardEventsSaga + logCameraState arm + asArray). Brief: scratchpad/task-5-brief.md.

Task 6 BRIEF now WRITTEN: scratchpad/task-6-brief.md. Cutover map fully traced:
  - rootSaga.ts: swap import(L53)+fork(L73)+docblock(L18) watchTourKeyboardSaga → watchKeyboardEventsSaga.
  - App.tsx: remove hook import(L49)+call(L118-125)+3 useCallback wrappers(L104-112)+dispatch decl(L70)+
    useAppDispatch import+uiSlice action import(L63)+useCallback react import(L33); FIX 3 docblock/comment
    refs. KEEP handleRef/selected/paletteOpen/uiHidden/debugPanelOpen (all used elsewhere).
  - DELETE: useKeyboardShortcuts.ts, UseKeyboardShortcutsInput.d.ts, watchTourKeyboardSaga.ts + its test.
  - Full-suite gate (behaviour change + test deletion). Dispatch AFTER Task 5 lands+reviewed.
TASK 7 (user manual sweep) WATCH-ITEMS (intended behaviour shifts from the pivot — NOT bugs):
  (a) Space no longer preventDefaulted outside a tour → again activates focused button / scrolls (intended).
  (b) `/` preventDefault now static true, relies on form-field filter when palette input focused.
  (c) hotkeys-js 'f' case-handling vs old explicit f||F; also h/e, d — confirm letters still fire.
Task 5 (watchKeyboardEventsSaga): DISPATCHED, agent aeb61cb9801281a13 (opus, bg). Transient asArray.ts
  tsc diagnostic seen mid-work (Array.isArray + readonly-generic narrowing) — implementer self-gates on tsc.

Task 5 (watchKeyboardEventsSaga + logCameraState arm + asArray): COMPLETE. commit 4bbb3708. Gate green
  (tsc clean; full suite 871 files / 5044 tests). Review (agent acc58938, opus): SPEC ✅, CODE QUALITY
  Approved. Concurrency verified correct (takeEvery fork non-blocking; parent-cancel tears down both;
  finally closes channel). asArray `[value as T]` cast sound (documented tsc TS2322 fix). All 5 test
  paths genuinely distinct incl. lazy-getContext arm. 1 non-blocking Minor (case-1 toContainEqual).
→ Dispatching Task 6 (atomic cutover). Brief: scratchpad/task-6-brief.md.

## ── USER-REQUESTED FOLLOW-UP: Task 6b (decomplect logCameraState arm) ──
User proposed extracting the takeEvery(logCameraState) arm out of watchKeyboardEventsSaga into its own
saga forked from mainSaga. AGREED (surface-agnostic command→effect, watchGoHomeSaga precedent).
Task 6b (task list #25). BRIEF WRITTEN: scratchpad/task-6b-brief.md.
  - NEW src/state/camera/watchLogCameraStateSaga.ts (bare takeEvery→reconcile.logCameraState, lazy getContext).
  - watchKeyboardEventsSaga.ts: remove arm + unused imports (getContext/takeEvery/logCameraState/ReconcileEffects)
    + drop the arm doc section → pure channel-drain.
  - rootSaga.ts: ADD watchLogCameraStateSaga fork (alongside Task 6's watchKeyboardEventsSaga swap).
  - Tests: MOVE the logCameraState-arm case from watchKeyboardEventsSaga.test.ts → new
    watchLogCameraStateSaga.test.ts (count preserved).
  SEQUENCING: dispatch AFTER Task 6 lands+reviewed (Task 6 edits rootSaga.ts → no concurrent edit).
  Then Task 6b review, then final whole-branch review + Task 7 manual sweep + /feature-done.

Task 6 (atomic cutover): landed commit c645ee88, DONE_WITH_CONCERNS. Gate green (tsc clean; full suite
  869 files / 5023 tests, exit 0). Test count −21 vs Task 5 (5044→5023): 2 test files deleted
  (watchTourKeyboardSaga.test.ts + tests/hooks/useKeyboardShortcuts.test.ts) — coverage RESTRUCTURED into
  keyboardShortcuts.test.ts (run logic) + watchKeyboardEventsSaga.test.ts (drain). Reviewer (agent
  a5e5ff9a, opus) directed to confirm moved-not-lost. Deletions: the 4 named + useKeyboardShortcuts.test.ts
  (in-scope). App.tsx removals exactly per brief; kept handleRef/selected/paletteOpen/uiHidden/debugPanelOpen.
  REVIEW IN FLIGHT.
5 STALE COMMENT REFS confirmed (comment-only, no imports): keyboardShortcuts.ts:25,73 (watchTourKeyboardSaga);
  createKeyboardListener.ts:27 (useKeyboardShortcuts hook, also a history note); TimeBarContainer.tsx:8;
  useEngine.ts:12. → Task 6c (task list #26), doc sweep, sonnet, AFTER 6b.
PIPELINE: Task 6 review → Task 6b (extract watchLogCameraStateSaga) → Task 6b review → Task 6c (doc sweep)
  → FINAL whole-branch review (opus) → Task 7 user manual sweep → /feature-done → squash-merge PR #507.

Task 6 COMPLETE. Review (agent a5e5ff9a, opus): SPEC ✅, CODE QUALITY Approved (approve for merge).
  Behaviour preserved key-for-key, no double-handling, all 5 kept App.tsx symbols have live consumers.
  Coverage verdict: mostly MOVED; 2 gaps VANISHED →
    (Important) form-field guard: bespoke contentEditable line in createKeyboardListener.ts has NO test
      (spec §7 said don't test the filter = hotkeys-js contract; the contentEditable sliver is OURS — tension).
    (Minor) trivial mappings unasserted: tab/d/h,e/shift+n + ctrl+k comma-split half.
  Also: keyboardShortcuts.ts:25,73 comments are FACTUALLY WRONG (claim watchTourKeyboardSaga swallows tour
    keys; deleted + tour keys omit preventDefault) → Task 6c must CORRECT not just rename.
→ Dispatching Task 6b (watchLogCameraStateSaga extraction). Coverage-restore scope = pending USER decision
  (spec §7 tension on the filter test).

USER DECISION on coverage-restore: "Mappings only" — add trivial key→action assertions; do NOT add a
  createKeyboardListener form-field-filter test (spec §7 leaves the filter to hotkeys-js). Form-field
  guard gap ACCEPTED as-is.
Task 6c BRIEF WRITTEN (scratchpad/task-6c-brief.md), now TWO commits: (1) doc sweep — correct 5 stale
  comments incl. the factually-wrong keyboardShortcuts.ts:25,73; (2) trivial-mapping assertions in
  keyboardShortcuts.test.ts (tab/d/h,e/shift+n/ctrl+k). Dispatch AFTER 6b. Sonnet.
Task 6b (watchLogCameraStateSaga extraction): DISPATCHED, agent ac37f97b (sonnet, bg). Awaiting report.

Task 6b COMPLETE. commit aedf6a3c. Gate green (tsc clean; full suite 870 files / 5023 tests). Review
  (agent a84f6dbe, sonnet): SPEC ✅, CODE QUALITY Approved, NO findings. Behaviourally-inert extraction,
  canonical takeEvery-body fork, test moved with parity (5→4+1). 6th stale comment (logCameraState.ts:4)
  folded into Task 6c.
→ Dispatching Task 6c (doc sweep of 6 comments + trivial-mapping tests, 2 commits). Brief updated to 6.

Task 6c LANDED: d319f581 (docs sweep, 6 comments incl. asArray.ts 6th) + 2d535902 (5 mapping tests).
  Gate green (tsc clean; full suite 870 files / 5028 tests; keyboardShortcuts.test.ts 11/11). Both grep
  gates zero. REVIEW IN FLIGHT (agent a8041b50, sonnet). LSP diagnostics on test file = phantom (tsc clean).
  Note: implementer reworded a 6th file asArray.ts (accurate ref to still-existing watchKeyboardEventsSaga)
  to satisfy grep gate — reviewer assessing as harmless.
NEXT after 6c review clean: FINAL whole-branch review (opus) over merge-base 36f95b01..HEAD, then Task 7
  user manual sweep, then /feature-done, then squash-merge PR #507.

Task 6c COMPLETE. Review (agent a8041b50, sonnet): SPEC ✅, CODE QUALITY Approved, no Crit/Imp. 1 Minor
  (asArray.ts reword, accepted). ALL IMPLEMENTATION TASKS DONE (1,2,3,4,5,6,6b,6c).
→ FINAL whole-branch review dispatched (opus). Code diff = 36f95b01..2d535902 (10 commits, 86KB).
  Requirements = spec 42a02ba8 + plan 4d12dc99. Real merge-base = 08b626fd.
ACCUMULATED MINOR ROLL-UP handed to final review:
  M1 (Task3) ReconcileEffects.ts top docblock prose omits the new logCameraState closure (field present L35). Cosmetic.
  M2 (Task5) watchKeyboardEventsSaga.test.ts case-1 uses toContainEqual (assertion strictness). Non-blocking.
  M3 (Task6) form-field guard test gap — USER DECIDED mappings-only, ACCEPT as-is (do NOT reopen).
  M4 (Task6c) asArray.ts comment reword — accepted.

## ── FINAL WHOLE-BRANCH REVIEW (agent ae74edc5, opus) ── VERDICT: MERGE. No Crit, no Imp.
Feature delivered per spec §5/§8; sanctioned simplification clean (no getState residue anywhere).
Minor findings:
  m-a: Shift+F/H/E/D no longer fire (plain + CapsLock DO). Old hook fired on e.key==='F' etc (shift OR caps).
       hotkeys-js needs exact modifier match. Near-zero impact (not advertised; caps preserved). USER DECISION.
  m-b: contentEditable guard in createKeyboardListener is REDUNDANT — hotkeys-js 4.0.4 builtin ALREADY
       filters contentEditable; the comment claiming it doesn't is WRONG. Decision: KEEP guard as version-
       insurance, FIX comment to be honest. (Connects to M3 — the untested line hotkeys-js already owns.)
  m-c: STALE comment missed by doc-sweep: CommandPalette.tsx:12 "Triggered by a keyboard shortcut (handled
       in App.tsx)" — now the saga. One-line fix. → FIX.
  m-d: `f` uses selectSelectedRef vs old refOf(selectSelectedFocusable) — transient edge, new arguably more
       correct. Note only, ACCEPT.
  M1: ReconcileEffects.ts docblock (L13-18 lists 4 effects) omits logCameraState (field L35); sibling
       makeReconcileEffects docblock WAS updated → asymmetry. → FIX (one line).
  M2: toContainEqual — ACCEPT. M3 — ACCEPT by user decision. M4 — ACCEPT.
PLAN: fix M1 + m-c + m-b-comment (+ m-a IF user says preserve) in ONE fix commit → re-gate → then Task 7
  manual sweep → /feature-done → squash-merge PR #507.

USER DECISION m-a: ACCEPT simplification (Shift+F/H/E/D won't fire; no code change).
Task 6d (task list #27) DISPATCHED, agent a1f64470 (sonnet): M1 docblock + m-c CommandPalette comment +
  m-b (verify hotkeys-js 4.0.4 covers contentEditable → remove redundant filter override + fix comment).
  ONE commit, full-suite gate. After 6d lands+gated: quick self-review (comment/inert), then Task 7 user
  manual sweep, then /feature-done, then squash-merge PR #507.

Task 6d: agent hit weekly API limit but COMMITTED + reported before dying (died in finalization only).
  commit f9947d74. Reviewed inline by main thread: M1 docblock ✓, m-c CommandPalette comment ✓, m-b
  REMOVED redundant hotkeys.filter override — verified against installed hotkeys-js@4.0.4
  dist/hotkeys-js.js:198-216 (builtin checks target.isContentEditable directly → override was inert).
  Doc section rewritten honestly. tsc clean (main thread); grep confirms no filter override code remains.
  Full-suite gate re-running on main thread. Task 6d COMPLETE.
ALL CODE COMPLETE. Remaining: Task 7 (user manual sweep) → /feature-done → squash-merge PR #507.
  HEAD = f9947d74. Branch keyboard-events-saga. 11 feature commits since 36f95b01 merge.

## ── SHIPPED ── PR #507 squash-merged to main = 089ddd1c (2026-07-28).
Task 7 sweep confirmed by user. /feature-done READY → completion commit 67306cfb (plan+spec moved to
completed/, 41 checkboxes ticked, backlog already swept). Marked PR ready (was draft), squash-merged via
gh api PUT /merge. Full suite 870/5028, tsc clean. NO sync-r2 (no .bin). All tasks 1-7 + 6b/6c/6d complete.
MEMORY: no entry needed — feature is recorded in git + specs/completed/; shipped-fact = git history.
DONE.
