# Grill Session: `refactor-ground` skill — 2026-07-14

Source: conversation — the user wants to encode their manual pre-feature habit ("before
implementing new functionality, look at the current data structure and determine what needs
to be refactored so the architecture _grows_ to support the feature, rather than bolting the
feature on") as a skill, so the process survives agent-driven development without sprawl,
cruft accumulation, or slop.

Context established before Q1: `entanglement-radar` already covers part of this territory
(design-time review of specs/plans, asymmetry-language STOP signal) and `simplicity.md`
already prescribes "land de-complecting as its own small PRs." The gap: a **feature-directed**
pass over the _existing_ code — "given feature F, where does the current structure resist it,
and what must be reshaped so F lands as growth rather than a bolt-on?" The radar finds
existing knots; this asks whether the extension points the feature needs exist at all — code
can be radar-clean and still lack the right joints.

---

## Q1: Skill, planning-flow step, or radar mode?

**The question:** Should this process be (a) a new standalone skill, (b) a mandatory step
baked into the existing planning flow (brainstorming/writing-plans), or (c) a new mode of
entanglement-radar? Everything else hangs off this.

**Considerations:**

- **Option A (standalone skill):** The input differs from the radar's (feature intent +
  current code, not a diff or spec text) and the output differs (prep refactors with a landing
  order, not knot findings). Standalone stays invocable for ad-hoc "I'm about to add X, what
  should move first?" conversations — the user's actual manual habit. Can still be _mandated_
  by a one-line addition to conventions, same pattern as entanglement-radar.
- **Option B (baked into planning flow):** Guarantees it runs, but hides it — not invocable
  standalone, and braids two skills that vary independently.
- **Option C (radar mode):** Folds two different lenses (existing-knot audit vs
  feature-directed fit assessment) into one skill — itself a complecting.

**Decision:** Option A — standalone skill, referenced by the planning conventions as a
required gate. User: "i think i agree. it needs to fold nicely into my workflow."

## Q2: Where in the lifecycle does it run?

**The question:** The flow is brainstorming → spec → plan → execution → /feature-done. At
which point does this skill run? This determines what state its inputs are in.

**Considerations:**

- **Option A (during brainstorming):** Too early — the feature is still shape-shifting;
  analysis would be redone.
- **Option B (after brainstorming converges, before the spec is finalized):** The
  architecture assessment can _change the design_, so it must run before the spec locks in.
  The spec is then written against the post-refactor architecture as if it already existed.
- **Option C (after spec, before plan):** The spec was written blind to the refactor and
  would need retrofitting.
- **Option D (first phase inside the feature plan):** Worst — the plan has already committed
  to a shape.

**Decision:** Option B. Running later quietly encodes the bolt-on into the spec.

## Q3: Where does the output live?

**The question:** When the pass finds refactors that must precede the feature, what artifact
carries them?

**Considerations:**

- **Option A (conversation-only):** Evaporates — weeks later, fresh subagents executing the
  plan can't see why the spec assumes a structure that doesn't exist yet.
