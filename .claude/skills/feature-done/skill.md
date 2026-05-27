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
  the plan should have been authored with one. Don't fail the audit
  for it (older plans pre-date the convention) — just note it.

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

OVERALL: <READY / NOT READY: <reason>>
```

If `READY`, say so and stop. Don't move files, don't update CLAUDE.md,
don't commit. Those are separate user decisions.

If `NOT READY`, the report's findings are the to-do list — the user
either addresses them or explicitly accepts and overrides.

## Anti-patterns

- **Don't** mark the plan complete from inside the skill. The skill
  audits; the user (or a separate explicit step) marks complete.
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
