# camera-commit-authoritative — ledger (resume map)

Worktree: `.claude/worktrees/camera-commit-authoritative`, branch `worktree-camera-commit-authoritative`
off main 2aeeff1b9. Data linked. Brief (AMENDED, now 5 deliverables):
`.claude/worktrees/fix-atmosphere/.superpowers/parked/2026-09-21-camera-commit-authoritative.md`
(copy of the Everest dump at scratchpad `earth-everest.json`; original at
`.claude/worktrees/fix-atmosphere/.superpowers/spike-poses/earth-everest.json`).

Rules: failing test first · no Co-Authored-By trailer ever · draft PR at start · squash at end ·
Sonnet implementers, main agent hand-edits nothing >2 files · one final review · CI is the gate.

## Dispatch 1 — DONE 2026-09-21: draft PR #785, commits dc686c5f6 test · 5bbe7e8bb fix · d47562b13 workarounds · 86df48721 dump key; suite 9220 green, typecheck clean, CI watch started

Brief given: `CameraRuntime.base` (store base last reconciled, by identity); in `stepCameraRuntime`
`winnerLastFrame = stored.camera.base === prev.base ? prev.register.winner : 'resting'` used for
replayInput / commitOnEdge.prevWinner / DriverCtx; `next.base = actions.reduce(cameraReducer,
stored.camera).base`; two tests in `tests/services/engine/camera/stepCameraRuntime.test.ts`
(A body-arm commit under followHold → base identity kept, displayed == commit, winner resting;
B world-arm commit → distance adopted); perf hook drops the rAF wait (keeps setAutoRotate: wake
reason); flyToLonLat keeps tween, header rewritten; `logCameraState` gains `framed` key
(= `outputs.displayed`); suite + typecheck + format; push; draft PR.

**On its report**: check failing-test evidence, SHAs, PR URL. Then dispatch 2. Do NOT resume the
isolation agent; a fresh Sonnet agent in this worktree.

## Dispatch 2 — IN FLIGHT 2026-09-21 (design RULED: no counter — user: "commitSeq is local state, bad practice")

Why dispatch 1 alone is not enough: `watchOrientationChangeSaga` re-encodes `base` into the new
basis via `commitCameraPose` from outside the loop. That is "same pose, new basis", not new
truth; under a followed body after a wheel zoom `base.distance` is STALE (the notch only updates
the follow memory, `replayInput` ~L212), so reading it as an outside commit would snap the zoom
back; mid-approach it would retarget the approach to `base.distance`. Also a commit landing
mid-approach is baked over at saturation (approach row outranks resting, not arm-gated).

Design (clean cut, one writer fewer, NO discriminator state):
1. The LOOP re-encodes. `CameraRuntime.orientation: OrientationFrameId` (the committed frame the
   loop last reconciled, beside `base`). In `stepCameraRuntime`, before the replay: if
   `stored.settings.orientation !== prev.orientation` and `isWorldArm(stored.camera.base)`,
   `reencodePose(base.pose, ORIENTATION_FRAMES[prev.orientation], ORIENTATION_FRAMES[stored…])`,
   fold `commitCameraPose(absoluteArm(reencoded))` into the camera snapshot every stage reads
   and push it FIRST into `actions` (an own commit → `next.base` identity stays consistent).
   `next.orientation = stored.settings.orientation`.
2. `watchOrientationChangeSaga` no longer puts `commitCameraPose`; it persists the frame and
   starts the frame tween only (header rewritten; its test follows). Side effect, intended: the
   URL `orientation` row's snap now also holds the eye still.
3. `seedCameraRuntime({ state: RootState, projection })` copies `base` (identity) and
   `orientation` from the store; callers dispatch first, then seed (wireInput swap L130/L139;
   engine.ts:103; harness seedPose).
4. Outside commit DELIVERS the framing: `approachDone = external || …`,
   `followIn = external ? settledMemory(followIn) : followIn` (export `settledMemory`).
5. Tests: orientation switch under followHold after a wheel keeps the zoomed distance AND the eye
   world position (re-encode holds the eye); commit mid-approach → next frame renders it, winner
   not followApproach; watchOrientationChangeSaga no longer commits.
