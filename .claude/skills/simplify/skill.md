---
name: simplify
description: Use when applying a simplicity fix in skymap — taking a complecting knot named by /entanglement-radar (or one you spot) and actually un-braiding it in the code, keeping the suite green. Triggers like "/simplify", "apply the un-braiding", "decomplect this", "fix the mirror state", "consolidate these branches into a registry", or any follow-through after an entanglement-radar review where the next step is to change the code, not just describe it. Skymap-specific; complements /entanglement-radar (names knots) and /code-review (correctness). Scoped to one coherent un-braiding per run, applied on a branch.
---

# Simplify

## Overview

The applier half of the simplicity pair. `/entanglement-radar` _names_ a knot (two
strands braided + the un-braided shape); `/code-review` finds _correctness_ bugs; this
skill _applies_ one un-braiding, in skymap's idiom, leaving the suite green. The
vocabulary and the un-braided shapes live in
`docs/superpowers/conventions/simplicity.md` (Rich Hickey, _Simple Made Easy_, applied to
skymap) and `docs/superpowers/conventions/renderers.md` — this skill is the _how_, those
are the _what_.

The unit of work is **one coherent un-braiding** — a single root-cause braid and the
symptoms it dissolves. That can be one duplicated constant, or a shared abstraction that
pulls several related knots apart at once: the radar ranks findings so the root-cause braid
that dissolves several symptoms sits on top, and that whole cluster is one job. What stays
_out_ of the diff is two things — _unrelated_ knots grabbed "while I'm in here", and any
_behaviour_ change (a de-complecting that also adds behaviour hides the strand you were
pulling). Each coherent un-braiding lands as its own branch + PR; if it sprawls past what
one sitting can review, that's the signal to split it, not a rule against scope.

## When to use

- Right after an `/entanglement-radar` review, to act on a named finding.
- "/simplify", "apply the un-braiding", "decomplect this", "consolidate these into a
  registry", "kill the mirror state".
- You spotted a real braid mid-task and want it pulled apart cleanly rather than worked
  around.

**Not for:** correctness bugs (use `/code-review`), naming/formatting/ordering tidy-ups
(that's taste, not complecting), or grab-bag refactors that sweep up _unrelated_ knots
(keep a run to one coherent un-braiding — related strands together, unrelated ones not).

## Input

Either is fine — the skill adapts:

- **A named finding** (the common case) — a `Where / braid / cost / un-braided shape`
  block from an `/entanglement-radar` report, this session's rundown, or
  `simplicity.md`'s "Known entanglements". Take it as the spec; don't re-derive it.
- **A target** (a diff, file, or module, default `git diff main...HEAD`) — run the lens
  from `entanglement-radar`'s skill / `simplicity.md`, pick the **single highest-leverage
  real knot**, and state it before touching code. If there's no real braid, say so and
  stop — "nothing to simplify" is an honest result, not a failure.

## Procedure

1. **Scope the un-braiding.** Name the two strands, the cost, and the un-braided shape from
   the lens table — in one or two sentences — so the fix is anchored to a strand, not vibed.
   This is the "label everything" step from `simplicity.md`; naming the strands is most of
   the work. If the finding is a root-cause braid with several symptoms (e.g. one shared
   abstraction replacing two duplicated walks), scope the run to that whole cluster — they
   share one un-braided shape, so they're one job, not several.
2. **Branch first.** Every change ships on a feature branch via PR — never edit on `main`,
   one-liners included.
3. **Trace before editing.** Follow the actual call graph of what depends on the strand
   you're pulling; verify the blast radius rather than assuming it. A "this only touches
   one file" guess is how a mirror reappears somewhere you didn't look.
4. **Apply the un-braided shape, in project idiom.** The replacement should read like the
   surrounding code:
   - registry row / discriminated union over a second `switch`/`if` branch on the same
     discriminant (the second branch _is_ the signal to consolidate);
   - one canonical home for a duplicated constant/encoding — and if two layers must agree
     (TS↔WESL, doc↔code), the parity test ships _with_ the fix, not later;
   - read the authoritative home instead of a mirror; no renderer/subsystem caching what
     `EngineState` owns;
   - `type` not `interface`; `Vec2`/`Vec3`, never raw tuples; one type per `@types` file;
     named-bag factory args, not positional;
   - values over places — `readonly`, pure functions, copy-on-write; concentrate any
     mutation into the smallest shell and comment the carve-out.
5. **Escalate, don't hack.** If a clean de-complecting is blocked by something structural
   (a load-bearing shared buffer, a bootstrap ordering constraint), **stop and surface
   it** — propose the larger move or an ADR. Re-braiding around the block to "finish" is
   the one outcome worse than leaving the knot.
6. **Keep it green.** Run `npm test` and `npm run typecheck`. The fix isn't done until both
   pass; a parity test added in step 4 counts here. `prettier` only the files you touched
   (a repo-wide format rewrites hundreds of unrelated files).
7. **Re-run the lens on your own diff.** Before calling it done, point the
   `entanglement-radar` lens at what you just wrote — a fix that introduces a new mirror or
   a new copy of a constant is common and easy to miss from the inside.
8. **Tidy the strands you touched, then close out.** Bring the comments in edited files to
   current state (timeless and terse — describe what is, not the journey); don't gold-plate
   neighbouring knots. If you cleared a knot that `simplicity.md`'s "Known entanglements"
   or `renderers.md`'s "Known outliers" lists, tick it off there in the same PR. Then open
   the PR (`gh pr create`, squash-merge).

## Common mistakes

| Mistake                                                          | Fix                                                                                                  |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Bundling _unrelated_ knots "while I'm in here"                   | Related strands that share an un-braided shape belong together; _unrelated_ ones hide the refactor — split those out. |
| Fixing a correctness bug you tripped over                        | That's `/code-review`'s job. Surface it; don't fold it into the refactor's diff.                    |
| Consolidating a constant but skipping the parity test            | The test is what _keeps_ the single home single. Without it you've just moved the drift, not killed it. |
| Replacing a mirror with a read, but leaving a second mirror      | Re-run the lens on your own diff (step 7); mirror state travels in pairs.                            |
| Hacking around a structural block to land the change             | Escalate (step 5). A re-braid that ships is worse than a knot that's documented.                     |
| Manufacturing a refactor because the skill was invoked           | "Nothing to simplify" is valid. Don't pull a strand that isn't braided.                              |

## Why this exists

`entanglement-radar` reliably names knots and then stops — by design. The built-in
`/simplify` applies generic reuse/efficiency cleanups but doesn't speak skymap's
vocabulary, doesn't know the un-braided shapes in `simplicity.md` / `renderers.md` / the
ADRs, and won't enforce the one-knot-per-PR discipline that keeps a de-complecting
reviewable. This skill closes that loop: it turns a named braid into a green, single-strand
PR in the project's own terms.
