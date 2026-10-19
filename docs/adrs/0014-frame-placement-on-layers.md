# ADR 0014 — Core Keeps the Ordered Steps; Layers Pin Their Passes to Them

- **Status:** Proposed
- **Date:** 2026-10-19
- **Decision-makers:** Alexander Rulkens (with Claude)
- **Tags:** engine, frame, layers, composition
- **Supersedes:** — (refines [ADR 0011](0011-engine-composition-bundle-rows.md), whose rejection of a render graph stands)
- **Superseded by:** —
- **Related:** research `docs/research/2026-10-16-central-frame-table.md` ·
  spec `docs/superpowers/specs/2026-09-09-layer-composition-design.md` §5 ·
  backlog `docs/backlog/2026-10-19-frame-placement-on-layers.md` and
  `docs/backlog/2026-10-11-layer-dependency-dag.md`

## Context

`src/data/rendering/frameSections.ts` is the hand-ordered frame: 27 lines in
the mono rig, each naming the passes it draws in draw order. ADR 0011
rejected deriving that order from a dependency graph because the cross-step
constraints are semantic (dust after emission, NEAR0 over COSMO, tonemap
last), and because the step list was "around thirteen steps, small and
stable". The layer-composition spec then moved `target` and `slab` off the
pass row onto the line so that order and roster are one artifact.

Both arguments hold. What grew is not the steps but the names in them: 26 of
48 pass names, all 5 planner names, 2 of 4 compute names and 5 of 10 target
ids in core's table belong to Layers. The Layer contract says core composes
Layers and does not reach inside one; the table reaches inside by name. A
Layer that owns its own offscreen target still needs core to author both the
line that renders into it and the roster slot of its upsample. Four
intra-roster constraints between different Layers' passes exist only as
prose. Plan rows throw when their planner is absent, so the table is
composition-specific. Adding the lightTime Layer cost a core commit for one
name.

## Decision

**Core keeps the ordered step list as the ordering artifact, with stable ids
and no Layer names. A Layer pins each of its passes, computes and planners to
a step by id. Intra-step order is declared by the pass, as `after:` edges,
and checked at boot only within a step.**

1. Every line in `frameSections.ts` gets a stable `id`
   (`scene.hdr.cosmo`, `scene.hdr.near0`, `scene.lens`, `overlays.swap.near0`).
   Cross-step order stays an explicit list; no toposort crosses a step.
2. `ContentPass`, `ContentCompute` and `FrameContentPlanner` gain `step`.
   A Layer target that needs its own line declares it as a `steps` row on
   the Layer (`{ id, target, slab, before: 'scene.hdr.cosmo' }`); core
   splices it before the named step.
3. `after?: readonly string[]` on a pass orders it within its step. The
   check runs only when both passes are present; an edge to an absent pass
   is inert. This is the first explicit inter-Layer reference and is the
   trigger the dependency-DAG item waits for; the two are decided together.
4. Capture membership moves to the pass (`captures: ['sgrAStar', 'solarSystem']`).
5. A planner or compute whose Layer is absent is dropped like a pass.
6. The rationale prose moves from the table to the pass file it explains.
7. `checkFrameOrder` keeps every rule it has and adds: the pass's declared
   pipeline formats match its step's target row; capture names resolve; a
   Layer pass on a swap-format step is rejected until an `onSwapFormat`
   hook exists.

Migration is behaviour-neutral per PR: add ids; accept `step` optionally;
move one Layer at a time; delete the names from the table when none remain.
`frameOrderBoot.test.ts` is the gate throughout.

## Alternatives considered

**Keep the table and close the holes only.** Fixes the silent failures (and
is done first regardless), leaves every Layer addition a core edit and the
inter-Layer constraints in prose.

**A render graph.** Rejected by ADR 0011; the reasons still apply, and this
decision keeps the cross-step list explicit.

## Consequences

- Positive: a Layer ships without a core commit; the four prose constraints
  become checked edges; the table shrinks to about 25 lines of pure order.
- Negative: two new contract members; the single narrative in the table is
  distributed across pass files; `after:` edges are a dependency the Layer
  rules did not allow before, which is why the DAG item rules with this one.
