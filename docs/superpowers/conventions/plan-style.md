# Plan style

> **Audience.** You're writing an implementation plan under `docs/superpowers/plans/`
> via the `superpowers:writing-plans` skill (or a subagent dispatched to do so).
>
> **Status.** Skymap-specific addendum to the upstream `writing-plans` skill.
> Where this doc and the upstream skill disagree, **this doc wins** — the upstream
> "complete code in every step" default produces bloated plans that rot the
> moment the surrounding code shifts.

## TL;DR

**Contract code yes, implementation code no.**

A plan is a strategy + task list. The implementer reads the current code, the
spec, and the test names — and writes the body themselves. Code in the plan
exists to _pin a contract the implementer must hit_, not to demonstrate the
implementation.

## Precondition: the spec must have a "Ground preparation" section

Do not author a plan against a spec that lacks a **Ground preparation** section —
either filled in (the ideal-shape sketch, growth/bolt-on verdicts, and prep-refactor
list) or explicitly "none needed — because X". That section is produced by the
`refactor-ground` skill, run between brainstorming and spec-writing, and it is what
guarantees the plan is written against an architecture that can _grow_ the feature
instead of bolting it on. If the section is missing, stop and run `/refactor-ground`
first; the spec may need to change shape.

## What earns its place in a plan

These four kinds of code are the contract. Include them, exactly.

1. **Type signatures and interface shapes** of new public APIs.
   The implementer must match them; vague prose ("add a method that returns
   the entry") loses information.
2. **Test names and assertions.**
   The test names _are_ the acceptance criteria. "Write a test for X" without
   showing the assertion lets the implementer ship something that passes the
   wrong test.
3. **Byte / offset tables** for binary formats, WGSL uniform layouts, vertex
   strides. Prose can't disambiguate "the K-band magnitude is at byte 47";
   the table can.
4. **Tiny before / after sketches** when the prose alone can't make the
   intended diff obvious. Keep these to a few lines each.
5. **The `npm run move-files` invocation, spelled out, in any task that moves
   or renames TS files.** Implementers who aren't told otherwise default to
   `git mv` + hand-editing every import path (observed, repeatedly); naming
   the tool in the task text is the only channel that reliably reaches a
   subagent, since they never load project skills. See
   `.claude/skills/refactor/SKILL.md`.

## What doesn't

These produce plan bloat and rot. Cut them.

- **Full function bodies.** The implementer writes the body from the test,
  not from a snippet that will drift between plan-write and plan-execute.
- **Copy-pasted existing code.** Cite `path/to/file.ts:123-145` instead —
  the file is the source of truth and won't go stale.
- **Hypothetical worked examples.** "Here's roughly what Task 3's
  implementation might look like" is implementation, not contract.
- **Boilerplate scaffolding** (commit-message templates, test-file skeletons
  the framework already generates, import lines).

## Definition of Done

Every plan ends with a `## Definition of Done` checklist, authored at
plan-writing time from the spec's success criteria — not backfilled once
execution wraps.

Feature-specific only:

- **Deliverable inventory** — the public artifacts that must exist (new
  files, exported symbols, UI surfaces).
- **Named observable behaviours** for the manual smoke pass — concrete and
  checkable, e.g. "hover preview, select ring, focus tween, Esc clear," not
  "works correctly."
- **The deferral boundary** — what is explicitly out of scope, so a reviewer
  doesn't chase it.

**Prohibited:** restating the standing gates — `npm test`, `npm run
typecheck`, TODO scans. `/feature-done` runs those against every plan
regardless; a DoD line that mirrors the audit is noise, not a checklist.

If you cannot write the DoD, the spec lacks success criteria. Stop and fix
the spec — don't invent criteria at plan time.

`/feature-done` audits this section at completion time; see
`.claude/skills/feature-done/SKILL.md`.

## Cite, don't paste

When a task touches existing code, reference it by file path and line range,
not by pasted excerpt. `pointRenderer.ts:240-280` is unambiguous, survives
refactors that move the code, and forces the implementer to read current
state instead of trusting a stale snippet.

The only exception: when a tiny before/after diff is genuinely clarifying
(category 4 above), paste _just_ the changing lines, never the whole function.

## Refactor vs green-field

Plans for **refactors** can be very terse — the existing code carries most
of the context, the spec carries the rationale, the plan just points at
what changes. The 2026-05-27 renderer-interface-extraction plan is the
canonical example: 14 tasks, almost no code, because everything the
implementer needs is already in the repo.

Plans for **green-field features** legitimately need more contract surface,
because there's nothing to point at yet. The new module's public type, the
new test names, the new binary-format bytes — all of those go in the plan.
But still no implementation bodies.

## Tiny example

**Bloated (don't):**

```markdown
### Task 4: Add `getFalloffHalfMpc(code)` helper

- [ ] Write the failing test

\`\`\`ts
test('getFalloffHalfMpc returns the survey value', () => {
expect(getFalloffHalfMpc(SDSS_CODE)).toBe(1000);
});
\`\`\`

- [ ] Write minimal implementation

\`\`\`ts
export function getFalloffHalfMpc(code: number): number {
const entry = SOURCE_REGISTRY[code];
if (entry.type !== 'survey') throw new Error(...);
return entry.falloffHalfMpc;
}
\`\`\`
```

**Terse (do):**

```markdown
### Task 4: Add `getFalloffHalfMpc(code)` helper

**Files:** `src/data/sources.ts` (modify), `tests/data/sources.test.ts` (modify)

**Signature:** `getFalloffHalfMpc(code: SourceCode): number`
**Behaviour:** returns `falloffHalfMpc` for survey entries; throws for non-survey codes.

- [ ] Add the test `getFalloffHalfMpc returns the survey value` asserting SDSS → 1000.
- [ ] Add the test `getFalloffHalfMpc throws for synthetic codes` asserting the throw.
- [ ] Implement against the existing `SOURCE_REGISTRY` lookup pattern (see
      `getMaxDistMpc` at `sources.ts:142` for the shape).
- [ ] `npm test -- sources` → both new tests pass.
- [ ] Commit.
```

Same contract, one third the bytes, won't rot when `SOURCE_REGISTRY`'s
internal shape changes.

## Why this differs from the upstream skill

The upstream `writing-plans` skill targets a generic engineer "with zero
context for our codebase and questionable taste." Skymap's implementer is
usually a fresh subagent dispatched mid-session — they have the full repo,
the spec, and the conventions docs available, and the plan's job is to
_direct attention_, not _substitute for reading_. Pre-pasted code defeats
that: the subagent copies the snippet instead of reading the current file,
and inherits whatever staleness the plan-author baked in.

The upstream rule "complete code in every step" was right for its
audience. For skymap subagents it's the wrong default.
