---
name: feature-done
description: Audit a plan against the Definition-of-Done gate before marking it complete. Use when the user types `/feature-done`, asks to "verify the plan is done", "check DoD on <plan>", or is about to close out a feature. Runs the static checks (tests, typecheck, TODO scan, modified-file inventory) and reports a pass/fail summary so unfinished business doesn't get rubber-stamped.
---

# /feature-done — Definition-of-Done audit

This is the plan-completion gate that the volume-renderer post-mortem
identified as missing. The volume renderer shipped with placeholder
defaults immediately overwritten, dangling TODOs, and 27% of the test
parity of comparable renderers — every one of those would have been
caught by a checklist that someone actually ran before declaring done.

This skill **does not** mark anything complete. It runs the audit and
reports the result. The user decides whether to ship.

## When to invoke

- The user says "I think this plan is done" or "ready to mark
  complete."
- All task checkboxes in a plan are ticked but the user wants
  confirmation before moving the file to `docs/superpowers/plans/completed/`.
- Before opening a PR for a feature branch that implements a plan.
- Proactively — when you (the assistant) believe a plan you've been
  executing is at the finish line, run this audit before announcing
  completion.

**Timing: always on the feature branch, BEFORE the PR merges.** The
completion commit (plan/spec moves + backlog sweep) ships with the PR —
that's why the housekeeping step pushes to the branch's upstream.
Sequencing the audit as a post-merge follow-up is an error: it needs a
second PR and detaches the "this plan shipped" record from the feature
that shipped it.

## Inputs

- Plan path. Either provided as an arg (`/feature-done docs/superpowers/plans/2026-05-27-foo.md`)
  or inferred from the most-recently-edited file in `docs/superpowers/plans/`.
- The current branch (auto-detected via `git branch --show-current`).

## Audit steps

Run the checks below in order. Don't short-circuit — collect every
finding and report them together at the end. Use parallel tool calls
where the checks are independent.

### 1. Baseline green

- `npm test` — full suite must pass. Note pass/fail and test count.
- `npm run typecheck` — zero errors required.
- If either fails, **everything else still runs** — but mark the audit
  as `BLOCKED` and surface the failure first.

### 2. Plan checkboxes

- Read the plan file. Count `- [ ]` (open) vs `- [x]` (done).
- The plan is complete only if every checkbox is `- [x]`, including
  the "Definition of Done" section at the bottom of the plan.
- If the plan's own DoD section is missing, flag this as a finding:
  the plan should have been authored with one, per the "Definition of
  Done" section in `docs/superpowers/conventions/plan-style.md`. Don't
  fail the audit for it (older plans pre-date the convention) — just
  note it.
- Backstop: locate the plan's spec (linked in its header, or the
  same-date/slug file in `docs/superpowers/specs/`) and check it has a
  "Ground preparation" section (filled, or "none needed — because X" —
  produced by the `refactor-ground` skill). The load-bearing gate for
  this is at plan-writing time (`plan-style.md`); here it's
  defense-in-depth. Missing section = a finding, not a failure; specs
  pre-dating 2026-07-14 are exempt.

### 3. Modified-file inventory

- `git diff --name-only main...HEAD` — list every file touched on
  this branch.
- Cross-reference against the plan's `## File Structure` section
  (Created / Modified subsections). Flag two things:
  - Files modified that the plan didn't anticipate. (Scope creep, or
    the plan was wrong — surface for human judgement.)
  - Files the plan said it would modify but didn't get touched.
    (Possible incomplete task.)

### 4. TODO / FIXME / HACK / XXX scan

Run `grep -rEn '\b(TODO|FIXME|HACK|XXX)\b' <modified files>`.

- Every such marker must be one of:
  - Pre-existing on `main` (not introduced by this branch).
  - Carries `(owner, YYYY-MM-DD)` or a tracking-issue link.
- New markers without ownership are findings. Don't silently strip
  them; surface them for the user to decide (keep with ownership /
  delete / convert to ticket).

### 5. Comment-style smell scan

Skymap uses didactic comments — "why and what was the alternative"
not "what." Quickly scan the diff for:

- Comments that only restate what the code does (`// increment i by 1`).
- Single-line `// TODO: figure this out` without context.
- Multi-line blocks of commented-out code with no `// kept-because-…`
  rationale.

These aren't hard failures — they're style smells worth flagging.

### 6. Test-parity sanity check

For each renderer/module modified, eyeball the test file's line count
vs an established comparable. If parity has dropped (e.g., a renderer
test file shrank by 30%+), flag it — refactors should normally either
preserve or improve test coverage.

This is a heuristic, not a hard rule. State the comparison so the
user can judge.

### 7. Dev-server / smoke-test attestation

If the plan has a Task labeled "smoke test" or similar manual-
verification step:

- Check the conversation history (within the current session) for
  evidence the smoke test was run.
- If no evidence is found, flag as a finding: "Manual smoke test in
  Task N has no record of being run in this session." Don't auto-run
  it — manual verification is the user's call.

### 8. Loose-ends recap

Read the plan's "Out of scope (deferred)" section if present. List
each deferred item. These don't block the plan, but make sure they're
documented as deferred (with a follow-up plan or ticket reference)
rather than silently dropped.

