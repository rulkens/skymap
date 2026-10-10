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
3. **Greenfield cross-check (adversarial).** The sketch's blind spot is inherited
   shape: an existing type quietly treated as a constraint, then "extended
   compatibly" — the sketcher cannot self-audit this, because the incumbent shape
   is in their context. So hand a fresh subagent ONLY the feature's data
   requirements — never the incumbent types — and have it derive the shapes
   greenfield. Diff its answer against the sketch. Each divergence is either a
   real constraint the sketch is defending (a paying external contract, a
   migration cost, a cache-skew window — name it and its price) or inherited
   shape masquerading as one. No divergence is resolved silently: real
   constraints become priced option pairs at the checkpoint (item 2 below); the
   rest reshape the sketch before verdicts are issued.
4. **Verdict per touchpoint: growth or bolt-on.** Growth = an addition at an
   existing seam. Bolt-on = the current structure forces a special case: a second
   branch on a discriminant, a field only one case reads, a copied constant, edits
   at N dispatch sites, another hand-added term in a wake predicate or watcher list.
   Each bolt-on names a **missing joint**; the prep refactor is whatever creates
   that joint.
5. **The second-special-case trigger.** If the ideal diff would add the _second_
   hardcoded term/branch/entry anywhere, the prep is consolidating that seam — not
   adding a sibling. An existing special case is the trigger to un-braid, **never
   precedent to cite for adding another**.
6. **Prep = exactly the delta.** Only joints the ideal diff actually needs. Nothing
   speculative.

## The checkpoint (required output)

Present this to the user **before any spec text is written**. It has three
parts: a page to read, one set of questions, and a few lines of text.

### 1. The ground-check page

With the claude-dash tools available, the checkpoint is a `show_sketch` page.
Copy `checkpoint.html` (beside this file) to your scratchpad, replace its
content, and show it with `width: "wide"`. Keep its structure and styles: the
template is the design, and its opening comment says what goes where. The page
shows the main points at rest and opens to the detail, so nothing below is a
reason to shorten what you found.

- **Headline.** The feature, and one sentence: how many touchpoints would be
  special cases today, how many prep commits create the joints, how many
  contracts change.
- **Contracts that change**, breaking ones first — the ideal shape, data delta
  first, one block per contract. At rest: its name, the kind of change, its
  reach as a counted number, and the real before/after lines. Opened:
  - **Why** — three steps: what the feature needs, what the code allows
    today, so what changes.
  - **Defined in** — the `file:line`.
  - **Who is affected** — who writes it and who reads it, grouped (by folder
    or role), each group opening to its files. Mark the files that special-case
    one value: those are the existing bolt-ons.
  - **How it is used** — the usage patterns, each opening to one real line.
  - **Weighed** — cost, what is deliberately left alone, and the alternative
    that was rejected with its reason. All three, always: "none recorded" is
    not an answer, "the greenfield cross-check proposed no other shape" is.
- **Prep, in order** — one row per prep commit with the bolt-on it removes;
  each row opens to the blockers (`file:line`) that force the special case
  today. Each prep is its **own diff, sequenced before the feature commits**.
- **Growth, in one line** — the touchpoints that land as plain additions.

Rules for the page:

- **Real code only.** Lines are copied from the files with their line numbers.
  An "after" line that does not exist yet is your proposal and is the only
  thing you may write yourself.
- **Every reference opens.** Give each file reference
  `data-ref="<repo-relative path>:<line>"`; a click opens it in the user's
  editor. The user reads these pages to learn the structure — a name without a
  path teaches nothing.
- **Counts come from a search**, and the page says which one. Never estimate
  a blast radius.
- **Colour means one thing each**: red/green are removed/added lines, the
  accent is "you can open this", amber is the one exception named under the
  list. Add no others.

### 2. The questions — one `ask_user` call

- **Shape options under compatibility tension.** Wherever the greenfield
  cross-check's shape and a compatibility-preserving shape diverge, ask a
  `choice`: both shapes, each priced in its label or `why` (what the break
  costs: migration, re-bake, cache-skew window, external readers; what compat
  carries: the extra concept or asymmetry, and for how long). Recommend one.
  The user prices the break; backward compatibility is never a silent default.
  "No tension found — greenfield and sketch agree" is the null form: say it in
  the text, ask nothing.
- **Sign-off** on the shape.
- **PR packaging**: "prep as separate PR(s), or everything on one PR?" Ask it
  every time — there is no default (`feedback_prep_rides_same_pr_ask`).

When the shape has genuine decision branches, escalate to a `grill-me` session
instead.

### 3. The text

