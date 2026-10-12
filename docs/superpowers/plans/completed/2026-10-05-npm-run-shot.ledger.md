# SDD ledger — plan: docs/superpowers/plans/2026-10-05-npm-run-shot.md

Branch worktree-npm-shot-tool (in worktree npm-shot-any-pose), draft PR #845, dev server :5177 (this
worktree, bg shell bkih0mfv3). Prep landed as #842 → main 827a3ac1b.
Start answers: parallelism n/a (one plan); perf gate NO; two Sonnet dispatches (tasks 1-4, then 5-6),
one final review. No task is tagged `review: yes`.
User ruling: cosmicWeb capture drift → backlog line, added in this PR.

Dispatch 1: tasks 1-4, sonnet, 2d3f08621 → c5f523d48, done
Task 1: complete (2b45707cd)
Task 2: complete (f19db5bd0)
Task 3: complete (97f1d5ca7)
Task 4: complete (c5f523d48)
Dispatch 2: tasks 5-6, same sonnet agent resumed, c5f523d48 → e6dbb1323, done
Task 5: complete (c4b248dfd)
Task 6: complete (e6dbb1323)
Final whole-branch review, opus: 0 critical, 3 important (--build reused a stale bundle; killed run
orphaned the spawned server; README worktree sentence wrong), 12 minor → review-final-fixes.md
Fix round: e6dbb1323 → e860bad5f, done (12/12), pushed.
Ruling: parked, not fixed — usage-hint rethrow for `Invalid URL`/parseSize; perf repeating the warning
per boot; merging spawnDevServer with spawnPreviewServer (left for the deletion audit / user).
Smoke on :5177 (and a temp second checkout on :5174, since removed): default shot 3200x1800 OK; hide-ui
+ size/dpr OK; two links OK; unknown id → PNG + one-line error + exit 1; --timeout 1 → PNG + exit 1;
no --url → own dev server, port closed after; --build → OK, port closed after; wrong checkout → warning
from shot and from perf.
OPEN 1: --hide-labels still shows labels. Fix 5's 100 ms wait (FADE_OUT_DURATION_MS) is NOT enough: the
label area keeps changing until ~370 ms after the dispatch (measured), then only the 500 ms idle
heartbeat. Needs a real "fades settled" signal or a ruled wait. Awaiting user.
OPEN 2: user asked (a) canvas readback when UI is hidden, (b) JPEG output/default. Measured at DPR 2:
page.screenshot PNG ~770 ms / 5.0 MB; page.screenshot JPEG q90 ~65 ms / 1.1 MB; canvas.toBlob PNG
~265 ms / 8.3 MB; canvas.toBlob JPEG q90 ~65 ms. Awaiting user.

## RESUME (written 2026-10-05 for compaction)