- **Option B (a "Ground preparation" section in the feature's spec):** Keeps the prep in the
  feature's context, where most prep (a registry extraction, a type tag, a store split) makes
  sense.
- **Option C (standalone prep spec/plan for everything):** Over-segments the common case.
- **Option D (size-dependent — B default, escalate to C):** Sometimes the assessment
  discovers the prep _is_ the project (cf. the disk-planner walk unification gating the
  impostor-LOD spec). Escalation threshold: the prep is independently valuable, independently
  testable, and gates other features too — then it becomes its own spec/plan.

**Decision:** Option D with B as the default. Confirmed consequence: prep refactors **land as
their own PR(s) before the feature PR** (per simplicity.md — "a refactor PR that also adds
behaviour hides the strand you were pulling"); the spec section is where they're _described_,
not a license to mix them into the feature diff.

## Q4: When is running it mandatory?

**The question:** Every change, substantial features only, or discretionary?

**Considerations:**

- **Option A (every feature, any size):** A tax that breeds resentment and skipping. Small
  changes are already guarded by entanglement-radar's proactive triggers at diff time.
- **Option B (anything substantial enough to get a spec/plan):** Matches the existing
  threshold; unconditional for real features, which is how the user's manual habit works.
  Sustainable only with the radar's honesty rule: "the architecture already has the right
  joints" is a valid, cheap outcome — the skill must not manufacture prep work to look
  thorough.
- **Option C (only when someone smells resistance):** How architecture erodes — the failure
  mode being encoded against is exactly that resistance isn't smelled until the bolt-on is
  merged.

**Decision:** Option B. The spec template gains a "Ground preparation" section that is either
filled in or explicitly says "none needed — current structure supports this because X."

## Q5: The core analytical move

**The question:** What does the pass actually _do_? This is the heart of the skill.

**Considerations:**

- **Option A (radar scoped to blast radius):** Subtly wrong — the radar finds _existing_
  braids, but code can be radar-clean and still lack the joints the feature needs (nothing is
  braided yet because there was only ever one case). Also invites unbounded pre-cleaning:
  not every knot in the blast radius gates this feature.
- **Option B (ideal-shape diff):** First sketch what the feature's diff _should_ look like if
  the architecture were already right ("a new row in X, a new file in Y, a new variant of
  Z"), then diff that ideal against the current structure. Every place the real diff would
  instead be a new branch / mirror / special-case / parallel path names a missing joint; the
  prep refactor is whatever creates that joint. Generalizes the codebase's strongest
  precedents ("a new source is a row, not a branch in N switches"; DESI_PATCHES as extension
  point; "the second hardcoded branch means consolidate") into a test: **growth = the feature
  lands as additions to existing seams; bolt-on = the feature must create parallel structure
  or edit many dispatch sites.** Built-in YAGNI guard: only refactor what the ideal diff
  requires.
- **Option C (freeform architectural meditation):** What the user does in their head, but it
  doesn't transfer to an agent — B is the encodable version.

**Decision:** Option B, with the radar as a subordinate tool, not the method.

## Q6: Checkpoint with the user

**The question:** Does the skill require presenting the ideal-shape sketch for sign-off
before spec writing, or can it run autonomously with review at spec time?

**Considerations:**

- **Option A (mandatory checkpoint):** The ideal shape _is_ the architecture decision — it
  determines both the prep refactors and the shape the spec assumes. Wrong here = everything
  downstream wrong; this is the cheapest moment for the user's judgment to enter (the whole
  premise of Q2). Reproduces the user's look-then-decide loop with the user in the decide
  seat. Cost is low: per the "design in code, lighter loop" convention, the artifact is a
  ~20–50-line code-shaped sketch, not prose.
- **Option B (autonomous, review at spec time):** Catching a wrong shape at spec review means
  redoing the spec.

**Decision:** Option A, with a user amendment: the checkpoint has **two intensities** — a
simple sketch + yes/no for the common case, escalating to a full `grill-me` invocation when
the ideal shape has genuine decision branches and shared understanding needs to be _built_,
not just confirmed.

## Q7: Scope guard for non-gating findings

**The question:** The pass will surface problems the ideal diff doesn't strictly require —
real knots in the blast radius, adjacent cruft, tempting generalizations. What's the rule?

**Considerations:**

- **Option A (hard line — prep = only the ideal-diff delta; everything else to backlog, no
  exceptions):** Exploits the objective scope boundary the ideal diff provides, but too
  rigid.
- **Option B (judgment call at the checkpoint):** Locates the judgment with the user, at the
  moment it's cheap.
- **Option C (include "nearby" knots if cheap while in there):** Initially framed by Claude
  as the slop generator; the user corrected this — adjacent strand-pulling is legitimate and
  sometimes necessary work. The real discipline is **non-conflation**, not prohibition.

**Decision:** Option B. At the checkpoint, adjacent findings **default to backlog** (a
`docs/backlog/` detail file) to keep focus on the important work and avoid the
down-the-stack rabbit hole; when a strand genuinely needs pulling now, it **branches off as
its own cleanup PR(s)** — never conflated with the prep-for-feature refactors or the feature
diff.

## Q8: Who executes the analysis?

**The question:** The delegation conventions are strict (main thread never hand-edits during
execution; plan-writing delegated; implementers in background). Who runs the ideal-shape
pass?

**Considerations:**

- **Option A (main thread analyzes + holds the checkpoint dialogue; Explore subagents do the
  legwork):** The ideal-shape judgment is the design thinking the "think before coding" /
  "design in code" feedback wants in the main loop with the user — highest-leverage,
  lowest-token step in the lifecycle, feeding directly into a dialogue. Explore subagents
  trace call graphs and confirm blast radius ("trace the call graph before assuming blast
  radius").
- **Option B (delegate the whole pass, relay the sketch):** Severs the dialogue from the
  analysis that produced it.
- **Option C (split: main thread sketches ideal, subagent maps current, main thread diffs):**
  Unnecessary ceremony over A.

**Decision:** Option A. Downstream unchanged: once prep scope is agreed, prep _execution_ is
delegated per existing rules (background implementers; main thread runs tests + commits).

## Q9: Name

**The question:** The name sets the vocabulary for conventions, spec sections, and future
conversations.

**Considerations:**

- **Option A (`prepare-the-ground`):** Claude's recommendation — names the outcome, pairs
  with the spec section.
- **Option B (`grow-the-architecture`):** Abstract as a command.
- **Option C (`ideal-diff`):** Names the method; opaque until you know the trick. Kept as the
  name of the _technique inside_ the skill.
- **Option D (`make-the-change-easy`):** Kent Beck's phrase, but describes the whole
  two-step dance; this skill is only step one.
- **Option E (`refactor-ground`, user's proposal):** Terse, imperative-readable ("refactor
  the ground before building"), keeps the growth metaphor, honestly names the activity.
  Claude's pushback: a name containing "refactor" nudges toward manufacturing one, whereas
  the honest null result is a first-class outcome — resolved by encoding null-result honesty
  in the skill text, not the name.

**Decision:** Option E — **`refactor-ground`**, with the spec section named "Ground
preparation."

## Q10: Enforcement wiring

**The question:** Where does the mandate live so the skill actually fires every time instead
of relying on memory? (The lesson already learned with entanglement-radar: a convention
bullet alone decays.)

**Considerations:**

- **Option A (CLAUDE.md bullet only):** Decays.
- **Option B (A + handoff lines in the brainstorming→spec flow and plan-style.md):** Fires at
  the moments an agent is writing a spec or plan.
- **Option C (B + "Ground preparation" section required, checked by /feature-done):**
  Claude's initial recommendation. User pushback: **the feature-done audit runs at the end —
  failing there is too late**; the bolt-on would already be built.
- **Option C′ (B + gate at plan-writing time):** `plan-style.md` / the plan-writing flow
  gains the precondition that _a plan may not be authored against a spec lacking a Ground
  preparation section_ (filled, or explicitly "none needed"). Fires before any code exists,
  at the moment an agent is mechanically reading the spec anyway. A one-line `/feature-done`
  backstop retained for defense-in-depth.

**Decision:** Option C′ — the load-bearing gate is at plan authoring; CLAUDE.md bullet points
brainstorming → `/refactor-ground`; feature-done keeps a backstop line.

## Q11: Data-first analysis ordering

**The question:** The user's original phrasing was specific: "I look at the current **data
structure**." Should the skill mandate data-model-before-code-layout ordering?

**Considerations:**

- **Option A (data-first):** The ideal-shape sketch _starts_ with the data delta — new types,
  registry rows, format fields, store shapes, and whether existing data shapes accommodate
  them — then derives the module/file layout, which in skymap mostly follows from the data (a
  new source is a registry row first; the store/renderer/UI shape follows mechanically from
  what kind of row it is). Matches simplicity.md #4 ("data is simple"). Gives a fresh agent a
  concrete first move: "open the types and registries the feature touches." Data-shape
  changes are where prep is most load-bearing (a wrong shape propagates into the .bin format,
  stores, and shaders) — so the checkpoint sketch leads with the data delta, which is also
  the part the user is best positioned to veto.
- **Option B (no ordering):** "Consider the architecture" is not actionable.

**Decision:** Option A.

---

## Resolved shape (summary)

1. Standalone skill **`refactor-ground`**, mandated by conventions.
2. Runs **after brainstorming converges, before the spec is finalized**; the spec is written
   against the post-refactor architecture.
3. Output = **"Ground preparation" section in the spec** by default; escalates to its own
   spec/plan when independently valuable/testable/gating; prep lands as **own PR(s) before
   the feature PR**.
4. Trigger = **anything substantial enough for a spec/plan**; "no prep needed — because X"
   is a first-class outcome.
5. Core move = **the ideal-diff**: sketch the feature's diff as if the architecture were
   already right; every forced branch/mirror/parallel path names a missing joint; prep = the
   delta. Growth = additions to existing seams; bolt-on = parallel structure or many edited
   dispatch sites.
6. **Mandatory checkpoint** on a compact code-shaped sketch before spec writing; escalate to
   `grill-me` when the shape has real decision branches.
7. Scope = **judgment call at the checkpoint**; adjacent findings default to **backlog**;
   genuinely-needed adjacent cleanup branches off as **separate PRs** — never conflated.
8. **Main thread analyzes** + holds the dialogue; Explore subagents trace blast radius; prep
   execution delegated per existing rules.
9. Name: **`refactor-ground`**; null-result honesty in the skill text.
10. **Gate at plan-writing time** (no plan without the section); CLAUDE.md bullet; feature-done
    backstop.
11. **Data-first ordering**: data delta before module/file layout.