A `> [!TLDR]` with the headline sentence, then at most a few lines: anything
the page cannot carry, and **adjacent findings** — knots seen but not required
by the ideal diff. Default: a `docs/backlog/` detail file. The user may promote
one to a separate cleanup PR — their call, at this checkpoint, never the
agent's call mid-execution. End with one line saying the questions are in the
dash. Do not repeat the page in prose.

### Without the dash

No `show_sketch`: write the same content as markdown, in the same order — the
TL;DR, then per contract a heading, one ```diff block of the real before/after
with its `file:line`, and the Why / Who is affected / Weighed lines as a short
list; then the prep list as a table; then the questions as a numbered list.

**The null result is first-class.** "Ground is ready — the feature lands as a row
in X plus one file, because those seams exist" is a complete, successful run: one
paragraph of text and the sign-off question, no page. Do not manufacture prep to
look thorough.

## After sign-off

- Write the spec **against the post-refactor architecture** as if it already
  existed; record the sketch + verdicts in a "Ground preparation" section.
- Escalate prep to its own spec/plan when it is independently valuable,
  independently testable, and gates other features too.
- Prep executes per normal delegation rules, sequenced before the feature
  commits, packaged per the user's checkpoint answer (separate PR(s) or one
  PR). Prep, adjacent cleanup, and feature are **three different diffs** —
  never conflated, whatever PR they ride.
- When prep ships as its own branch, the prep session reports `prep: true` to
  `session_progress` and the feature session reports
  `dependsOn: [{ branch: "<local branch>" }]` (add `pr` once it's open).
  Landing stays the user's move; the dash only notices when the prep has landed.

## Rationalizations

| Excuse                                                              | Reality                                                                                                                                                                                                          |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "User is in a hurry — go straight to implementation"                | The sketch is 20 lines and minutes of work; a wrong shape costs a re-spec and a bolt-on PR. Time pressure is exactly when bolt-ons happen.                                                                       |
| "The seams already exist, so skip the checkpoint"                   | Then the checkpoint is one paragraph saying so, with the reason. Say it and get the nod.                                                                                                                         |
| "It's just one small field / one more term"                         | The second special-case term IS the consolidation trigger (#7 in simplicity.md). Smallness is how hand-maintained lists grow.                                                                                    |
| "There's already a special case doing this — I'll mirror it"        | Existing bolt-ons are triggers to un-braid, not precedent. Mirroring one is adding the second branch.                                                                                                            |
| "I'll note the refactor in the plan for later"                      | Later = never, and the spec would be written against the wrong shape. Prep lands first.                                                                                                                          |
| "The prep is only ~15 lines — just fold it into the feature commit"| Don't conflate diffs. A refactor commit that also adds behaviour hides the strand being pulled (simplicity.md), regardless of size. Keep prep its own commit(s); PR packaging is the user's checkpoint call, not yours in either direction. |
| "This adjacent cleanup is right there, fold it in"                  | Backlog by default, or its own cleanup PR if the user promotes it. Never folded into prep or feature diffs.                                                                                                      |
| "The shape is deployed/persisted — extend it compatibly"            | Deployment is a cost input, not a decision. Run the greenfield cross-check, present both shapes priced (checkpoint item 2); the user chooses which cost to pay.                                                  |
| "The cross-check will just re-derive what I sketched — skip it"     | The sketcher can't see their own inherited-shape concessions; that's the whole reason the check is a fresh subagent. Agreement is cheap to confirm and is the checkpoint's null form.                            |

## Red flags — STOP

- You're writing spec or implementation steps and no ideal-shape sketch exists.
- Your approach cites an existing special case as precedent for adding a sibling.
- You're about to hand-edit a wake predicate, watcher list, or dispatch chain to
  add the feature's entry.
- The user hasn't seen the shape and you're about to lock it into a spec.
- Your sketch preserves an existing type/format/API shape (an optional field, a
  parallel map, a `deeper?`-style extension beside an incumbent) and the
  checkpoint doesn't present the greenfield alternative beside it, priced.

## Common mistakes

| Mistake                                                     | Fix                                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Running the radar over the blast radius and calling it done | Radar finds existing knots; this pass asks whether the joints the feature needs exist. Run the ideal-diff. |
| Prep scope ballooning into a cleanup crusade                | Prep = only what the ideal diff needs; the rest is backlog or a user-promoted cleanup PR.                  |
| Prose architecture musings at the checkpoint                | The page is code-shaped (real before/after lines, files, counts) — per "design in code, lighter loop".     |
| Restyling the page, or adding a diagram of your own         | Fill the template. Its layout was designed and checked; a restyled page is how checkpoints became noise.   |
| A file name without a path, or a count without a search     | Every reference carries `data-ref`; every number says how it was counted.                                  |
| Treating "no prep needed" as a failed run                   | It's a valid, honest outcome — the most common one in a healthy codebase.                                  |
