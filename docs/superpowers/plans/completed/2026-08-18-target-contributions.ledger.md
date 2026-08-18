# SDD ledger — plan: docs/superpowers/plans/2026-08-18-target-contributions.md

Branch refactor/target-contributions, draft PR #575, base at plan commit c1a3f62cc.
Plan adversarially reviewed pre-execution (COMMIT-WITH-AMENDMENTS, 17/17 findings
applied): .superpowers/plan-reviews/2026-08-18-target-contributions-review.md.
User approved execution 2026-08-18 ("you can move on to rung 2").
Artifact task board: https://claude.ai/code/artifact/4027c9f0-17bf-42e4-a686-7aa096283852
(mirror only — this ledger is authoritative).

Protocol (carried from rung 1): controller makes NO file edits in main context —
all edits via bg subagents; controller gates typecheck + tests natively; implementers
attempt targeted vitest and report if the environment blocks them. Never merge from
this worktree; squash via gh api, announced first.

## Pre-flight conflict scan (2026-08-18)
Plan was adversarially reviewed + amended pre-execution; this scan checks the AMENDED text's self-consistency.
| Pair / task | Shared surface | Produce vs consume | Finding |
|---|---|---|---|
| T2/T3/T4 | RenderTargets.d.ts, renderTargets.ts, renderTargets/hdrActiveOf/volumeUpsampleLayer tests | each adds a distinct member (specOf+clearValue / sizeOf / scale-union+reconcile) | clean — strict T2→T3→T4 order declared and load-bearing (finding 2) |
| T4/T6 | gpuHandleRegistry.ts | T4 reshapes renderTargets row; T6 swaps format literals | clean — T4→T6 declared |
| T5/T6 | renderTargets.ts | T5 renames buildSpecs→renderTargetRows; T6 edits rows inside it | clean — T5→T6 declared |
| T7/T8 | createUpsampleLayer | produce→consume | clean |
| T9 | docblocks Tasks 2–4 shape | consume | clean — runs last of code tasks |
| T1 | initGpu/wireInput/buildSwapRenderers only | independent | clean |
| T2 self | 12 clearValue entries = 7 named + 5 bloomN | — | agrees with DoD |
| T3 self | clamp-test relocation sanctioned by parity gate 1 | — | agrees |
| T4 self | 3 remaining specs.find sites; DoD total 11 = 4(T2)+4(T3)+3(T4) | — | agrees |
| T5 self | filtered gate OK: rename is export-only, tsc covers importers | — | agrees |
Scan clean — no rulings needed. Reviews pipeline; T2–T6 implementation strictly sequential.

## Task flow
- Task 1 dispatched (sonnet, bg). BASE c1a3f62cc. Brief: task-1-brief.md; report: task-1-report.md.
- Task 1 DONE (commit b97abebfe; typecheck clean, 16/16 filtered tests). Reviewer dispatched (sonnet, inline verdict). Task 2 implementer dispatched in parallel (sonnet, bg; BASE for T2 = b97abebfe) — T1/T2 files disjoint, reviews pipeline.
- Task 1: complete. Review Spec ✅ / Quality approved; type-soundness of the parameter-supertype trick independently verified; one cosmetic nit in the report prose only (comment is 3 lines, report said 2) — no action.
- Task 2 DONE (commit 10b819cdc). Controller gates: typecheck clean, full suite 7005/7005. Test-count note: 7005 vs rung-1's 7008 is main-side history (atmosphere PRs), NOT this branch — T2 diff verified to delete zero tests (+2 added). Reviewer + T3 implementer dispatched in parallel (T3 BASE = 10b819cdc).
- Task 2 review: Spec ✅ / Quality findings — 6, all Low/Info, none blocking. Dispositions:
  - Ruling: finding 1 (the plan-mandated `every declared row carries a clearValue` test is compiler-redundant) — adopt reviewer's reshape: assert the a-channel split instead (hdr+swap a=1, all others a=0), which tests the actual merge-loss the plan feared and satisfies testing.md. Overrides the plan's test-body text; the plan's INTENT (catch a silent clear-value loss) is preserved — cost if wrong: one weaker test.
  - Fix round 1 queued for findings 1-3 (test reshape; re-add the bloom0 a=0 rationale clause; two stale `.specs` comments in hdrActiveOf.ts + its test). DEFERRED until T3 commits — the fix touches renderTargets.test.ts/hdrActiveOf.test.ts which T3 is editing now; no parallel implementers.
  - Finding 4 (hdrActiveOf tightening unnamed in commit msg): accept as noted, no amend.
  - Finding 5 (TARGET_CLEAR_VALUES mentions in engine-composition-map.md:72,111 + current-contracts-map.md:267): folded into Task 9's sweep scope — carry pointer in T9 dispatch.
  - Finding 6 (pre-existing comment-budget overage in renderTargets.ts, improved by this commit): no action.
