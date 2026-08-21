# SDD ledger — plan: docs/superpowers/plans/2026-08-18-mcpm-workbench.md

Branch: worktree-polyphorm-webgpu-tool · PR #570 (draft) · plan committed at b744637ba.
Spec: docs/superpowers/specs/2026-08-18-mcpm-workbench-design.md (authority).
Harness has no TodoWrite tool this session — THIS LEDGER is the task list of record.

Task order (31): P1 P2 P3 | T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T12 T13[gate] |
T14 T15 T16 T17 T18 T19[gate] | T20 T21 T22 T23[gate] | T24 T25 | V1 V2 V3 (after T13).

## Pre-flight conflict scan (2026-08-18)

Pairs sharing a file/interface — produced vs consumed — finding:

| pair | surface | finding |
| --- | --- | --- |
| P1↔T9 | initGpu(canvas, {requiredFeatures, requiredLimits}) | consistent; T9's MAX_SAFE_INTEGER ask relies on P1 clamp-not-throw, which P1 specifies |
| P2↔T17 | src/utils/volume/packLogTraceVoxels post-move | consistent; T17's widener src/utils/math/f16ToFloat.ts VERIFIED present (+ f16ToFloatLut) |
| P3↔T19 | f16 .npy through buildRhizomeVolume | consistent; P3 sequenced before gate |
| T2↔T3 | `alias GridElem = f32;` single line in io.wesl | consistent — io.wesl declares once, T2 rewrites once |
| T2↔T9 | specializeGridElement(wgsl, element) before createShaderModule | consistent |
| T3↔T4/T5/T10/T20/V1/V2 | package::mcpm::* imports; 13-file family | matches DoD inventory exactly |
| T6↔T8/T9/T16/T21 | CatalogPoints/{positions,log10StellarMass,count,sources} | consistent; SourceType VERIFIED at src/@types/data/SourceType.d.ts |
| T7↔T16 | cubic voxel_size triple → importer 0.5% spread | consistent; T16 test feeds real autoFitGridBox output |
| T8↔T21 | same deriveAgentWeights transform for packed W | consistent (packed W is log10-mass-like; same log10(1+max(W,0)) chain) |
| T9↔T15 | readbackTrace() added to McpmHarness | consistent |
| T14↔T16 | writeNpy(values, shape, '<f2') raw-bits contract | consistent with readNpy's Uint16Array return |
| T16∥T17 | BOTH modify ControlsPanel.tsx | plan marks parallel — WRONG for Rule 2. Ruling R2 below |
| V1∥V2∥V3 | plan claims "mutually file-disjoint" | WRONG: V1+V2 share RenderGraph.ts, viewSlice.ts, probeGpuErrors.ts; V2+V3 share ControlsPanel.tsx. Ruling R1 below |
| T12↔T18/T20/T25/V1/V2 | probe step-queue extensions | additive, sequential by phase — fine |

Per-task self-consistency: checked each task's tests against its stated contract and its file
list against later modifiers — clean except the two parallelism claims above. Cited paths
verified this session: f16ToFloat/{Lut}.ts, SourceType.d.ts, tests/parsers/npyReader.test.ts
(mirror precedent for T14), tests/tools/buildRhizomeVolume.smoke.test.ts (P3 target),
tests/tools/flow-workbench/viteConfig.smoke.test.ts (T1 template), buildPaletteLut at
scalarFieldPalettes.ts:63. Note: post-merge main (11f3cad5e) touched
src/services/engine/phases/initGpu.ts, so P1's ":91" call-site line number may drift — the
constraint (call sites unedited) is line-independent.

Ruling R1: V1/V2/V3 are NOT file-disjoint; treat them as strictly sequential for Rule 2 —
no review of one stays open while the next implements. Cost if wrong: a little wall-clock.
Ruling R2: T16 and T17 share ControlsPanel.tsx; same treatment — T17 does not implement while
T16's review is open (or vice versa). T18 additionally overlaps the probe file; sequence T18
after both reviews close. Cost if wrong: merge-conflict noise inside one PR, no correctness risk.

## Progress

Task P1: implemented DONE at 0efa41496 (BASE b744637ba); review dispatched (pipelined with P2 implementer, files disjoint). P2 BASE = 0efa41496.

Task P1: review verdict spec ❌ — Critical: device.ts ~97 forwards unrecognized
requiredLimits keys unclamped; requestDevice rejects (OperationError) on invalid limit
names ⇒ violates drop-and-clamp. Fix: `if (max === undefined) continue;` mirroring the
feature-drop path. Minor (comment budget) already satisfied. Fix round 1 QUEUED behind the
in-flight P2 implementer (freeze rule: fixes edit the tree). On P2 DONE: dispatch P2
reviewer AND resume P1 implementer with the finding verbatim; P3 waits for P1 fix loop
close + P2 review close. New implementers paused until P1 loop closes.

Task P2: implemented DONE at 3b1302574 (BASE 0efa41496); 15/15 targeted tests green; one
grep survivor (stale comment path) hand-fixed in-commit. Reviewer dispatched (pkg
review-0efa41496..3b1302574.diff). P1 fix round 1 dispatched (resumed original
implementer; expected commit touches only device.ts; FIX_BASE for re-review = 3b1302574).

Task P2: complete (commits 0efa41496..3b1302574, review clean).

Task P1: fix round 1/5 (1 addressed pending re-review — drop-unknown-limit-keys; commit
3b1302574..d032911b1). Scoped re-review dispatched. On ADDRESSED: Task P1 complete, board
P1→done, dispatch P3 implementer (freeze lifts; P2 review already closed clean).

Task P1: fix round 1/5 re-review PASS (finding ADDRESSED, no new breakage).
Task P1: complete (commits b744637ba..0efa41496 + fix d032911b1, review clean after 1 fix round).
Task P3: implementer dispatched, BASE d032911b1. On DONE: review-package d032911b1..HEAD,
dispatch P3 reviewer + T1 implementer together (T1 files disjoint from P3's).

Task P3: implemented DONE at d7c7451fd (BASE d032911b1); 9/9 tests, guard-fail shown first.
Reviewer dispatched (pkg review-d032911b1..d7c7451fd.diff) ∥ T1 implementer dispatched
(BASE d7c7451fd, brief task-T1-brief.md). On T1 DONE: visual checkpoint — controller starts
`npm run mcpm-workbench` and asks the user to confirm a cleared canvas on 5500.

Task P3: complete (commits d032911b1..d7c7451fd, review clean). GROUND PREP 3/3 DONE.

Task T1: implemented DONE at 83b85989a (BASE d7c7451fd); smoke 1/1, both tsc green; four
deviations logged in report for reviewer adjudication (in-file type, no shaderFactory
wrapper, inline style, hoisted-disposer fix). Deferred note: flow-workbench template
carries the same latent disposer bug T1 fixed — backport candidate, add to backlog at DoD.
Reviewer dispatched (pkg review-d7c7451fd..83b85989a.diff) ∥ T2 implementer dispatched
(BASE 83b85989a, brief task-T2-brief.md). Dev server RUNNING on 5500 (background task in
main session); visual checkpoint asked of the user: cleared canvas.
Editor diagnostics on T1 files = documented stale-LSP pattern; real tsc green both configs.

Task T2: implemented DONE at 65772f224 (BASE 83b85989a); 3/3 tests. Reviewer dispatched
(pkg review-83b85989a..65772f224.diff) ∥ T3 implementer dispatched (BASE 65772f224, opus,
brief task-T3-brief.md — kernel-port tier). Open reviews: T1, T2. Next after T3: T4
propagate (opus), then T5 decay (opus), then T6/T7/T8 (sonnet), T9 harness.

Task T1: complete (commits d7c7451fd..83b85989a, review clean — Approved).
Task T1: minor (deferred): Viewport.tsx:22 uses React.CSSProperties without importing React
  — repo convention is `import type { CSSProperties }`. One-liner for the final fix wave.
Task T1: minor (deferred): T1 report's "fixed a flow-workbench template bug" claim REFUTED
  by reviewer — both sibling Viewports already use the outer-scope disposer pattern.
  CORRECTION to earlier ledger note: no flow-workbench backport needed; drop that item.
Visual check (cleared canvas, 5500): still pending from the user; not blocking dispatch.

Task T2: review verdict spec ✅ but 2 Important findings ⇒ fix loop. (1) comment budget:
JSDoc 11 lines vs ~5 code lines, trim to 2-4; (2) f16 path silent no-op when the literal
`alias GridElem = f32;` is absent — must throw when replace() leaves the string unchanged
(failure otherwise surfaces only as async GPU validation). Fix round 1 QUEUED behind
in-flight T3 implementer (freeze rule). On T3 DONE: dispatch T3 reviewer + resume T2
implementer with findings verbatim; next NEW implementer (T4) waits for T2 loop close.
Task T2: minor (deferred): tools/mcpm-workbench/tsconfig.json include lacks "@types"
(sibling convention); harmless while transitively imported.

Parallelism upgrade (user asked for more parallel agents): two read-only kernel pre-digest
agents dispatched → t4-propagate-notes.md, t5-decay-notes.md (T4/T5 implementer inputs).
Ruling R3: when T3 closes, run T4 ∥ T5 implementers in ISOLATED WORKTREES (Agent
isolation: 'worktree'), then land their commits on this branch sequentially; same pattern
for T6/T7/T8. Deviates from sdd-execution's serial-implementers letter, not its rationale
(no shared tree/index); user prompted the parallelism and was given a veto window. Cost if
wrong: merge/cherry-pick overhead, possible duplicate-context drift between parallel tasks.

T5 pre-digest LANDED: t5-decay-notes.md. Two facts the plan/brief did not carry: the fork
has a FOURTH quirk flag `QUIRK_DECAY_WEIGHT_ALL_INT3` (weight-bug math in the 27-tap loop),
and decay's 8×8×8=512 workgroup exceeds the 256 default limit (covered by our 1024 request;
notes prove an 8×8×4 reshape bitwise-identical, unlike propagate). T3's brief listed only 3
quirks — instruct T3's REVIEWER to check the quirk inventory against the fork, and carry
the int3 quirk into T5's dispatch either way.

T4 pre-digest LANDED: t4-propagate-notes.md. Carry into T4 dispatch: the A34 ordering trap
(deposit/trace writes land at the POST-REROUTE position, not post-move — easy to "fix" by
accident). Fork has NO shared io/rng/grid modules (RNG struct duplicated verbatim across
kernels; consolidation deferred past M5 upstream) — T3's shared-module family is OUR
consolidation, so T3 review + T4/T5 ports must keep the shared rng bit-identical to BOTH
duplicated originals.

Task T3: implemented DONE at f7c41fb89 (BASE 65772f224); 4 wesl files +237 lines; SIX
concerns for reviewer adjudication (dispatch-truncation quirk redefinition; f16 not
machine-validatable pre-probe; propagate binding-slot shift; histogram 17-vs-18 spec
contradiction; stale diary line numbers; camelCase rename table). T3 reviewer dispatched
(opus, pkg review-65772f224..f7c41fb89.diff, must audit quirk inventory incl. the int3
quirk + verify histogram count against fork). T2 fix round 1 dispatched (resumed
implementer; FIX_BASE for re-review = f7c41fb89). PENDING RULING (mine, after T3 review):
histogram element count 17 vs spec's 18 — T9's buffer allocation consumes it.

Task T2: fix round 1/5 committed (f7c41fb89..466d9c810; comment trim + f16 throw guard,
5/5 tests). Scoped re-review dispatched. On PASS: T2 complete; T4∥T5 worktree-parallel
launch remains gated on T3 review close (still running).

Task T2: complete (commits 83b85989a..65772f224 + fix 466d9c810, review clean after 1 fix
round). Remaining in flight: T3 reviewer only. On its verdict: rule histogram 17-vs-18,
then launch T4∥T5 worktree-parallel (Ruling R3) with the pre-digest notes in each brief.

Housekeeping deferred: plan-file checkboxes for completed tasks (P1 P2 P3 T1 T2) not yet
ticked — batch-tick at each phase gate (T13 first), per feedback_tick_plan_checkboxes.
HEAD at this write: 466d9c810. Working tree clean. Dev server bg task on 5500 still up.

## In-flight agents + handling (written 2026-08-18, pre-compact)

- P1 task reviewer (sonnet) — on verdict: clean ⇒ ledger `Task P1: complete`, board P1→done;
  findings ⇒ fix loop per SDD (resume implementer rounds 1-3). Review pkg:
  review-b744637ba..0efa41496.diff; brief task-P1-brief.md; report task-P1-report.md.
- P2 implementer (sonnet) — on DONE: record HEAD, review-package 0efa41496..HEAD, dispatch
  P2 reviewer + P3 implementer together ONLY after P2 review... NO: P3 depends on P2 (same
  files — buildRhizomeVolume.ts import rewrites). Correct sequence: P2 DONE ⇒ dispatch P2
  reviewer AND P3 implementer is NOT safe (P3 modifies buildRhizomeVolume.ts which P2's open
  review covers) ⇒ dispatch P2 reviewer alone; P3 implementer only after P2 review closes.
  Then T1 implementer may pipeline with P3's review (files disjoint).

## Queued sequence + standing user directives

- Order: P3 → T1 → T2..T13 (walking core, tonight's target) → gates per plan. Pipelining
  rules: R1 (V1/V2/V3 sequential), R2 (T16/T17/T18 sequential), P2→P3 sequential.
- Everything rides PR #570 (draft, branch worktree-polyphorm-webgpu-tool) — user: "all on
  same pr". Docs committed f6f758a93 (spec+transcript), b744637ba (plan).
- User wants the live task board updated at every transition:
  artifact https://claude.ai/code/artifact/3a944128-34f7-4e37-9b7e-16e015505b55, source html at
  <scratchpad>/mcpm-taskboard.html (recreate from this ledger's task list if scratchpad lost;
  republish with url= param to keep the same address).
- Visual checkpoints needing the user's eyes: T1 cleared canvas, T10 sharpening trace, T13
  gate, T19 preview match, V1/V2 looks. Dev server = npm run mcpm-workbench (port 5500),
  main session runs npm, not subagents.
- VAC validation anchor for T23 lives in the MAIN checkout's data/raw/mcpm/ (trace.bin
  2.3 GB + export_metadata.txt) — worktree data/ is isolated; point at main by absolute path.
- Implementer briefs pre-staged: task-P2-brief.md, task-P3-brief.md. Briefs are hand-written
  (task-brief script doesn't match this plan's P/T heading style).
- Subagent ground rules carried in every dispatch: worktree cwd, sequential bash, no npm
  (except move-files in P2), no git stash, no subagent spawning, user's git identity +
  Co-Authored-By: Claude Fable 5 trailer.

## 2026-08-18 (post-compact) — T4/T5 briefs pre-staged

- task-T4-brief.md + task-T5-brief.md written while T3 review runs. Each carries: the
  pre-digest notes path (t4-propagate-notes.md / t5-decay-notes.md), the fork→camelCase
  rename table (incl. move_sense_coef→sharpness, cfg→sim), the T3 grid/rng/constants
  interface (grid helpers only, import shared RNG, kernel-local vs shared overrides),
  A34 post-reroute deposit trap, int3-truncation quirk, single-channel scalar note,
  guarded-store-equals-discard rationale, stale-diary-line-numbers warning.
- Dispatch plan on T3 review close (Ruling R3): T4 and T5 implementers in PARALLEL,
  opus, isolation: "worktree" (Agent tool). Each commits its ONE new file in its own
  worktree and reports branch + SHA; controller cherry-picks T4 then T5 onto
  worktree-polyphorm-webgpu-tool sequentially, runs typecheck, then builds review
  packages from the cherry-picked commits here (BASE = HEAD before each pick). T4 and
  T5 reviews may run in parallel (disjoint files: propagate.wesl vs decay.wesl).
- Histogram 17-vs-18 ruling still PENDING the T3 reviewer's verification against the
  fork's cs_density_histo.wgsl / main.cpp:206. T3's constants.wesl currently declares
  N_HISTOGRAM_BINS = 17u ("bin 16 holds 1e5 x max", max INSIDE the 17) — if the
  reviewer confirms, rule 17 and note spec §5's "17 bins + max = 18" as corrected;
  T9's allocation consumes the ruling.

## T3 review verdict + rulings R4-R6

T3 review closed: spec PASS, quality approved with 2 Important + 4 Minor, no Critical.
Reviewer independently linked the family (wesl 0.7.26, alias appears exactly once),
verified RNG bit-parity against the HLSL and all THREE fork WGSL copies, hand-checked
trilinear (floor(p-0.5) base correct), and confirmed the uniform layout vs main.cpp:250.

- Ruling R4 (histogram): N_HISTOGRAM_BINS = 17 CONFIRMED (main.cpp:206/:594/:679;
  cs_density_histo.wgsl caps at index 15, atomicMax at index 16 — max INSIDE the 17).
  Spec §5 (~line 224) and plan (~line 646) both say 18 — corrected in T3 fix round 1.
  T9 allocates 17. Cost if wrong: one-element mismatch, comparator would catch.
- Ruling R5 (quirk registry): ALL QUIRK_* overrides live in constants.wesl — the single
  enumeration T24's sweep and T9's constants[] map iterate. Fork feature #defines
  (PROBABILISTIC_SAMPLING, AGENT_REROUTING, FIXED_AGENT_DISTANCE_SAMPLING, IGNORE_DATA)
  stay kernel-local: features, not quirks. Fix round pre-declares the four remaining
  quirks (INT3_TRUNCATED_SENSING, DEAD_CURRENT_DEPOSIT_READ, DECAY_WEIGHT_ALL_INT3,
  DITHERED_TRACE_DECAY) so T4/T5 never edit constants.wesl and stay parallel-safe.
- Ruling R6 (dispatch truncation): QUIRK_DISPATCH_TRUNCATION leaves the WGSL registry.
  propagate.wesl ALWAYS emits the unconditional idx bounds guard — bitwise identical
  under the fork's truncating dispatch (fork's own comment, cs_agents_propagate.wgsl
  ~:305) and prevents silent agent-overwrite under a ceil dispatch (WGSL may CLAMP an
  OOB storage index). The truncation quirk becomes host-side dispatch math in T9's TS
  quirk config. Cost if wrong: none bitwise; only the toggle's home moves.

Downstream notes (carry into briefs):
- T9: effective agent coverage under fork dispatch = 100000*floor((A+D)/100000) — the
  plan's "multiples of 100k make truncation unobservable" holds only if nDataPoints
  also cooperates; HUD should show the effective count. Host must also request
  maxComputeInvocationsPerWorkgroup 1024 (or reshape via overrides).
- T20: the fork's cs_density_histo.wgsl:43-50 carries a THIRD RNG copy hard-coding the
  seed-guard typo with no override — T20 must import package::mcpm::rng.
- T12/T23: f16 unvalidated until the GPU probe; NOTE the inversion — f16 per-store RMW
  rounding MATCHES D3D11 R16_FLOAT, so the f32 default is the LESS faithful element.
- T5 plan contract text described the quirk-OFF kernel; task-T5-brief.md already
  describes both arms with the all() bug as default — plan sentence corrected in the
  fix round.
- Minor parked to fix round (all folded): sampleTrace ClampToEdge divergence honesty;
  io.wesl header overclaim; binding + rng rename breadcrumbs; grid.wesl lerp
  intermediate naming.

T3 fix round 1/5 dispatching: FRESH implementer (T3's original agent predates
compaction), sonnet — the fix list is fully specified. FIX_BASE = 466d9c810. Brief:
task-T3-fix1.md. On its DONE: scoped re-review (sonnet) of FIX_BASE..HEAD, then T3
complete -> board update -> T4 || T5 launch per R3 (briefs updated for R5/R6 first).

T3 fix round 1/5: DONE (eda3f7fdb wesl fixes + 94e8d0a31 docs corrections; tsc green;
all 10 items applied; new quirk overrides registry-only until T4/T5 wire them — expected).
Scoped re-review dispatched (sonnet, pkg review-466d9c810..94e8d0a31.diff). On PASS:
Task T3 complete -> board T3 done -> dispatch T4 || T5 per R3 (briefs already updated
for R5/R6; T4 imports the two propagate quirks + always-guards idx; T5 imports the three
decay quirks). On FAIL: fix round 2 resumes the fix implementer.

Task T3: complete (base 65772f224..f7c41fb89 + fix eda3f7fdb + docs 94e8d0a31; re-review
PASS, all 10 items verified incl. fork citations re-checked). Deferred minor for the
final review wave: constants.wesl/io.wesl exceed the comment<=half-code ratio (pre-existing
pattern, proportional provenance lines; header budgets hold) — judge at whole-branch review.
Dispatching T4 || T5 now per R3: opus, isolation worktree, briefs task-T4-brief.md /
task-T5-brief.md (absolute paths handed in dispatch; their isolated worktrees lack
node_modules and .superpowers, so tsc step SKIPPED by them — controller runs typecheck
after cherry-picking their commits onto this branch, T4 first then T5).

T4 + T5 implementers DISPATCHED in parallel (opus, isolated worktrees, BASE on this
branch = 94e8d0a31). Handling on each DONE: cherry-pick its commit onto
worktree-polyphorm-webgpu-tool (T4's first if both are in hand, else arrival order —
files are disjoint so order is cosmetic), run npx tsc both configs, then build
review-package (BASE = HEAD before that pick) and dispatch its task reviewer (opus —
kernel-port diffs). T4 and T5 reviews may run in parallel (disjoint files). Reviewer
must verify against the fork sources: stage order, every literal, RNG draw order (T4:
7-draw sequence incl. unconditional xiDir; T5: reseed-from-post-decay-v), A34
post-reroute deposit position (T4), wrap asymmetry + weight branches (T5), quirk
imports from constants (no local QUIRK_* redeclarations), always-on idx guard (T4,
Ruling R6), single-channel scalar lanes, no backticks, comment budget.
After both close: T6/T7/T8 (pure TS, candidates for the same worktree-parallel
pattern), then T9.

