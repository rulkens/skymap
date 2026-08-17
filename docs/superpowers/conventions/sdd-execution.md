# SDD execution

> **Audience.** You're executing an implementation plan via the
> `superpowers:subagent-driven-development` skill.
>
> **Status.** Skymap-specific addendum to that upstream skill. Where this doc
> and the upstream skill disagree, **this doc wins** — the upstream skill
> serializes strictly and deletes its own progress ledger on Finish, both of
> which cost real time and real history on skymap-sized plans.

## Rule 1 — Task list before Task 1

Before dispatching any implementer, create one visible task per plan task —
the harness task list the user can see, not a note buried in a ledger. After
a compaction, rebuild the list from the ledger + `git log` before resuming
dispatch.

This is a hard gate, not a suggestion. The upstream skill's Setup section
asks for this todo-per-task but it demonstrably doesn't stick — an execution
session with no task list is mis-following this doc, full stop.

## Rule 2 — Pipelined reviews

Upstream serializes implement → review → next implement. Override: when
implementer N reports DONE, record HEAD, generate the review package, then
dispatch reviewer N **and** implementer N+1 in the same breath — provided
task N+1's **Files** set is disjoint from every task whose review is still
open.

This is always read-safe: the reviewer's input is the frozen review-package
diff, so later tree edits cannot affect it. Implementers themselves remain
strictly serial — the upstream ban on parallel implementers stands, same
working tree.

Freeze rule: any Critical/Important finding (or spec ❌) pauses dispatch of
new implementers until that task's fix loop closes. The in-flight
implementer runs to completion; fix dispatches queue behind it, since fixes
edit the tree.

Completion bookkeeping is unchanged: a task is complete only when its review
is clean. Reviews may close out of task order — ledger lines already carry
task numbers, so this doesn't lose track of anything.

## Rule 3 — Ledger archiving

The Finish step's workspace deletion is amended: **before** `rm -rf
<workspace>`, copy `<workspace>/progress.md` to
`docs/superpowers/plans/completed/<plan-basename>.ledger.md` and commit it
with the completion moves. Never delete a workspace whose ledger is not
archived.

Why: the ledger is the only record of how a plan actually ran — dispatch
waves, fix rounds, mid-flight pivots. Without it, questions like "did
pipelining cost extra fix rounds" are unanswerable.

See also: [`plan-style.md`](plan-style.md) for how plans are written (the
Definition of Done section it mandates is what `/feature-done` audits at
the other end of this execution).