- Task 3 DONE (commit d955bb225). Controller gates: typecheck clean, 7005/7005 (net-zero count: 2 clamp tests out, sizeOf case + relocation in). T3 reviewer (sonnet) + T2 fix round 1 (resumed T2 implementer) dispatched in parallel — T4 waits for the fix-round commit.
- Task 3: complete. Review Spec ✅ / Quality approved, zero findings; size-map lifecycle (allocate/resize/destroy) independently verified; the 3 extra renderFrame* test files ruled justified (cast stubs would runtime-throw once layers call sizeOf).
- Task 4 dispatched (opus, bg — core task; BASE for T4 = 8dc9aaf81). T2 fix-round re-review (sonnet) in flight.
- Task 2: complete. Fix round 1 (8dc9aaf81) re-review verdict ALL FINDINGS ADDRESSED — alpha-split test sound (GPUColorDict cast verified against all dict-form rows), bloom0 clause restored, stale comments fixed, no drive-bys.

## In-flight handling plan (written for compaction safety, 2026-08-18)
- IN FLIGHT: Task 4 implementer (opus, bg, agent a6f291d7086d132ae). Its uncommitted edits explain any transient tsc diagnostics; it gates itself (typecheck + FULL npm test) and commits.
- ON T4 DONE: controller gates natively (npm run typecheck + full npm test); review-package with BASE 8dc9aaf81 → HEAD; dispatch T4 reviewer on OPUS (core task — verify reconcile semantics vs the brief, parity relocations of the runFrame divisor describe, bloomSrcTexelSize numeric-consequence note in commit msg, one construction site for state.gpu.renderTargets). Fix rounds: resume implementer ≤3, escalate 4-5.
- THEN sequential implementation, reviews pipelined: T5 (sonnet; filtered gate targetParity+renderTargets) → T6 (sonnet; formats single-source, compositor hdrFormat literal EXEMPT) → T7 (sonnet; TDD, new files only) → T8 (sonnet; four layers onto primitive) → T9 (sonnet; docblock sweep — CARRY T2-review finding 5: TARGET_CLEAR_VALUES doc-drift in engine-composition-map.md:72,111 + current-contracts-map.md:267) → T10 (controller gates; USER visual smoke per plan list incl. divisor slider + ZoA lettering; perf before/after with --url http://localhost:5174 — dev server shell bam5o4gzh; decisions.md #12 already committed with the plan, verify it's in the PR diff).
- AFTER T10/all reviews: /feature-done audit → completion commit (plan+ledger to completed/) → push → gh pr ready 575 (announce; merge only on user's word via gh api squash route, announced) → update memory project_engine_subsystem_bundles.md + artifact board (URL in ledger header).
- Task board mirror: republish scratchpad/engine-ladder-board.html at the same URL as tasks complete (labels tN-done).
- Task 4 DONE_WITH_CONCERNS (commit b3b9acc27). Controller gates: typecheck clean, 7007/7007 (+2 reconcile tests net). Concern rulings: (1) three unlisted comment-only resize→reconcile renames = T9's finding-6 list done early, ACCEPTED — T9 dispatch must note these are done; (2) header shrunk per-paragraph not to 10 total, ACCEPTED (≤10 governs new headers); (3) five inert resize:vi.fn() stragglers in cast stubs — reviewer to judge. Reviewer dispatched on opus (BASE 8dc9aaf81); T5 implementer (sonnet) in parallel (BASE b3b9acc27).
- Task 5 DONE (commit 813e6f285). Controller gates: typecheck clean, 7010/7010 (1044 files, +3 parity tests). T5 reviewer (sonnet) in flight.
- Task 4 review: Spec ✅ / Quality approved, 6 findings (4 Minor: Size.d.ts + RenderTargets.d.ts + EngineGpuHandles.d.ts dangling resize prose, delete 5 straggler resize:vi.fn() stubs [reviewer overruled implementer's keep]; 2 Nit: circular MW_DIVISOR comment, "divisor in force"→"size in force"). Also verified: reconcile edge cases sound, allocate-takes-resolved-pixels deviation ruled strictly better, boot-divisor neutrality confirmed. Fix round 1 dispatched (resumed T4 implementer); T6 QUEUED behind the fix commit (renderTargets.ts contention).
- Task 5 review: Spec ✅ / Quality one nit — targetParity.test.ts header 11 lines incl. delimiters (budget ≤10). Ruling: trim-don't-waive (rung-1 T8 precedent). Queued as a one-line trim for the T5 implementer AFTER the T4 fix round commits (shared git index — no parallel committers). Reviewer confirmed the three parity tests cross-check genuinely independent lists.
- T4 fix round 1 committed (c91d65de0; filtered gates green). Scoped re-review dispatched (sonnet). T5 header trim dispatched (resumed T5 implementer). T6 dispatches once the trim commits.
- Task 4: complete. Fix re-review verdict ALL FINDINGS ADDRESSED (10 files, all comment/dead-stub hunks, no logic).
- Task 5: complete (trim commit 69a5ec941 closes the header nit).
- Task 6 implementer dispatched (sonnet, bg; BASE 69a5ec941).
- Task 6 DONE (commit bebd38a81). Controller gates: typecheck clean, 7010/7010. Reviewer (sonnet) + Task 7 implementer (sonnet, TDD, new files only; BASE bebd38a81) dispatched in parallel.
- Task 6: complete. Review Spec ✅ / Quality approved, zero findings — greps verified the constants replaced every literal with exactly the compositor exemption remaining, and the exemption's premise was checked against compositor.ts itself.
- Task 7 DONE (commit 7954db423). Controller gates: typecheck clean, 7014/7014 (1045 files, +4 primitive tests). Editor's module-not-found diagnostic was stale (file exists, tsc clean). Reviewer (sonnet) dispatched; T8 deliberately WAITS for this verdict — it would inherit any primitive defect (esp. the viewOf-before-null-check question).
- Task 7: complete. Review Spec ✅ / Quality approved — draw signature byte-matched against ContentLayer.d.ts, viewOf resolved only inside the null-guard (same as today), postBlit independence exact. Info note: @types comment ratios over nominal budget but matching committed local practice for contract files — accepted, no action. T8 implementer dispatched.
- Task 8 DONE (commit 05ccfddb4; agent died once to machine sleep pre-edit, resumed cleanly). Controller gates: typecheck clean, 7014/7014. Ruling: milkyWayUpsampleLayer 13-line header ACCEPTED (brief's keep-list content beats the line count; reviewer verifies it's keep-list, not padding). Reviewer (sonnet) + Task 9 implementer (sonnet; carries T2-review doc-drift scope + notes T4 did the resize-comment sites early) dispatched in parallel; T9 BASE 05ccfddb4.
- Task 8: complete. Review Spec ✅ / Quality approved — ZoA postBlit verified byte-for-byte (own guard, fresh liveness call, LABEL_RADIUS_MPC intact), enabled predicates identity-preserved, passes/index.ts untouched at positions 263/267/290/308. Header line-count delimiter ambiguity noted, no action.
- Task 9: complete. Review Spec ✅ / Quality approved, zero findings; adjacent-paragraph coherence edits ACCEPTED (verified narrow). Parked one-liner for any future PR: current-contracts-map.md:62 mermaid label still says buildSpecs (outside T9's rewritten paragraphs).
- Task 10 controller items: gates green (typecheck clean, 7014/7014); decisions.md #12 confirmed in PR diff (+18/-3 vs origin/main). PERF: paired A/B via scratch worktree at c1a3f62cc (perf skill procedure; scratchpad/perf-base, node_modules+public/data symlinked to MAIN checkout — worktree's own node_modules is only a .vite cache, packages resolve by walking up). First branch runs read ~45ms consistently — STALE HMR-churned dev server (skill gotcha), evaporated on restart: fresh-server branch 20.9/31.3 vs base 34.7 merged-total median, star-aggregates slot brackets base. VERDICT: no regression beyond noise (machine noise ~±10ms merged total; Apple Silicon inflation applies). Row scales verified identical base↔branch via git diff. Perf JSONs: scratchpad/perf-*.json.
- REMAINING for Task 10: USER visual smoke (dev servers: branch http://localhost:5174, base-for-comparison http://localhost:5175). After attestation: cleanup scratch worktree (git worktree remove scratchpad/perf-base + kill bizpk3z1x), then completion sequence per the in-flight plan above.
- Task 10 USER SMOKE ATTESTED (2026-08-18): items 1-5 check (scene, ZoA lettering, divisor slider, resize, HDR toggle). Item 6 (HUD slot identity) "not 100% sure, no obvious perf regressions" — accepted: timedSlotsGroupKeys.test.ts covers slot identity in CI, perf verdict already NO REGRESSION.
- USER DIRECTIVE during smoke: set the Milky-Way aggregateDivisor DEFAULT to 6. Ruling: honored as its OWN commit on this PR, explicitly labeled as user-requested tuning — NOT folded into the behaviour-neutral rung commits. Dispatched.

## Post-smoke additions (2026-08-18)

- Divisor default: 9a5443c57 (3 -> 6, milkyWayCalibration.ts only) — gated
  (typecheck + 7014 tests by agent, controller typecheck re-run clean), PUSHED.
- USER DIRECTIVE (mid-turn): (a) comment-convention audit over all rung-2
  touched files; (b) turn that audit into a project skill.
  Ruling: both land on PR #575 as their own commits (audit commit, then skill
  commit), sequenced before the completion commit — cheap to drop if the user
  wants the skill elsewhere. Audit scope = git diff c1a3f62cc..HEAD code files
  (32 src + 15 tests); docs excluded (prose). Agents sequential (shared index).
- USER: skill agent may run in PARALLEL with the audit agent (overrides the
  sequential ruling). Mitigation: disjoint paths, explicit-path staging, retry
  on index.lock contention.
- Skill commit amended -> aef3a290e (stat replaced with a LINK to comments.md's
  2026-07-30 measurement; stat was genuine but restating numbers would drift).
- USER: "for the rest the PR looks good" — content sign-off on #575. Merge
  still gated on an explicit merge instruction.
- USER: "once the comment fix is in you can land it" — MERGE AUTHORIZED for
  PR #575, conditional on the comment-audit commit landing + gates green.
  Sequence: gate -> push -> checkbox/memory delegate -> /feature-done audit ->
  completion commit -> push -> pr ready -> squash-merge via
  `gh api -X PUT repos/rulkens/skymap/pulls/575/merge -f merge_method=squash`
  (announced) -> board/memory/workspace cleanup.

## Completion (2026-08-18)

- Comment audit 256eb62c8 (13 files, 96 del / 54 rewritten) + /comment-audit
  skill aef3a290e; controller gate typecheck clean + 7014/7014; PUSHED.
- Checkboxes 95/95 ticked (delegate verified against tree, not just ledger).
- /feature-done audit: tests PASS 7014, typecheck PASS, TODO scan clean,
  no backlog straggler, smoke attested in-session, deferred items documented
  in "Out of scope, with reasons". No spec file — plan resolves against
  docs/research/engine/decisions.md (noted, per mini-plan convention).
- READY -> archiving ledger, moving plan to completed/, completion commit,
  pr ready, squash-merge per user authorization.