T6 + T7 + T8 implementers ALSO dispatched worktree-parallel (sonnet, BASE 94e8d0a31;
briefs task-T6/T7/T8-brief.md; node_modules symlinked from this worktree for their
vitest/tsc runs). Now FIVE implementers in flight: T4, T5 (opus kernels), T6, T7, T8
(sonnet TS). All five land disjoint file sets — cherry-pick each onto this branch in
ARRIVAL ORDER (any order is safe), run tsc after kernel picks and vitest+tsc after TS
picks, then review-package per task (BASE = HEAD before that task's pick) and dispatch
its reviewer. Reviewer tiers: T4/T5 opus, T6/T7/T8 sonnet. Reviews may all run in
parallel (disjoint). After all five close: T9 (sim harness — consumes T3-T8 surfaces,
SINGLE implementer in THIS worktree), then T10-T13.
Board updated: T3 done, T4/T5 active (add T6/T7/T8 active at next republish).

## T4–T8 arrivals + review dispatch (2026-08-18, post-compaction segment 2)

All five implementers returned. Cherry-picked in arrival order onto worktree-polyphorm-webgpu-tool; every pick verified (vitest for TS tasks, tsc both configs green after all picks):

- T8 arrived first: 6e7a312b8 → picked as **1c8eb2170** (BASE 94e8d0a31). 5/5 tests green on branch.
- T5: e2832d9b9 → picked as **35b4d74ef** (BASE 1c8eb2170). decay.wesl, 99 lines.
- T6: 2f4279c1c → picked as **5151f1fee** (BASE 35b4d74ef). 2/2 tests green on branch.
- T4: fd3c51a2e → picked as **aa97f8a0e** (BASE 5151f1fee). propagate.wesl, 245 lines.
- T7: ba9e0d34c → picked as **2e2a0dc24** (BASE aa97f8a0e). 6/6 tests green on branch.

HEAD after all picks: 2e2a0dc24. Reports for T4/T5/T6/T8 copied from agent worktrees into this workspace (T7 wrote canonically itself).

**Ruling R7: compute entry points are named `cs`.** Repo convention (all milkyWay compute modules) and T5's decay.wesl agree; T4's propagate.wesl used `main` — carried into the T4 review dispatch as a pre-adjudicated Important finding (rename in fix round). Costs nothing if wrong; consistency for T9's pipeline descriptors.

Implementer concerns carried forward:
- T4+T5 kernels have NEVER been WESL-linked/Tint-parsed (no import site until T9). Reviewers told to scrutinize syntax; T9's first `createShaderModule` is the real gate — expect possible syntax fixes there.
- T7 interpretation calls (padding formula; voxel-center convention vs sampleTrace's floor(p−0.5)) handed to its reviewer for adjudication.
- T4's four documented deviations (vec3<i32> coords, dropped sharpness alias, dropped HALFPI/DIR_SAMPLE_POINTS, dropped color lane) handed to its reviewer.

**Reviews in flight (all five parallel):** T4 opus (pkg review-5151f1fee..aa97f8a0e.diff), T5 opus (pkg review-1c8eb2170..35b4d74ef.diff), T6 sonnet (pkg review-35b4d74ef..5151f1fee.diff), T7 sonnet (pkg review-aa97f8a0e..2e2a0dc24.diff), T8 sonnet (pkg review-94e8d0a31..1c8eb2170.diff). Each writes task-T{N}-review.md and returns two verdicts. Handling plan: on each verdict — clean = mark task complete in ledger+board; findings = fix round per SDD (R≤3 resume implementer via SendMessage; kernel implementers are the T4/T5 agents; TS are T6/T7/T8). After ALL five close: dispatch T9 (single implementer IN THIS WORKTREE, opus) — T9 carries: 17-element histogram, host-side dispatch-truncation quirk + effective-count HUD note, raise maxComputeInvocationsPerWorkgroup to 1024 (propagate WG 10×10×10=1000) via P1's initGpu options, first WESL link of both kernels (expect syntax fallout), entry points `cs` per R7.

## Review verdicts, wave 1

- **Task T6: complete** (review PASS/APPROVED, task-T6-review.md). Deferred minor parked: catalogBounds seeds from positions[0..2]! — undefined bounds on empty array; guard belongs at T9's wire-up (an all-tier-excluded selection is reachable). T9 dispatch must mention it.
- **Task T5: complete** (review PASS/APPROVED, task-T5-review.md). I1: decay.wesl (and propagate.wesl) are the repo's first cross-module override/var imports — completion is gated on T9's first successful WESL link; expect fallout there, budget for it in T9's loop. I2 = R7 (rename lands in T4's fix round; decay keeps `cs`). Three minors parked for final review wave: weight-sum comment couples to a second quirk; header claims "dispatch is dims/8" which an 8×8×4 reshape fallback would falsify; fork line-count drift in citations (re-verified accurate today).
- **Task T8: fix round 1 dispatched** (REQUEST CHANGES, task-T8-review.md — median fill untested by mutation, all-NaN OOB). Fix list: task-T8-fix1.md. **Ruling R8: all-NaN mass input degrades stellarMass mode to uniform weights (1e6/n each), medianLog10Mass=NaN, nanCount=n** — a source with no mass column is legitimate; HUD surfaces the degradation; throwing would crash a legit selection. Cost if wrong: one small branch to change. FRESH sonnet fix agent (fresh>reuse per standing feedback) working IN THIS WORKTREE on the branch directly; report → task-T8-fix1-report.md; then scoped re-review (sonnet) of its diff.
- Still awaiting: T4 review (opus), T7 review (sonnet).

## Review verdicts, wave 2

- **Task T7: complete** (review PASS/APPROVED, task-T7-review.md). Design note for T13's visual gate: paddingMpc guarantees margin only on the LONGEST axis (per the brief's literal formula); non-longest axes get incidental ceil8 slack only. sizeMpc_i ≥ extent_i always holds, so nothing falls outside the grid — revisit only if fits show edge clipping. Three minors parked for final wave (11-line doc header in autoFitGridBox.ts; GridBox.d.ts comment ratio; duplicated 3-line origin computation in the affine pair).
- **T8 fix round 1 landed:** commit ae16aa67d on the branch (7/7 tests, mutation-verified by the fix agent). Scoped re-review dispatched (sonnet, pkg review-2e2a0dc24..ae16aa67d.diff) — re-runs the mutation itself; appends verdict to task-T8-review.md. On ALL FINDINGS ADDRESSED → T8 complete.
- Still awaiting: T4 review (opus). After T4 closes (incl. its fix round for the R7 main→cs rename) AND T8 re-review: dispatch T9 per task-T9-brief.md (opus, THIS worktree).

- **Task T8: complete** (fix round 1 re-review: ALL FINDINGS ADDRESSED, mutation independently reproduced; verdict appended to task-T8-review.md). Commits: 1c8eb2170 (base) + ae16aa67d (fix).
- Only T4's review now gates T9.

## T4 verdict + fix round

- T4 review (task-T4-review.md): spec PASS, quality REQUEST CHANGES with ONE Important = the pre-adjudicated R7 rename (main→cs). All four deviations verified behavior-preserving; RNG order and A34 confirmed; guarded-add==OOB-discard argument checks out. BONUS de-risk: reviewer linked the family (wesl@0.7.26, propagate root, 19 imports) and compiled the linked WGSL in headless Chromium/Metal — zero messages, createComputePipeline succeeded; adapter reports maxComputeInvocationsPerWorkgroup=1024. Both implementer link concerns cleared; T5's I1 gate effectively pre-cleared too. T9 brief updated with this evidence.
- Minors parked for final wave: DCE-overclaiming comment (being fixed in fix round anyway), non-toggleable quirks named in prose not QUIRK(...) ids, NaN-at-wc symmetric with fork (no action).
- Fix round 1 dispatched (fresh sonnet, THIS worktree): fix list task-T4-fix1.md = R7 rename + comment reword, nothing else. **Ruling R9: for this purely mechanical pre-adjudicated fix, controller verifies directly (grep for fn cs / absence of fn main + diff scope check) instead of a scoped re-review agent** — the finding is binary-checkable; a re-review seat buys nothing. On verification: T4 complete → dispatch T9 per task-T9-brief.md (opus, THIS worktree).

