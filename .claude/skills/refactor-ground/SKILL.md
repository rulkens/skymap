---
name: refactor-ground
description: Use when a feature substantial enough for a spec/plan has converged in brainstorming and the spec is about to be written — or standalone, when the user asks "I'm about to add X, what should move first?". Triggers like "/refactor-ground", "add <capability>" (a new source, layer, effect, POI category, tour primitive, settings group), or any ask where existing structure must grow to host new functionality. Skymap-specific; complements entanglement-radar (finds existing knots) — this asks whether the joints the feature needs exist at all.
---

# Refactor ground

## Overview

A feature-directed architecture-fit pass, run **after brainstorming converges and
before the spec is written**. The core test: a feature should land as **growth**
(additions at existing seams — a new row, a new file, a new variant) rather than a
**bolt-on** (a new branch on an existing discriminant, a mirror, a parallel path,
another entry in a hand-maintained list). The pass finds the delta between the diff
the feature _should_ have and the diff the current structure _forces_, and turns
that delta into ground preparation that lands first.

This is not the entanglement-radar: the radar finds _existing_ braids, but code can
be radar-clean and still lack the joint a feature needs (nothing is braided yet
because there was only ever one case). Decision ledger:
`docs/grill-sessions/refactor-ground-skill-2026-07-14.md`.

## When to use

- **Mandatory** for anything substantial enough to get a spec/plan. A plan must not
  be authored against a spec that lacks a "Ground preparation" section (filled, or
  explicitly "none needed — because X") — that's the plan-style gate.
- Standalone, conversationally: "I'm about to add X — what should move first?"
- **Not for:** small inline changes (the radar's diff-time triggers cover those),
  correctness bugs, or general knot audits with no feature in hand (use
  entanglement-radar).

## The method — the ideal-diff

1. **Data delta first.** Open the types, registries, formats, and store shapes the
   feature touches. Sketch what the feature _adds_ as data: new registry rows, new
   type-union variants, new format fields, new store shapes. Only then derive the
   module/file layout — in skymap it mostly follows from the data (a new source is
   a `SOURCE_REGISTRY` row first; store/renderer/UI shape follows from what kind of
   row it is). Data shapes are where prep is most load-bearing: a wrong shape
   propagates into the .bin format, stores, and shaders.
2. **Sketch the ideal diff.** Write the feature's diff as if the architecture were
   already right: "a row in X, one new file Y, a variant of Z." Explore subagents do
   the legwork — trace the call graph and every dispatch site before assuming blast
   radius; the main thread does the thinking and holds the dialogue.
3. **Verdict per touchpoint: growth or bolt-on.** Growth = an addition at an
   existing seam. Bolt-on = the current structure forces a special case: a second
   branch on a discriminant, a field only one case reads, a copied constant, edits
   at N dispatch sites, another hand-added term in a wake predicate or watcher list.
   Each bolt-on names a **missing joint**; the prep refactor is whatever creates
   that joint.
4. **The second-special-case trigger.** If the ideal diff would add the _second_
   hardcoded term/branch/entry anywhere, the prep is consolidating that seam — not
   adding a sibling. An existing special case is the trigger to un-braid, **never
   precedent to cite for adding another**.
5. **Prep = exactly the delta.** Only joints the ideal diff actually needs. Nothing
   speculative.

## The checkpoint (required output)

Present this to the user **before any spec text is written**. The output IS, in
order:

1. **Ideal shape** — a compact code-shaped sketch (~20–50 lines: registry rows,
   type deltas, file list), data delta first.
2. **Missing joints** — each with its growth/bolt-on verdict and the current
   blocker (`file:line`).
3. **Prep list** — the refactors that create the joints; each lands as its **own
   PR before the feature PR**.
4. **Adjacent findings** — knots seen but not required by the ideal diff. Default:
   a `docs/backlog/` detail file. The user may promote one to a separate cleanup PR
   — their call, at this checkpoint, never the agent's call mid-execution.
5. **The ask** — sign-off on the shape. When the shape has genuine decision
   branches, escalate to a `grill-me` session instead of a yes/no.

**The null result is first-class.** "Ground is ready — the feature lands as a row
in X plus one file, because those seams exist" is a complete, successful run: one
paragraph, still checkpointed. Do not manufacture prep to look thorough.

## After sign-off

- Write the spec **against the post-refactor architecture** as if it already
  existed; record the sketch + verdicts in a "Ground preparation" section.
- Escalate prep to its own spec/plan when it is independently valuable,
  independently testable, and gates other features too.
- Prep executes per normal delegation rules, own PR(s), before the feature PR.
  Prep, adjacent cleanup, and feature are **three different diffs** — never
  conflated.

## Rationalizations

| Excuse                                                              | Reality                                                                                                                                                                                                          |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "User is in a hurry — go straight to implementation"                | The sketch is 20 lines and minutes of work; a wrong shape costs a re-spec and a bolt-on PR. Time pressure is exactly when bolt-ons happen.                                                                       |
| "The seams already exist, so skip the checkpoint"                   | Then the checkpoint is one paragraph saying so, with the reason. Say it and get the nod.                                                                                                                         |
| "It's just one small field / one more term"                         | The second special-case term IS the consolidation trigger (#7 in simplicity.md). Smallness is how hand-maintained lists grow.                                                                                    |
| "There's already a special case doing this — I'll mirror it"        | Existing bolt-ons are triggers to un-braid, not precedent. Mirroring one is adding the second branch.                                                                                                            |
| "I'll note the refactor in the plan for later"                      | Later = never, and the spec would be written against the wrong shape. Prep lands first.                                                                                                                          |
| "The prep is only ~15 lines — offer to fold it into the feature PR" | Don't volunteer conflation. A refactor PR that also adds behaviour hides the strand being pulled (simplicity.md), regardless of size. Present prep as its own PR; if the user wants them merged, they'll say so. |
| "This adjacent cleanup is right there, fold it in"                  | Backlog by default, or its own cleanup PR if the user promotes it. Never folded into prep or feature diffs.                                                                                                      |

## Red flags — STOP

- You're writing spec or implementation steps and no ideal-shape sketch exists.
- Your approach cites an existing special case as precedent for adding a sibling.
- You're about to hand-edit a wake predicate, watcher list, or dispatch chain to
  add the feature's entry.
- The user hasn't seen the shape and you're about to lock it into a spec.

## Common mistakes

| Mistake                                                     | Fix                                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Running the radar over the blast radius and calling it done | Radar finds existing knots; this pass asks whether the joints the feature needs exist. Run the ideal-diff. |
| Prep scope ballooning into a cleanup crusade                | Prep = only what the ideal diff needs; the rest is backlog or a user-promoted cleanup PR.                  |
| Prose architecture musings at the checkpoint                | The sketch is code-shaped (rows, types, file list) — per "design in code, lighter loop".                   |
| Treating "no prep needed" as a failed run                   | It's a valid, honest outcome — the most common one in a healthy codebase.                                  |
