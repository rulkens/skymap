# SDD execution

> **Audience.** You're executing an implementation plan via the
> `superpowers:subagent-driven-development` skill.
>
> **Status.** Skymap-specific addendum to that upstream skill. Where this doc
> and the upstream skill disagree, **this doc wins** — it replaces upstream's
> Model Selection, its Task Loop (per-task review + fix loop), its Final
> Review, its Finish step and its `implementer-prompt.md` template. Upstream's
> worktree + ledger recovery discipline stands.
>
> Derived from the P1/P6 retrospective,
> [`lean-sdd-process-2026-09-15.md`](../../grill-sessions/lean-sdd-process-2026-09-15.md):
> 61 agents, 3,295 turns, ~$270, sixteen reviews that found zero behaviour bugs.

## Ask two questions before Task 1

Parallelism (how many plans/PRs run at once) and whether the perf gate runs —
one message, at plan start, answers recorded in the ledger. Why: both were
inferred from the spec last run, and an inferred perf gate is a gate nobody
chose to pay for.

## One worktree per PR

The controller works inside it; implementers are plain agents in that same
tree, dispatched serially. Isolation worktrees only when two plans run
concurrently — one per plan, never one per task. Edits under ~50 lines the
controller makes inline. Why: 33 isolation agents spent 12% of all turns on
git/npm plumbing and 22 GB of disk for parallelism that 2–4 dispatches per plan
cannot use, and delegation only breaks even at ~2 turns.

## Group consecutive tasks into 2–4 dispatches

The plan stays task-shaped — tasks are the unit of thinking and testing. The
controller does the grouping, by **cognitive locality**: consecutive tasks that
share files, a subsystem, or one mental model go to one agent, worked as a
checklist with **one commit per task**.

Why: a subagent turn costs exactly a main-loop turn at equal context, so a fresh
agent on the same files re-pays orientation and loses cache share (93% vs 98%).

## Briefs are pointers, precise not short

A brief carries: the plan path plus the exact task headings; spec section
headings with line ranges when the recipient is a reviewer; interfaces and
decisions produced by earlier dispatches; the reply contract. No pasted task
text, no extraction scripts, no packaged diffs. Why: brief length is free — the
first-turn cache write was 25–30k tokens for every agent regardless — but
vagueness costs turns, and re-reading the spec 7.6× per agent cost ~$30 against
~$10 of content.

## Agent protocol

Paste this verbatim into every implementer dispatch; it replaces the upstream
per-session protocol file.

```text
- Work on the current branch in this worktree. One commit per plan task,
  message in the plan's voice. Never rebase, never force-push, never merge.
- Verify with `npm run typecheck:fast` and the targeted tests for the files
  you touched. CI is the gate: no full-suite run, and no verification agent
  after you push.
- `npx prettier --write` the files you touched. Stage by path — never `git add -A`.
- Reply in 8 lines or fewer: status, HEAD sha, which tests you ran, and any
  deviation from the plan (name it, don't hide it).
- Write a report file only if you have a concern the reply cannot hold.
- Every message you send either calls a tool or is your final reply.
```

## One review, at the end

One whole-branch review when the last dispatch lands. Its mandate is **spec
fidelity and slop** — surplus helpers, dead paths, tests that restate code,
comments over budget. One fix round, run by the branch's own implementer. No
re-review.

Exception: a task the plan tags `review: yes` gets one mid-branch review,
given the diff **and** the task contract **and** the named spec section — a
diff alone produces confident spec verdicts that quietly redefine the spec.
One round, no re-review. The trigger list for the tag lives in
[`plan-style.md`](plan-style.md).

Why: the two-stage per-task chain cost ~$110 and ~20 min of latency per task
and found only comment-level issues across sixteen reviews.

## Models

Planning, spec-writing, the final review and rulings run on the top tier.
Implementers default to Sonnet; tasks tagged `review: yes` get Opus. Never
Haiku for multi-step work. No thinking caps, no tool-call budgets. Log the
model and the turn count for every dispatch in the ledger.

Why: the Sonnet default is a measured bet — last run's tier data was confounded
by a protocol that forced install, full suite and rebase on every agent — and
the log is what decides it after two plans. Caps and budgets cost turns, and
turns are the bill.

## Ledger

One line per dispatch — tasks, model, BASE→HEAD, status, turn count — and one
per landing. Rulings only when one is made, in the existing
`Ruling: <decision> — <why> — <cost if wrong>` form. The pre-flight conflict
table is written only when the scan finds a conflict. The task-list artifact is
published at start and at end, not on every status change. The diff breakdown
(code / comment / test / doc lines) is produced once per PR, at landing. Why:
controller bookkeeping was $74 and 436 turns, most of it re-reading its own
records.

## Archive the ledger before deleting the workspace

**Before** `rm -rf <workspace>`, copy `<workspace>/progress.md` to
`docs/superpowers/plans/completed/<plan-basename>.ledger.md` and commit it with
the completion moves. Never delete a workspace whose ledger is not archived.
Why: it is the only record of how a plan actually ran, and the only way to
answer "did Sonnet implementers cost extra fix rounds".

## Landing

`gh pr checks`, then squash-merge on the user's explicit word. The DoD audit,
the plan + spec move and the ledger archive are done inline by the controller —
no verification agents. Agent worktrees, their branches and the dev servers
started for this plan are cleaned up in the same step, not deferred.

See also: [`plan-style.md`](plan-style.md) for how plans are written — the
Definition of Done it mandates is what `/feature-done` audits here.
