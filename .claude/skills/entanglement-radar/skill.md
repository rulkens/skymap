---
name: entanglement-radar
description: Use when reviewing a diff, file, or module for simplicity — before or after a refactor, or when concerns feel tangled and you want the complecting named precisely rather than as vibes. Also at DESIGN time, over a spec or plan you're writing, the moment a section exists to teach careful handling of an "asymmetry" / "subtlety" / "special-case" / "must-remember-to". Triggers like "is this complected / too complex", "simplicity review", "/entanglement-radar", a second branch on the same discriminant, a duplicated constant, a renderer mirroring EngineState, or a state field written by one path but read-for-truth by another. Skymap-specific; complements /code-review (correctness) and /simplify (applies fixes).
---

# Entanglement radar

## Overview

Review a target through one lens: **what is complected** — two things that could
vary independently, braided together. Complexity _is_ that braiding; the radar's job
is to _see_ it, name the two strands, and propose the un-braided shape. Vocabulary and
rationale live in `docs/superpowers/conventions/simplicity.md` (Rich Hickey, _Simple
Made Easy_, applied to skymap).

This is a **review**, not a rewrite. It finds and names knots; `/simplify` (or an
explicit ask) applies the fix.

## When to use

- Before merging a refactor, or after one, to check it actually un-braided something.
- A diff / file / module "feels complex" and you want the complecting named, not vibed.
- "Is this complected?", "simplicity review", "/entanglement-radar".
- Proactively when you're about to add a _second_ branch on a discriminant, a _second_
  copy of a constant, or mirror state a renderer already gets from `EngineState`.
- **At design time, not just on diffs.** The moment you catch yourself _writing_ a spec/plan
  section to teach how to handle an "asymmetry" / "the subtlety" / "special-case" /
  "must remember to" — stop and run the lens on it. Prose that explains how to _cope with_ a
  non-uniformity is a STOP-and-un-braid signal: documenting a knot well is not removing it,
  and it's never cheaper to un-braid than before the plan locks it in. Classify the
  difference **essential** (any reasonable implementation of the domain has it — e.g.
  famousGalaxy has no ring) vs **accidental** (an artifact of how state is stored — e.g.
  visibility kept as fade opacity); un-braid the accidental, document only the essential.

**Not for:** correctness bugs (use `/code-review`), or applying cleanups (use `/simplify`).

## The lens

For each unit under review, scan for these braids. Each row: the smell → the two strands
braided → the skymap-preferred un-braided shape.

| Smell                                                                              | Braided strands                               | Un-braided shape                                                                             |
| ---------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A mutable field read like a value; "ask twice, get two answers"                    | value × time                                  | value default; functional interface (same in → same out) over a thin mutable shell           |
| A renderer / subsystem caches what `EngineState` owns                              | value × place (mirror state)                  | read the authoritative home; no mirror (`renderers.md`)                                      |
| Same fact in two places — constants, defaults, doc vs code, TS vs WESL             | the two copies                                | one canonical home + a parity test                                                           |
| `switch` / `if` on a discriminant, especially the 2nd+ branch                      | many who/what pairs in one closed place       | registry row / discriminated union (exhaustive)                                              |
| Information wrapped in a class / method                                            | logic × representation                        | plain data — record / map / set; `type` not `interface`                                      |
| Caller must orchestrate a multi-step setup / teardown                              | _what_ × _how_ (spec leaks impl)              | one entry point that applies internally; smaller interface; inject deps                      |
| A calls B directly across a stage boundary                                         | when / where coupling                         | put a queue between them                                                                     |
| Big interface / god-object / presentation-role name over a data store              | several jobs jammed together                  | split into more, smaller units (_what_ vs _how_, per ADR 0005)                               |
| "Separate files" that presume each other's internals / magic returns               | hidden coupling behind modularity             | depend on abstractions + values only; verify no "never returns 17" assumptions               |
| Terser construct, harder-to-change artifact                                        | authoring × outcome                           | judge the runtime artifact, not the keystrokes                                               |
| A state field written by one path but read-for-truth by a _different_ one          | value × place (a dead / shadow mirror)        | name the single reader and single writer; make them agree, or fold to one home               |
| A spec/plan section teaching how to handle an asymmetry / exception / special-case | accidental complexity × its own documentation | classify essential vs accidental; un-braid the accidental at design time — don't document it |

Then run the checklist in `simplicity.md` ("Entanglement-radar checklist").

## Procedure

1. **Scope.** Default target = the branch diff (`git diff main...HEAD`). Or a named
   file / module. Or a **spec / plan at design time** — the cheapest moment to un-braid,
   before the shape is locked into code. For "audit module X / the codebase," fan out
   read-only reviewers per subsystem and merge — **REQUIRED:** superpowers:dispatching-parallel-agents.
2. **Run the lens** over each unit; ask the checklist questions.
3. **Cross-check the known knots** — `simplicity.md` "Known entanglements", `renderers.md`
   "Known outliers", the ADRs. Reference an in-flight knot; don't re-report it as new.
4. **Triage:** keep _real knots_ (two independent strands braided + a concrete cost);
   drop _taste_ (names, formatting, ordering preference).
5. **Report** (below). Don't edit code.

## Report format

Per finding:

- **Where** — `file:line`.
- **The braid** — the two strands that are tangled (be specific, not "this is complex").
- **The cost** — what you can't now change independently, or the bug-class it invites
  (e.g. "defaults drift", "wrong galaxy highlights", "forgotten setter → stale mirror").
- **Un-braided shape** — the skymap-preferred replacement from the lens table.
- **Confidence + effort** — high / med / low; small / medium / large.

Rank by leverage — a root-cause braid that dissolves several symptoms ranks first. End
with what's _already clean_, and remember: **"no significant complecting found" is a
valid, honest result.** Don't manufacture findings to look thorough.

## Common mistakes

| Mistake                                                                              | Fix                                                                                                                                                                             |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stopping at DRY — reporting duplicated literals / teardown, missing the deeper braid | DRY is one row. Also check value × place (mirror state) and _what_ × _how_ (API makes the caller orchestrate).                                                                  |
| "This is complex" with no named strands                                              | Name the two things and why they could be independent. Unnamed = taste.                                                                                                         |
| Flagging names / formatting / ordering                                               | That's not complecting. Drop it.                                                                                                                                                |
| Rewriting the code                                                                   | This skill reviews. Hand fixes to `/simplify`, or ask first.                                                                                                                    |
| Re-reporting a documented in-flight knot as new                                      | Reference it (ADR / outlier) and move on.                                                                                                                                       |
| Padding the list to look thorough                                                    | Fewer real knots > many weak ones. "None found" is fine.                                                                                                                        |
| Documenting an asymmetry instead of removing it                                      | "The subtlety / special-case / must-remember-to" is a STOP-and-un-braid trigger, not a note to write more carefully. Classify essential vs accidental; un-braid the accidental. |

## Why this exists

A default "review for simplicity" reliably catches duplication and doc/code drift — and
reliably _misses_ value-as-place (mirror state) and _what_/_how_ leaks, and doesn't speak
the project's vocabulary. This skill supplies the missing lenses and ties findings to
`simplicity.md`, `renderers.md`, and the ADRs.
