# SDD ledger — plan: docs/superpowers/plans/2026-08-10-rhizome-scfd-importer.md

Branch: rhizome-importer-design (main checkout — user-directed; PR #546 draft).
Execution start HEAD: a4e3affd1.
Process notes: bg implementers self-tsc only, NO npm and NO commits — main thread
runs `npm test` + `npm run typecheck` gate, then commits (memory
feedback_bg_subagents_no_npm). Pipelined reviews per sdd-execution.md Rule 2;
implementers strictly serial. Dispatch order 1,2,3,4,5,6,7,8; tasks 5-8 share
buildRhizomeVolume.ts + its test file (serial, no pipelining among them).
Plan's five open questions resolved pre-execution (see plan "Open questions"):
rule-10 prefix = blockAverageCube; guard split check/call-site; Task 1 ships
under-pinned (Task 7 pins); quick-look visual DoD waits on fork sidecar or
hand-written one; blockAverageCube lands unwired by design.

Task 1: implementer DONE (self-tsc clean; two comment-only deviations noted in
report). Gate green (typecheck + buildMcpmVolume test, zero test edits).
Committed 05ef0b95b. Review dispatched (BASE a4e3affd1, HEAD 05ef0b95b).
Task 2: implementer dispatched (pipelined; files disjoint from Task 1 review).
Task 1: minor (deferred): module header 11 lines w/ delimiters vs ≤10 budget.
Task 1: minor (deferred): clamp-≥0 guard rationale comment dropped in trim —
  the "looks redundant, would get fixed back" landmine note; consider restoring
  one line in packLogTraceVoxels.ts.
Task 1: minor (deferred): implementer report overstated header fidelity (no
  CF-4 mention) — report-accuracy only, no artifact change.
Task 1: complete (commits a4e3affd1..05ef0b95b, review clean)
Task 2: implementer DONE (self-declared extra: non-object-JSON guard, untested).
Gate green (typecheck + 6/6 polyphyTraceSidecar). Committed bdae48d6c.
Review dispatched (BASE 05ef0b95b, HEAD bdae48d6c).
Task 3: implementer dispatched (pipelined; new files only, disjoint).
Task 2: minor (deferred): non-object-JSON guard has no covering test (7th test
  candidate if the guard is load-bearing).
Task 2: minor (deferred): rule-4 sub-cases (non-integer dims, negative voxel,
  non-array) implemented but untested — coverage-could-be-broader.
Task 2: minor (deferred): frame-list order in error message differs from spec's
  illustrative text — immaterial, substring-pinned.
Task 2: complete (commits 05ef0b95b..bdae48d6c, review clean)
Task 3: implementer DONE (unwired confirmed by grep). Gate green (typecheck +
3/3 blockAverageCube). Committed 995ef2029. Review dispatched (BASE bdae48d6c,
HEAD 995ef2029).
Task 4: implementer dispatched (pipelined; disjoint from open reviews 3).
Task 3: minor (deferred): no factor=1 / full-collapse [2,2,2]→[1,1,1] tests —
  reviewer hand-traced both, correct; coverage-could-be-broader.
Task 3: minor (deferred): describe-scope shared fixture across tests 1-2.
Task 3: complete (commits bdae48d6c..995ef2029, review clean)
Task 4: implementer DONE (brief line numbers ±1, no drift). Gate green
(typecheck + 3 tests/2 files). Committed 4a096f097. Review dispatched
(BASE 995ef2029, HEAD 4a096f097). Stale editor diagnostics on syncR2 noted
mid-flight; tsc clean — noise, per reference_stale_editor_diagnostics.
Task 5: implementer dispatched (pipelined; new files, disjoint from review 4's
edit set). Tasks 5-8 serial from here (shared buildRhizomeVolume.ts).
Task 4: review NEEDS FIXES — Important: 'mcpm-large.scfd' literal restated 3x
  (assertNoQuickLookSentinel.ts header + runtime Error message,
  quickLookSentinelPath.ts header) vs one-home constraint; runtime message is
  the consequential one. Minor: quickLookSentinelPath comment ratio 7:4.
  Fix round 1 QUEUED behind Task 5's in-flight implementer (freeze rule:
  no new implementer dispatches until Task 4's loop closes).
Task 5: implementer DONE (corroborated via scratchpad tsx run; rule-order
9-before-8 flagged unobservable). Gate green (typecheck + 4/4). Committed
79bb985a0. Review dispatched (BASE 4a096f097, HEAD 79bb985a0).
Task 4: fix round 1 dispatched (resumed original implementer; 3 literal sites
+ comment-ratio minor). Task 6 dispatch remains frozen until loop closes.
Task 4: fix round 1/5 — implementer DONE (basename-derived filename; grep-
confirmed literal gone). Gate green (typecheck + 2/2). Fix commit fb20f2497.
Scoped re-review dispatched (FIX_BASE 79bb985a0 = fix commits only under
pipelining, HEAD fb20f2497).
Task 5: minor (deferred): module header 14 lines vs ≤10 budget (precedent:
  buildMcpmVolume's is 17 — inherited, not a regression).
Task 5: minor (noted, no action): provenance/valueUnits console echo flagged
  "beyond scope" by reviewer — it is spec-mandated (Decision 2 sidecar table:
  "echoed to the console at build time"); ruling: keep.
Task 5: minor (deferred): no f8-acceptance test (squeeze coverage is Task 7).
Task 5: complete (commits 4a096f097..79bb985a0, review clean)
Task 4: fix round 1/5 (1 addressed — literal derivation verified correct;
minor comment-ratio improved 1.75→1.0 but still >0.5, does not extend loop).
Task 4: minor (deferred): quickLookSentinelPath.ts comment ratio 1.0 vs ≤0.5
  budget (4-line file; convention is "not a lint gate" — final review triages).
Task 4: minor (deferred): assertNoQuickLookSentinel.ts ratio ~0.57, pre-
  existing overage, fix improved it.
Task 4: complete (commits 995ef2029..4a096f097 + fix fb20f2497, review clean
after round 1)
Task 6: implementer dispatched (loop closed, freeze lifted).
Task 6: implementer DONE. Gate green (typecheck + 5/5). Committed 430284f87.
Review dispatched (BASE fb20f2497 — first package mistakenly spanned the
Task 4 fix commit, regenerated). Task 7 NOT pipelined (plan mandates 5-8
strictly serial incl. open reviews — shared test file).
Task 6: minor (deferred): spread % in message is display-rounded toFixed(2);
  raw sizes echoed alongside — informational only.
Task 6: complete (commits fb20f2497..430284f87, review clean)
Task 7: implementer dispatched (serial; expected test-file-only).
Task 7: implementer DONE (test-file-only confirmed; builder untouched;
independent index derivation matched brief). Gate green (typecheck + 8/8,
transpose pin passed first run = characterization). Committed 494f954d1.
Review dispatched (BASE 430284f87, HEAD 494f954d1). Task 8 waits (serial).
Task 7: complete (commits 430284f87..494f954d1, review clean, zero findings)
Task 8: implementer dispatched (last implementation task).
Task 8: implementer DONE (flag-scan parser deviation self-declared; 3
unreachable-return hints; tsx sanity runs of error paths, quick-look NOT run).
Gate green (typecheck + 8/8). Committed 17b3a5005. Review dispatched
(BASE 494f954d1, HEAD 17b3a5005).
Task 8: review NEEDS FIXES — Important (plan-mandated): sentinel-after-build
  ordering leaves truncated-reference-without-sentinel open on mid-write
  failure. ADJUDICATION: spec mandates no ordering (plan clause was incidental
  phrasing, not a considered decision); spec intent (structural impossibility)
  decides → sentinel-BEFORE-build governs. Plan + spec text amended in place;
  user informed, ruling reversible. Minor: 3 unreachable returns (fix rolls
  in). Minor (deferred): degenerate no-positional arg combo mis-parses to a
  downstream error instead of usage; exits 1 either way.
Task 8: full suite green mid-stream (947 files / 6261 tests).
Task 8: fix round 1 dispatched (resumed original implementer).
Task 8: fix round 1/5 — implementer DONE (reorder + comment + returns
removed). Gate green (typecheck + 8/8). Fix commit a2d1437be (code + plan/spec
ruling amendments). Scoped re-review dispatched (FIX_BASE 17b3a5005).
Task 8: fix round 1/5 (2 addressed — three-path failure trace confirms
dangerous state unreachable; no new breakage).
Task 8: complete (commits 494f954d1..17b3a5005 + fix a2d1437be, review clean
after round 1)
All 8 tasks complete. Branch pushed a4e3affd1..a2d1437be. Full suite green
(947/6261). Final whole-branch review dispatched (opus, merge-base 4533b371c,
HEAD a2d1437be; pointed at deferred minors for triage).
Manual DoD items outstanding (cross-repo blocked / visual): quick-look against
a real cube + v1 sidecar, dev-server tier=large visual, sync-r2 refusal live
check. Plan checkboxes untick-ed — sweep before /feature-done.
FINAL REVIEW: verdict "with fixes". Important: (1) --out bypasses sentinel
(cross-task gap; fix = hoist write into builder gated on resolved path);
(2) 58 unticked plan checkboxes. 11 minors triaged: 4/5/7/8/9/10/11/3 fold
into fix wave + spec edits (6, one-home trim) + plan open-question
resolutions (13). All 15 deferred ledger minors triaged fine-to-merge except
T1 clamp-rationale (must-fix, item 4). Minor 12 (near-tautological no-throw
test) no action. Pre-existing mcpmFetcher tier-filename restatement =
backlog candidate, NOT this branch.
Final review reveal: DoD less blocked than assumed — 4/5 manual lines
runnable with hand-written v1 sidecar over existing d2 npy; only the
renders-in-place line needs the fork's cube.
Fix wave dispatched (ONE agent, complete list, sonnet).
MERGED origin/main (1627f9336, clean). Full suite green 1012/6843. PUSHED.
DoD manual pass 2026-08-11 (non-destructive route): hand-written v1 sidecar
at data/raw/mcpm/mcpm_sdss_d2.json (gitignored; tier-2 grid params).
--out to scratchpad → BYTE-IDENTICAL to shipped public/data/mcpm-large.scfd
(shasum b5c1af93). Proves full pipeline + sidecar values + normalisation
parity. --shell inner → clean not-implemented error, exit 1. --out+--quick-look
together → usage error. --out to non-guarded path writes NO sentinel.
NOT live-tested (permission classifier blocked --quick-look overwrite of the
shipped reference; needs explicit user go-ahead): --quick-look overwrite,
sentinel arm, sync-r2 refusal, build-mcpm restore. All four are unit-tested;
the live cycle is optional given byte-identity.
Fix wave DONE (13 items; isQuickLookOutput extracted as exported pure fn in
buildRhizomeVolume.ts — self-declared placement deviation for re-review to
judge). Gate green (typecheck + 22 tests / 5 files). Commit c1725556d.
Scoped re-review dispatched (FIX_BASE a2d1437be, HEAD c1725556d).
Fix wave re-review: 12/12 original findings ADDRESSED; ONE new Important —
`in` on ALLOWED_FRAMES Record admits Object.prototype keys ('toString' etc.)
→ silent frame-byte corruption downstream (regression vs old .includes).
Fix round 2 (fresh sonnet, single finding): Object.hasOwn + landmine comment
+ toString/__proto__ rejection test. Mutation-verified in main thread
(reverted parser → test fails 1/8; restored → 8/8). Gate green (typecheck).
Commit c3bd95694. Adjudicated closed by direct diff inspection (2-line
mechanical fix, prescribed form) — no third re-review round.
Final review + fix loop CLOSED.
USER DIRECTIVE: merge latest origin/main into this branch once done
(main is ahead by #544 dust seeding + #535 frame fix — both src/-side,
low conflict risk). Sequence: fix wave gate+commit → scoped re-review →
merge origin/main → full suite → push → manual DoD pass (hand-written
sidecar quick-look).
USER RULING 2026-08-11: land the PR with 4 manual-DoD lines open — the live
quick-look cycle moves to a post-merge worktree test; renders-in-place stays
cross-repo blocked (PolyPhy PR #114). Audit verdict otherwise clean; plan DoD
lines annotated in place. Housekeeping moves + squash-merge follow.
