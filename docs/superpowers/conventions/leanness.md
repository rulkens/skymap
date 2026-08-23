# Leanness — applying deletion-audit findings

Companion to the `deletion-audit` skill (`.claude/skills/deletion-audit/SKILL.md`),
which produces the findings; this convention governs what happens to them. The frame
is [`simplicity.md`](simplicity.md)'s code-is-liability rule: the scarce resource is
maintenance attention, and an audit's value is realized only when its findings land
or are explicitly ruled kept.

## Triage every finding into three bins

1. **Safe-now** — mechanical, no behavior change, safety argument verified
   (importer grep, coverage, or a targeted test run): dead code, zero-importer
   exports, restatement tests, over-budget comment trims, duplicated fixtures.
   → ONE deletion commit, riding the open PR (or a dedicated cleanup PR when the
   code already merged). Suite + typecheck green after; deleted restatement tests
   need no replacement — that they could be deleted is the point.
2. **Needs-ruling** — anything that changes behavior, removes debug/UI surface, or
   deletes user-requested scaffolding. The user rules each item; never process
   momentum. Debug-surface cuts sequence AFTER any pending on-device verification
   that still uses them.
3. **Traps** — constructs the audit verified as load-bearing despite looking
   removable. Where the guard isn't already recorded, add a one-line comment naming
   the concrete thing that fails without it, so the next audit (and the next
   editor) doesn't re-litigate.

## Rules

- **Deletion commits are their own commits** — never mixed with feature or fix
  work, same as prep refactors.
- **Scaffolding gets an expiry at birth.** Anything built for a diagnosis or
  verification carries `// delete when <trigger>` from day one; audits and
  /feature-done grep for expired markers. Removal needs a trigger — "notice it's
  stale" measurably doesn't happen.
- **Keep the audit report beside the ledger.** Its trap list and null results are
  the next audit's scope fencing; without it, findings get re-argued.
- **A false clean bill is a defect.** If an audit returns "nothing to remove",
  check it ran on an opus-class model before believing it.
