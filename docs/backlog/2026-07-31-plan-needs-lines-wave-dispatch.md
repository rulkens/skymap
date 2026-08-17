# Plan `Needs:` lines for wave dispatch

**Problem.** SDD executes plans serially; the upstream skill bans parallel
implementers outright. Wall-clock is left on the table.

**Measurement (2026-07-31, all 203 completed plans, 1533 top-level tasks).**
`**Files:**` coverage is 93% of tasks; `Consumes:` lines 6%; prose "Task N"
backreferences 27%. Dependency-edge models over the ~130 parseable plans:
write-write file overlap only → mean critical-path depth 2.55, mean ideal
speedup 4.7x; adding a read-after-write proxy → 4.1x; adding prose
backrefs → mean depth 3.45, ideal speedup 3.2x mean / 2.75x median, 2.7x
capped at 4 concurrent agents. Only 2/124 plans are pure chains.

**Calibration failure (the key finding).** The one recorded real execution
(keyboard-events-saga; ledger now at
`docs/superpowers/plans/completed/2026-07-23-keyboard-events-saga.ledger.md`)
ran waves [1,2,3] → 4 → 5 → 6 (depth 4). Every mined model produced a
shallower graph — it merged tasks the run correctly serialized, because the
real dependencies are symbol-level and live in prose ("logCameraState from
Task 3"), invisible to Files blocks. All mined numbers are therefore
ceilings; expect ~1.5–2x real. **The DAG must be authored, not mined.**

**Proposal sketch.**

1. `plan-style.md` gains a required `**Needs:** N (symbol), M (symbol)` line
   per task — every edge justified by the symbol/file it carries, `none`
   explicit; unjustified "previous task" habit edges are the failure mode
   that made `Consumes:` lines useless.
2. Execution predicate: dispatchable = all `Needs` complete ∧ `Files`
   disjoint from every in-flight task. Parallel implementers get
   worktree isolation and cherry-pick back, main thread runs the combined
   gate — the exact procedure the keyboard-events run validated by hand.
3. File overlap stays as a net that may only ADD serialization, never
   remove it.
4. The task reviewer gains one line-item: does the diff consume symbols
   from tasks outside this task's `Needs`? (closes the under-declaration
   hole).

Pilot on one plan before codifying; archived ledgers (now kept) provide the
before/after fix-round data.

Readiness: needs a spec.
