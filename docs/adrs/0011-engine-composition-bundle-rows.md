# ADR 0011 — Engine Composition is Declarative Per-Family Rows, Not a Render Graph

- **Status:** Accepted
- **Date:** 2026-08-17
- **Decision-makers:** Alexander Rulkens (with Claude)
- **Tags:** engine, rendering, subsystems, composition
- **Supersedes:** —
- **Superseded by:** —
- **Related:** [engine decisions record](../research/engine/decisions.md)
  (decisions #4, #8, #9, #10, #11) ·
  [current engine contracts map](../research/engine/current-contracts-map.md) ·
  [subsystem sweep](../research/engine/subsystem-sweep.md) ·
  [engine composition map](../research/engine/engine-composition-map.md)

## Context

A rendering subsystem in skymap is a diagonal cut across six contract families:
frame assembly (`ContentLayer`, `FrameStep`, `RenderTargetSpec`, `COMPUTE`),
assets, GPU handles and teardown, fades/visibility, presentation producers, and
wake/liveness. Each family is internally consistent. The cost sits in how a
subsystem _registers_ with them: most families are joined by hand-editing a
central file rather than by contributing a row.

The handle family is the worst case. `EngineGpuHandles` is a flat struct of ~50
nullable fields, and one renderer costs four edits kept in parallel by hand — the
type field, the null literal, the construction in `initGpu`, and a destroy+null
pair in `engine.destroy()`. Teardown is ~46 such pairs whose ordering is encoded
only by position in the function, with the lifecycle contract stated in a doc
comment. Adding constellations cost nine file-edits for its render slice alone,
and four more had it needed its own render target.

That registration style also propagates copies. The staleness idiom — compare a
live setting against the fact baked into a resource, destroy, recreate — is
hand-written about eight times; volume ingest exists in three places while the
imperative `handle.volumes.add` side-door has no callers at all; the
swap-format rebuild is a hand-picked list of eight renderers; `FADE_ROW` and
`VISIBILITY_ACTION_ROW` are hand-maintained inverses of each other; render-target
clear values live in a second table beside the specs, read independently by
`runBloom`.

Two families already show the shape that works. `ASSET_WIRING` rows drive slot
construction, demand evaluation and eviction from one declaration, and
`FadeLayer` rows plus a single `seedFades` walk do the same for fades — where
those registries reach, a new subsystem edits nothing downstream. Derived debug
is the same story: timing slots, slot groups and render toggles are computed
from the frame program and the layer list, so a new subsystem gets them for
free. The sweep across all fourteen subsystems found the remaining families are
close to row-shaped already: what they lack is a row type and a walker, not a
new abstraction.

## Decision

**Engine composition is normalized one family at a time into declarative row
registries, each row keyed by the same subsystem `key: string`, with generic
walkers deriving the central artifacts from those rows.**

The walkers are the point: target allocation from target rows (replacing the
hand table and the bespoke divisor-rebuild branch in `runFrame`), handle
construction and teardown from handle rows (replacing the `initGpu` assignments
and the destroy/null pairs, with `rebuildOnSwapFormat` replacing the hand-picked
swap list), a staleness sweep from generated-artifact rows, frame-assembly
coverage validation of layers against program steps, derived debug groups and
sliders, a wake fold, and a fades manifest built by concatenating each
subsystem's declared rows.

**The umbrella `SubsystemBundle` type is deferred.** It is not introduced up
front and then filled in; it is reassessed once the families are row-shaped, at
which point it is either a thin grouping over rows that already exist or
unnecessary. Until then the contract sketch in the decisions record is a north
star each family is checked against, not an executable target. The anti-drift
requirement that makes deferral safe is the shared `key: string` from the first
family onward, so rows across families are already joinable before anything
groups them.

**Rows diverge by changing a contract, never by exception.** When a subsystem's
row does not fit its family's shape, the misfit is never encoded as a per-row
escape — no optional field only one row reads, no flag, no bolted branch.
Both ends get re-evaluated: the row shape, and the underlying loading /
rendering / data-structure contract that produced the misfit. Either that
contract is refactored so the row fits, or the row shape was wrong and changes
for **all** rows. An optional field is legitimate only when it names a
capability several rows share (`rebuildOnSwapFormat` is the model); one
subsystem's quirk never earns one. This holds at every family and at the final
umbrella reassessment.

**Explicitly out of scope.** The hand-authored `frameProgram` step list stays
hand-authored. Pick/selection kind tables stay out of the row scheme entirely —
that surface is as large as rendering and has its own backlog item. The three
named presentation mechanisms (`LabelProducer`, `MarkerProducer`, `drawPick`)
stay three named mechanisms rather than a fake-unified registry. The store stays
fade-free. Engine-core keeps what is genuinely shared and never becomes
subsystem-owned: the `hdr` / `swap` / `foreground:0` accumulators and bloom
mips, step-level gates, `ctx` ambient state (rows read it, never write it),
`pickProgram` infrastructure, tone/bloom post, camera and input.

## Alternatives considered

**Derived frame ordering via toposort / a render graph — rejected.** The
obvious next move from declarative rows is to let each row declare what it reads
and writes and derive the frame order from the dependency graph. It was rejected
because the ordering constraints in this renderer are semantic, not dataflow:
multiplicative dust must follow additive emission, `NEAR0` must draw over
`COSMO`, tone-map must be last. A toposort has no access to those reasons and
would need them re-encoded as synthetic edges. The step list is also small and
stable — around thirteen steps — so the explicit ordered list is the honest
representation of the ordering, and a walker validating that every layer is
covered by some step gets the safety without pretending the order is derived.
For the same reason the vocabulary avoids coining "phase": layers pin to
`(target, slab)` as data, and the step list remains the ordering artifact.

**Schema-generated settings UI — rejected** as a further level of derivation
beyond declarative rows plus derived debug.

## Consequences

### Positive

- A new subsystem contributes rows instead of editing central files. The four
  parallel handle edits collapse into one row; the layer ordinal, the fades
  manifest, the debug group and the wake term follow the pattern the asset and
  fade registries already prove, where the downstream edit count is zero.
- The duplicated idioms get one home each: staleness in a sweep rather than
  eight copies, ingest as one function rather than three, the swap-format subset
  as a row flag rather than a hand-picked list.
- Walkers can enforce cross-file contracts that are advisory today — `blend` is
  never checked against the baked pipeline, target formats are hand-matched at
  construction, and nothing checks that a layer's target exists in the specs.
- The row-divergence rule turns each misfit into a signal about a contract
  rather than a local patch, so pressure accumulates on the thing that is
  actually wrong instead of dispersing into optional fields.

### Negative

- Normalizing family by family means the composition surface is mixed for the
  duration: some families read as rows, others still as hand-edited central
  files. A reader has to know which families have been converted.
- Deferring the umbrella type means no single declaration shows a subsystem's
  full contribution until the families land; the contract sketch in the
  decisions record carries that role in the meantime, and it is documentation,
  not a type the compiler checks.
- Frame ordering stays a hand-maintained artifact. Coverage is validated,
  order is not derived, so a step inserted in the wrong position remains a
  reviewable mistake rather than an impossible one.

### Neutral / forward-looking

- Execution is a ladder of per-family rungs, each a behaviour-neutral PR of its
  own, sequenced in the decisions record (#9) — handle registry first, then
  target contributions, generated-artifact staleness, ingest consolidation, the
  wake fold, debug derivation, and the fade/visibility inverse-map question.
  That sequencing is project plan, not architecture; the architecture is the row
  shape and the walkers.
- The renderer/layer sweep (#11) assigns every outlier it found to a rung rather
  than to a local fix, which is the row-divergence rule applied to existing code
  as well as new rows.
- Label mechanisms stay as they are for now: the private label paths that bypass
  the director are catalogued and sequenced after the rungs, not folded into an
  early unification.

## References

- [`docs/research/engine/decisions.md`](../research/engine/decisions.md) —
  decision #4 (architecture level C; toposort and schema-generated UI rejected),
  decision #8 (engine-core keeps), decision #9 (per-family ladder; umbrella type
  deferred), decision #10 (row-divergence rule), decision #11 (sweep outliers
  assigned to rungs).
- [`docs/research/engine/current-contracts-map.md`](../research/engine/current-contracts-map.md)
  — the six families with `file:line` evidence, the cost-per-new-subsystem
  ranking, and the "do not regress" list this ADR preserves.
- [`docs/research/engine/subsystem-sweep.md`](../research/engine/subsystem-sweep.md)
  — all fourteen subsystems against the contract, and the shared vocabulary.
- [ADR 0001 — fade is a subsystem](0001-fade-ownership.md) — the fade rows whose
  registry shape this ADR generalizes to the other families.
- [ADR 0005 — engine data layer and asset loading](0005-engine-data-layer-and-asset-loading.md)
  — the asset wiring rows, the second family already row-shaped.
- [`docs/backlog/2026-08-17-focusable-kind-registry.md`](../backlog/2026-08-17-focusable-kind-registry.md)
  — the pick/selection surface deliberately excluded here.
