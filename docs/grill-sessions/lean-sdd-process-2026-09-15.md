# Grill Session: Lean SDD process — 2026-09-15

Source: retrospective on the P1 (#704) + P6 (#705) terrain execution, 2026-09-14, in
conversation. Measured from the session and agent transcripts (61 agents, 3,295
turns, ~344M context tokens, ~$270 at API list rates, ten hours wall-clock of
which ~4.5 h was the usage limit).

Goal: cut the cost and wall-clock of building a feature aggressively while keeping
output quality close (correctness and spec fidelity unchanged; comment polish and
test volume may degrade a little, and should — both are over-produced today).

Where this run's money went: implementers 38%, controller 21%, reviewers 14%,
final-review fix rounds 9%, plan-writing agents 8%, the rest 10%. Cache reads were
60% of the bill; turn count × context size is the cost, not agent count or brief
length. Sixteen reviews found zero behaviour bugs.

---

## Q1: What is the quality floor?

**The question:** Which quality dimensions must still be guaranteed by process after
the cuts, and which may slip?

**Considerations:**

- **Behaviour correctness** — already machine-checked (typecheck, tests, CI) plus
  the user's eye-check for shader-only facts. Costs nothing to keep.
- **CI-enforced conventions** (purity ratchet, one symbol per file, format, lint) —
  same.
- **Comment quality and budget** — every comment-level finding this run came from
  here; the repo is over-commented already.
- **Leanness / slop** — surplus helpers, dead paths, over-testing. Refactoring stays
  part of the process; growth must not create slop.
- **Spec fidelity** — the one thing a reviewer catches that CI cannot; unforeseen
  situations during implementation are normal and get named, not hidden.
- **Tests** — the suite is large and slow; the plan-writing habit of a failing test
  per step over-produces.

**Decision:** Correctness and CI-enforced conventions stay guaranteed, leaning on CI
during the process where it does not slow things down. Spec fidelity stays
guaranteed, with deviations named rather than forbidden. Comments may degrade a
little. Over-testing is a defect to remove, not a quality signal. Refactoring/slop
control stays in the process.

## Q2: Review structure

**The question:** Per-task review + fix + re-review + final review + fix + re-review
cost ~$110 and ~20 min of latency per task and found only comment-level issues. What
survives?

**Considerations:**

- **Option A (status quo):** two-stage review per task plus whole-branch review.
  Catches a deviation the moment it lands; in practice found nothing CI missed.
- **Option B (one final review):** one whole-branch review at the end, mandate
  limited to spec fidelity and slop, one fix round by the branch's own implementer,
  no re-review. A deviation in task 2 is caught after task 8 and may cost a wider
  fix. Superpowers 6 evals moved the same way (merged reviewer −41% output; per-plan
  review loops removed after ~25 min overhead with no measurable gain).
- **Option C (B + tricky-code exception):** as B, plus a mid-branch review for tasks
  whose bug class CI cannot see.

**Decision:** Option C. The exception list, tagged in the plan at authoring time as
`review: yes` so the controller never decides ad hoc: shaders and any TS↔WGSL
contract; camera/pose math; Redux state and sagas; binary formats and parsers;
any file a landmine memory names. A tagged review gets the diff, the task contract
and the spec section (a diff alone produces "confident spec verdicts that silently
redefine spec as global constraints" — Vincent's caveat); one round, no re-review.

## Q3: Dispatch grouping and worktrees

**The question:** 18 plan tasks became 10 isolation-worktree dispatches (33 isolation
agents in all, 12% of turns on git/npm plumbing, 22 GB of worktrees on disk, an
install per dispatch, push-by-ref that the sandbox keeps denying). Should plans be
written as dispatches? Should implementers run in isolation worktrees?

**Considerations:**

- **Option A (plans as 2–4 dispatches):** rejected by the user — tasks are the unit
  of thinking and testing; batching belongs to execution, not authoring.
- **Option B (plan stays task-shaped; controller groups by cognitive locality):**
  consecutive tasks sharing files/subsystem/mental model go to one agent that works
  them as a checklist with one commit per task. Grounded in the "cognitive locality,
  not task count; 2–4 agents per wave" heuristic and in the measured fact that a
  subagent turn costs exactly a main-loop turn at equal context — fresh agents on the
  same files re-pay orientation and lose cache share (93% vs 98%).
- **Isolation worktrees:** bought parallel implementers; with 2–4 dispatches per plan
  that is worth little. Setup itself is only ~1.5% of tokens, but it is 1–3 min
  latency per dispatch, disk, and the review-package / push-by-ref indirection.
- **Inline vs delegate for trivia:** from a 160k controller context, delegation breaks
  even at ~2 turns and spawning costs ~2.3 turns; the one-line agents were
  break-even at best.

**Decision:** Option B. One worktree per PR with the controller in it; implementers
are plain agents in that tree, serial; isolation worktrees only when two plans run
concurrently, one per plan. Trivial edits (under ~50 lines) the controller does
inline. No per-dispatch install, no push-by-ref, no packaged diffs.

## Q4: Controller bookkeeping and agent communication

**The question:** The controller spent $74 and 436 turns on ledgers, briefs, review
packages, PR bodies and a task-board artifact. What stays?

**Decision:** Briefs are pointers (plan path + task headings + interfaces + reply
contract), no extraction script, no pasted task text. Protocol file trimmed to what
CLAUDE.md does not already say. Replies ≤ 8 lines (status, HEAD, tests run,
deviations); a report file only when there is a concern. Ledger: one line per
dispatch and per landing, rulings only when made. Task-list artifact published at
start and end only (reverses the republish-on-change ask). Diff breakdown once per
PR at landing (reverses the per-task ask). Reviewer inputs: diff range + plan
headings + spec section, no packaged file.

## Q5: Tests and comments

**The question:** Both are over-produced. Criterion change or budget?

**Considerations:** Vincent's evals: word budgets on plans cut test content 62% and
quality with it — so no numeric cap on tests. Every comment fix round this run was a
stale line-number citation.

**Decision:** A plan writes a test only for a behaviour that can fail on a real bug
the compiler and existing tests would miss (testing.md's criterion, now overriding
the writing-plans "failing test per step" default). Type sweeps, routing, deletions
and constant plumbing get no new tests. Deleting a test that cannot fail is a valid
deliverable; the final review's slop mandate includes tests that restate code.
Comment header budget drops 10 → 5 lines; inline comments only for a landmine, a
unit, a derivation or a cross-file contract; no cross-file line-number citations
(name file + symbol). Suite speed: measure once, slowest offenders become one
backlog item.

## Q5b: Repo-wide prune instead of per-feature trimming

**The question:** Should tests and comments be pruned repo-wide once, so the
per-feature process does not carry it?

**Decision:** Yes, as two backlog items, tests first (measurable: baseline the suite,
delete only what cannot fail on a real bug, list every deletion in the PR body),
comments second (script lists files over budget and cross-file line citations;
agents trim only listed files; landmine memories + RENDERER.md are the protected
set). The comment audit has worked well as a tool; the problem was only that it
stacked onto every PR. Run both after the process change lands.

## Q6: Models, prompting, thinking, budgets

**The question:** Which of the "obvious" levers are grounded?

**Considerations, each against this run's data:**

- **Thinking cap:** unmeasured here. Arithmetic: output was $45 of $270, context
  re-reads $160; at 110–150k context per turn one extra turn ≈ 5k thinking tokens.
  Vincent's one eval: cap raised turns 92 → 138. Downside dominates.
- **Model tiers:** confounded. Sonnet fix agents took 60–196 turns on two-file
  comment edits, but the protocol forced install + full suite + rebase + push on
  each. Vincent: refusing Haiku on complex plans saved money; Sonnet planning lost
  structure.
- **Brief length:** irrelevant to cost — first-turn cache write was 25–30k for every
  agent regardless of brief size (1–10k chars). Vague briefs cost turns (Anthropic:
  duplicated work).
- **Tool-call budgets:** no agent would have benefited; the 183- and 154-call agents
  delivered; the stalls were the usage limit.
- **Text-only turns:** turns exceeded tool calls by 30–45% in every agent — narration
  between actions, each re-reading ~120k. The largest grounded saving on the table.

**Decision:** No thinking cap. Sonnet-default for implementers as a measured bet,
Opus for tagged tasks (shader, camera, state, format, design), planning/spec/final
review/rulings on the top tier; model and turn count logged per dispatch so the
next two plans decide it. Briefs precise, not short. No tool-call budgets. Protocol
drops install, full-suite and report-file steps in favour of CI, and adds: every
message either calls a tool or is the final reply.

## Q7: Front and tail of the process

**The question:** Brainstorm, refactor-ground, spec, radar, plans (10% of cost, where
quality is decided) and the tail (perf, attestation, DoD audit, landing).

**Decision:** Front unchanged except: plan tasks carry `files:` and `review: yes`
tags; the SDD pre-flight conflict table is written only when it finds a conflict.
Perf gate is asked up front at plan start, alongside parallelism (not assumed from
the spec). Attestation stays — it is the only regression suite for shader-only
facts. DoD audit, plan move and ledger archive are done inline by the controller.
Landing = `gh pr checks` then squash-merge on the user's word; no verification
agents. Worktree/branch/server cleanup happens at landing, not deferred.

## Q7b: Spec and plan verbosity

**The question:** How much do spec/plan reads cost, and should the documents be cut?

**Considerations:** Spec 753 lines / ~15k tokens read 122 times by 16 agents (7.6
reads per agent); plans read 5.8–7.2 times per agent. Content carried ≈ $10; the
364 read turns ≈ $30. Halving the spec saves ~$2; one read per agent saves ~$25.

**Decision:** Briefs name exact headings and line ranges so an agent reads once. A
plan task is self-contained (contract code, files, test, done criteria) so an
implementer never needs the spec; the spec is the reviewer's document. Verbosity
is a quality problem, reviewed by the user with plan-style's existing bans as the
lens (background restatement, option surveys, history, asymmetry-coping prose); no
numeric cap.

## Q8: Deliverables

**Decision:** `sdd-execution.md` rewritten as the lean protocol; `plan-style.md`
amended (tags, self-contained tasks, header 5); CLAUDE.md pointers and comment
budget updated; contradicting feedback memories rewritten; two backlog items (test
prune, comment prune); this transcript. One docs PR.