### 9. Leanness audit

If no `deletion-audit` run covers this branch since its last substantive
commit, dispatch one (whole-branch, legacy framing, opus-class — see
`.claude/skills/deletion-audit/SKILL.md`). Findings apply per
`docs/superpowers/conventions/leanness.md`: the safe-now bin lands as its own
deletion commit before the completion moves; needs-ruling items go to the user
alongside the audit verdict. Report the audit's net-LOC number.

## Report format

Output **one** structured summary at the end. Don't narrate each step
in user-facing text; collect findings and present them together.

```
DoD audit — <plan filename>

  Tests:       <PASS / FAIL>  (N tests, baseline was M)
  Typecheck:   <PASS / FAIL>
  Checkboxes:  <X/Y ticked>   (DoD section: <PRESENT / MISSING>)
  Modified files vs plan:
    Unexpected: <list, or "none">
    Untouched : <list, or "none">
  New TODOs without ownership: <count>  <list>
  Comment-style smells:        <count>  <samples>
  Test parity:                 <flag list, or "OK">
  Smoke test attestation:      <FOUND / NOT FOUND IN SESSION>
  Deferred items: <list, or "none">
  Leanness audit: <net LOC found; safe-now applied in <sha> / NOT RUN>

OVERALL: <READY / NOT READY: <reason>>
```

If `READY`, **execute the housekeeping moves immediately** as part of
the same response — no separate confirmation step. The audit _is_ the
gate; reaching READY is the user's signal to move the files. State
what's being moved in one line, then do it:

- `git mv` the plan file from `docs/superpowers/plans/<file>.md` to
  `docs/superpowers/plans/completed/<file>.md`.
- If a matching spec exists at `docs/superpowers/specs/<same-date>-<same-slug>*.md`
  (or one the plan links to in its header), `git mv` it to
  `docs/superpowers/specs/completed/` the same way.
- **Archive the ledger.** If `.superpowers/sdd/<plan-basename>/progress.md`
  exists — or a flat-era `.superpowers/sdd/progress.md` whose first line
  names this plan — copy it to
  `docs/superpowers/plans/completed/<plan-basename>.ledger.md` and stage it
  with the completion commit (see
  `docs/superpowers/conventions/sdd-execution.md`). An SDD-executed plan
  with no ledger found is worth one line in the report.
- **Sweep the backlog.** The item should already be gone — the
  convention removes a backlog item (its index line **and** its
  `docs/backlog/<date>-<slug>.md` detail file) the moment it's picked
  up to write a spec/plan — but catch stragglers. Search `docs/BACKLOG.md`
  and `docs/backlog/` for the feature's slug/name:
  - Remove any matching index line via Edit.
  - `git rm` any matching `docs/backlog/<date>-<slug>.md` detail file —
    the shipped plan/spec supersedes it.
  - **Never leave a `~~struck-through~~` "done" line** — delete it. The
    completion record is the git log + `*/completed/`, not the backlog.
  - If the plan referenced a _separate_ deferred item that's still open,
    leave that one — it stays in the backlog until independently picked up.

Then **commit and push** the moves so the "this plan shipped" record
lands on the feature branch / PR without a manual follow-up:

- Stage the moved plan/spec at their new `completed/` paths **including
  any in-place edits** (ticked checkboxes, a completion note). A bare
  `git mv` over an unstaged edit stages only the rename and strands the
  content change, so `git add` the new paths explicitly. Stage the
  BACKLOG edit + any removed `docs/backlog/` detail file too. Stage only
  those doc paths — never `git add -A`.
- Commit with a `docs(plan): mark <slug> complete` message under the
  user's git identity + the `Co-Authored-By: Claude …` trailer, with the
  audit verdict in the body.
- `git push` to the current branch's upstream if it has one, so the
  commit lands on the open PR. If the branch has no upstream yet, leave
  the first push to the user and say so.

Don't update CLAUDE.md, and don't commit anything beyond the completion
moves — the implementation should already be committed; this commit is
_only_ the plan/spec relocation + checkbox ticks + BACKLOG/`docs/backlog`
sweep.

If the user explicitly says "audit only" / "don't move" / similar
before invoking, skip the moves and just report. Otherwise default to
moving on READY.

If `NOT READY`, the report's findings are the to-do list — the user
either addresses them or explicitly accepts and overrides. Don't
move anything until READY.

## Anti-patterns

- **Don't** ask the user to confirm the move on every READY result.
  The audit's READY verdict is the confirmation; the moves are part
  of the same response. The only exception is when the user
  explicitly opted into "audit only" before invoking.
- **Don't** auto-fix findings. A new TODO without ownership might be
  legitimate ("the owner is you, today's date"); blindly stamping it
  hides the conversation that should happen.
- **Don't** rerun the audit until findings are addressed. If the user
  asks again with no intervening change, the report will be the same
  — say so and skip the re-run.
- **Don't** trust the plan's "all tasks done" without running tests.
  Checkbox-driven plans are aspirational; the audit is the reality
  check.
- **Don't** treat tests + typecheck green as sufficient. The
  volume-renderer post-mortem failed on items 4–6 (loose ends, test
  parity, smoke attestation) despite green CI.