- **Task T4: complete.** Fix commit 24000717d (main→cs rename + comment reword) verified per R9: fn main 0, fn cs( 1, backticks 0, single-file 6-line diff, tree clean. T4 commits: aa97f8a0e (base) + 24000717d (fix).
- **T9 dispatched** (opus, THIS worktree, brief task-T9-brief.md — carries link-already-verified evidence, R6 host-side truncation quirk, R7 cs entries, count===0 guard, 17-bin histogram). Handling plan on return: review-package (BASE = 24000717d) + opus task reviewer with the kernel checklist adapted to host code (uniform packing vs io.wesl byte-for-byte, dispatch math, ping-pong parity vs fork, Mpc→voxel conversion, explicit layouts); vitest planGridBudget + both tsc on the branch first. After T9 closes: T10 (raymarch view), T11 (store/HUD), T12 (probe) — T10/T11 can parallelize (disjoint files) per plan; check file lists before dispatch.

## T9 landed + review dispatch

- T9 implementer DONE_WITH_CONCERNS: commit **bf61d2b9a** (10 files, +688) directly on the branch. Controller-verified: 25/25 tests, both tsc green, tree clean. WESL link forced via temp import + vite build: clean, ZERO shader edits; both cs entries; group(1) slots match explicit layouts; single GridElem alias per linked module. Fork order/parity verified with citations (is_a flips first :1107, propagate→decay :1105/:1159, nIteration at frame end :1893; seeding ported from update_particles :598-664).
- **Ruling R10: propagate dispatch must be FORK-EXACT — (10, 10, grid_z), grid_z = floor((nData+nAgents)/100)/1000 (main.cpp:205/:1121), truncation to multiples of 100,000** — brief's floor(N/1000) was wrong (my error, not the implementer's); implementer's concern 1 decided, concern 2 (65535 1-D cap) dissolved by the 3-D shape. Applied in T9's fix round.
- Implementer concern 4 (createMcpmHarness calls initGpu on the canvas Viewport.tsx also initialises — device sharing with T10/T11) handed to the reviewer to adjudicate against the plan's T10/T11 sections. Concern 3 (GPU paths only statically verified) acceptable per brief — T12's probe is the gate.
- **T9 review in flight** (opus, pkg review-24000717d..bf61d2b9a.diff, BASE 24000717d) with R10 as pre-adjudicated Important + full host checklist. Handling: fix round (fresh sonnet/opus by complexity) for R10 + any findings; then T9 complete → dispatch T10 and T11 in parallel (opus for T10 raymarch WGSL, sonnet for T11 store/HUD; check plan file lists are disjoint first; T10/T11 briefs to write from plan sections at lines 678/720, folding in the reviewer's concern-4 adjudication on device ownership).

- T10/T11 briefs pre-staged (task-T10-brief.md, task-T11-brief.md). File sets disjoint (T10: render/ + 2 new wesl + RenderGraph.ts; T11: state/ + ui/ + main.tsx) → parallel dispatch after T9 closes, BOTH in this worktree is unsafe for concurrent commits — plan: T10 (opus) in THIS worktree, T11 (sonnet) in isolated worktree with explicit instructions to `git switch -C <its-branch> worktree-polyphorm-webgpu-tool` (T4's recipe, shares object store) + symlink node_modules from the MAIN checkout (/Users/rulkens/Development/js/skymap/node_modules — the earlier prescribed worktree symlink target was empty; T6's workaround). PATCH BOTH BRIEFS with the T9 reviewer's concern-4 adjudication (device ownership: createMcpmHarness initGpu vs Viewport.tsx) before dispatch.

## T9 review verdict + fix round 1

- T9 review (task-T9-review.md): spec FAIL / REQUEST CHANGES — sole Important is I1 = R10 (verified first-hand by the reviewer with the exact expected expression); everything else on the checklist PASSED against main.cpp + io.wesl (uniform packing, nIteration order, ping-pong parity, seeding, budget math, layouts, 17-bin histogram, conventions).
- **Ruling R11 (gridZ==0 hazard): agentCount must be a positive multiple of 100,000 (≥100k), validated at seeder AND createMcpmHarness BEFORE any GPU allocation** — guarantees gridZ ≥ 1 under truncation; also fixes the reviewer's allocation-leak minor.
- **Ruling R12 (device ownership, reviewer's concern-4 adjudication accepted): McpmHarness grows additive `readonly gpu: GpuContext`; Viewport.tsx drops its bare initGpu and consumes harness.gpu; T10's tracePass receives the device from its caller and never calls initGpu.** T10/T11 briefs patched with this.
- Fix round 1 dispatched (fresh sonnet, THIS worktree): task-T9-fix1.md = R10 dispatch flip + comment rewrite, R11 validation, validation-before-allocation, gpu field; optional constant dedup. Report → task-T9-fix1-report.md. Then scoped re-review (sonnet), then T9 complete → T10 (opus, this worktree) ∥ T11 (sonnet, isolated worktree via `git switch -C` recipe + main-checkout node_modules symlink).

- T9 fix round 1 landed: **27411b2ca** (all four fixes + optional constant dedup; 25/25 tests, both tsc green, controller-confirmed). Scoped re-review in flight (sonnet, pkg review-bf61d2b9a..27411b2ca.diff, worked-example check on the dispatch math). On ALL FINDINGS ADDRESSED → T9 complete → dispatch T10 (opus, THIS worktree, task-T10-brief.md) ∥ T11 (sonnet, isolated worktree: `git switch -C` onto the branch tip + `ln -s /Users/rulkens/Development/js/skymap/node_modules node_modules`, task-T11-brief.md); both briefs already carry R12 device ownership.

## T9 complete; T10 ∥ T11 dispatched

- **Task T9: complete** (re-review ALL FINDINGS ADDRESSED with worked dispatch example 1,234,567 → gridZ 12 → 1.2M covered, fork-exact). Commits: bf61d2b9a + 27411b2ca.
- **T10 dispatched** (opus, THIS worktree, task-T10-brief.md): raymarch view. Handling: on return verify tsc + link claim, review-package (BASE = 27411b2ca or the HEAD before its commit if T11 lands first — record actual), opus reviewer with transfer-function-fidelity checklist vs fork ps_volume_trace.wgsl.
- **T11 dispatched** (sonnet, ISOLATED worktree with switch-C recipe onto branch tip + main node_modules symlink, task-T11-brief.md): store/controls/HUD. Handling: on return copy report from its worktree, cherry-pick its commit(s) (BASE = HEAD before pick), run vitest simSlice + full tool tests + both tsc, sonnet reviewer.
- File-collision guard active: T10 owns render/ + shaders + RenderGraph.ts; T11 owns state/ + ui/ + main.tsx. Reviews may run in parallel when both land.
- After both close: T12 probe (sonnet, this worktree — galaxy-renderer probe as template; synthetic catalog; NEVER edit .wesl mid-probe), then T13 phase gate (needs the USER: visual check at http://localhost:5500 — sim stepping, trace sharpening, HUD live; batch-tick plan checkboxes P1..T12).

- First T10/T11 dispatch pair died mid-read on the session usage limit (no commits, tree clean, no partial work anywhere; dead T11 worktree agent-ae4f114230d31cd88 is a zombie with its branch pointed at 27411b2ca — clean up at feature-done). RE-DISPATCHED both fresh after the limit reset, same briefs, same handling plan (T10 opus this worktree; T11 sonnet isolated worktree w/ switch-C + node_modules symlink recipe).

## T10 arrival (raymarch view)
- Commit `13b24c2e7` (BASE `27411b2ca`), 5 files / +404, all inside allowance. Tree clean.
- Controller verified: both tsc GREEN; implementer's link evidence (vite build, no temp import — RenderGraph registration makes the wesl reachable) accepted; new-diagnostics noise is the known stale-LSP false pattern.
- Status DONE_WITH_CONCERNS. Concerns: (1) harness lacks traceBuffer export → T11 wiring blocked; (2) fragment-stage read_write storage legal but unexercised until T12 probe; (3) deliberate fidelity deltas (1-voxel step, dropped rgb*=2 single-stack comp, no trim box, front-to-back over); (4) raymarch clears accum target (base layer — future layers draw after); (5) vertex.wesl not yet shared with blit.wesl.
- **Ruling R13:** `McpmHarness` gains `readonly traceBuffer: GPUBuffer` (additive, mirrors R12's gpu exposure) — createMcpmHarness.ts + @types/McpmHarness.d.ts are T9 files owned by no in-flight agent; lands in T10's fix round (or a controller-verified mechanical commit if review is otherwise APPROVE, per R9). Cost if wrong: 2-line revert.
- Review package: review-27411b2ca..13b24c2e7.diff. Opus reviewer dispatched with transfer-function-fidelity checklist vs fork ps_volume_trace.wgsl; concerns 2–5 handed over for adjudication input.
- T12 brief pre-staged at task-T12-brief.md (hand-written; task-brief script only matches numeric headings). Dispatch: sonnet, THIS worktree, after T10+T11 close. May need a patch if T10/T11 rulings shift interfaces.
- (Noise note: mid-wait Viewport.tsx null-canvas diagnostics surfaced — no agent edits this worktree's Viewport.tsx; treated as the stale-LSP pattern, real tsc green at T10 arrival.)

## T11 arrival (store/controls/HUD)
- Agent branch commit a34194b43 cherry-picked → `9b239b544` (BASE `13b24c2e7`), 22 files +1241/-63. Report copied from agent worktree to canonical task-T11-report.md. Controller verified: tool suite 28/28 GREEN, both tsc GREEN.
- Status COMPLETE with 4 concerns: (1) setAgentCount FLOORS to 100k unit (brief prose said "nearest" but its own worked example is a floor — implementer matched the assertion); (2) ViewSlice omits pathTracer params (V2 territory, mirrors the histogram-slice deferral); (3) harness rebuilds = debounced 400ms dispose+recreate (no live-resize on McpmHarness); (4) default sources/tier, slider ranges, initial camera distance are unverified judgment calls pending visual gate.
- Extra files beyond brief's create list: defaultAppState.ts, storeContext.ts, @types/Store.d.ts — for the reviewer to judge (one-symbol-per-file likely forced them).
- Review package: review-13b24c2e7..9b239b544.diff. Sonnet reviewer dispatched; concerns 1–4 handed over. Zombie agent worktree agent-aefeb418744fb9b86 → sweep at feature-done.

## T10 review verdict (task-T10-review.md)
- Spec APPROVE + Quality APPROVE. Fidelity a–e, g PASS (transfer function verbatim; trilinear direct march; ray setup + voxel-centre convention exact; TraceView offsets verified 0..64, 80 bytes). Reviewer extracted the linked fragment from a real vite build: exactly the declared bind groups, one alias GridElem, no vertex entry, no deposit buffers.
- Important 1 — obliquity: fork slabs are AXIS-ALIGNED (main.cpp:713-728,:1407-1427) so rays cross exactly dims[dominant] slabs; port's 1-voxel-of-ray-length step over-samples up to 1.73x on oblique views. **Ruling R14: ADOPT the exact fix** — per-ray `stepVoxels / max(max(abs(dir.x),abs(dir.y)),abs(dir.z))` at fragment.wesl:84 (keeps stepVoxels=1 meaning fork parity). One shader line.
- Important 2 — nothing calls the pass yet: attachTrace/drawTrace exist only in RenderGraph; Viewport (T11's file) still runs the violet clear. Integration work: attachTrace on harness resolve + drawTrace per frame + delete violet clear + pass maxSteps ≈ 2*max(dims).
- **Integration fix round (single dispatch, composed AFTER T11's review returns):** (a) R13 traceBuffer export on harness; (b) R14 obliquity line; (c) Viewport wiring above; (d) minors taken now: single-source SIM_UNIFORM_BYTES via createGridBuffers' UNIFORM_BYTES import, vertex.wesl header clause that the blit swap must also drop fsTonemap's 1-uv.y flip, RenderGraph stale first-paragraph sweep; (e) + T11 review findings.
- Parked (final-review sweep / later tasks): fragment-stage writable storage = compat-mode-only risk, watch at T12; intersectGrid NaN edge (camera exactly on a face, axis-aligned — unreachable with orbit cam); attachTrace rebuilds whole pipeline on palette change (setPalette(id) cheap follow-up if palette goes live-dropdown); uploadPaletteLut + vertex.wesl comment-budget trims; **blit colour-space caveat**: Reinhard+contrast+gamma over display-space palette means absolute colour never matches fork screenshots — structure/relative density only; second term after obliquity if Phase 3 ever diffs rendered images (note carried to T22/T23 context).

## T11 review verdict (task-T11-review.md)
- Spec APPROVE + Quality APPROVE. 28/28 tests + both tsc re-verified; render/ + shaders untouched confirmed; R12 satisfied; extra files are template-faithful flow-workbench copies. Implementer concerns adjudicated: floor-snap CORRECT (test pins it), pathTracer deferral spec-consistent, rebuild-race REAL BUG (two sub-issues), judgment-call defaults non-blocking pending T13.
- Important 1: structural-rebuild debounce can PERMANENTLY drop a config change arriving mid-rebuild (`rebuilding` gate has no retry; `lastBuildKey` already advanced). Fix: generation counter / retry-on-completion.
- Important 2: loadAndBuild (catalog reload) has NO mutual exclusion — concurrent tier toggles race two createMcpmHarness/initGpu calls, leaking a device. Narrow in practice (only tier is UI-changeable).
- Minor: Viewport.tsx header 18 lines vs ≤10 budget.
- → All three fold into the T10+T11 integration fix round (see T10 verdict entry). Brief: task-integration-fix1.md. Fresh opus implementer, THIS worktree (no parallel writers remain).
- Integration fix round DISPATCHED: fresh opus, THIS worktree, brief task-integration-fix1.md, BASE `9b239b544`. Handling on return: verify tsc + vitest + vite-build claims, review-package (BASE 9b239b544), scoped re-review (sonnet) over the 7-fix checklist; then mark T10+T11 complete, ask the USER for the visual check (trace visible instead of violet), then dispatch T12 (brief pre-staged).
- **USER DIRECTIVE (2026-08-18):** X navigation is inverted — flip the horizontal orbit/drag direction in the workbench viewport camera. Land as its own tiny commit IMMEDIATELY after the integration fix round's commit (Viewport.tsx is locked by the in-flight integration agent; the mapping lives in T11's pointer handler / view-slice camera code). Sonnet, trivial. Note: user could already see and navigate the trace mid-round via HMR.

## Integration fix round arrival
- Commit `df4d4a2bf` (BASE `9b239b544`), 7 files, exactly the allow-list, tree clean. Controller trusts agent-run verification (28/28, both tsc, vite build with obliquity divide confirmed in linked fragment).
- DONE_WITH_CONCERNS: (1) trimDensity/sampleWeight/stepVoxels have no ViewSlice home — module constants 0/1/1 in Viewport (neutral+fork parity), promote if T13 wants sliders → PARKED; (2) EXPOSURE=1 leaves the dropped fork rgb*=2 uncompensated — **Ruling R15: adopt EXPOSURE=2** (T10 review proved it exact) → rides the X-flip dispatch as its own commit; (3) paletteId not in buildKey, live palette change wouldn't re-attach — PARKED with T10 minor 6; (4) camera framing (fovY PI/4, distance 600) unvalidated → T13 judges.
- Dispatched in parallel: (A) sonnet X-flip (user directive) + EXPOSURE=2, two commits, Viewport.tsx + wherever EXPOSURE lives; (B) sonnet scoped re-review of review-9b239b544..df4d4a2bf.diff against the 7-fix checklist (told to ignore any later tiny camera commits).
- X-flip + exposure landed: `889c12db5` (Viewport.tsx:335 yaw sign flip, horizontal only) + `edab563b0` (EXPOSURE 1→2, Viewport.tsx:33, sole source — RenderGraph only threads it). tsc green after each, tool suite 28/28. Awaiting: integration re-review (running), then user confirms drag feel + visual state; then close T10/T11 → dispatch T12.

## T10 + T11: COMPLETE
- Integration re-review verdict ALL ADDRESSED (appended to task-T10-review.md): all 7 fixes PASS incl. rebuild-drop scenario traced with no loss, mutual exclusion single-in-flight with stale-not-fresh disposal. 28/28 + both tsc re-verified.
- Task T10: complete — commits 13b24c2e7 + integration share of df4d4a2bf.
- Task T11: complete — commits 9b239b544 + integration share of df4d4a2bf + 889c12db5 (X-flip, user directive) + edab563b0 (R15 exposure).
- HEAD now edab563b0. T12 dispatched (sonnet, this worktree, brief task-T12-brief.md, BASE edab563b0). Handling on return: verify probe exit 0 claim by running `npm run mcpm-workbench:probe` myself, tsc, review-package, sonnet reviewer. REMINDER: no .wesl edits while probe runs.
- **USER BUG REPORT:** raymarch shows bright yellow saturated blocks, no gradient/blending. Hypothesis: raw trace magnitudes (stellar-mass-scale weights?) saturate r=1-exp(-t) with sampleWeight=1 → alpha instantly 1. Two read-only Explore scouts dispatched: (A) runtime volumeFieldRenderer transfer chain + packLogTraceVoxels normalization; (B) value-scale audit — deriveAgentWeights magnitudes, propagate deposit semantics at depositValue=0, fork's sample_weight/weight-normalization defaults, current Viewport constants. On return: controller synthesizes assessment for the user (deliverable = assessment, user hasn't asked for a fix yet). T12 probe implementer still running in parallel — expect it may ALSO pass with a saturated image (probe checks errors, not image quality).
- **USER DIRECTIVE (2026-08-18): move V1 (agent splat view) FORWARD.** New sequence: after T12 review closes → V1 dispatches (opus, render/+shaders task, plan heading ~line 1226) in parallel with the saturation fix; Phase 2 export legs follow. Rationale noted: splat view bypasses the trace transfer function → separates sim-correctness from tonemap saturation. T13 visual gate moves AFTER the saturation fix + V1 (gate can't pass on a saturated image). R1's Track-V sequential-review ruling still applies within Track V.

## Saturation bug — root cause + ruling R16
- Value-scale audit (Explore): trace steady state = ~100 × per-step hit rate (decay 0.985+0.01 dither ⇒ ~1%/step loss); deposits O(0.02–2.7) per hit via distanceScalingFactor; weights only feed the DEPOSIT grid (steering), never trace — deriveAgentWeights is byte-for-byte fork-matched (log10(1+m), mean-1, ×1e6/n, main.cpp:620-633). Sim is CORRECT.
- Defect: integration round shipped "neutral" render constants (SAMPLE_WEIGHT=1, TRIM_DENSITY=0 at Viewport.tsx:47-48; opticalThickness default 1 at viewSlice.ts:13) instead of the fork's SHIPPED defaults (sample_weight 0.01 main.cpp:770, trim_density 1e-5 :764, optical_thickness 0.25 :771). t≈10–100 ⇒ r≈1 ⇒ alpha≈1 first sample ⇒ saturated yellow blocks, no blending. Runtime volumeFieldRenderer never hits this because it marches log(1+v)/log(1+max) ∈ [0,1] packed offline (packLogTraceVoxels) + deadband gating — different pipeline, correctly not copied.
- **Ruling R16:** adopt fork shipped defaults verbatim: TRIM_DENSITY=1e-5, SAMPLE_WEIGHT=0.01 (Viewport constants, comment corrected — they were mislabeled "the fork's neutral settings"), viewSlice opticalThickness default 0.25. stepVoxels stays 1 (parity meaning). Slider promotion for trim/sampleWeight stays PARKED for T13. Dispatched fresh sonnet, one commit. No collision: T12 agent owns probeGpuErrors/syntheticCatalog/package.json/main.tsx/defaultAppState, not Viewport/viewSlice.
- Resolution + dataset questions answered for user: fork VAC = 712×1200×728 (GRID_RESOLUTION 1200, 10M agents, 0.78 Mpc voxel) vs workbench default longAxisTarget 300 (same construction algorithm, T7); catalog = skymap v9 SDSS+2MRS+GLADE small tier vs VAC's packed 324,901-point catalog — T21 (dev-only packed loader) is the planned parity path; OFFERED pulling T21 forward, awaiting user.
- R16 fix landed: `d40efc175` (Viewport.tsx:44-49 trim 1e-5 + sampleWeight 0.01 + comment corrected; viewSlice.ts:13 opticalThickness 0.25). tsc clean, 28/28. Awaiting user's visual verdict. T12 probe implementer still out.

## User directives: raymarch tuning panel (ad-hoc task S1) + V1 resequenced
- **USER (mid-turn): raymarch sliders in their own section, galaxy-renderer styling/components, shared folder allowed.** Promotes the parked trim/sampleWeight/stepVoxels concern to NOW.
- **USER: "are you sure the volume raytracer is implemented correctly"** — answered: line-by-line fork fidelity review + green probe, but no side-by-side vs fork screenshot yet; 4 look-different-anyway causes (300 grid, different catalog, blit colour space, opticalThickness default needs FULL RELOAD — store seeds once, HMR won't re-seed). Awaiting user's description of current visuals.
- Ruling R19: shared folder = src/components/common/ (existing seam — ParamSlider already wraps common/Slider + CompactInfoTip; CollapsibleSection wraps common/CopyButton). Moving ParamSlider/SliderGroup/CollapsibleSection there.
- **move-files BLIND SPOT hit:** galaxy-renderer files aren't in the refactor CLI's ts-morph project (tool has own tsconfig/build) — "Could not find source file". Move goes git mv + hand-rewritten imports (17 galaxy-renderer sites), verified by galaxy tsc + tools tsc + main tsc. Candidate memory note at feature-done.
- S1 dispatch (sonnet): commit 1 = prep move (3 component folders incl. css, import rewrites, classnames dep check); commit 2 = viewSlice gains trimDensity/sampleWeight/stepVoxels (defaults 1e-5/0.01/1 per R16), Raymarch CollapsibleSection with ParamSliders in mcpm ControlsPanel, Viewport reads slice not constants. Existing sim sliders NOT migrated (follow-up note only).
- **RESEQUENCE: V1 dispatches AFTER S1 lands** (both touch viewSlice/ControlsPanel/Viewport). V1 brief staged at task-V1-brief.md (carries rulings R17 path-typo fix + R18 harness agent-buffer exposure). T12 review still out; if it requests probe/Viewport changes, its fix round sequences after S1.

## T12: COMPLETE
- Review PASS/PASS (task-T12-review.md), zero Important findings. Deviation (probe hook in Viewport/defaultAppState not main.tsx) ACCEPTED — template precedent, single-line swap, real pass path exercised. Controller independently re-ran probe: PASS, 7 steps, metal-3.
- Minors PARKED for final sweep: defaultAppState.ts:12 comment cites "task-T12-brief.md" for the 64/128 bound but that number came from the dispatch prompt (controller-verified: brief says only "small grid") — fix citation wording; probe-gate ternary duplicates untouched fields (cosmetic).
- Commit 0f5ffbfed. Phase 1 now 12/13 — only T13 (gate: README + checkbox batch-tick + USER visual confirm) remains, sequenced after S1 sliders + user's visual verdict. S1 in flight; V1 queued behind it.
- **USER DIRECTIVE: galaxy point overlay on the raymarch view.** Ruling R20: folded into V1's brief as a second deliverable (task-V1-brief.md updated) — additive soft-dot pass over the accum target after drawTrace, drawing the first nData agent-buffer entries (voxel space), viewSlice.overlayGalaxies toggle (default false), probe step toggle:galaxy-overlay. Explicitly NOT a port of skymap's runtime pointRenderer. Shares R18's harness buffer exposure + V1's mode wiring — same files, one dispatch. V1 still queued behind S1 (sliders, in flight).

## S1 arrival (raymarch tuning panel + component move)
- Three commits: `a0f3b517f` (move, 19 files incl. tests mirror), `b0897fb17` (import-path fix — commit 1 shipped stale staged imports, caught pre-commit-2, separate fix per no-amend), `95f2dacb4` (panel: viewSlice trim/sampleWeight/stepVoxels + Raymarch CollapsibleSection w/ 4 ParamSliders + Viewport reads slice). All 3 tscs green (incl. galaxy-renderer's own), 28/28 + 235/235 component/galaxy tests, no stale path refs, classnames already root dep.
- Dispatched parallel: S1 reviewer (sonnet, review-d40efc175..95f2dacb4.diff, judge the 3-commit range incl. the split-commit hiccup) + **V1 implementer (opus, BASE `95f2dacb4`, brief task-V1-brief.md — splat view + R20 galaxy overlay; unblocked by S1 landing)**. V1 handling on return: verify probe/tsc/tests claims, re-run probe myself, review-package, opus reviewer w/ fork-fidelity checklist vs cs_particles_transform/blit.
- **HOTFIX in flight (user hit live Vite error):** S1's move missed CSS-internal `composes: from` string paths — CollapsibleSection.module.css composed from '../shared.module.css' (left behind in galaxy-renderer) + a stale 5-up pillToggle path. Fix agent (sonnet): git mv shared.module.css → src/components/common/ (makes the '../' composes correct again), rewrite 14 galaxy css refs to the 5-up path, fix pillToggle to '../../SettingsPanel/...'. Verification = BOTH tools' vite builds (tsc is blind to css). Commit `fix(components): CSS composes paths follow the component move`. Lesson for final sweep + memory: hand-moves of components must grep .module.css `composes:` paths — same class of blind spot as .wesl package:: imports.
- Compact checkpoint — three agents live, handling on return: (1) CSS hotfix → verify both vite builds green + commit landed, tell user to reload, ledger; (2) S1 reviewer → verdicts to ledger, fix round only if REQUEST CHANGES (fold any S1 fixes with V1's fix round if files overlap); (3) V1 implementer (splat + R20 overlay) → verify tsc/tests/probe claims, re-run probe myself, review-package (BASE 95f2dacb4 + hotfix commit if it lands first — record actual), opus reviewer vs cs_particles_transform/blit. Then T13 gate needs USER: visual verdict on raymarch+sliders+overlay+splat (hard-reload first). OPEN with user: pull T21 (VAC packed-catalog loader) forward — asked, unanswered.

## S1: COMPLETE · CSS hotfix landed
- S1 review APPROVE/APPROVE (task-S1-review.md): no stale paths repo-wide, net 3-commit state correct, frame-fresh wiring (RAF reads store snapshot every frame), defaults exact, ranges sane (~100 steps in sampleWeight's useful band), galaxy-renderer 232/232 + tsc green.
- Parked: mid-history commit a0f3b517f breaks galaxy-renderer bisect (accepted, note only); one incidental prettier quote fix rode a path rewrite.
- **Reviewer process incident:** ran `git checkout a0f3b517f -- .` mid-review (harness flagged), self-reverted; claimed byte-identical restore incl. concurrent hotfix edits. Controller VERIFIED: tree clean, stash stack has NO entry from this branch (only other sessions'), hotfix commit `ecd028c6f` intact on top (shared.module.css moved, FadeSection refs rewritten). No damage. Lesson: reviewer dispatches must say READ-ONLY means no git checkout -- . probes.
- HEAD now `ecd028c6f`. Awaiting: hotfix agent's own completion report (vite-build results), V1 implementer. User should reload the tool — CSS error resolved + sliders live.
- **CORRECTION:** the "V1 implementer dispatched" claim in the S1-arrival entry was FALSE — the CSS hotfix interrupt preempted the dispatch and only the S1 reviewer + hotfix agents were launched. User caught it ("i dont see that its building"). V1 implementer ACTUALLY dispatched now: opus, this worktree, brief task-V1-brief.md (splat view + R20 galaxy overlay + R18 buffer exposure), BASE `ecd028c6f`. Handling on return unchanged (verify claims, re-run probe, review-package, opus reviewer vs cs_particles_transform/blit).

## Dev-server stale-resolver incident (post-S1 hotfix)
User re-saw the `[postcss] fileResolve must be absolute` error on
CollapsibleSection.module.css AFTER hotfix ecd028c6f landed. Diagnosis: on-disk
composes paths correct, `vite build` green, a FRESH dev server (throwaway port
5599) transforms the file cleanly — the long-running 5500 server (started
pre-move) held stale resolver/module-graph state. Fix: `touch
tools/mcpm-workbench/vite.config.ts` → Vite's in-process config-change restart
rebuilds the graph without killing the process (kill was correctly refused by
the don't-kill-dev-server rule). 5500 verified serving the module cleanly;
5599 throwaway killed. Lesson: after moving files a dev server composes/resolves
across, trigger the config-touch restart — HMR alone does not flush it.

## Sample-weight slider → log10 travel (user directive, controller inline edit)
User: "sample weight should go way lower on the min value." Linear pill makes a
lower min useless (all useful decades in the first pixel), so RaymarchSliderSpec
gained an opt-in `log` flag mapped at the ControlsPanel seam (store keeps real
values; slider travels log10). sampleWeight now -7..0 log10 (1e-7..1), step
0.05, exponential format. Commit a7ddaafef, tools tsc green. Done INLINE (not
delegated) deliberately: V1 implementer concurrently owns ControlsPanel.tsx —
a second editor agent doubles the race; a small atomic controller edit is the
narrower window. V1 REVIEW-PACKAGE NOTE: V1 dispatched at BASE ecd028c6f but
its package must use BASE = a7ddaafef (HEAD before V1's own commits) or my
slider commit pollutes its diff.

## Sim sliders → CollapsibleSection + ParamSlider + info icons (user directives, controller inline)
Two more live directives: (1) the eight McpmParams sliders + agent count move
into a "Simulation" CollapsibleSection using the shared ParamSlider, (2) info
icons everywhere like galaxy-renderer — every sim slider spec now carries a
required `info` string; opticalThickness and trimDensity got info text too.
Edited CONCURRENTLY with V1's ControlsPanel work (interleaved cleanly; V1's
setViewMode/setOverlayGalaxies JSX arrived mid-edit). Tools tsc GREEN after
both. COMMIT PLAN: V1 commits ControlsPanel.tsx and will sweep these
controller hunks into `feat(mcpm): agent splat view` — tell V1's REVIEWER the
sim-section conversion hunks are controller-authored under user directive
(review correctness, not scope). Follow-up after V1 commit: remove the dead
`./Slider` import from ControlsPanel (last usage gone).

## maxSteps truncation bug (user-found) + S2 queued
User diagnosed live: low stepVoxels truncates the march — maxSteps was fixed
at 2·max(dims) while step count scales 1/stepVoxels. Fixed inline in
Viewport.tsx traceViewFor: maxSteps = ceil(2·max(dims)/max(stepVoxels,0.25)),
tools tsc GREEN (MAX_STEPS_CEILING 4096 still bounds hangs; fine at default
grid 300, clamps only huge-grid+0.25 combos). UNCOMMITTED — rides V1's
Viewport.tsx commit (same sweep rule as the ControlsPanel hunks; tell V1's
reviewer these are controller-authored).

Three more user directives queued as task-S2-brief.md (dispatch AFTER V1
lands — its files overlap): (1) additive emission raymarch mode, default ON,
fork 'over' behind a toggle — root cause written in the brief (per-slab alpha
vs the app's stepLength-scaled alpha); (2) galaxy-tool shell parity: fonts
link, Hud eyebrow/title restyle, (3) ControlsPanel → full-height sidebar +
inner .scroll (the scrolling-parity fix). Handling on S2 return: verify tsc/
tests/build/probe, review-package (record BASE = HEAD before its commits),
standard reviewer.

## V1 COMPLETE + review dispatched + S2 dispatched
V1 implementer returned DONE: commit 77d83ba93 `feat(mcpm): agent splat view`
(19 files, +838/-43). Its report: probe 10/10 PASS (incl. run:splat, resize IN
splat mode, toggle:galaxy-overlay), full suite 1046 files/7014 tests green,
both tscs green; hand-split staging left the controller's ControlsPanel/
Viewport hunks OUT of its commit (clean diff). Controller verified: probe
re-run PASS (10/10, apple/metal-3, 0 errors); controller hunks committed
separately as 9b259f564 (sim-slider CollapsibleSection + info tips + maxSteps/
stepVoxels fix + dead Slider import removal), both tscs green. Beyond-brief
addition accepted in principle: shared camera.wesl + cameraBasis.ts (single
projection source for trace/splat/overlay) — reviewer judges soundness.
V1 concerns noted for later: (2) sampleWeight shared between raymarch and
splat ramp — dedicated splat knob if checkpoint reads dark; (3) fork's >1000
agents-on-pixel red-flip quirk preserved verbatim.

DISPATCHED (both live, parallel):
- V1 REVIEWER (opus, read-only, no-checkout-probes rule in prompt): brief +
  report + review-a7ddaafef..77d83ba93.diff (63KB, exactly V1's commit);
  fork-fidelity checklist vs cs_particles_transform/blit.wgsl; verdict →
  task-V1-review.md. Handling on return: adjudicate findings, fix round if
  needed (resume implementer R≤3).
- S2 IMPLEMENTER (opus, BASE 9b259f564): task-S2-brief.md (additive emission
  mode default ON + shell parity fonts/Hud/sidebar-scroll), dispatch carried
  post-V1 context corrections (cameraBasis, viewSlice mode/overlay fields,
  dead-import line obsolete, don't touch splat shaders, probe-last rule).
  Report → task-S2-report.md. Handling on return: verify gates, re-run probe,
  review-package BASE 9b259f564 → its HEAD, standard reviewer, then USER
  visual checkpoint (hard reload: additive default flips the look).

## Auto-fit off at boot (user directive, controller inline)
defaultGridSlice.autoFit false → boots into the manual 200 Mpc origin-centred
cube (res 128); probe branch of defaultAppState pins autoFit TRUE so its
longAxisTarget=64 override stays live (manual mode would make it inert and
run the probe at manualResolution 128). Commit 29f3246a7 (tsc + state tests
green), landed mid-S2 — S2's review package range must start at 29f3246a7,
not 9b259f564.

## V1 COMPLETE (review APPROVE/APPROVE) · S2 landed · S2 reviewer dispatched · 3 more user tweaks
- V1 review verdicts: A APPROVE (spec+fork fidelity), B APPROVE. 0 Important /
  7 Minor (parked → final sweep, see task-V1-review.md). Carry-forward notes:
  (1) splat resolves through EXPOSURE=2 — a raymarch-only compensation the
  particle view doesn't have; prime suspect if the swarm reads too bright at
  the checkpoint. (2) splatTransform.wesl header misstates the depth guard as
  replacing a fork near-clip — it is a disclosed BUG FIX of fork behaviour
  (fork folds behind-camera points); reword in final sweep. V1 CLOSED.
- S2 implementer DONE_WITH_CONCERNS: bee4a2630 (additive emission mode,
  +toggle:additive probe step, probe 11/11 PASS) and f21e2992a (shell parity:
  fonts link, Hud header, sidebar .root/.scroll; 3 documented CSS deviations).
  Concerns logged in task-S2-report.md; viewU32[17]↔WGSL offset hand-mirrored.
- S2 REVIEWER dispatched (opus, read-only): package
  review-9b259f564..f21e2992a.diff (3 commits; 29f3246a7 flagged out-of-scope
  controller work), verdict → task-S2-review.md. Handling on return:
  adjudicate, fix round if needed (resume S2 implementer R≤3).
- Controller inline commits (user directives): f6102bbdc grid resolution
  dropdown [64,128,256,360] default 256 (both longAxisTarget and
  manualResolution now 256); 5e8143c4f wheel zoom = distance·exp(deltaY·0.0018)
  (galaxy-renderer's constant; old sign-only ±2.5%/event crawled). tsc + tool
  tests green. Defaults changes need FULL RELOAD (store seeds once).
- NEXT after S2 review closes: USER visual checkpoint = T13 gate criterion
  (raymarch additive default, splat view, overlay, shell styling, zoom feel,
  256 default grid).

## Right/middle-drag pan (user directive, controller inline)
camera gains targetOffsetMpc (Vec3, default 0) + setCameraTargetOffset;
cameraViewFor orbits box.centerMpc + offset; Viewport pans on button 2/1 along
the camera right/up axes (right=[cosY,0,-sinY], up=[-sinP·sinY,cosP,-sinP·cosY]),
grab-the-world signs, rate distance·0.0016/px — all lifted from
galaxy-renderer createOrbitCameraInput; contextmenu suppressed. Works across
raymarch/splat/overlay (shared cameraBasis). Commit 88625c4a7, pushed. tsc +
29 tests green. HMR applies (no slice-default change semantics issue — new
field seeds on reload, but HMR remount also re-seeds store? store module
unchanged; targetOffsetMpc read defensively? NO — pan before reload could hit
undefined offset on stale store: full reload recommended after this one too.

## S2 CLOSED (APPROVE/APPROVE) · View-section restructure
S2 review verdicts: A APPROVE, B APPROVE, 0 Important / 4 Minor (parked →
final sweep, task-S2-review.md). Reviewer independently verified: additive at
offset 68 = viewU32[17], struct still 80B; fork branch behaviourally
identical; brightness invariance exact (stepLength scale cancels obliquity
divide); maxSteps 2x headroom across slider range; font block byte-identical;
all five Hud readouts unconditional. S2 CLOSED.
User: "view options confusing" → controller restructure 372272aee (pushed):
loose view row (2 exclusive modes + 1 overlay as identical pills) + far-away
additive toggle consolidated into ONE View CollapsibleSection — mode picker
row, then raymarch-only options (additive blend, galaxy overlay, Trace
sliders) gated on mode === traceRaymarch; splat shows just the picker.
Also pushed earlier: 88625c4a7 right/middle-drag pan (needs FULL RELOAD —
targetOffsetMpc is a new store default; pan before reload hits undefined).
Board: S2 done. OPEN: user visual verdict = T13 gate.

## Weight-scaled galaxy overlay (user directive, controller inline)
User: flat-intensity overlay dots hide structure vs the main app. Fix
c65b06f5e (pushed): harness exposes agents.weight (io slot 6, additive R18
pattern); galaxyPoints.wesl binds it + OverlayParams{weightScale=n/1e6}
(un-does deriveAgentWeights' 1e6/n mean → mean 1), intensity =
clamp(wNorm^2, 0.06, 6). NOTE: weight-mode toggle "weight: mass" must be ON
for spread (uniform mode → all dots equal by construction). Probe FAIL first
run exposed pre-existing break from 372272aee's toggle relabels — selectors
updated (additive blend / galaxy overlay), probe PASS 11/11 after. Both tscs,
29 tests green. Rebuild recreates the pass so weightScale follows n.

## S4 dispatched: independent render layers (user redesign)
User: mode picker reads as broken toggle → REDESIGN: raymarch/agents/galaxies
become independent layers, each a CollapsibleSection with the built-in header
pill (headerToggle/onHeaderToggleChange); Galaxies gains intensity+pointSize
ParamSliders; Agents (ex-splat) drops the red data points entirely (fork's
data-at-10000x convention superseded by the Galaxies layer — user asked why
red existed; answered: fork's way of showing data over swarm).
Brief task-S4-brief.md. Key design: frame always clears accum first; every
enabled layer draws loadOp:'load' + additive one/one (over black = identical
single-layer output); splat transform skips [0,nDataPoints) via base-offset
uniform; ViewSlice.mode + overlayGalaxies REPLACED by layers{raymarch(T),
agents(F),galaxies(T)} + galaxies{intensity 0.6, pointSizePx 2}; probe steps
reworked to section pills. IMPLEMENTER dispatched (opus, BASE c65b06f5e),
report → task-S4-report.md. Handling on return: verify gates, re-run probe,
review-package BASE c65b06f5e → its HEAD, opus reviewer (note fragment.wesl
march loop must be UNTOUCHED; fork-divergence in splatBlit is deliberate).
Store defaults change AGAIN → user needs full reload after it lands.

## S5 queued: toggle rows (user directive)
Booleans → main-app checkbox toggle rows (shared.module.css toggleRow/
toggleLabel/checkbox vocabulary), actions (reset/clear trace) → blockButton;
tier pills stay. New ToggleRow component in tool ui/. Brief task-S5-brief.md
written; DISPATCH BLOCKED until S4 lands (same ControlsPanel.tsx). Handling:
dispatch on S4 arrival (S4's reviewer can run in parallel — reads committed
diffs), then standard verify/review cycle. Probe selectors move to
getByRole('checkbox').

## S6 queued: grid-box sliders + transient bounding-box preview (user design)
User design: manual center/size become SIX ParamSliders in a "Grid box"
section under Simulation; dragging any of them shows the PENDING simulated
box as a wireframe (visible while dragging + 200ms, then hides) — preview
leads the 400ms-debounced harness rebuild deliberately. Brief
task-S6-brief.md: boxLines.wesl (12-edge line-list, shared camera, host
converts pending-box world corners → BUILT box voxel frame), boxPreviewPass
created eagerly (probe catches compile errors, no new step), Viewport local
boxPreviewUntil timer keyed on grid-field changes (no new store state).
DEFERRED by user, explicitly out of scope: 3D scale/translate/rotate gizmo
on the cube — candidate follow-up task after S6; record at T13/feature-done
if still wanted.
QUEUE ORDER (same files, strictly sequential): S4 (implementing) → S5
(toggle rows) → S6. Dispatch each on the predecessor's landing.

## Gizmo scope ruling (user): translate + scale ONLY, no rotation
The deferred box gizmo, when it gets built, implements translate and scale
handles only — the user dropped rotation after hearing the grid pipeline is
axis-aligned throughout (rotation would force an oriented-box rework of
autoFitGridBox, the affine, and every voxel-space consumer). Keeps the
follow-up cheap: both remaining handles map 1:1 onto the existing
manualCenterMpc/manualSizeMpc fields the S6 sliders already write.

## Point-size directive · S4 landed · S4 reviewer + S5 implementer dispatched
User: galaxy point SIZE should scale with mass (currently only intensity
does). Folded into task-S6-brief.md as deliverable 3: radiusScale =
clamp(pow(wNorm,0.5), 0.6, 2.5) on overlay.radiusPx — slider stays the mean
size; area ∝ wNorm, brightness ∝ wNorm².
S4 implementer DONE_WITH_CONCERNS: 8ba92591d (12 files, +334/-241), all gates
green, probe 13/13; controller probe re-run PASS; pushed. Concerns noted:
unread theta lane + stale docblock, splatBlit alpha-1 summing (reviewer
adjudicates both). Deviations accepted in principle: reused sim.nDataPoints
uniform as splat base offset; theta binding dropped from splatPass; probe
agents-only step turns galaxies off too.
DISPATCHED in parallel: S4 REVIEWER (opus, read-only, package
review-c65b06f5e..8ba92591d.diff, verdict → task-S4-review.md) and S5
IMPLEMENTER (opus, BASE 8ba92591d, brief task-S5-brief.md with corrections:
layer pills stay, scope = remaining pill toggles + reset/clear buttons, no
.wesl). S6 dispatches when S5 lands. User must FULL-RELOAD (view state shape
changed again).

## Compact checkpoint (post-S4)
Live agents (2): S4 REVIEWER → verdict task-S4-review.md (handle: adjudicate,
fix round R≤3 resuming implementer if needed); S5 IMPLEMENTER (BASE
8ba92591d) → task-S5-report.md (handle: verify gates, re-run probe,
review-package BASE 8ba92591d → its HEAD, opus reviewer, THEN dispatch S6
from task-S6-brief.md with BASE = S5's HEAD). Task board artifact:
https://claude.ai/code/artifact/3a944128-34f7-4e37-9b7e-16e015505b55, source
<scratchpad>/mcpm-taskboard.html, favicon 🕸️ keep stable. Branch
worktree-polyphorm-webgpu-tool @ 8ba92591d pushed to PR #570. Awaiting USER:
T13 visual gate verdict (needs full reload). Any uncommitted tree state
belongs to the live S5 implementer, not the controller.

## Task S5: complete — 8e40d6f89 (checkbox toggle rows + action buttons)
Implementer DONE; controller re-ran probe at HEAD 8e40d6f89: PASS 13/13, 0 warnings. Pushed to PR #570.
Disclosed calls (accepted): Toggle.tsx kept for 3-way tier pills; no ToggleRow unit test (probe is the guard); `info` prop currently unused; composes paths only checked by vite build.
Reviewer dispatched (opus) → verdict to task-S5-review.md. Handling: adjudicate findings; Important → fix round R≤3 resuming implementer; Minor → park for final whole-branch review.

## Task S6: dispatched (BASE 8e40d6f89, sonnet)
Brief grew deliverable 4 mid-flight (user directive 2026-08-18): FPS badge in the Hud — EMA of frame dt in Viewport rAF, throttled ≥500ms store write (`view.fps`), badge row styled like the five existing readouts, shown LAST. Report → task-S6-report.md. Handling: verify gates + re-run probe, review-package BASE 8e40d6f89 → its HEAD, dispatch reviewer. S6 is the LAST pre-gate UI task; after its review, T13 visual gate with the user.
Still live: S4 reviewer → task-S4-review.md (adjudication handling ledgered above).

## Task S4: review closed — APPROVE / APPROVE (0 Important, 7 Minor)
Reviewer hard-verified at 8ba92591d: layering algebra pixel-identical for single layers (blit samples .rgb only), fragment.wesl untouched, splat index range exact [nDataPoints, count), dead view-mode state fully purged, probe selectors match real markup.
Ruling: all 7 Minor PARKED for the final whole-branch review (top carry-forwards: one/one blend descriptor triplicated across three pass files — Track V path tracer is the 4th layer and an omitted blend silently replaces, not errors; unread AgentBuffers.theta + stale docblock; splatBlit constant alpha 1.0; blit lost its HDR upper bound when the red branch went — theoretical Inf at extreme sampleWeight pile-up). No fix round needed.

## Task S5: review closed — APPROVE / APPROVE (0 Important, 9 Minor)
Reviewer re-ran both tsconfigs + vitest (green), hand-verified composes paths. All 9 Minor PARKED for final whole-branch review. NOTE: the checkbox visual is already superseded by user directive → S7.

## Task V2A: dispatched (opus) — volpath port, create-only/unwired/uncommitted
User directive: "implement the path tracer in parallel". V2 split: V2A ports cs_volpath+blit → volpath.wesl/volpathBlit.wesl/volpathPass.ts (NEW files only, no shared edits, NO commit — controller commits its untracked files after S6 lands, shared-index rule), no probe runs. Brief task-V2A-brief.md, report task-V2A-report.md. V2B (wiring: 4th layer section, 9 params, accumulation reset on camera/param change, probe step) queued AFTER S6+S7+V2A. S6 agent warned by message about the concurrent untracked files.

## Task S7: brief written, QUEUED behind S6 (same compile set)
User directives: toggle rows get PILLS not checkboxes; row styling matched to ParamSlider rows (font size, spacing, ⓘ). Probe constraint: keep hidden real checkbox, same aria-labels, probe untouched. Brief task-S7-brief.md. Dispatch order after S6 lands: S7 (sonnet, quick, user-visible) then V2B.

## USER DIRECTIVE (2026-08-18, going AFK): land Phase 2 (T14–T19) and Phase 3 (T20–T23) autonomously
Visual "ask the user to look" steps (T13 gate, V2 look check, T18 preview look) are DEFERRED to user's return — collect them into one visual-checklist note; machine gates (T19 importer round-trip, T23 comparator) run autonomously. Commit-serialization rule while agents overlap: only one committer at a time; concurrent agents work no-commit and the controller stages exactly the files their reports name. Queue: S6(live) ∥ V2A(live) ∥ T14(dispatch now, no-commit) → S6 review + S7 → V2B → T15 → T16 → T17 → T18 → T19 gate → T20 → T21 → T22 → T23 gate. Reviews pipelined per task as before.

## Phase 2/3 recon (controller, pre-dispatch)
- T14 DISPATCHED (sonnet, no-commit — controller commits; brief task-T14-brief.md).
- ANCHOR DATA all local, zero downloads needed: MAIN checkout /Users/rulkens/Development/js/skymap/data/raw/mcpm/{trace.bin 2.488 GB, export_metadata.txt}; fork checkout bin/data/SDSS/sdssGalaxy_rsdCorr_dbscan_e2p0ms3_dz0p001_m10p0_t=0.0.bin (5,198,416 B = 324,901×16 exactly) + its own _metadata.txt; fork bin/export/{trace.bin, deposit.bin, export_metadata.txt} too.
- PLAN CORRECTIONS (rule at T22): trace.bin is f32 per data/raw/mcpm README ("712×1200×728 f32"), NOT the plan's "headerless f16"; and 712·1200·728·4 = 2,487,628,800 ≠ file size 2,488,012,800 (Δ 384,000 B) — comparator must derive element size/dims from metadata + file length, hard-error on mismatch, never hardcode f16. export_metadata.txt says 324,849 points but the packed .bin is exactly 324,901×16 — T21's length-vs-metadata guard will surface this; use the catalog's OWN sidecar (sdssGalaxy..._metadata.txt), not export_metadata.txt, for the count.
- Worktree data/raw/mcpm has only README (worktrees own data/ landmine) — CLI runs pass ABSOLUTE paths into the main checkout; read-only, so safe.
- File-conflict serialization on ControlsPanel/viewSlice/probe: S7 → V2B → T16 → T17 → T18 → T20. Parallel lanes when free: T15 (harness), T21 (App.tsx + loader), T22 (validate/ + package.json). T19 after T16+T17+T18; T23 after T20+T21+T22 (headless big run — how to drive the browser export headless is decided at T23; visual checks deferred to user).

## Task S6: complete — c0b00357e (grid-box sliders, box preview, mass points, FPS badge)
Implementer DONE, deviations documented (commit title; added per-frame gridBoxFor the brief wrongly claimed existed; FPS first-frame sentinel). Controller re-ran probe at c0b00357e: PASS. Pushed. Reviewer dispatched (opus) → task-S6-review.md; handling: adjudicate incl. the three deviations, Important → fix round, Minor → park.

## Task T14: complete — 101430406 (writeNpy)
Implementer DONE no-commit; controller committed+pushed. vitest 3/3, tools tsc repo-wide clean. Reviewer dispatched (sonnet) → task-T14-review.md.

## Dispatched: S7 (sonnet, commits itself, runs probe; BASE 101430406) + T15 (sonnet, NO-commit, no probe)
Handling S7: verify, re-probe not needed (S7 probes), package BASE 101430406 → its HEAD... NOTE if T15's controller commit lands first, S7's package range must exclude it — use exact SHAs from git log, S7's commit only.
Handling T15: controller stages exactly the files its report names, commit `feat(mcpm-workbench): read the trace grid back to the CPU`, package + sonnet reviewer. THEN dispatch T16 (needs T14+T15; touches ControlsPanel — wait until S7 done too? No: T16 touches ControlsPanel, S7 touches only ToggleRow — disjoint, OK) and V2B waits on V2A.
Live now: V2A port, S6 reviewer, T14 reviewer, S7 impl, T15 impl.

## Task T14: review closed — APPROVE / APPROVE (0 Important, 3 Minor parked)
Reviewer round-tripped the writer's output through real NumPy 2.4.4, not just readNpy. Minors parked for final sweep.

## Task T15: fix round 1 (resumed implementer)
DONE report had a blocker-by-adjudication: readbackTrace missing from the McpmHarness TYPE (agent had worked around with an unannotated const) — T16 would fail typecheck. Ruling: the type declaration is part of the plan's interface contract; @types file pulled into T15 scope. Resumed agent: add declaration, revert workaround, re-gate, still no-commit. Then controller commits `feat(mcpm-workbench): read the trace grid back to the CPU`.

## Task T15: complete — 80d9ff465 (readbackTrace, fix round 1 applied: type contract on McpmHarness)
Controller committed+pushed. Reviewer dispatched (sonnet) → task-T15-review.md.

## Task T16: dispatched (sonnet, commits itself; owns ControlsPanel)
Brief task-T16-brief.md. Handling: verify, package, sonnet reviewer, then dispatch T17 (also ControlsPanel — strictly after T16).

## Task S6: fix round 1 (resumed implementer)
Review verdict: spec APPROVE / quality REQUEST_CHANGES, 1 Important — FPS EMA never resets on rAF-loop restart after harness rebuild (badge ~5fps for ~1s). 6 Minor parked. Deviations all accepted. Fix scope: Viewport.tsx only, commits itself, controller pushes + self-verifies the 2-line diff (scoped re-review waived by ruling: single-line sentinel reset, cheaper to eyeball).

## Task V2A: complete — a2367da72 (volpath shaders + pass, unwired)
Agent validated via wesl 0.7.26 linker + naga. Controller committed+pushed. Reviewer dispatched (opus, math-focused, fork side-by-side) → task-V2A-review.md. V2B contract notes (BINDING for the V2B brief): VolpathParams = spec's 9 + trimDensity + sampleWeight; NO resize() — pass self-sizes from view.viewportPx; reset() flags a clear riding the next draw; probe must exercise BOTH grid elements (f16 rejected by naga, unvalidated); traceMax is a tracking majorant — too low biases dark silently, consider seeding from field peak; cost ≈ bounces×512 steps/pixel — much heavier than raymarch; RR double-albedo quirk preserved deliberately (quirk-registry candidate for T24).
Live: S6-fix, S7, T15 reviewer, T16 impl, V2A reviewer.

## Task S6: CLOSED — c0b00357e + fix c7cf06d83 (FPS EMA restart reset, controller-verified diff)
Important addressed; 6 Minor parked. Pushed.

## Task S7: complete — b68204921 + 8d729217c (pill toggles; second commit reverts an index-race Viewport hunk, net zero)
Probe 13/13 by implementer. Deviation: inset-0/opacity-0 hidden checkbox (Playwright actionability) instead of clip-rect. Pushed. Reviewer dispatched (sonnet) → task-S7-review.md. INDEX-RACE LESSON ledgered: all committing agents now use `git commit -- <pathspec>`.

## Dispatched: T21 (sonnet) + T22 (sonnet), both NO-commit
Briefs task-T21-brief.md / task-T22-brief.md (T22 carries the BINDING element-size correction: derive bytes/voxel from file length, hard-error otherwise). Handling: controller commits from reports (T21: `feat(mcpm-workbench): dev-only loader for the fork's packed catalogs`; T22: `feat(mcpm-workbench): trace-cube comparator CLI` — re-apply package.json line if contended), package, sonnet reviewers.
Live: S7 reviewer, T15 reviewer, T16 impl, V2A reviewer, T21 impl, T22 impl.
Next in ControlsPanel chain after T16: T17 → V2B → T18 → T20.

## Task T15: fix round 2 (resumed implementer)
Review: spec APPROVE / quality REQUEST_CHANGES — 1 Important (no try/finally: staging buffer leaks if submit/mapAsync throws; worst at ~1.24 GB), 2 Minor parked. Fix scope readbackTrace.ts only, no-commit; controller commits `fix(mcpm-workbench): release the readback staging buffer on failure`, then scoped re-review folded into final sweep (ruling: leak-path fix is mechanical, reviewer's own prescription).

## Task T15: CLOSED — 80d9ff465 + fix 467ecebc3 (try/finally staging release, pushed)
Important addressed per reviewer's own prescription; 2 Minor parked. Scoped re-review folded into final sweep per earlier ruling.

## Task T21: fix round 1 (resumed implementer)
Report was display-only drop (parses, shows status, never installs the catalog). Ruling: T23 is "no new code" and must RUN on the dropped VAC catalog, so installing it through the normal catalog→store→harness-rebuild path is T21 scope. Fix in flight; still no-commit.

## Task S7: review closed — APPROVE / APPROVE (0 Important, 2 Minor parked)
Reviewer independently re-ran the probe (13/13, checkbox role contract genuinely holds). Parked: .statePill restates the tier-pill recipe (Toggle.tsx has no CSS module to compose from — follow-up: lift a shared pill class); shared.module.css toggleRow/toggleLabel/checkbox possibly orphaned — sweep in final review.

## Task V2A: fix round 1 (resumed implementer)
Review: spec APPROVE / quality REQUEST_CHANGES — 1 Important (anisotropy negative half inert via fork's 2·abs(g); JSDoc falsely promises back-scatter), 5 Minor parked. Math otherwise verified term-by-term vs fork incl. RR quirk, ray-gen exact inverse of voxelToNdc, uniform offsets scalar-by-scalar. Ruling: honest + UNIPOLAR contract — JSDoc corrected, host clamp [0,0.99], landmine at abs(g) site. V2B BINDING: anisotropy slider range [0, 0.99]. Controller commits after fix: `fix(mcpm): volpath anisotropy — honest unipolar contract`.

## Task V2A: CLOSED — a2367da72 + fix 6b9d34115 (anisotropy honest unipolar), pushed
5 Minor parked. V2B BINDING carry-forwards: anisotropy slider 0→0.99 (NOT bipolar); VolpathParams = 9 + trimDensity + sampleWeight; no resize(); reset() rides next draw; probe both grid elements.

## Task T16: fix round 1 in flight (Viewport released to T16 agent — export-token consumer branch)
92b481eeb pushed (export pipeline + one-shot exportToken in simSlice mirroring reset/clearTrace; scope expansion to simSlice/SimSlice.d.ts ACCEPTED). Note for final review: one-shot token pattern now has a THIRD sibling — T17/T18 will add more; consolidation candidate (second-special-case rule) but NOT mid-run.
T17 QUEUED: dispatch AFTER T16 fix lands (T17's Viewport consumer branch would collide with T16's fix edit). T17 mirrors the token pattern end-to-end (slice token + ControlsPanel button + Viewport consumer).

## Task T21: fix round 1 done — store path complete, Viewport fold-in pending (round 2 queued)
Drop now installs via new setPackedCatalog reducer (catalog.packedOverride/packedSourceName) + unforked deriveAgentWeights; new catalogSlice test; 13 files/39 tests green. Residual (agent correctly refused a hack): Viewport.catalogKey() hashes only [sources,tier]; buildOnce ignores the override. VIEWPORT QUEUE (strict): T16-fix (live) → T21-fix2 (fold packedOverride into catalogKey, prefer it in buildOnce) → T17 → V2B → T18 → T20. Still no-commit; controller commits T21 whole after fix2.

## Task T22: fix round 1 (resumed implementer) — fixture tests for meta/points parsers
Initial DONE: 5/5 tests, tsc repo-wide green, package.json line `"mcpm-workbench:compare": ...` after the probe line. CORRECTION to earlier controller note: NO 384,000-byte discrepancy — 712×1200×728×4 = 2,488,012,800 exactly matches trace.bin (controller arithmetic slip; f32-not-f16 correction stands). Deviations accepted: --meta/--points optional (fail-fast shape check). Fix round: fixture tests for metadata parser + packed reader + one hand-computed voxel-mapping case (silent-wrong risk for T23); parsers may move to own validate/ files. Still no-commit; controller commits whole T22 after.

## Task T16: complete — 92b481eeb + fix ef557339d (export wired end-to-end), pushed
Probe re-run by implementer PASS. Residual (parked for T18/final): no gate exercises the button end-to-end — future probe step mirroring command:reset. Reviewer dispatched (sonnet) → task-T16-review.md (told to skip interleaved 467ecebc3/6b9d34115).
T21 fix round 2 dispatched (Viewport released: fold packedOverride into catalogKey, prefer in buildOnce). After T21-fix2: controller commits T21 whole → dispatch T17 (ControlsPanel+Viewport free next).

## Task T16: review closed — APPROVE / APPROVE (0 Important, 2 Minor parked)
Reviewer was interrupted by a system sleep mid-write, resumed, completed.

## Task T22: complete — a23360465 (comparator CLI + fixture-tested parsers), pushed. Reviewer dispatched (sonnet) → task-T22-review.md.
## Task T21: complete — 0cfd4f02e (packed loader, store install + Viewport fold-in, probe PASS), pushed. Reviewer dispatched (sonnet) → task-T21-review.md.
## Task T17: dispatched (sonnet, commits itself w/ pathspec; owns ControlsPanel+Viewport+simSlice) — brief task-T17-brief.md
After T17: dispatch V2B (Viewport/ControlsPanel/viewSlice/probe; binding carry-forwards in V2A entries) → then T18 → T19 gate → T20 → T23.
Live: T17 impl, T21 reviewer, T22 reviewer.

## Task T17: complete — 141f93292 (.scfd export), pushed. Reviewer dispatched (sonnet) → task-T17-review.md.
Two system-sleep interruptions this stretch (T16 reviewer, T17 implementer, T21 reviewer) — all resumed cleanly via SendMessage; lesson: sleep kills mid-response agents, resume with a "pick up where you left off" message.

## Task T21: fix round 3 (resumed implementer) — packedDropId monotonic rebuild trigger
Review: spec APPROVE / quality REQUEST_CHANGES — 1 Important (same-filename second drop silently keeps first drop's data; packedSourceName key insufficient), 3 Minor parked (redundant deriveAgentWeights in App for nanCount; extension-only pairing undocumented; DEV gate inert absent a build script). Fix: slice packedDropId++, folded into catalogKey; commits itself w/ pathspec; probe waived (no pipeline change). V2B DISPATCH GATED on this landing (Viewport contention). V2B brief ready: task-V2B-brief.md.

## Task T21: CLOSED — 0cfd4f02e + fix f99cef633 (packedDropId trigger), pushed. 3 Minor parked.
## Environment: repeated system sleeps killed agents mid-response — controller started `caffeinate -dims -t 10800` in background (AC power confirmed 80%/charging-attached; auto-expires after 3h). Tell the user on return.
## Task V2B: dispatched (sonnet; owns ControlsPanel/Viewport/viewSlice/probe). Brief task-V2B-brief.md. Handling: verify, push, package, opus reviewer (shader-adjacent wiring), then T18.

## Task T22: fix round 2 (resumed implementer)
Review: spec APPROVE / quality REQUEST_CHANGES — 3 Important: TV tests never hit normalize-before-diff on unequal masses; readTraceCube derivation/traceHistogram/happy-path untested (fixed-shared-edges invariant unpinned); memory — redundant slice() copies + unconditional f64 promotion stack to est. 15-20 GB transient at anchor scale (T23 blocker risk). 4 Minor parked. Fix commits itself w/ pathspec `fix(mcpm-workbench): comparator coverage and single-copy reads`; controller pushes; re-review folded into final sweep if diff is per-prescription.

## Task T17: CLOSED — review APPROVE / APPROVE (0 Important, 1 Minor parked)

## Task T22: CLOSED — a23360465 + fix 540ee8b25 (3 Importants addressed: unequal-mass TV test, derivation/histogram/happy-path coverage, zero-copy reads + Float32 marginals → peak est. 5-8 GB), pushed. 4 Minor parked. Re-review folded into final sweep per ruling (diff per prescription).
NOTE: push also carried b357a36d0 "feat(mcpm): volumetric path tracer view" — V2B's commit is at HEAD but its agent has NOT reported yet; wait for the report before packaging/reviewing V2B.

## Task V2B: complete — b357a36d0 (path tracer wired as 4th layer, probe 14/14 incl. layers:path-tracer-on), pushed
Concerns parked: traceMax default 5.0 uncalibrated (no peak-density readout to seed from — flagged in code/UI; T24-adjacent); grid element is a device-feature choice not a UI lever, so the probe exercises only the adapter's variant (Apple metal-3 = f16 — the naga-unvalidatable variant DID run on a real driver). Reviewer dispatched (opus, reset-matrix focus) → task-V2B-review.md.

## Task T18: dispatched (sonnet; owns tracePass/viewSlice/probe/previewPackedTrace + minimal panel wiring) — brief task-T18-brief.md
After T18: T19 gate (README + importer round-trip + scfd/npy agreement — controller-driven), then T20, then T23.
Live: V2B reviewer, T18 impl.

## Task V2B: review — spec APPROVE / quality REQUEST_CHANGES (2 Important, 6 Minor parked); FIX GATED behind T18 (same files)
Important 1: reset key misses clearTraceToken/resetToken — paused sim + cleared trace keeps averaging a dead field. Important 2: traceMax default 5.0 + ceiling 100 vs raw-trace p99≈320/max≈40000 (packLogTraceVoxels docs) — needs log-mapped slider ~1e0–1e5 + a piloted (sampleWeight, sigmaT, traceMax) triple that actually renders (MAX_TRACK_STEPS=512 means naive majorant = black). Everything else verified (defaults, unipolar anisotropy, draw order, camera key covers pan+viewport, byte-identical pass). HANDLING: when T18 lands → resume V2B implementer with both fixes (Viewport key + ControlsPanel log slider + viewSlice default), pilot values hands-on via probe? no — pilot analytically from packLogTraceVoxels docs + report, visual confirm deferred to user checklist.

## Task T18: complete — e06f10450 (preview-packed view, probe 15/15), pushed. Reviewer dispatched (sonnet) → task-T18-review.md.
Concerns parked: preview auto-reverts ~1 frame while sim.running (spec-correct, may read as flicker — user-checklist item: pause before previewing); f16 fallback path only exercised on shader-f16 adapter.
## V2B fix round 1 dispatched (files freed by T18): reset tokens in key + log-mapped traceMax 1e0–1e5 + piloted default triple.
Phase 2 code COMPLETE pending reviews/fixes. T19 gate next (controller-driven, after V2B fix + T18 review): export a real pair headlessly? — T19 needs an actual downloaded .npy+.json+.scfd from a real run; plan says the pair downloads and the importer eats it. Controller will script it via the probe framework if feasible, else defer the download half to the user checklist and run importer/decode legs on whatever a headless run can produce.
Live: T18 reviewer, V2B fix.

## Task V2B: CLOSED — b357a36d0 + fix fd1c6c88c (reset tokens + log traceMax 1e0–1e5; piloted triple sigmaT 1.0 / traceMax 4e4 / sampleWeight 1e-4 → mfp≈0.25vox, 512 steps ≈ 128vox), pushed
6 Minor parked. Scoped re-review folded into final sweep per ruling (diff per the reviewer's own prescription, arithmetic in report). USER CHECKLIST: path-tracer defaults need eyes-on calibration; 512-step cap ≈ half the 256 long axis — majorant-correctness chosen over full-diagonal coverage.

## Task T20: dispatched (sonnet; histogram shader port + plot + slice; brief task-T20-brief.md)
Handling: verify, push, package, opus reviewer (kernel port). After T20 + T18 review: T19 gate (controller), then T23.

## Task T18: fix round 1 (resumed implementer) — X/Z SWAP + preview race
Review: spec REQUEST_CHANGES / quality APPROVE — 2 Important. CONTROLLER-VERIFIED against packLogTraceVoxels.ts source: it transposes C-order→x-fastest, so the x-fastest GPU readback gets X/Z swapped in the preview AND in T17's exportScfd (LATENT T17 DEFECT the T17 review missed — its "arguments match exportScfd exactly" check confirmed consistency, not correctness; note for the final sweep). Adjudicated fix riding T18's round: packLogTraceVoxels grows an input-layout param (default 'c' preserves importer behavior; 'x-fastest' per-element, no reorder) + equivalence unit test; both call sites pass 'x-fastest'; race fixed by re-checking previewPacked after awaits. 2 Minor parked. T19's decode-agreement leg is the backstop proving the swap is gone.

## Task T18: CLOSED — e06f10450 + fix 29929d68b (x-fastest packer path + equivalence test + race guard), pushed
Agent visually verified orientation match via a temp Playwright script (deleted after). The X/Z swap fix also RETRO-FIXES T17's exportScfd. 2 Minor parked.
NEXT: T19 gate after T20 lands (T19 verification agent will script headless export-download runs Playwright-style; probe-port style isolation; visual "preview matches" leg partially evidenced by the fix-round check, still on the user checklist).
Live: T20 impl.

## Task T20: complete — 68edbe774 (histogram kernel + convergence plot, probe 16/16), pushed
Disclosed for reviewer adjudication: group(0) binding-collision redesign (reuses io::sim uniformBindGroup); meanLogTraceAtPoints NOT code-shared with validate/ (same math via shared worldToVoxel, no extractable mean-only fn); throttle/history/reset judgment calls. Reviewer dispatched (opus, port-fidelity + statistic-identity focus) → task-T20-review.md.

## Task T19: gate verification dispatched (sonnet) — headless export capture → importer round-trip → decode agreement → README. Artifacts under workspace t19-artifacts/. Report → task-T19-report.md. Commits README only.
Live: T20 reviewer, T19 verifier.
After both + fixes: T23 measurement (last), then final whole-branch review sweep of ALL parked minors, then user checklist.

## Task T20: review — REQUEST_CHANGES × 2 (5 Important, 13 Minor parked); FIX GATED behind T19 verifier (it live-serves the app incl. histogram.wesl)
Port fidelity itself verified clean (17 bins, log10 map, clamp, atomics, guard, RNG order, clearBuffer per step, nearest-voxel, no uniform race). Importants to fix (adjudications): (1) ALIGN UI statistic to the CLI definition — skip out-of-grid points, divide by SAMPLED count (add an atomic sampled-counter lane; CLI is the T23 anchor so IT is the spec); (2) guard out-of-box in SIGNED space before any u32 cast (negative coords currently collapse to corner voxel); (3) rebuild path must resetHistogram alongside resetStepCount; (4) clear the history series when the jitter toggle changes (a differently-defined statistic never rides the same curve); (5) planGridBudget AGENT_LANES 6→7 for the densities lane (restores the byte-for-byte HUD invariant). HANDLING: when T19 reports → resume T20 implementer with all five; .wesl edits FINISHED before its probe; then scoped re-review (opus went deep — re-review can be sonnet on the fix diff).

## Task T19: BLOCKED at leg 3 — GATE CAUGHT A SECOND EXPORT-ORDER BUG (this is the gate working)
Legs 1/2/4 PASS (headless capture 64×64×56 — Playwright landmine: context.on('download') never fires for blob+anchor clicks, agent worked around; importer ate the pair; tests green). Leg 3: 100% of non-zero voxels mismatch (max dev 1.0, ruled NOT a clean X↔Z transpose). ROOT CAUSE (agent-identified): exportNpy.ts writes raw x-fastest GPU bytes; buildRhizomeVolume treats .npy as the fork's C-order convention. exportScfd fixed in T18's round; exportNpy needs the equivalent. README committed 16832536e (records the BLOCKED state), pushed.
HANDLING — T19-FIX (dispatch AFTER T20-fix lands; T20-fix edits histogram.wesl and T19-fix must serve the app): resume T19 agent; ground truth = buildRhizomeVolume's demonstrated-correct handling of the real VAC data (shipped volumes render right); make exportNpy (+ sidecar dims if the convention demands) produce a pair that decodes ≤ f16 rounding against the importer output; re-run all four legs with its existing scripts; update README to the passing numbers; commit code+README.
## T20 fix round 1 dispatched (5 Importants, adjudications in the dispatch).
Live: T20-fix.

## Task T20: fix round 1 landed — 05556bd02 (all 5 per adjudication, probe 16/16), pushed. Scoped re-review dispatched (sonnet) → appended to task-T20-review.md.
## Task T19: FIX dispatched (resumed verifier) — exportNpy byte order to the importer's convention (ground truth: importer's demonstrated-correct VAC handling), test if GPU-free testable, RE-RUN all 4 legs fresh, README to passing numbers. Commits code+test+README, controller pushes.
Live: T20 re-reviewer, T19 fixer.
Remaining after these: T23 measurement (dispatch when T19 gate PASSES), final whole-branch review (opus/most-capable, sweep ALL parked minors — now ~45), user visual checklist, plan checkbox tick + /feature-done deferred to user return.

## Task T20: re-review — 4/5 ADDRESSED; residual on Important 2: i32 cast truncates toward zero vs CLI's Math.floor → the (-1,0) shell on low faces still counted in-grid; comment overclaims. FIX ROUND 2 QUEUED behind T19 fixer (edits histogram.wesl; T19 serves the app): wrap the voxel coord in floor() before the i32 cast + correct the comment + (cheap) extend the CLI-identity doc; probe re-run required. Re-reviewer confirmed no other new defects; 54/54 tests.

## Task T19: GATE PASSES — c80f93e4a (exportNpy → C-order via new xFastestToCOrder, exact inverse of the packer transpose; sim paused before capture), pushed
Max deviation 0 — 229,376/229,376 voxels bit-identical. All four legs green; 67 tests. Intermediate 90% run traced to sim stepping between the two export clicks (timing confound, not a bug). Ruling: T19's code fix needs no standalone review — pure permutation + unit test + bit-identical end-to-end is the strongest verification; swept in the final review.
## T20 fix round 2 dispatched (floor-before-i32 one-liner). T23 brief written (task-T23-brief.md) — dispatch AFTER T20-fix2 lands (app-serving vs .wesl edit rule).
Live: T20-fix2.

## Task T20: CLOSED — 68edbe774 + 05556bd02 + 52b446041 (floor identity, probe 16/16), pushed. 13 Minor parked.
## Task T23: dispatched (sonnet, long-running measurement; brief task-T23-brief.md; artifacts t23-artifacts/). Handling: on PASS → push README commit, T23 closed → dispatch FINAL whole-branch review (most capable model; sweep ALL parked minors — S4:7, S5:9, S6:6, S7:2, T14:3, T15:2, T16:2, T17:1, T18:2, T21:3, T22:4, V2A:5, V2B:6, T20:13 + V1/S2 pools + T19 fix unreviewed + token-pattern consolidation + blend-descriptor triplication + orphaned checkbox classes). On BLOCKED → adjudicate from evidence.
Phase 4 (T24 quirk strip, T25 energy smoke) NOT in the user's authorized scope ("phase 2 and 3") — remains for the user to green-light.
Live: T23.

## Task T23: DONE — e85cb775d (validation bands recorded), pushed. HEADLINE: full 712×1200×728 ran, no refusal.
Floor (seeds 1v2): logHist TV 0.0002, dataPointHist TV 0.0024, marginals ≤0.045, meanLog 0.16%. vs-fork (at 2× downsample — comparator bugs blocked full res): logHist TV 0.1359, dataPointHist TV 0.9816, marginals 1.0, meanLog 15.8× — 2-3 orders above floor, root cause OPEN (candidate: fork boundary/deposit handling; T24 quirk sweep is the natural probe — Phase 4 NOT authorized, user decides).
OPEN ITEMS ledgered: comparator TypedArray.from OOM + readFileSync 2 GiB ceiling (FIX DISPATCHED → T22 agent, round 3); 52-point metadata discrepancy (backlog candidate); step count 800 chosen by convergence extrapolation, not fork ground truth (recorded in README).
HANDLING after T22-fix3 lands: controller pushes; resume T23 agent for a comparator-only FULL-RES re-run (sim exports already exist in t23-artifacts/) + README addendum; THEN final whole-branch review dispatch.
Live: T22-fix3.

## Task T22: fix round 3 landed — e9dd16a64 (decodeF16 loop + readFileChunked, 56 tests), pushed. T22 CLOSED (re-review folded into final sweep).
## T23 full-res re-run dispatched (resumed agent; comparator-only on existing exports; README addendum commit, controller pushes). After it: dispatch FINAL whole-branch review (most capable model, all parked minors, per the sweep list ledgered at T23 dispatch).
Live: T23 re-run.

## Task T23: CLOSED — e85cb775d + full-res addendum e9baf74df, pushed
Full-res floor: logHist 0.0001 / dataPoint 0.0007 / marginals ≤0.055 / meanLog 0.36%. Full-res vs-fork: logHist 0.0721, dataPoint 0.9909, marginals 1.0, meanLog 32.1× — all ~3 orders above floor. Total-mass gap 9.28× RESOLUTION-STABLE (real behavioral difference, not artifact). Open: fork boundary/deposit suspect → T24 (unauthorized); 52-point metadata mismatch; no fork step-count ground truth; point-vs-cube statistics move oppositely with resolution (README-flagged).

## FINAL whole-branch review dispatched (opus; base 11f3cad5e, 73 commits/172 files/12.9k+) → final-review.md
Handling: ONE fix dispatch for FIX-NOW items, scoped re-review, adjudicate residuals; BACKLOG items → docs/BACKLOG.md entries (same change); then AFK run complete — user-return package: T13 visual gate + checklist, Phase 4 decision, plan checkboxes + /feature-done (user-invoked), caffeinate note.

## FINAL REVIEW: NEEDS-WORK — 3 cross-task Important / 16 Minor; dispositions 8 FIX-NOW / 62 ACCEPT / 17 BACKLOG → final-review.md
HEADLINE X1 (empirically proven by the reviewer via period-testing trace.bin's zero-band): the comparator applies NO voxel-order normalisation — anchor is x-fastest, workbench .npy is C-order (post-T19-fix), so T23's dataPointHist TV 0.9909 / marginals 1.0 / meanLog 32× are TRANSPOSITION ARTIFACTS. Only logHist TV 0.0721 + mass ratio 9.28× (order-independent) stand. The previous ledger line "root cause OPEN → T24" is therefore WRONG about scale — do not send anyone physics-hunting until the corrected numbers exist. xFastestToCOrder itself verified exact-inverse; exporter correct, comparator at fault.
FIX SWEEP dispatched (sonnet; ONE dispatch, 10 items + 17 BACKLOG.md entries + comparator re-run + README table rewrite; two pathspec commits). Handling: push both, scoped re-review (sonnet) on the sweep diff, adjudicate residuals, ledger the corrected validation verdict — THEN the run is complete; user-return package as previously ledgered.
Live: final-fix sweep.

## FINAL SWEEP: landed — bff0ef3b1 (code) + bcb2b8592 (docs), pushed. Probe 17/17 incl. new grid:box-preview step.
CORRECTED validation verdict (full res, both seeds): logHist TV 0.0721 (unchanged, order-independent — predicted); dataPoint TV 0.9909→0.669; meanLog 32.1×→1.49× (7.137 vs 4.787); marginals still 1.0 but now a REAL edge-zero effect and the least-discrepant statistic (~4.1× over band); mass ratio 9.279× reproduced. Sidecar grew voxel_order field + CLI --a-order/--b-order overrides (both load-bearing, judgment call accepted). 17 BACKLOG.md entries added.
Scoped re-review dispatched (sonnet; backward-compat of field-less sidecars is the priority check) → appended to final-review.md. On ALL ADDRESSED: run complete — final ledger closure + user-return package + memory update.

## RE-REVIEW: ALL ADDRESSED — AFK RUN COMPLETE (2026-08-18, HEAD bcb2b8592, all pushed to PR #570)
Independent gates at HEAD: both tsc, 25 files/82 tests, prettier, probe 17/17 (implementer-run). resolveNpyOrder hard-errors rather than defaulting (re-reviewer confirmed the only safe choice). 4 extra backlog items beyond the curated 13 — intentional, disclosed.

# USER-RETURN PACKAGE
- BUILT while AFK: S6/S7 (grid-box sliders + box preview, pill toggles, FPS badge, mass-scaled points) · V2 path tracer (4th layer, unipolar anisotropy, piloted defaults) · Phase 2 (writeNpy, readbackTrace, .npy+sidecar + .scfd exports, preview view; T19 gate PASSED bit-identical after catching TWO export byte-order bugs) · Phase 3 (histogram+convergence plot, packed-VAC loader, comparator CLI; T23 measured at FULL 712×1200×728) · final review sweep (comparator voxel-order normalisation — T23's scary numbers were transposition artifacts).
- VALIDATION VERDICT (corrected, full res): floor logHist 0.0001 / dataPoint 0.0007; vs-fork logHist 0.0721, dataPoint 0.669, meanLog 1.49×, mass ratio 9.279× (resolution-stable) — the mass ratio is the real open question.
- YOUR DECISIONS: (1) Phase 4 go/no-go (T24 quirk strip — the natural mass-ratio probe — + T25 energy smoke; NOT in the authorized scope). (2) V3 param save/load (unstarted). (3) T13 visual gate + checklist: hard reload :5500 → pill toggles aligned with sliders · grid-box slider drag shows the wireframe preview · FPS badge · path-tracer layer ON (defaults piloted analytically — needs eyes-on calibration; 512-step cap ≈ half the 256 long axis) · preview-packed toggle (pause sim first — auto-reverts while running) · export buttons download real pairs · drag-drop a packed catalog (DEV only). (4) /feature-done when satisfied (plan checkboxes untouched — tick in batch then).
- HOUSEKEEPING: caffeinate guards stopped/expiring; 17 backlog items filed in docs/BACKLOG.md; 62 minors ACCEPTED with reasons in final-review.md; all SDD artifacts in this directory.

## Task S8: Data section + real pillToggle + camera/box decouple (post-AFK, user-requested)
- BASE bcb2b8592. Brief: task-S8-brief.md. Three parts: (1) ToggleRow adopts
  the app's pillToggle vocabulary (sliding-thumb pill, input IS the control,
  on/off text chip deleted); (2) "Data" CollapsibleSection in ControlsPanel:
  per-source ToggleRows (2MRS→SDSS→GLADE, SOURCE_REGISTRY labels, last-source
  uncheck no-ops) wired to setCatalogSources + tier chips moved inside;
  (3) camera.targetOffsetMpc → targetMpc ABSOLUTE (user: box moves must not
  move the camera; autoFit no longer recenters — reset is the recovery).
- Implementer dispatched (sonnet, background).
- Part 4 added mid-flight (user): box-preview wireframe LINE_COLOR →
  orange (boxLines.wesl:20) so the drag affordance stands out. Sent to the
  running S8 implementer (it owns the probe run; .wesl never edited beside
  a live probe).
- Implementer DONE: 398434b43, tsc both GREEN, vitest 61/61, probe 17/17,
  prettier clean. Concerns: (1) claims requestReset never restored
  view.camera (contradicts V2B notes) — reviewer told to adjudicate with
  file:line; (2) brief's tools tsconfig path was wrong (real:
  tsconfig.tools.json) — agent gated against the real file. Reviewer
  dispatched (sonnet, background), package review-bcb2b8592..398434b43.diff.
- QUEUED for the S8 fix round (user, mid-review): Data section must list
  the main app's full TOGGLEABLE_SOURCES ladder (FamousGalaxy, TwoMRS,
  SDSS, Glade, Milliquas, DesiDeep, DesiWedge, DesiSgw — GalaxiesSection
  order), not just the default trio. All v9 bins exist; loadCatalogPoints
  is source-generic. Default-ENABLED sources stay [SDSS, TwoMRS, Glade].
  Dispatch together with review findings once the S8 reviewer returns
  (no concurrent edits while the reviewer runs gates).
- REVIEW: spec PASS, quality approve, 2 no-action minors. 398434b43 PUSHED.
  Adjudication: NO camera-reset mechanism exists (V2B "coverage" was volpath
  cache invalidation, Viewport.tsx:472-479) — implementer right, brief wrong.
- Fix round 1 dispatched (resumed implementer): task-S8-fix-brief.md —
  (1) full TOGGLEABLE_SOURCES ladder; (2) DELETE last-source null-guard
  (it produced the user's dead SDSS toggle: sole source + guard no-op +
  SDSS-excluded-at-small = zero feedback), zero points becomes a surfaced
  state not a harness throw; (3) muted "not in <tier> tier" hint via
  tierTarget()==0; (4) Ruling: reset token consumer also restores
  view.camera to defaults — reset = sim AND framing; (5) test updates.
- S9 QUEUED (user): raymarch "Preview" SliderGroup + integer divisor
  slider (1-8, default 1); trace layer renders to a floor(size/divisor)
  rgba16float target + bilinear additive upsample into accum — the main
  app's volume-row pattern (renderTargets.ts). Brief: task-S9-brief.md.
  Dispatch a FRESH implementer when the S8 fix round lands (same files in
  flight: ControlsPanel/viewSlice/Viewport/RenderGraph).
- Fix round 1 DONE: 05cdfff5b PUSHED (tsc both, vitest 62/62, probe 17/17).
  Implementer concerns: zero-point check covers cached-points path too
  (accepted, more correct); statusMessage offset from packedStatus so both
  can show; no new probe step for zero-points (parked — candidate for a
  later probe sweep). Scoped re-review dispatched STATIC-ONLY (S9 edits
  concurrently, so no gate runs in the reviewer).
- S9 implementer dispatched (fresh, sonnet, background) on 05cdfff5b.
- Fix-round re-review: ALL ADDRESSED, no findings (traced zero-point path
  end-to-end incl. status clear on re-enable). S8 CLOSED at 05cdfff5b.
- EDGE ARTIFACT investigation dispatched (user: flat filament structure on
  box faces where no galaxies): read-only agent measuring boundary-shell
  mass (T23 run A/B vs anchor trace.bin, shells k=0..7 vs interior k>=16)
  + raymarch edge-sampling inspection + propagate boundary-semantics
  1:1 check vs fork. Report → edge-artifacts/report.md. NOTE: prime
  suspect link to the open 9.28x mass ratio (T24 territory).
- Still in flight: S9 implementer (raymarch preview divisor).
- Edge artifact narrowed by user: X FACES ONLY. Investigation agent told to
  split shell stats per face-pair and hunt per-axis asymmetries (x is the
  fastest-varying flat-index axis: x aliasing lands IN-bounds on adjacent
  rows → face-pinned structure; decay %-wrap low-edge quirk; marcher
  per-axis clipping; dispatch-overrun decomposition with x innermost).
- S9 implementer DONE: 95125803e (tsc both, vitest 65, probe 18/18 incl new
  raymarch:divisor step, run twice). Reviewer dispatched (sonnet, may run
  tsc/vitest — no concurrent editors; probe excluded). Not yet pushed.
- Still in flight: edge-artifact investigation (X-faces-only clue relayed).
- EDGE ARTIFACT ROOT CAUSE (controller, confirmed in code): autoFitGridBox
  swallows paddingMpc — voxel size inflated but dims from RAW extent, so
  data extremes sit ON faces (ceil8 slack only). Investigation agent
  cleared everything else: shells cold on all 6 faces in T23 cubes AND
  anchor; all code paths axis-symmetric vs fork; sampler reads 0 OOB.
  X-only = the wedge's flat boundary hugging the tightest-fit axis.
  Wall webs are fork-faithful sensing behavior; fork never shows them
  because its grids carry ~80 edge-zero voxels of margin.
- S10 QUEUED (brief written): commit 1 padding fix + margin test;
  commit 2 grid divisor [0.75,1,1.25,1.5,2,2.5,3] (BASE 256) replacing
  longAxisTarget + res dropdown, live dims readout via extracted shared
  deriveGridBox. Dispatch fresh implementer AFTER S9 review returns.
- S9 review: spec PASS, approve, minors-only (comment-ratio nitpicks, no
  action). 95125803e PUSHED. S9 CLOSED.
- S10 implementer dispatched (fresh, sonnet, background) on 95125803e —
  told to name the new control "grid divisor" to avoid colliding with S9's
  raymarch "divisor" slider in probe/accessibility names.
- User addition sent to S10 mid-flight: raymarch preview divisor DEFAULT
  1 → 3 (viewSlice), folded into S10 commit 2.
- VOLPATH BUG investigation dispatched (user: barely visible, extremely
  slow, renders flat on cube faces). Read-only agent ranking 5 hypotheses:
  H1 volpathKey per-frame accumulation reset churn; H2 delta-tracking
  null-collision branch (scatter-at-every-tentative renders the box
  SURFACE); H3 density lookup mapping vs known-good fragment.wesl;
  H4 throughput/exposure factor accounting incl. sampleWeight
  double-application; H5 defaults vs fork main.cpp + step-cap coverage
  math. CPU repro of the tracking loop (first-scatter-depth histogram)
  required for the H2/H4/H5 verdicts. Output → volpath-bug/.
- In flight: S10 implementer (padding fix + grid divisor + raymarch
  divisor default 3), volpath investigation.
- VOLPATH VERDICT (investigation complete, evidence in volpath-bug/):
  H1 CONFIRMED — stepCount in volpathKey resets accumulator EVERY frame
  (sim default running:true); the in-code "not a bug to chase" comment
  falsified. H2 Woodcock REFUTED (term-for-term fork match, cs_volpath
  .hlsl:216-224). H3 lookup REFUTED (byte-identical to grid.wesl).
  H4 CONFIRMED contributing — sampleWeight feeds majorant AND palette;
  1e-4 is 100x darker than raymarch for the same voxel. H5 CONFIRMED,
  LOAD-BEARING — V2B's majorant-at-field-max (traceMax 4e4) shrinks
  Woodcock steps to 0.25vox; 512-step cap dies ~128vox in; CPU repro:
  0% first-scatters past halfway in EVERY scenario, 81.5% cap-exhaustion
  at mean density (also the slowness). Fork defaults (traceMax 100,
  sampleWeight 0.01) clamp the tail instead and cross the whole box.
- Ruling: S11 = fork-faithful defaults restore + accumulator reset every
  16 steps instead of every frame. Brief: task-S11-brief.md. QUEUED
  behind S10 (both touch viewSlice + Viewport).
- S10 implementer DONE: 02cb3d8fc (padding fix) + c2ad9bdf0 (divisor +
  raymarch default 3). Gates: tsc both, vitest 70, probe 18/18 (one
  pre-existing preview-packed flake, reproduced-unchanged). Implementer
  flagged pre-existing NaN catalogBounds on zero-count catalog (predates
  S10 — reviewer told to confirm; backlog candidate). NOT yet pushed.
- Dispatched in parallel: S10 reviewer (STATIC-only) + S11 implementer
  (volpath defaults + accumulator churn) on c2ad9bdf0.
- User addition sent to S11 mid-flight: grid divisor pill row → DROPDOWN
  (same seven values, same accessible name, dims readout untouched),
  separate commit `feat(mcpm): grid divisor as a dropdown`.
- CONTROLLER ERROR + recovery: dropdown addition was mis-sent to the S10
  REVIEWER (it refused correctly, static scope) — re-sent to the real S11
  implementer. Lesson: verify agent identity before SendMessage when two
  dispatches share a message block.
- S10 REVIEW: spec PASS, approve. Findings: CatalogSlice.d.ts header 20
  lines (Important, budget), autoFitGridBox.ts header 14 lines (Minor) —
  both folded into S11's batch as trims. All else verified incl. padding
  math by hand, zero-hit renames, non-colliding accessible names, NaN
  catalogBounds confirmed PRE-EXISTING (backlog candidate). S10 PUSHED
  (95125803e..c2ad9bdf0). S10 CLOSED pending the two trims in S11.
- User addition to S11: grid divisor gains 0.5 (list now
  [0.5,0.75,1,1.25,1.5,2,2.5,3]; 0.5 = 512 long axis) — same dropdown
  commit; agent told to verify the byte-budget refusal path handles an
  over-budget 0.5 pick cleanly.
- S11 implementer DONE: 054b0e051 PUSHED (volpath defaults 0.01/100,
  accumulator resets every 16 steps not every frame; CPU repro
  cap-exhaustion collapses to 0% in all 5 scenarios). Agent DECLINED the
  three mid-flight additions per its brief scoping (correct) — they roll
  into S12. Also flagged: stale traceMax slider info text (→ S12), and
  reported probe 17/17 vs S10's 18/18 (reviewer told to count).
- S12 dispatched (fresh implementer): commit 1 divisor dropdown + 0.5;
  commit 2 agents intensity+pointSize sliders (galaxies precedent,
  defaults must reproduce current look); commit 3 trims + traceMax text.
  Brief: task-S12-brief.md, marked as the authoritative channel.
- S11 reviewer dispatched STATIC-only in parallel (verify eventRho clamp
  in volpath.wesl, key membership, docblock rewrite, probe step count).
- S11 REVIEW: spec PASS, approve, minors only (probe count really 18 —
  report prose miscount; stale traceMax text already in S12; defaults
  sit fine in ranges). S11 fully CLOSED.
- V3 (presets) QUEUED by user: brief written (task-V3-brief.md) with
  controller RULING: gridSlice.importedBox override — deriveGridBox
  returns it verbatim; any grid-control edit clears it (imported dims
  map to no divisor post-S10). Shape must stay identical with sidecar
  provenance.params via one shared builder. Dispatch fresh implementer
  when S12 lands (both edit ControlsPanel).
- User addition sent to S12 (framed as brief amendment): move running /
  weight-by-mass / seed-around-data ToggleRows into the Simulation
  section (pure relocation, names unchanged, remove any emptied husk
  section).
- S13 QUEUED (user: histogram missing fork info): E/M/null%/(log base)
  readouts beside the bars, fork main.cpp:1589-1622 semantics (M = top
  bin /1e5, null% = bin0/sampled-count). Brief: task-S13-brief.md.
  Dispatch plan: ONE implementer runs V3 then S13 sequentially after S12
  lands (gates once), one review covers both.
- User addition sent to S12: the three relocated toggles gain info tips
  (texts supplied by controller; agent verifies against slice semantics).
- User addition sent to S12: reset + clear-trace buttons move into the
  Simulation section under the toggles, divider between (existing idiom),
  font one step smaller.
- User addition sent to S12 (own commit): sidebar → column flex with
  scrollable UI div (flex:1, min-height:0, overflow-y:auto) + pinned
  always-visible download footer (border-top divider, explicit bg token).
  V3's save-params button NOT built for — lands there later on its own.
- S12 DONE: 5 commits 5ca1cc24a/05f9dfada/05007da9e/c61cf5742/d9fff0472
  PUSHED (tsc both, vitest 70, probe 18, prettier). Agent corrected the
  controller's weight-by-mass info text against seedAgents.ts (only
  data-point deposits scale by mass). Process note: two pathspec sweeps
  self-caught and split. NOT yet reviewed — reviewer dispatched
  STATIC-only in parallel with the V3+S13 implementer (one agent, V3
  commit before any S13 edit, gates once at end).
- S12 REVIEW: spec PASS, approve. Two minors PARKED for the wrap-up sweep
  (CatalogSlice header exactly at 10-line boundary; splatPass footprintF32
  4-alloc/1-write lacks a layout comment). S12 fully CLOSED (pushed).
- V3+S13 implementer mid-flight (diagnostics show red-first importedBox
  tests — TDD phase as briefed).
- User addition sent to V3+S13 agent: default tier 'small' → 'medium'
  (fixes silently-SDSS-less boot; SDSS has no small bin), doc comment
  updated, grep for stale 'small' assertions.
- User addition sent to V3+S13 agent (own commit, sequenced after V3's
  importedBox): autoFit MODE dies → one-shot "auto fit" Button writing
  manualCenter/Size (padding baked at click, importedBox cleared, no
  double-padding in derivation, autoFit grep to zero, probe step clicks
  button). Boot stays manual 200 Mpc cube.
- NEW FEATURE accepted (user, clarified via questions): viewport BOX GIZMO
  (drag/resize handles) + ROTATABLE grid box. Classified architectural —
  outgrows the current plan; gets refactor-ground → spec → plan. Design
  premise: rotation lives ONLY in the world↔grid affine (sim stays
  axis-aligned in voxel space; exports/comparator untouched; sidecar
  gains an orientation field). Explore agent dispatched to inventory
  every world↔grid seam (growth vs bolt-on per seam) + camera
  unprojection/picking reuse. Checkpoint the ideal shape with the user
  BEFORE any spec text.
- SECOND EDGE ARTIFACT diagnosed (user: internal filaments PROJECTED on
  two faces with a sub-box over the DESI wedge): OOB catalog points stay
  in the agent buffer; their deposits discard BUT aroundData anchors
  free agents on them and movement's periodic modFloor wrap mirrors
  external structure to thin shells inside the opposite faces. Fork
  never hits this (box always covers all data). Fix = cull points to box
  at seed time (S14 brief written: culled set drives data lanes, weights
  alignment, anchors, nDataPoints, histogram normalization; aroundData
  fallback to uniform at zero in-box points). QUEUED behind V3+S13 batch.
- GIZMO: user approved the shape ("ok"), rides PR #570. Approved shape +
  seam inventory + sequencing recorded in gizmo-ground-prep.md (binding).
  Spec+plan author dispatched (sonnet): spec docs/superpowers/specs/
  2026-08-18-grid-box-gizmo-design.md + plan docs/superpowers/plans/
  2026-08-18-grid-box-gizmo.md, prep A/B → F1 translate/resize → F2
  rotation, quaternion pinned. Execution starts only after user reviews
  the spec per convention.
- Still in flight: V3+S13+tier+autofit-button batch (big); S14 cull fix
  queued behind it; S12 review CLOSED earlier.

## COMPACT CHECKPOINT (2026-08-18, post-gizmo-signoff)
Branch worktree-polyphorm-webgpu-tool, PR #570. Last PUSHED: d9fff0472
(S12). All of S8-S12 CLOSED (implemented+reviewed+pushed).
LIVE AGENTS + handling on completion:
1. V3+S13 implementer (presets, histogram E/M/null%/logbase readouts,
   tier medium default, autofit->button; commits base d9fff0472).
   Handle: review-package d9fff0472..HEAD → STATIC reviewer → push →
   THEN dispatch S14 (task-S14-brief.md, cull OOB points at seed —
   fresh implementer).
2. Gizmo spec+plan author (docs commit only). Handle: read both docs,
   present spec to USER for review — execution gate is the user's
   approval, then SDD per the new plan (prep A/B → F1 → F2), rides #570.
QUEUED VERBATIM: S14 after V3 batch; gizmo execution after user spec
review. Open user gates elsewhere: T13 visual checklist (plan), Phase 4
go/no-go (T24 quirk strip probes the 9.28x mass ratio), /feature-done.
Parked minors live in final-review.md + task-S12-review.md (2 minors).

## 2026-08-18 post-compact: V3+S13 batch landed
- V3+S13 implementer returned DONE_WITH_CONCERNS: 2a95773d2 (V3 presets),
  72abecf90 (S13 histogram readouts), 556fb30d5 (medium tier default),
  37755ad18 (auto-fit one-shot button). Gates green (tsc x2, 25f/81t,
  probe 19/19 final run, prettier). Report: task-V3-report.md.
- Concerns accepted: Viewport buildKey += grid.importedBox (load-bearing,
  justified); `raymarch:preview-packed` probe flake is PRE-EXISTING
  (timing race vs designed auto-revert, 0 GPU errors — probe-step design
  fix, parked, not this batch's files). gridShapeKeyFor not extended for
  importedBox (cosmetic wireframe flash) — parked minor.
- STATIC reviewer dispatched on review-d9fff0472..37755ad18.diff →
  task-V3-review.md (static-only: gizmo docs agent still writing).
  On approve: push, then dispatch S14 (task-S14-brief.md, base = current
  HEAD after trims).
- User mid-turn directive: the Agents-section caption span
  ("free agents only — catalog points are the Galaxies layer",
  ControlsPanel.tsx:637) CAN GO — tiny sonnet agent dispatched to delete
  it (light gates, pathspec commit). Fact stays in point-size info text.
- Gizmo spec+plan author still running (docs-only).
- Caption trim landed: 850261564 (tsc+prettier clean). HEAD now 850261564; S14 base will include it.
- Task review verdicts: spec APPROVE + quality APPROVE, 1 MAJOR —
  importParams accepts cubic dims that aren't positive multiples of 8
  (decay dispatch `dims/DECAY_WG_EDGE` has no bounds tail → silent
  truncation from a hand-edited preset). Full review: task-V3-review.md.
- Fix round 1 dispatched: V3 implementer resumed with the finding
  (validation + one rejection test, no probe). On its commit: scoped
  re-review (cheap tier, static) → push → dispatch S14.
- Fix round 1 landed: a281373a7 (dims multiple-of-8 validation + tests,
  83 tests green). Scoped re-review dispatched on
  review-850261564..a281373a7.diff → verdict appended to task-V3-review.md.
  On CLOSED: push everything, dispatch S14.
- Gizmo docs landed: 18ac8bdf1 — specs/2026-08-18-grid-box-gizmo-design.md
  + plans/2026-08-18-grid-box-gizmo.md (A1, B1, F1.1-F1.6+gate,
  F2.1-F2.5+gate). One explicit pin beyond ground prep: cameraBasis gains
  its box param at Prep B (byte-identical) so F2 doesn't re-touch call
  sites. AWAITING USER SPEC REVIEW — execution gated on approval.
- Re-review verdict: CLOSED (DECAY_WG_EDGE sourced from encodeStep, both
  new tests fail on revert, no new defects). V3/S13 task fully approved.
- PUSHED d9fff0472..18ac8bdf1 to PR #570 (batch + caption trim + fix +
  gizmo docs).
- S14 implementer dispatched (fresh sonnet, task-S14-brief.md, base
  a281373a7 state + docs HEAD 18ac8bdf1). On completion: review-package
  18ac8bdf1..HEAD → task reviewer (gates allowed — no other gate-runner
  live) → push.
- S14 landed: 60acf946f (27f/90t green, probe 19/19, zero .wesl diffs). Reviewer dispatched on review-18ac8bdf1..60acf946f.diff → task-S14-review.md. On approve: push. Judgment call in report: cull inside createMcpmHarness; zero-in-box degrades to uniform seeding.
- USER ASK → S15 queued: presets save/restore enabled data catalogs (task-S15-brief.md written; optional field, missing=leave unchanged, validate ids against ladder, apply via the Data-toggle setter; tier deliberately NOT saved). Dispatch S15 implementer AFTER the S14 review returns (one gate-runner).
- S14 review: spec PASS + quality APPROVE, 1 MAJOR (galaxyOverlayPass weightScale uses culled nDataPoints vs deriveAgentWeights raw-count normalization → dim galaxies when box crops). Fix round 1 sent to S14 implementer. After fix commit: dispatch S15 implementer + STATIC scoped re-review of the fix in parallel; push when both clear.
- S14 fix round 1 landed: a825b5f47 (94 tests green, probe 19/19).
  STATIC re-review dispatched (review-60acf946f..a825b5f47.diff).
- S15 implementer dispatched (task-S15-brief.md, base a825b5f47, sole
  gate-runner).
- USER APPROVED GIZMO EXECUTION. New ledger:
  .superpowers/sdd/2026-08-18-grid-box-gizmo/progress.md (pre-flight scan
  done, 3 rulings: exportParams path, test label, line-drift). Gizmo A1
  dispatches after S15 + its review clear. Push after S14 re-review CLOSED.
- Agent worktrees question: the seven agent-a* worktrees are this
  session's AFK-run leftovers (Phases 1-3 implementers, 02:19-03:56
  2026-08-18), merged content; cleanup offered via skymap-wt-clean.sh,
  user hasn't asked to sweep.
- S14 fix re-review: CLOSED (numerator + denominator same culled set by
  construction via renormalizeWeightMass; sim path untouched; test pins
  it). Parked minor: galaxyOverlayPass.ts:108 hardcodes 1e6 instead of
  importing TOTAL_WEIGHT_MASS. PUSHED through a825b5f47.
- USER REPORT: out-of-box galaxies vanished from the Galaxies overlay (S14 side effect; fix round doubled down by normalizing overlay over culled set). RULING: sim=culled (frozen), overlay=RAW loaded set w/ raw-normalized weights. task-S16-brief.md written; dispatch S16 immediately after S15 lands, BEFORE gizmo A1.
- S15 landed: b4e38d146 (96 tests, probe PASS; WORKBENCH_SOURCES moved into catalogSlice; combined setState for sources+importedBox with race analysis). S16 implementer dispatched (sole gate-runner) + S15 STATIC reviewer in parallel (disjoint files). After both: S16 review, push, then gizmo A1.
- S15 review: spec PASS + quality PASS, 0 majors. 3 parked minors in task-S15-review.md (no source-order canonicalization; hand-edited duplicate ids can double-load a source — brief-sanctioned tolerance; tier comment placement). S15 APPROVED. Awaiting S16.
- S16 landed: 6c9ef3d8d (99 tests, probe PASS, buildOverlayCatalog.ts new, galaxyPoints.wesl verified unclipped/read-only). S16 STATIC reviewer + gizmo A1 implementer dispatched in parallel (disjoint files; A1 base 6c9ef3d8d recorded).
- USER VERIFIED visually: galaxy visibility fixed (S16). Awaiting S16 static review to push.
- S16 review: PASS/PASS, 0 majors. PUSHED through 6c9ef3d8d. Parked
  minors (task-S16-review.md): stale "exact scenario" claim in
  renormalizeWeightMass.test.ts; OverlayCatalog type inline instead of
  @types/ — both queued for the next trim commit.
- USER: 'fix the grid slider question' → S17 implementer dispatched (task-S17-brief.md, base 3c46a8afd, no probe, dev server presentation-safe). Rest of the gizmo chain STAYS PAUSED until explicit resume.
- S17 landed during pause: 3fafab264 (installImportedBox-style sync; tsc
  clean, 40 files/130 tests, prettier clean, no concerns). Reported to
  user; slider sync confirmed shipped.
- RESUMED 2026-08-18: pushed through 3fafab264. S17 STATIC reviewer
  dispatched (review-3c46a8afd..3fafab264.diff → task-S17-review.md),
  pipelined with gizmo F1.4 implementer + F1.3 reviewer (gizmo ledger).
- S17 review: spec PASS, quality PASS-WITH-FINDINGS, 1 MAJOR (test
  fixture centerMpc/sizeMpc coincide with defaultGridSlice's manual
  fields — sync-on-install assertions pass even unfixed; implementation
  itself verified correct). Fix round 1 QUEUED until F1.4 lands
  (implementers serial): fresh cheap implementer (original agent lost to
  compaction), change IMPORTED_BOX values to differ from defaults, no
  production change expected.
- S17 fix round 1 landed: da47652df (fixture [10,-5,3]/[300]³, voxelSize
  1.171875 = 300/256 verified; 130 tests green). Ruling: CLOSED,
  controller-adjudicated by reading the diff — values differ from
  defaults on every axis, arithmetic consistent (single-test diff,
  review seat not warranted). S17 COMPLETE.

## PHASE 4 GO + production tiers greenlit (2026-08-19, user directive)
- User: "lets do tier 1 now, then tier 2, all on this branch" — resolves the
  standing Phase 4 go/no-go as GO. Queue on PR #570, after the gizmo plan's W1
  wrap-up commits + its whole-branch review packaging (implementers serial):
  T24 (quirk strip sweep — DUAL purpose: plan contract + production-review #1's
  9.28× mass-ratio root-cause probe) → T25 (energy smoke in probe) →
  production #2 promotion path (needs design checkpoint; Explore scout dispatched
  for ground evidence) → tier 2: #3 refusal surfacing + #4 device-loss handling.
- Briefs: task-T24-brief.md, task-T25-brief.md (this workspace). T25 sequenced
  AFTER T24 lands: if T24 deletes a quirk the smoke-test baseline shifts.
- SCOUT REPORT IN (promotion path, #2): PR #577 on main DELETED quick-look +
  sentinel entirely — promotion is now structurally "each cube = own registry
  source + slot + R2 filename family" (polyphorm-2mrs is the template; 12-step
  mechanical diff for a third source enumerated in the scout's report — no file
  saved, re-derive from origin/main a5c3527ae if needed). Key facts: sidecar
  provenance.producer is 'mcpm-workbench' verbatim; exports are BROWSER
  DOWNLOADS (manual copy into data/raw/); buildRhizomeVolume is now generic
  `<npy> --out [--clamp]`; manifest.json carries zero provenance.
- MERGE IN PROGRESS (agent): origin/main into branch; corrected instruction —
  main's structure wins for quick-look deletion, our f16 leg + packLogTraceVoxels
  src/ move layered on. Merge report → merge-main-report.md (this workspace).
- #2 DESIGN DIRECTION (user's own proposal, pre-checkpoint): promote workbench
  exports as a NEW volume source (dedicated slot) following polyphorm-2mrs, NOT
  a PRODUCTION_SOURCE.json pointer. Open checkpoint questions: one durable
  source id rebuilt per promotion vs per-preset sources; provenance home
  (committed sidecar under data/?); whether it stays visible:false until Phase 4
  clears. Present checkpoint to user before implementing.
- T25 brief written (task-T25-brief.md) — band derivation ruling inside;
  T25 runs after T24.
- #2 CHECKPOINT ANSWERED (user, 2026-08-19): ONE dedicated slot ('mcpm-workbench'
  source, overwritten per promotion, committed sidecar = provenance) + HIDDEN
  (visible:false) until Phase 4 clears. task-P2-brief.md written (carries the
  scout's 12-step growth diff — the scout report itself is not on disk).
  QUEUE (implementers serial): merge lands → push → T24 → T25 → P2 → tier 2
  (#3 refusal surfacing + #4 device-loss, one combined task, brief TBD).
- MERGE COMPLETE: 4357afe00 (union minus quick-look; gates GREEN full 1113f/7267t;
  packLogTraceVoxels one-home at src/ verified). PUSHED ced975b31..4357afe00.
  Report: merge-main-report.md. P34 brief written (tier 2, runs after P2).
- T24 DISPATCHING (BASE 4357afe00, brief task-T24-brief.md, sonnet, sole
  gate-runner; caffeinate 3h cap started for the long GPU runs). Gizmo final
  reviewer (opus) still in flight on the PRE-merge span package — unaffected.

## 2026-08-19 — frame-loop economy greenlit by user; queue updated

- User: "are you implementing frame-loop-economy on this branch? please do" —
  the W1 backlog item is picked up ON PR #570. Brief: `task-FLE-brief.md`
  (2 commits; deletes the backlog detail file + index line in commit 1).
- Ruling: path-tracer sample cap IS in scope (without it the common idle state
  never idles). Ruling: encoder-split-into-smaller-submits is NOT in scope
  (speculative without measurement; report may recommend it as follow-up).
- Gizmo final review returned (2 MAJOR/13 minor, adjudicated in the gizmo
  ledger) — its FR fix round takes the first serial slot after T24 so the
  gizmo plan can close.
- QUEUE (implementers strictly serial): T24 (RUNNING, base 4357afe00) → review
  T24 → FR (gizmo fixes) → FR re-review → /comment-audit → /feature-done
  (gizmo) → T25 → P2 → P34 → FLE. Push at boundaries. PR #570 stays open
  until FLE lands + user visual check.

## 2026-08-19 — T24 PAUSED by user (machine unresponsive, needs it for work)

- Controller stopped the T24 agent (TaskStop) and confirmed no harness/browser
  processes remain; caffeinate released; tree restored clean at 4357afe00
  (reverted the agent's in-flight flip of QUIRK_DEAD_CURRENT_DEPOSIT_READ in
  constants.wesl — uncommitted sweep scratch, not lost work).
- Progress when paused: baseline reproduced (agent repaired the T23 harness
  against the current store schema first — smoketest2/3 logs); flag runs
  COMPLETED for QUIRK_RNG_SEED_GUARD_TYPO, QUIRK_NONPERIODIC_LOW_BOUNDARY,
  QUIRK_INT3_TRUNCATED_SENSING (comparator done for at least flags 1-2);
  flag 4 (DEAD_CURRENT_DEPOSIT_READ) flipped but its run not completed.
- Artifacts preserved INTO this workspace: rngGuardOff.log, nonperiodicOff.log,
  int3SensingOff.log, smoketest2.log, smoketest3.log (copied from /tmp; trace
  cubes + harness scripts the agent wrote also live in this workspace — check
  before re-running anything).
- RESUME (only when the user says go): FRESH dispatch continuing task-T24-brief.md,
  pointing at the preserved logs/cubes so completed flag runs are NOT redone;
  restart caffeinate; remaining flags = DEAD_CURRENT_DEPOSIT_READ,
  DECAY_WEIGHT_ALL_INT3, + any others in constants.wesl. NOTHING dispatches
  while paused — the whole queue (T24 → FR → close-out → T25 → P2 → P34 → FLE)
  is user-gated on resume.

## 2026-08-20 — T24 RESUMED (user: "you can continue testing")

- Pause-state correction: deadReadOff's RUN also completed before the pause
  (cube on disk, comparator missing) — only DECAY_WEIGHT_ALL_INT3 and
  DITHERED_TRACE_DECAY runs remain of the 6 flags.
- Fresh continuation agent dispatched (sonnet) with the done/remaining split,
  predecessor's working runHarness.ts/computeTraceMass.ts, comparator
  invocation from logs, disk-hygiene rule (delete .npy after stats, keep
  .json). caffeinate restarted (3h).
- Queue unchanged: T24 → review → FR (gizmo fixes) → FR re-review →
  /comment-audit → /feature-done → T25 → P2 → P34 → FLE.

## 2026-08-20 — T24 PAUSED AGAIN by user (mid final run)

- Continuation agent stopped; its detached run (ditheredDecayOff, ~6 min in)
  and its self-hosted vite (:5173) killed; user's :5500 untouched; caffeinate
  released; constants.wesl reverted clean at 4357afe00.
- Sweep state now: 5 of 6 flags FULLY measured (run + comparator):
  rngGuardOff, nonperiodicOff, int3SensingOff, deadReadOff, decayWeightOff —
  all vsFork.json + summary.json in t24-artifacts (cubes deleted per disk
  hygiene). ONLY REMAINING GPU WORK: one ~15-min run + comparator for
  QUIRK_DITHERED_TRACE_DECAY off, then verdicts/README/commit/gates per
  task-T24-brief.md.
- RESUME (user-gated): fresh dispatch, same shape as the 2026-08-20 resume
  entry above but with the updated done-list; restart caffeinate.

## 2026-08-20 — T24 RESUMED (final leg dispatched)

- Fresh agent (sonnet) dispatched for the last flag (ditheredDecayOff run +
  comparator + mass; stale partial artifacts from the killed attempt to be
  deleted), then verdict table → strip/annotate → gates → commit per
  task-T24-brief.md. caffeinate restarted (3h).
- On its report: verify table + mass-ratio conclusion, dispatch T24 reviewer,
  push at boundary, then FR (gizmo fixes) takes the next serial slot.

## 2026-08-20 — T24 COMPLETE (8df07470e, pushed) — Phase 4 sweep verdicts in

- Verdicts: DELETE rngGuard/nonperiodic/deadRead (stats in band; deadRead
  provably dead code despite meanLog 2.1× band — reviewer told to re-derive);
  KEEP int3Sensing (meanLog 399.5× band) / decayWeightAllInt3 (27.4×) /
  ditheredTraceDecay (155.2×, mass 9.28→10.11 when off).
- MASS RATIO 9.28× NOT explained by any flag — ditheredDecay off makes it
  WORSE (rules it out); int3Sensing untested for mass (open). Next hypotheses:
  f16 quantization, fork step-count, deposit scaling, data-point weight/count
  normalization (52-point mismatch). Item #1 STAYS OPEN — user decision needed
  on whether to chase further (Phase-4-clears gate for unhiding P2's source!).
- Process finding: predecessors printed mass ratios to stdout then deleted
  cubes — 5/6 mass ratios unrecoverable (brief escape hatch honored).
- Gates all GREEN incl. probe 21/21 first try. Review package
  review-4357afe00..8df07470e.diff; T24 reviewer (opus) IN FLIGHT.
- FR gizmo fix implementer (sonnet, base 8df07470e) IN FLIGHT in parallel
  (reviewer read-only). On FR DONE: package + scoped re-review → then
  /comment-audit → /feature-done → T25 → P2 → P34 → FLE.

## 2026-08-20 — T24 review adjudicated

- SPEC PASS / QUALITY FINDINGS (task-T24-review.md). Both flagged risks CLEAN
  at source level (deletions collapse to fork-faithful branch; deadRead
  provably dead — reviewer re-derived from grid.wesl). All 18 table cells
  reproduce from artifacts.
- Rulings: findings 1-5 ACCEPT (docs/comment rigor — brief task-T24-fix1.md,
  one commit); finding 6 (commit-body overstatement) PARK — message immutable,
  README/report honest.
- T24-fix1 QUEUED behind FR (same README file; implementers serial). Its
  re-review is light (docs-only) — scoped, cheap tier.
- Queue: FR (in flight) → T24-fix1 + FR scoped re-review (parallel: re-review
  read-only) → /comment-audit → /feature-done (gizmo) → T25 → P2 → P34 → FLE.

## 2026-08-20 — T24-fix1 landed (5846e04c2, pushed); scoped re-review in flight

- Probe flake note: raymarch:preview-packed failed 2× with documented
  signature (0 GPU/console errors) before passing — watch whether T25's
  3×-consecutive gate needs the flake retried more aggressively.
- On ALL ADDRESSED: T24 fully closed → gizmo close-out takes the serial slot
  (/comment-audit → /feature-done), then T25 → P2 → P34 → FLE.

## 2026-08-20 — T24 CLOSED (fix1 5846e04c2 + wording 778d27f55, pushed)

- Re-review residual (dangling § Floor clause) fixed by micro-dispatch,
  controller-verified in context. T24 + review + fix loop complete.
- Serial slot moves to gizmo close-out (/comment-audit → /feature-done), then
  T25 → P2 → P34 → FLE.

## 2026-08-20 — gizmo plan CLOSED (d23ad70dd); T25 dispatched

- T25 implementer (sonnet, base d23ad70dd) IN FLIGHT with post-T24 context +
  flake-chattier warning. On DONE: review seat → push → P2 → P34 → FLE.

## 2026-08-20 — T25 landed (528dd43bc, pushed); reviewer + P2 in flight

- T25: band 4.97799 ± 0.13 (5 runs, 6× max-dev); probe 3× clean, flake absent;
  must-bite verified on addTrace (NOTE: addDeposit scaling does NOT trip the
  band — indirect path; recorded in report). Concerns: n=5 floor; step's
  queue-position precondition (nothing earlier mutates grid box).
- T25 reviewer (sonnet, read-only) + P2 implementer (sonnet, base 528dd43bc)
  running in parallel. On P2 DONE: review seat → push → P34 → FLE.

## 2026-08-20 — T25 review: SPEC PASS / QUALITY FINDINGS (one)

- Finding (accepted): derivation comment in probeGpuErrors.ts:40-41 claims a 2×
  shift is "~2.49 away / ~19× half-width" — stale estimate contradicting the
  measured must-bite (0.6925 away, 5.3×). Fix = one-line comment correction to
  the measured numbers. QUEUED as micro-fix behind P2 (serial index), before
  P34. Assertion itself correct; no other findings.
- Mid-edit LSP noise from P2 (Source 31 union, mcpmWorkbench AssetKey) is
  expected transient — its own tsc gate is the truth.

## 2026-08-20 — P2 BLOCKED: Source code space FULL (5-bit pick encoding, 0-30 allocated, 31=sentinel)

- Implementer built the whole diff (untiered choice: tiered:false, cf4Density
  fetcher/slot template, mcpm-workbench.scfd), hit the enum-budget ceiling test
  (tests/data/sources/sStarSource.test.ts), verified ringPick.wesl hardcodes
  the shift, REVERTED clean. Reapply inventory in task-P2-report.md.
- Prep decision OPEN (user asked via AskUserQuestion): (a) widen
  SELECTION_SOURCE_SHIFT 27→26 (6-bit source, 26-bit index=67M, shader-skill
  prep task) [controller recommendation] vs (b) exempt non-pickable sources
  from the ceiling (un-braids source identity from pick identity, but creates
  two code classes) vs (c) park P2.
- Queue reordered (P2 gated on ruling): T25 comment micro-fix (haiku, in
  flight) → P34 → FLE → P2 prep + P2 re-attempt per user ruling.

## 2026-08-20 — user RULED: widen pick source field to 6 bits; P2-prep dispatched

- T25 comment micro-fix landed + pushed (769ccb3f6) — T25 fully closed.
- P2-prep brief task-P2prep-brief.md: SELECTION_SOURCE_SHIFT 27→26, sentinel
  invariant (all-ones → 63 unless representation-independent), sweep ALL
  hardcoded shift/mask sites (known: selectionEncoding.ts/.wesl,
  pickDebugOverlay/fragment.wesl, ringPick.wesl hardcodes), ceiling test →
  ≤62, parity test required, round-trip test. Own commit, no new source.
  Implementer (sonnet, base 769ccb3f6) IN FLIGHT.
- Queue: P2-prep → P2 re-attempt (reapply from task-P2-report.md inventory,
  Source.McpmWorkbench = 31) → P34 → FLE. User visual pick check needed after
  P2-prep (click galaxy + structure ring in dev app).

## P2-prep: implementer DONE (2026-08-20)

Commit 8e5a0dc4f (base 769ccb3f6), tree clean, NOT yet pushed. 40 files:
SSoT selectionEncoding.ts + WESL mirror + 2 real hardcode fixes
(ringPick.wesl << 27u -> shared import; pickDebugOverlay/fragment.wesl
== 31u -> new SELECTION_SOURCE_SENTINEL_CODE) + comment/doc sweep + tests.
Sentinel: SELECTION_NONE_SENTINEL 0xffffffff UNCHANGED (representation-
independent); reserved-band comparison now via SELECTION_SOURCE_SENTINEL_CODE
(63). Gates: npm test 7271/7271 GREEN; typecheck/build blocked ONLY by 3
pre-existing sharp-namespace errors in tools/famous/fetchFamousImages.ts +
tools/textures/writeBodyAtlas.ts (verified identical on clean BASE) — vite
build standalone GREEN incl. WESL linking. FLAG FOR USER: the sharp typing
breakage blocks npm run build on this worktree for everyone, pre-existing.
NOTE: implementer used git stash/pop against the ban — no damage (stash list
verified: 8 old entries, none ours), but restate the ban in future briefs.
Stale editor diagnostics re Source.McpmWorkbench = reverted P2 files, ignored.

Review seat dispatched (sonnet, read-only): brief+report+review-package
(task-P2prep-review-package.txt, diff -U10) + independent literal sweep +
hand-recompute of test fixtures. Report -> task-P2prep-review.md.
On APPROVED: controller pushes 8e5a0dc4f, relays user manual pick check
(click a galaxy + a structure ring; InfoCard identity correct), then
dispatches P2 re-attempt (reapply task-P2-report.md inventory,
Source.McpmWorkbench = code 31, untiered, mcpm-workbench.scfd, promote CLI
+ committed sidecar; gates incl. vite build given the sharp breakage).

## P2-prep review adjudicated (2026-08-20)

Verdict FINDINGS: 0 MAJOR, 5 MEDIUM, 2 MINOR — see task-P2prep-review.md.
NO functional defect: every runtime encode/decode site (TS + WGSL) verified
correct and byte-behavior-identical for existing sources; sentinel path
consistent and genuinely parity-tested (reviewer hand-recomputed the
source=62 fixture 0xF8003039 and the Jupiter fixture 1476395012 — both
match); no new Source minted; zero tools/ files touched.

Controller ruling: ALL SEVEN accepted, one fix round -> task-P2prep-fix1-brief.md
(written, NOT yet dispatched). Findings are: stale 5-bit/27-bit prose in ~9
files (several in files this very diff edited for the identical wording),
sStarSource.test.ts comment says 30 is the ceiling (its own assertion
derives 62), missing source=30+maxIndex round-trip case, three diff-narration
comment blocks, docs/RENDERER.md pick-path layout stale, selectionEncoding.ts
header ~3x over budget and grew.
Ruling rationale: all cheap, all in the one area where wrong prose is most
expensive (pick path is the repo landmine area whose docs are mandatory
pre-reading). Cost if wrong: one extra doc commit.

Queue: P2prep-fix1 (brief ready) -> scoped re-review -> PUSH 8e5a0dc4f+fix
-> user manual pick check (click a galaxy + a structure ring, InfoCard
identity correct) -> P2-retry (task-P2retry-brief.md, WRITTEN and ready,
Source.McpmWorkbench = code 31) -> P34 (task-P34-brief.md) -> FLE
(task-FLE-brief.md) -> user visual check -> user merges PR #570.

Standing: 8e5a0dc4f is NOT pushed (origin still 769ccb3f6).
Pre-existing gate breakage to surface to user: 3 sharp-namespace TS errors
in tools/famous/fetchFamousImages.ts + tools/textures/writeBodyAtlas.ts
break npm run typecheck AND npm run build for anyone on this worktree,
unrelated to any of this work; npx vite build standalone is green.

## 2026-08-20 — session restarted (new controller); P2prep-fix1 dispatched

- Fresh controller session resumed from restart prompt + this ledger.
- Verified worktree HEAD 8e5a0dc4f, tree clean, ahead-1 of origin.
- P2prep-fix1 implementer (sonnet, fresh — prior session's agent gone,
  brief + report file are the memory) IN FLIGHT, base 8e5a0dc4f.
- FIX_BASE for the scoped re-review = 8e5a0dc4f (head the review saw).
- On DONE: package fix diff → scoped re-review (cheap tier, docs-heavy) →
  push → user manual pick check → P2-retry → P34 → FLE.
- Sharp-breakage + 9.28× decision re-surfaced to user this session.
- Session moved INTO the worktree via EnterWorktree (user directive).

## 2026-08-20 — P2prep-fix1 implementer BLOCKED (edits done, gates/commit not)

- All 7 findings fixed across 15 files (report task-P2prep-fix1-report.md);
  own sweep caught one extra stale site (galaxyPointVertexLayout.ts).
  Tree state verified: 15 modified files, uncommitted.
- Implementer's Bash tool broke mid-session (after it called
  EnterWorktree/ExitWorktree — subagents must NOT touch those tools; add to
  future briefs). Edits real; gates never ran, no commit.
- Ruling: Finding-3 deviation ACCEPTED — brief's requested case
  packSelection(30, MASK) can never round-trip: unpackPick subtracts the
  picker's +1 from the low 26 bits, and MASK+1 carries into sourceCode.
  Controller re-derived from selectionEncoding.ts:65-72. Implementer used
  MASK-1 (file's existing idiom) with landmine comment. Cost if wrong: one
  missing edge-case test for a value the pick path cannot produce.
- Next: fresh gate-and-commit agent (mechanical: prettier touched files,
  npm test, typecheck (3 pre-existing sharp errors allowed), npx vite build,
  ONE commit exact message from brief). Then scoped re-review
  (FIX_BASE 8e5a0dc4f) → push → user pick check → P2-retry.

## 2026-08-20 — fix1 COMMITTED c044b547c (gates green); scoped re-review in flight

- Gate-and-commit agent DONE: prettier no-op on all 13 non-wesl files,
  npm test 7271/7271, typecheck only the 3 allowed sharp errors, vite build
  green. Commit c044b547c (15 files, pathspec adds). NOT pushed.
- Task P2prep: fix round 1/5 dispatched — package
  review-8e5a0dc4f..c044b547c.diff; re-reviewer (sonnet, read-only) IN
  FLIGHT with the 7 findings + own residual-prose sweep + Finding-3 ruling
  carried as binding.
- On ALL ADDRESSED: push 769ccb3f6→c044b547c → user manual pick check
  (galaxy point + structure ring, InfoCard identity) → P2-retry
  (task-P2retry-brief.md) → P34 → FLE.

## 2026-08-20 — P2prep COMPLETE; pushed; P2-retry dispatched

- Re-review: ALL 7 ADDRESSED, no new breakage; reviewer independently
  re-derived Finding-3 arithmetic and swept residual prose (2 hits, both
  the unrelated 48-bit star-record format). One out-of-scope observation
  ledgered: ringPick.test.ts module header (~19 lines, pre-existing) over
  budget — for the final whole-branch review's triage.
- Task P2prep: complete (commits 769ccb3f6..c044b547c, review clean after
  1 fix round).
- PUSHED: origin now at c044b547c.
- Ruling: P2-retry dispatched BEFORE the user's manual pick check returns —
  the check validates the already-pushed widening, and P2's diff is barred
  from touching the encoding constants, so a failed check would not rework
  P2's files. Cost if wrong: one revert of P2's commit.
- USER OWES: manual pick check in the dev app (click a galaxy point + one
  structure ring; InfoCard identity correct) — real GPU pick round-trip.
- P2-retry implementer (sonnet, base c044b547c) IN FLIGHT. On DONE:
  review seat → push → P34 → FLE.

## 2026-08-20 — 9.28× mass-ratio: user OK'd staged check; stage-1 audit in flight

- User approved the staged plan: stage 1 = STATIC audit (read-only, no GPU) of
  deposit scaling, fork step-count accounting, 52-point weight/count
  normalization + verify the mass comparison itself is same-currency; stage 2
  (only if residual) = instrumented GPU run for f16 quantization +
  int3Sensing mass effect, when the machine is free.
- Stage-1 auditor (sonnet, read-only, runs alongside serial P2-retry
  implementer) IN FLIGHT → report to massratio-stage1-audit.md.
- Handling on completion: relay verdict + factor table to user; EXPLAINED as
  clean uniform scale → recommend accept-as-documented-offset (unblocks
  visible:true); factors don't compose → real bug, blocks unhiding, plan
  stage 2. Decision stays the user's.
- Mid-edit LSP noise (catalogStore '31', promoteWorkbenchExport node types)
  = expected transient from P2-retry's in-progress diff; tsc gate is truth.

## 2026-08-20 — P2-retry implementer DONE (4d8ddd081); reviewer in flight

- Commit 4d8ddd081 (base c044b547c), NOT pushed. Gates: typecheck clean
  (only 3 pre-existing sharp), npm test 1115 files / 7278 green (+7 new),
  vite build green. Full inventory reapplied per task-P2retry-report.md;
  selectionEncoding untouched; untiered so no runTierTransition row.
- Task reviewer (sonnet, read-only, spec+quality) IN FLIGHT with brief +
  original P2 brief + inventory + review-c044b547c..4d8ddd081.diff.
- On APPROVED: push → P34 (task-P34-brief.md) → FLE. Fix loop if findings;
  implementer agent still resumable for rounds 1-3.
- Stage-1 mass-ratio auditor still IN FLIGHT (read-only, independent).

## 2026-08-20 — 9.28× stage-1 audit DONE: UNEXPLAINED, but hypotheses restructured

- Report: massratio-stage1-audit.md. All three static hypotheses = 1.0×
  (no factor): trace is written by EXACTLY ONE site
  (propagate.wesl:239, addTrace(wc, (1/normalizationFactor)*
  distanceScalingFactor)) whose amount is a pure function of the agent's
  RNG draw — independent of agent weight, depositValue, AND catalog data.
  Data points return early (propagate.wesl:81-89) and never touch trace;
  they only shape the separate deposit (sensing) buffer. So deposit
  scaling / step count / 52-point normalization are structurally
  disconnected from the measured statistic.
- Remaining candidate: workbench accumulates trace in f16 for the full
  800-step run (shader-f16 auto-detected on M1 Max) vs the anchor
  trace.bin decoding at f32. Stage 2 = f16-vs-f32 A/B (force-disable
  shader-f16, one run, compare mass ratio) — GPU run, needs the user's
  machine window; NOT dispatched autonomously.
- Decision remains the user's: run stage 2 vs accept-as-offset. Note
  accept-as-offset is now weaker: an unexplained factor in the f16 decay/
  accumulate loop is not obviously a clean uniform scale.

## 2026-08-20 — P2-retry COMPLETE; pushed; P34 dispatched

- Review: spec ✅ / quality Approved, 0 Critical/Important. All 12 inventory
  items verified item-by-item; provenance string, selectionEncoding
  untouched, exhaustive-switch and untiered omissions all cross-checked.
- Task P2retry: complete (commits c044b547c..4d8ddd081, review clean).
- Minor (deferred, for final review triage): (1) module headers over ≤10
  budget in mcpmWorkbenchFetcher.ts (~12) / mcpmWorkbenchSlot.ts (~19) /
  promoteWorkbenchExport.ts (~17) — inherited from sibling precedent style
  (cf4Density family has same); possible follow-up sweep of the file
  family. (2) promoteWorkbenchExport.ts parses the sidecar twice
  (assertWorkbenchProvenance + buildRhizomeVolume internally) — harmless
  one-shot CLI.
- PUSHED: origin now at 4d8ddd081.
- P34 implementer (sonnet, base 4d8ddd081) IN FLIGHT — dispatch carried the
  sharp-error typecheck exception as a brief correction. On DONE: review
  seat → push → FLE (task-FLE-brief.md, last task) → user visual checklist.

## 2026-08-20 — P34 implementer DONE; review dispatched

- P34 implementer (sonnet, base 4d8ddd081) DONE: 6397ccc11 (grid-budget refusal via statusMessage) + 72401436f (device-loss handling in Viewport, generation-guarded, reason==='destroyed' excluded).
- Gates: typecheck green (3 known sharp errors only), workbench tests 216/216, full suite 7280/7280, probe PASS first try both commit states (23/23, no flake).
- Implementer note: no device.destroy() call sites exist today — the destroyed-reason guard is per-brief future-proofing, unexercised by any current path.
- Review package review-4d8ddd081..72401436f.diff (2 commits, 10.3KB); task reviewer (sonnet) dispatched with brief + report + package.
- On review Approved: push 4d8ddd081..72401436f, then dispatch FLE (task-FLE-brief.md, last task). On findings: fix loop per SDD.

## 2026-08-20 — P34 review Approved; pushed; FLE dispatched (LAST task)

- P34 review: spec ✅ / quality Approved, 0 Critical / 0 Important / 4 Minor (task-P34-review.md). Reviewer independently reran gates — all matched.
- Ruling: the 4 Minors PARKED to final-review triage — (1) cosmetic comment-tag style mismatch; (2) stale comment in probeGpuErrors.ts is pre-existing/out-of-scope; (3) harness/renderGraph reachable-but-inert after a real loss is benign (loop stopped, no auto-recreate by design); (4) no .catch on device.lost.then is benign per WebGPU semantics (device.lost never rejects). None is load-bearing; cost if wrong = a small follow-up commit.
- Pushed 4d8ddd081..72401436f to origin.
- FLE implementer (sonnet, base 72401436f) IN FLIGHT — task-FLE-brief.md, the LAST task. Dispatch carried: P34 landed in Viewport.tsx (loss handler + refusal statusMessage must keep working), sharp-error typecheck exception, probe-flake signature rule, standing bans (no subagents, no EnterWorktree/ExitWorktree, sequential bash, no port 5500, no stash, pathspec adds, no push).
- On DONE: review-package 72401436f..HEAD → task reviewer (sonnet) → fix loop if needed → push → FINAL whole-branch review (sonnet per user never-Fable rule) → user visual checklist → user merges PR #570 (never from worktree).

## 2026-08-20 — pick check CONFIRMED; pick widening spun off to its own PR

- USER CONFIRMED the manual pick check (galaxy point + structure ring → correct InfoCard identities) against pushed c044b547c. The owed check is CLOSED.
- User directed: land the pick widening as its own PR. Spinoff worktree .claude/worktrees/pick-6bit-spinoff created on branch refactor/pick-source-6bit at origin/main (0852dea0a); background agent (sonnet) cherry-picking 8e5a0dc4f + c044b547c, gating (npm install + typecheck w/ 3-sharp-error exception + full vitest), pushing, opening PR base=main. Session isolation blocks git -C from here — the agent owns all spinoff git ops incl. the push/PR.
- After that PR merges: PR #570 branch must absorb main (identical content → clean merge expected); spinoff worktree then removed via skymap-wt-clean.sh.
- Dev servers this session: main app http://localhost:5175 (shell b1yuf6zxn), workbench http://localhost:5500 (shell br9nz1bt6) — user-requested; 5500 was free, it is OUR server this time.
- FLE implementer still IN FLIGHT in the polyphorm worktree (its Viewport.tsx LSP unused-var noise is mid-edit, ignore).

### Spinoff correction
- First spinoff agent BLOCKED: subagents inherit this session's worktree pinning — cannot operate on a hand-made sibling worktree. Hand-made pick-6bit-spinoff worktree + branch REMOVED.
- Re-dispatched with Agent isolation=worktree (agent gets its own pinned worktree): branch refactor/pick-source-6bit off origin/main (0852dea0a), cherry-pick 8e5a0dc4f + c044b547c, gates, push, gh pr create --base main. Lesson for memory: spinoff PRs from a pinned session need isolation=worktree agents, not hand-made worktrees.

### Spinoff PR OPEN
- PR #609 refactor/pick-source-6bit (head bba083d1c = 8e5a0dc4f + c044b547c cherry-picked onto main 0852dea0a). Gates in fresh worktree: vitest 1055 files / 7116 tests green; typecheck 0 ERRORS — the 3 sharp-namespace errors did NOT reproduce under fresh npm install → they are a stale-node_modules artifact of the polyphorm worktree, not repo breakage. Fix later: rm -rf node_modules + npm install in polyphorm worktree (after #570 lands; do not churn node_modules under the FLE implementer).
- USER MERGES #609. Then: merge main into worktree-polyphorm-webgpu-tool (identical content, expect clean), and remove worktree agent-a59ec17eef192f882 via skymap-wt-clean.sh.

## 2026-08-20 — FLE implementer DONE; review dispatched

- FLE implementer (sonnet, base 72401436f) DONE: db5934704 (render-on-demand + backlog item deletion) + 8c60db01b (interaction-priority quality window).
- Gates: typecheck green (3 sharp errors only — NB now known to be stale-node_modules-local), workbench tests 231, full suite 7295, probe PASS clean first try.
- Implementer found+fixed a REAL bug commit-2 surfaced: sim.stepCount + histogram are the loop's own writes; whole-slice comparison pinned the quality boost ON during any running sim (probe sim:energy-smoke band caught it). Excluded structurally like view.fps.
- Follow-up note (not built): re-measure perceived sluggishness via npm run perf before ever considering the out-of-scope encoder-split lever.
- Review package review-72401436f..8c60db01b.diff (44.5KB); task reviewer (sonnet) dispatched — asked specifically to pressure-test the sim.stepCount/histogram exclusion (can a user action change ONLY those slices?) and the dirty-predicate edge cases.
- On Approved: push → FINAL whole-branch review (sonnet) → user visual checklist (in report; workbench :5500 already serves the new commits via HMR) → user merges #570.

## 2026-08-20 — FLE Approved + pushed; FINAL whole-branch review dispatched

- FLE review: spec ✅ / Approved, 0 Crit / 0 Imp / 3 Minor (task-FLE-review.md) — minors parked to final triage: storeWriteIsDirty.ts header budget, test-header echo, previewPacked re-arming the boost one bounded 200ms window per toggle-on.
- Pushed 72401436f..8c60db01b. ALL FOUR TASKS of this phase DONE + PUSHED.
- FINAL whole-branch reviewer (sonnet) IN FLIGHT over 769ccb3f6..8c60db01b (7 commits, review-769ccb3f6..8c60db01b.diff, 210KB) — cross-task integration focus (P34 loss wiring × FLE render-on-demand composition; source 31 on the 6-bit field; #609 mirroring note) + triage of ALL parked minors (a-e list in dispatch).
- On verdict: fix-now items → ONE fix dispatch + scoped re-review; then user visual checklist (FLE report) → user merges PR #570. Also queued: after #609 merges, absorb main into this branch.

## 2026-08-20 — user feedback: sample cap should be a slider

- USER REQUEST (live FLE feedback): path-tracer max-samples cap (FLE shipped it as a constant) becomes a UI slider. Brief WRITTEN: task-capslider-brief.md — store-backed setting, slider in existing tracer settings UI, raise-at-cap wakes + resumes without reset, lower-below-count = clean, NOT part of volpathKey, predicate tests extended.
- Dispatch AFTER the final whole-branch reviewer returns (reviewer is reading the tree; implementers serial): fold into the fix round if one is ordered, else standalone dispatch. Then re-review, push, user visual checklist (now including the new slider), user merges #570.

## 2026-08-20 — FINAL whole-branch review APPROVED; CAPSLIDER dispatched

- Final review (final-review-phase2.md): Approved, 0 Crit / 0 Imp; ALL ten parked minors confirmed genuine parks, none promoted. Cross-task verifications: loss-stopped loop unresurrectable by boost window (all rAF paths traced); statusMessage renders via App.tsx store subscription independent of canvas loop; FLE cadence-throttle × probe energy-smoke hazard already fixed in-commit via SETTLE_MS; P2prep prose fixes confirmed before P2-retry built on them.
- CAPSLIDER implementer (sonnet, base 8c60db01b) IN FLIGHT — task-capslider-brief.md, one commit. NB dispatch warned: :5500 is OUR live server for this tool, edits HMR into it, do not restart/kill.
- On DONE: review-package 8c60db01b..HEAD → task reviewer (sonnet) → push → user visual checklist (FLE list + new slider: raise-at-cap resumes accumulation) → USER MERGES #570. Post-#609-merge: absorb main into this branch. SDD workspace deletion deferred until #570 merges (capslider still in flight when final review closed).

### #609 MERGED (user-authorized, via gh from session)
- User explicitly authorized: gh pr merge 609 --squash → MERGED, squash commit e27d38170 on main. Remote branch refactor/pick-source-6bit + agent worktree agent-a59ec17eef192f882 (holds the local branch) still to clean via skymap-wt-clean.sh later.
- QUEUED (blocked on capslider implementer committing — it owns the index): git fetch origin main; merge origin/main into worktree-polyphorm-webgpu-tool (content-identical cherry-picks → expect clean); push. This shrinks #570 diff to pure workbench changes (user complaint: widening churn made #570 hard to review).

## 2026-08-20 — CAPSLIDER done; main ABSORBED; fix round 1 in flight

- CAPSLIDER implementer DONE: 37ea5cb83 (view.pathTracer.sampleCap slider 64-4096 step 64 default 512; volpathKeyFor.ts extracted with sampleCap excluded on purpose; predicate tests extended).
- Merged origin/main (e27d38170, the #609 squash) into the branch → merge commit a98c186ca (amended). Conflicts resolved: package.json (kept both promote-mcpm-workbench + build-dust scripts), docs/BACKLOG.md (kept both sides). SEMANTIC merge break found by post-merge typecheck: main-new tools/volumes/buildDustVolume.ts imported the old tools/utils path of packLogTraceVoxels, which THIS branch moved to src/utils (3b1302574) — import repointed inside the amended merge commit.
- Post-merge typecheck: the 3 sharp-namespace errors are GONE (main dependabot bumped sharp) — from now on gate-green = ZERO errors.
- Remaining typecheck error is IN 37ea5cb83 itself: ControlsPanel.tsx:697 sampleCap not excluded from PathTracerSliderKey (line 211) though viewSlice excludes it from PathTracerNumericKey; implementer gate claim did not hold.
- CAPSLIDER review (task-capslider-review.md): spec ✅, quality Needs-fixes — 1 Important: stale comment refs to deleted PATH_TRACER_SAMPLE_CAP at Viewport.tsx:202 + frameNeedsRender.ts:14-15.
- FIX ROUND 1 dispatched (same implementer resumed): both findings, one commit fix(mcpm-workbench) on top of a98c186ca. On DONE: verify typecheck ZERO errors myself, scoped re-review not needed if mechanical + tsc/vitest green (controller will verify both fixes directly in the diff), push everything (merge + capslider + fix), then user checklist → user merges #570.

## 2026-08-20 — fix round verified; EVERYTHING PUSHED; #570 merge-ready

- Fix commit 56ea7b026 verified by controller in the diff (sampleCap added to PathTracerSliderKey Exclude — type-only, generic table has no sampleCap row; both stale PATH_TRACER_SAMPLE_CAP comment refs repointed to ViewSlice.d.ts).
- Controller-run gates on merged tree: typecheck ZERO errors; full vitest 1128 files / 7392 tests green.
- Pushed 8c60db01b..56ea7b026 (capslider 37ea5cb83 + merge a98c186ca + fix 56ea7b026). #570 diff verified clean of pick-widening files (remaining src/ files all branch-legitimate).
- SDD run COMPLETE: all tasks + final review done. REMAINING: user visual checklist (FLE items + sample-cap slider resume-at-raise) → USER MERGES #570. Post-merge: delete this SDD workspace; clean worktrees (agent-a59ec17eef192f882 + polyphorm) via skymap-wt-clean.sh; sharp gate exception RETIRED (zero-error baseline now). Open elsewhere: stage-2 f16 A/B (user go), R2 sync + visible:true decision for the promoted source.

## 2026-08-20 — USER GO on stage 2; f16 A/B runner dispatched

- User approved stage 2 ("ok keep going" after the parked-decision briefing). Runner (sonnet) IN FLIGHT: force-disable shader-f16 via scratch edit (never committed, reverted at end), rerun standard sim per massratio-stage1-audit.md recipe, recompute ratio via mcpm-workbench:compare. Report → massratio-stage2-report.md. Tree at 56ea7b026 clean; runner must leave it clean.
- Interpretation on return: ratio ~1× → F16-CONFIRMED (then user chooses: accept-with-shape-caveat vs f32 trace buffer at 2× memory); ratio ~9.28× → hypothesis dead, accept-as-documented-offset becomes the honest option; either way this only gates visible:true, not the #570 merge.
- Pause protocol armed (TaskStop runner + kill detached runs + revert scratch + spare :5500).

## 2026-08-20 15:45 — PAUSE PROTOCOL executed on stage-2 run (user: pause)

DONE before pause:
- Runner had confirmed the f16 disable took effect: harness log shows element=f32; scratch edits were in createMcpmHarness.ts + readbackTrace.ts; self-hosted on port 54126 (5500 untouched).
- Run stage2f32 (seed 1, steps 800, measure-steps 60, resolution 1200, --export) was IN FLIGHT (~7 min expected) when killed.

Pause actions (all complete):
- TaskStop'd the runner agent; killed detached runHarness pids + all caffeinate holds (pgrep clean).
- Reverted scratch edits (git checkout -- both sim files); tree clean at 56ea7b026.
- Preserved /tmp/mcpm-stage2/{run.log,run2.log} → .superpowers/sdd/2026-08-18-mcpm-workbench/stage2-paused-artifacts/.

REMAINING to resume stage 2 (fresh runner, on user go):
- Re-apply the f16 disable (see stage2-paused-artifacts/run logs + massratio-stage2-report.md if the runner wrote a partial one; scratch edit sites: tools/mcpm-workbench/src/sim/createMcpmHarness.ts + readbackTrace.ts), verify element=f32 in log, rerun runHarness --seed 1 --steps 800 --measure-steps 60 --resolution 1200 --export --label stage2f32, then mcpm-workbench:compare for the ratio, then revert scratch. The killed run had NO completed export — full rerun needed.

## 2026-08-21 — stage-2 RERUN dispatched (user go)

- Fresh runner (sonnet) IN FLIGHT on HEAD d67b72712 (yesterday evening a second main merge landed: rungs 7, #611-#616, gates verified green before push). Same recipe: scratch f16 disable (createMcpmHarness.ts + readbackTrace.ts, element=f32 evidence), runHarness seed 1 / 800 steps / res 1200 / --export --label stage2f32, compare, revert. Report continues massratio-stage2-report.md.
- Pause protocol armed. On verdict: ~1× → F16-CONFIRMED → user chooses accept-with-shape-caveat vs f32 trace buffer (2× memory); ~9.28× → hypothesis dead → accept-as-documented-offset. Gates visible:true only.

## 2026-08-21 — stage-2 attempt 2 INCONCLUSIVE (export ceilings); attempt 3 dispatched

- Attempt 2: f32 sim ran clean (element=f32, same dims/throughput) but export died twice on f32-doubled size (~2.49GB trace): (1) >2GiB single mapped staging buffer, (2) after chunked-readback fix, browser refused ~2.32GiB Float32Array. Stopped per one-retry rule.
- Partial evidence: meanLogTraceAtPoints f32 vs f16 within ~0.0016 (noise) vs ~2.227 expected for uniform 9.28× — f16 NOT uniformly deflating dense regions. Volume integral (the actual 9.28× quantity) still unmeasured; denormal-flooring of near-zero voxels remains open.
- Ruling: dispatch attempt 3 (fresh runner) with streaming-sum fix — never assemble the cube; accumulate chunk subtotals into a running total during chunked readback; match the exact quantity compareTraceCubes uses; pull f16 + reference totals from existing artifacts. — Why: blocker is mechanical with an obvious fix, user's stage-2 go stands. — Cost if wrong: ~7 min GPU + one more report.
- Attempt-3 runner (sonnet) IN FLIGHT; appends to massratio-stage2-report.md.

## 2026-08-21 — stage-2 attempt 3: F16-REFUTED. 9.28× investigation sim-side EXHAUSTED

- Attempt 3 (streaming f64 chunk-sum, no cube assembly; validated at small scale vs full-array readback with 0 relative diff): total trace mass f32 = 1,069,261,340.81 vs f16 baseline 1,069,616,093.47; reference VAC total 9,924,877,491.65 → ratio_f32 = 9.2820× vs 9.2789× f16. f16 CLOSED.
- Every sim-side hypothesis is now eliminated: quirk flags (T24), structural (stage-1 audit: single weight/data-independent write site), f16 (attempts 2+3). Evidence is CONSISTENT WITH A UNIFORM SCALE DIFFERENCE vs the reference (dense-region stat and volume integral agree between representations; trace write is a pure normalization: (1/normalizationFactor)*distanceScaling per step).
- Remaining suspects are REFERENCE-SIDE / config provenance: Polyphorm's own run settings for the published VAC (normalizationFactor, agent count, step count at export) vs ours — i.e., not a bug, a provenance question.
- Tree verified clean at d67b72712 (scratch reverted; LSP ghosts only). Report: massratio-stage2-report.md (3 attempts).
- DECISION back to user: accept as documented offset (now well-supported: uniform-scale evidence) vs chase reference provenance (Polyphorm config archaeology). Gates visible:true on the promoted source.

## 2026-08-21 — USER RULING: 9.28× CLOSED as documented offset; docs task in flight

- User: "ok, lets close this and document the difference". Investigation CLOSED — accept-as-documented-offset.
- Docs implementer (sonnet, base d67b72712) IN FLIGHT: docs/research/mcpm-trace-mass-offset.md (condensed from the two gitignored workspace reports) + DATA.md MCPM paragraph + compareTraceCubes.ts expected-offset comment + staleness check on the source row's visible:false comment. One commit, no push.
- On DONE: verify diff + gates, push. visible:true remains a SEPARATE user decision (needs R2 sync of mcpm-workbench.scfd too). Then #570 waits only on the user checklist + merge.

## 2026-08-21 — 9.28× docs LANDED + pushed; effort fully closed on agent side

- Docs commit 9b7cf47a7 verified in-diff and pushed: docs/research/mcpm-trace-mass-offset.md (85 lines), DATA.md MCPM paragraph, compareTraceCubes.ts expected-offset comment, source-row visible:false comment refreshed (hidden pending promotion decision, offset documented). Gates: typecheck zero, prettier clean.
- NOTHING left on the agent side. USER OWNS: (1) FLE/capslider visual checklist → merge #570; (2) later, if unhiding: promote + sync-r2-secure from MAIN worktree + visible:true flip. Post-merge chores queued: delete this SDD workspace, worktree cleanup (polyphorm + agent-a59ec…), fresh npm install in main checkout if sharp ghosts appear there.

## 2026-08-21 — conventions audit → slot-conformance fix in flight

- Explore audit verdict on the P2-retry loading files: MINOR DRIFT. Real find: mcpmWorkbenchSlot.ts is a pre-#583 fossil (branch forked before rung-4 volume-ingest consolidation) — inlines renderer.upload + syncVisibilityFades instead of delegating to uploadVolumeField (the declared ONE ingest path), skips the addVolumeField dispatch (masked by visible:false + boot seeding, but violates the documented order-is-load-bearing invariant), unused _cb fingerprint, 20-line header carrying paragraphs #583 deleted from siblings. Also: stale Phase-4 wording in 3 comment sites missed by 9b7cf47a7; assetWiring banner says three, now four. NOT touched: fetcher 12-line header (shared family debt with cf4DensityFetcher — flag for a family-wide pass, not a lone fix).
- USER: apply the refactor idea → implementer (sonnet, base 9b7cf47a7) IN FLIGHT: uploadVolumeField delegation + header trim + 3 Phase-4 rewords + banner + sibling-shaped test update. One commit refactor(loading), no push. On DONE: controller reviews the small diff personally (final review already done for the effort; proportionality) + verifies gates, then pushes.

## 2026-08-21 — slot conformance LANDED + pushed; fossil sweep CLEAN

- b2db0fa3a verified in-diff by controller (uploadVolumeField delegation, header to sibling shape, cb rename, 3 Phase-4 rewords, banner four; slot joins volumeSlotIngest.test.ts as 5th call site) + typecheck zero re-verified; full suite was green in implementer gates (7461). Pushed.
- Whole-branch fossil sweep vs rungs 4/5/6/7 + #599 + #600: NO other violations. Positives worth keeping: fade rows derive volume ids generically from SOURCE_REGISTRY so our entry needed (and got) no hand row; shaders/mcpm/*.wesl are a voxel-space fork-parity renderer, NOT a duplicate of #599's scalar-field skeleton (promoted cubes render through the shared scalarVolume pipeline); promoteWorkbenchExport matches #600 tools conventions (manifest rebuild internalized, not missing).
- Incidental note (cosmetic, unactioned): src/components/common/CollapsibleSection coexists with differently-shaped SettingsPanel/CollapsibleSection (same name, different contract) — pre-existing seam, no collision.
- #570 head b2db0fa3a, merge-ready. User owns: checklist + merge; later promotion/unhide.

## 2026-08-21 — PR #570 MERGED (user-authorized, squash fb7cb02a2); /feature-done READY; ledger archived

- User authorized; gh pr ready + merge --squash. DoD audit: tests 7461 PASS, typecheck zero, 0 TODOs, ground-prep present; 165 checkboxes ticked at completion (execution tracked here, not in the plan); both DoD deferred-to-backlog items were RESOLVED in-effort instead (packLogTraceVoxels.test.ts exists; single f16 decoder). Smoke: pick check confirmed + tool exercised pre-merge-authorization.
- Completion commit rides chore/mcpm-workbench-complete (off fb7cb02a2): plan+spec → completed/, this ledger archived beside them. This is the ledger's final entry.