6. `#pose=` row + `applyUrlPose` command + `watchUrlPoseSaga` (commit when engine status is
   ready, else after the ready action) + `encodeFramedPose`/`decodeFramedPose` in
   `src/utils/url/` + `l`-key share URL (effect returns `{ framed, simDays }`, log saga composes
   `hashBodyFor` params + `t` from the frame's simDays + `pose`). Details unchanged from the
   earlier brief text below the After section.

## After dispatch 2 — USER RULING 2026-09-21: TWO PRs

- PR #785 = the FIX only: dispatch 1 commits + Part A commit(s) (re-encode in loop, debt settling).
  When the agent reports: reset this branch hard to the last Part A SHA, push with force-with-lease,
  trim the PR body to the fix (drop #pose bullets + deep-link manual checks).
- PR 2 = the FEATURE: new worktree/branch `url-pose-deep-link` from the fix branch, cherry-pick the
  Part B commit(s), draft PR with base `worktree-camera-commit-authoritative` (stacked, gets CI);
  retarget to main after #785 merges. Body: #pose row, encoding tags, read-only, deferred-to-ready,
  Everest string, manual checks.
- PR 3 (later, off main after #785): distance-truth un-braid — `base.distance` is the truth, follow
  memory holds only the OWED framing distance, any commit pays it; wheel under follow commits;
  delete `followDistanceTarget` lane + `DriverCtx.winnerLastFrame`/`followDistanceTarget` + 3
  re-capture branches. Golden exposure: wheel mid-approach traces move. User has seen the sketch.

- One final review (code-review skill, whole branch). CI watch after every push.
- User ask (2026-09-21): compare my line-count ESTIMATE vs the actual diff. Estimate given for
  deliverables 1–4 only: src ≈ +3 net (field+seed+step +6..8, perf hook −4, fly header −1..2,
  dump +1), tests ≈ +50. Report `git diff --stat main...HEAD` split src/tests, plus the
  code/comment/test/doc breakdown, and say what the counter/reencode/deep-link additions cost
  beyond the estimate.
- Verification per brief: suite + typecheck; `npm run perf -- --url http://localhost:<port>`
  before/after one scenario; manual `?perf` commit check; deep link cold open of
  `/#t=2026-09-21T01:43:21.690Z&pose=<encoded Everest>` (no splash, pose held), `l` URL
  reproduces, Back/forward leaves the camera alone.
- /feature-done → squash-merge → /wt-close. Update memory
  `project_camera_commit_authoritative.md`.

## Dispatch 2 — DONE 2026-09-21: 94a1604ce test · 3736dc775 fix (Part A) · ff127d777 #pose= (Part B); CI GREEN on ff127d777

Split IN PROGRESS: feature branch `worktree-url-pose-deep-link` pushed at ff127d777, worktree
`.claude/worktrees/url-pose-deep-link` (data linked, npm ci done). BLOCKED on user go for
`git reset --hard 3736dc775 && git push --force-with-lease` on THIS branch (denied once) + trim
#785 body (drop #pose bullets + deep-link manual checks; PR body saved at scratchpad pr785-body.md).

Dispatch 3 IN FLIGHT (Sonnet, in wt url-pose-deep-link): `copy URL` button above `copy all` in
CameraStateSection (user ask); `shareUrlFor` extracted to `src/state/url/`, snapshot gains
`framed`; agent opens the stacked draft PR (base worktree-camera-commit-authoritative) + CI watch.
On report: check SHA/PR, one final review per PR, estimate-vs-actual report per PR.
Dev servers: fix wt :5174 (shell bj8g29ezy).
Dispatch 3 REDISPATCHED with `isolation: worktree` (subagents inherit this session's wt pin; the
sibling wt `url-pose-deep-link` was REMOVED, its branch stays local+origin at ff127d777). On its
report: `git branch -f worktree-url-pose-deep-link <sha>` + `git push origin
worktree-url-pose-deep-link` from THIS wt, `gh pr create --draft --head worktree-url-pose-deep-link
--base worktree-camera-commit-authoritative`, CI watch; later clean the agent-* wt + branch.
Dispatch 3 DONE: e8844dabc (copy URL button, shareUrlFor) → branch worktree-url-pose-deep-link
pushed; draft PR #787 (base worktree-camera-commit-authoritative), CI watch bg bccpe94i5.
Review notes for the final pass on #787: saga + shareUrlFor headers are 6 lines (budget ≤5).
Agent wts to clean at feature cleanup: agent-a93c49514da038348, agent-a5e0b2d19f5c65ca5 (+ branches).
STILL BLOCKED on user go: reset #785 branch to 3736dc775 + force-with-lease + body trim.

## SPLIT DONE 2026-09-21 (no-reset route, user picked): fix = branch `worktree-camera-fix` @3736dc775, draft PR #788 (base main); feature = #787 retargeted onto worktree-camera-fix; #785 CLOSED. This wt now has worktree-camera-fix checked out (old branch worktree-camera-commit-authoritative kept @d8a372104 until cleanup). User SMOKE-TESTED the fix OK and said "785 can be merged" → gates first: code-review skill (bg @code-review) + CI watch #788 (bg b82qemaoh) → /feature-done → squash-merge #788 → retarget #787 to main + merge main in → its own review/smoke (deep link + copy URL) → /wt-close. Estimate-vs-actual report still owed per PR.
#788 CI GREEN @3736dc775. Final review: 8 findings. Fix-up dispatch IN FLIGHT (Sonnet, this wt):
reducer identity contract comment+test · 3 stale cross-file comments (applySceneEffect/SceneEffect/
restoreSceneSaga) · tail-only next.base fold · 3 headers ≤5 · successor mid-roll re-switch test.
FLAGGED to user (not fixed): (1) dump `framed` = outputs.displayed (projected) — reviewer says
register.pose/base is the round-trippable one under pan/tilt-pin; (3) engine destroyed + orientation
switch + re-create leaves base in the old frame (narrow); (4) register not re-encoded during a HELD
drag on a switch (pre-existing). Then /feature-done → squash #788.
USER FINDING 2026-09-21: seedCameraRuntime takes `state: RootState` → bad practice. QUEUED after the
fix-up agent lands (same file): REFINED by user: keep passing the state object, type it `Pick<RootState, 'camera' | 'settings'>` (one-file type change in seedCameraRuntime.ts; call sites unchanged). Also sweep `stepCameraRuntime`'s `rootState` input? NO — StepInputs.rootState predates this PR.
/feature-done on #788 RUN 2026-09-21: suite 1350/9222 green, typecheck clean, no TODOs/smells, parity moved not dropped,
smoke ATTESTED (user), deletion audit (opus) → safe-now APPLIED 08571ea19 (report: deletion-audit-788.md beside this
ledger); 7 needs-ruling items (A–G) to user. No plan/spec to move (brief-driven); ledger archived at #787's gate (it
serves both PRs). Backlog straggler `camera-pose-url-hash` = #787's sweep. VERDICT: READY pending CI on 08571ea19 +
user rulings A–G + merge word. Open user thread: runtime-into-store (replaces PR 3) — brainstorm on user go.
USER RULING 2026-09-21: audit A,C,D,E,F,G CUT, B KEPT. Dispatch IN FLIGHT (Sonnet, this wt) applying them → one
commit + push + CI watch. On report: verify SHA/CI, then squash-merge #788 on the user's merge word (already given:
"785 can be merged" → applies to the fix PR), then /wt-close prep + retarget #787 to main + merge main into it.
#788 MERGED 2026-09-21 → main d15de44c2 (audit cuts landed 08885be6b, CI green; PR marked ready then squashed).
#787 RETARGETED to main; this wt now has `worktree-url-pose-deep-link` checked out (:5174 serves it). Main merged in
a677c3417 (6 conflicts = fix files main squashed with later fix-ups, feature commits never touched them → theirs);
npm ci, typecheck clean, suite 1358/13404 green, pushed; CI watch bg b7530zc2z. NEXT: final review #787 (headers
saga+shareUrlFor 6 lines → ≤5) → user smoke (Everest cold-open URL in memory file, `l` URL, copy URL, back/forward)
→ backlog sweep `camera-pose-url-hash` + archive this ledger → /feature-done → squash on merge word → estimate-vs-actual.
Branch `worktree-camera-fix` is merged: delete local+origin at cleanup.
USER SMOKE #787 ATTESTED 2026-09-21 ("works well"); user asks that testers can use it → README feature bullet
"Reproduce a view" (l key prints link to console / copy URL in debug panel Camera section) committed + pushed.
Still waiting: final review (@code-review) + CI on the new head. Then archive ledger → /feature-done → squash on word.
USER 2026-09-21 mid-turn: copy URL + copy all → one row at the TOP of the Camera section; `copy all` → `copy JSON`.
Sonnet dispatch IN FLIGHT (this wt, 3 files: tsx, module.css, test) → commit + push. README note says "copy URL", unaffected.
On report: verify SHA, user eye-check :5174, wait review + CI, archive ledger → /feature-done → squash on word.
UI row DONE 9af467dfb (copy URL + copy JSON at top of Camera section). FINAL REVIEW #787: 8 findings. Fix wave
IN FLIGHT (Sonnet, this wt, 5 commits): (1) arrival hash canonicalized via replaceState — #pose= arrival pushed a
pose-less entry = Back trap, CONFIRMED in code (t row writesOn + pose write null); (4) decode rejects empty/≤0;
(5) one-fn-per-utils-file + bodySelectionRow reuses isSceneBodyId; (6) 3 headers ≤5; (7) shareUrlFor keeps search.
CUT: (8) clipboard .catch (l key already prints the URL; same pattern as copy JSON).
FLAGGED to user, unfixed: (2) non-orbital focus (galaxy/star/structure/site) share link is overwritten by the
#focus= fly-to tween landing (commitsOnEdge) — only bodies (follow driver + #788 handoff) reproduce; fix needs a
design (store flag "pending url pose" the tween saga honours, or drop the tween when a pose arrived);
(3) watchUrlPoseSaga gates on engineStatus 'ready' (a catalog-count pulse from createLayers) which can precede
wireInput's seed commit → theoretical overwrite; no store-visible "seeded" signal exists today.
On report: verify SHAs + suite, CI watch, user ruling on (2)/(3), archive ledger → /feature-done → squash on word.
USER 2026-09-21: "lets land this pr, but go on to the two items that need fixing" → MERGE WORD for #787 (after fix wave
+ CI green + /feature-done). THEN follow-up PR off main for (2) focus tween vs URL pose + (3) ready-vs-seed ordering.
Design seed for the follow-up: put the arrived pose in the camera slice (`applyUrlPose` reducer); wireInput seeds FROM
it (kills the ready-wait saga and item 3); the arrival focus tween either targets the URL pose or is skipped — ordering
trap: focus row dispatches BEFORE pose row inside applyHash, and a galaxy tween defers until its store is fed (after
ready). Brainstorm with the skill before coding.
FIX WAVE DONE 2026-09-21: 9cd737358 (arrival canonicalized, hashArrivalApplied + writeHashBody mode) · 16506f78f
(decode strict) · 0458c56e2 (helpers → utils/scene + utils/url) · b09def7ad (headers) · d226f70f2 (search kept).
Suite 1361/13431 green. CI watch bg bq6huuzd7 on d226f70f2. Deletion audit (opus) IN FLIGHT → report at
deletion-audit-787.md. On both: apply safe-now, /feature-done (archive THIS ledger to
docs/superpowers/plans/completed/2026-09-21-camera-commit-authoritative.ledger.md, no plan/spec exist), push, CI,
squash-merge #787 (merge word given), estimate-vs-actual, then follow-up branch for items (2)+(3).
CI on d226f70f2: Workers build pass; GitHub Actions never received the synchronize event (no run; workflow has no
dispatch) → the next push triggers it. DELETION AUDIT #787 (opus): lean, zero dead logic, ceiling ~118 LOC. Applied
by Sonnet IN FLIGHT: safe-now 1–6 + rulings C (shareUrlFor test fold), E (renderedFrame derived from framed.frame),
F (writeHashBody mode required, closure comment gone). KEPT: A/B (focused tests for extracted utils = CLAUDE.md),
D (console.warn on malformed pose = tester diagnostic). On report: archive ledger, /feature-done commit, push, CI, squash.
Audit cuts DONE 1bb52b0b3 (src −20, tests −39; suite 1361/13430). NO CI run since 9af467dfb: main moved under the PR
(landmine ci-stale-on-main-move) → merging origin/main IN PROGRESS: rootSaga resolved by me (watchTourSaga → main's
watchTakeoverSaga, keep watchUrlPoseSaga); CameraStateSection.tsx 3-way (main restructured it: CopyButton, modelOf/
copyTextOf/poseSnippetOf, view-pose copy; ours: copy URL + copy JSON row at top) → Sonnet IN FLIGHT finishes the merge,
npm ci, gates, push. On report: verify, CI watch, user re-eye-check the button row, archive ledger, /feature-done, squash.
MERGE of main DONE fd20a95da (CopyButton is render-time text → copy URL/JSON stay plain buttons; main's modelOf.ts read
the renamed `renderedFrame` → fixed to `framed.frame`); suite 1366/13688 green; CI running. User-reported Mars limb
band (bright hard boundary at ~130 km) REPRODUCED headlessly via the #pose= URL (scratchpad mars-shell.png); suspect
main's #790 depth-source prep (lastDepthClear keyed by target only) — belongs to the fix-atmosphere session; bisect
offered. /feature-done #787: READY (suite green, typecheck clean, smoke attested, review 8 findings → 5 fixed +
1 cut + 2 deferred to follow-up, deletion audit applied, backlog swept b7319062e, no plan/spec exist) → ledger archived
to docs/superpowers/plans/completed/2026-09-21-camera-commit-authoritative.ledger.md in the completion commit.
FOLLOW-UP (own PR off main after squash): (2) focus tween overwrites URL pose for non-orbital focuses; (3) ready-vs-seed
ordering — design seed above (slice holds the arrived pose; wireInput seeds from it).