State: branch `worktree-npm-shot-tool` @ e860bad5f, pushed, draft PR #845. Tree clean. No background
agents live. This worktree's dev server: http://localhost:5177 (bg shell bkih0mfv3). Temp worktrees
removed. Implementer agent for fix rounds: a363459564c8387a8 (resume via SendMessage; fresh Sonnet if gone).
Spec: docs/superpowers/specs/2026-10-05-npm-run-shot-design.md (still in specs/, moves to completed/ at
this PR's /feature-done). Prep plan + ledger already in plans/completed/ (PR #842 → main 827a3ac1b).

Waiting on dash ask `wHAd` (3 questions; do NOT guess):
 1. output-format — rec: JPEG q90 default, `--png` for lossless (spec says PNG only → spec + README +
    plan DoD + shotOutName extension + parseShotArgs must change if chosen).
 2. canvas-readback — rec: no.
 3. hide-labels-settle — rec: add `settled()` to `window.__skymap` (no fade animating), used by shot and
    capture-featured. Facts: label area keeps changing until ~370 ms after labelDeclutterActions
    dispatch; FADE_OUT_DURATION_MS (100) wait in shootLink is too short; fadeRegistry has an
    any-animating check (src/services/animation/fadeRegistry.ts ~:156) but it is unverified that these
    labels use it — trace the label fade source first (systematic-debugging), don't guess a timer.

Then, in order:
 a. Apply the three answers (one Sonnet dispatch; hook change = Redux/engine surface → review it).
    If `settled()` is chosen and capture-featured adopts it, re-check the backlog line
    "capture-featured cosmicWeb no longer reproduces…" (docs/BACKLOG.md) — delete it if fixed.
 b. Re-run smokes on :5177: default, --hide-ui --hide-labels (labels must be gone), two links,
    unknown id, --timeout 1, no --url, --build.
 c. Push, watch CI (`gh pr checks 845 --watch`, confirm sha with `gh run list`).
 d. /feature-done on docs/superpowers/plans/2026-10-05-npm-run-shot.md — INCLUDING the deletion audit
    (skipped on the prep PR); parked item for it: spawnDevServer vs spawnPreviewServer near-duplicate.
    Move plan + spec to completed/, archive this ledger, diff breakdown once.
 e. Merge only on the user's explicit word; if main moved, merge main into the branch and re-run CI
    first; squash via `gh api -X PUT repos/rulkens/skymap/pulls/845/merge` (never local merge from a wt).
 f. After merge: /wt-close; stop :5177; delete remote branches worktree-npm-shot-any-pose and
    worktree-npm-shot-tool; note the main checkout (/Users/rulkens/Development/js/skymap) sits on branch
    ccr-0a687515-mz6i8j, 8+ commits behind main, with a stale dev server on :5173.

ANSWERED 2026-10-05 (ask wHAd):
 1. JPEG q90 default, `--png` for lossless.
 2. Canvas readback YES whenever `--hide-ui` is set, for JPEG and PNG alike; page.screenshot otherwise.
 3. `settled()` on `window.__skymap`, used by shot and capture-featured.
Trace: labels fade through TWO sources, both already votes in shouldKeepTicking — the fade registry
(`fades.isAnyAnimating`, labelLayer rows) and the label directors' per-label fades (`labelsAnimating`,
runFrame.ts:319-322). `settled()` = frames until neither is animating. NOT keepTicking as a whole
(auto-rotate / manual play never settle).
Dispatch 3 (answers): fresh sonnet, e860bad5f → 983895954, done. Flag = EngineState.fadesAnimating,
loop = src/services/engine/helpers/waitUntilSettled.ts. Canvas PNG verified opaque.
Controller review of the hook diff: clean. Added 3448e44a9 (`--out` extension decides the format;
`--png` + non-.png `--out` is an error) and ab186ac09 (backlog: cosmicWeb drift is now view-only —
labels gone with settled(), framing still differs). Pushed ab186ac09.
Smokes re-run on :5177: default JPEG OK; --hide-ui --hide-labels → no UI, no labels, 4.8 s end to end.
Ruling: isAnyAnimating runs twice per frame (once for the flag, once in shouldKeepTicking) — a walk
over a few dozen controllers; not worth widening shouldKeepTicking — revisit if the audit disagrees.
Deletion audit (opus) done: safe bin ≈ −32 lines → sonnet dispatch in flight (one commit
`shot: deletion audit, safe bin`, unpushed; also moves readCanvas to tools/utils/shot/).
Needs-ruling → dash ask `5igP` (7 q, do NOT guess): spawn-merge (rec merge into spawnViteServer, needs
`record --serve` re-smoke), signal-handler (rec keep), to-data-url (rec toDataURL in readCanvas),
url-check (rec keep), warn-once (rec once per run), outcome-name (rec rename capture's ShotOutcome →
CaptureOutcome), plan-stale (rec leave plan as record).
ANSWERED (ask 5igP): merge spawners → spawnViteServer; KEEP signal handler; readCanvas → toDataURL;
KEEP --url check; warn once per run; capture's ShotOutcome → CaptureOutcome; plan left as record.
REVERSED by user after dispatch: readCanvas KEEPS toBlob (wanted later for in-app export); agent told
to revert and only MEASURE toBlob vs toDataURL (JPEG + PNG, in-page time) — report numbers to user.
CI green on ab186ac09. Smokes 1-7 shown to user at b8257f9a2 (all as specified).
Dispatch 5 (ruled items): fresh sonnet, base b8257f9a2, in flight — one commit per item, unpushed.
Then: review diff, push, CI, /feature-done moves, diff breakdown; merge only on the user's word.
Dispatch 5 done: ff1867d31 (spawnViteServer, −50), a014c580a (warn once), 91ebabb24 (CaptureOutcome);
readCanvas stays toBlob. Measured in-page: toBlob JPEG 75 ms / PNG 238 ms; toDataURL 62 / 206 ms.
Pushed 91ebabb24; CI watch in bg. Smokes OK incl. `record-clip flyout --serve --frames 5`.
Open nit (unasked): PreviewHandle now also names the dev server → ViteServerHandle?
USER ASK 2026-10-05: extensive perf test of shot (one/many links, views) + suggestions + path to
sub-100 ms. Bench script: .superpowers/bench/shotBench.mts (gitignored), output
scratchpad/bench/out.txt + results.json; full run in bg. Early: ~2800 dev modules/boot (~0.9 s),
50–100 MB data refetched per fresh context, READY_STABLE_MS = 1 s flat. Report findings; propose, don't build.
/feature-done moves still owed after this.
d261b08e9: PreviewHandle → ViteServerHandle (user asked). Then merged origin/main (#843) into branch, pushed.
CI RED, NOT OURS: main @084eda87c fails typecheck in tests/services/engine/frame/deriveBodyStates.test.ts:91
(`orbit` missing on one fixture shape) — reproduced locally after the merge. Needs a fix on main; do not
fix here without the user's word. /feature-done blocked on green.
BENCH DONE (scratchpad/bench/out.txt): one shot 4.8 s (tsx) / 5.3 s (npm); page clock: hook 0.6-0.85,
arrived ~0.8-1.0, loads idle 2.5-2.9, +1.0 s READY_STABLE_MS; boot is decode/upload-bound, not network
(warm cache no gain; preview no gain for bodies). 8 links: 39 s now, 29 s renavigating one page,
17-18 s with 2-4 parallel contexts, 37 s at 8. Hash-change-only path is fast (0.4-0.8 s) but WRONG
pictures today (exhibits not applied, welcome overlay stays). Capture: JPEG 35 ms @DPR1, 80-125 @DPR2.
Suggestions reported to user; nothing built — awaiting their pick.
Safe bin landed: b8257f9a2 (−26 net, tests green), UNPUSHED — push it with the ruled items.
In flight: CI watch (bg shell bh39k9ywj) on ab186ac09. After answers: apply, smoke, push, CI, then
/feature-done moves (plan + spec → completed/, ledger archive, diff breakdown).

Session rules that bit: no `git -C`, no shell variables/loops around git or node in this isolated wt
(split into plain commands); commits carry NO Co-Authored-By; the user is asked via ONE dash ask_user.
