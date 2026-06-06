# Grill Session: Flow-field integration into the main renderer — 2026-06-04

Source: `/wt` + brainstorming conversation, worktree `worktree-integrate-flow-fields`.

Goal: promote the standalone **cosmic-flow** dev tool (CF4++ peculiar-velocity GPU
particle viz, PR #247) into a first-class layer of the main skymap renderer,
overlaying the real galaxy field. Companion to
`docs/superpowers/specs/2026-06-04-flow-field-integration-design.md`.

---

## Q0 (pre-grill): mode scope + deliverable

**Decision:** Ship **both** modes (advect + streamline) with a toggle. Deliverable:
follow the project convention — brainstorm → spec → plan (no implementation this
session).

## Q1: Velocity-field data — self-contained cube vs reuse the existing density volume

**The question:** The flow needs velocity (to advect) and overdensity δ (to seed).
cosmic-flow ships both in one RGBA16F cube. The main app already loads a *different*
density field (CF-4 / rhizome, single-channel `.scfd`). Do we ship a self-contained
4-channel cube, or reuse the existing density for seeding?

**Considerations:**
- **Option A (self-contained 4-channel cube):** port the extractor, register the npz,
  wire an independent source. Flow fully decoupled. ~16 MB, tier-agnostic.
- **Option B (reuse CF-4 density for seeding, ship velocity only):** smaller velocity
  blob, but couples flow to the density volume always being loaded, forces a resample
  across two mismatched grids, breaks if density is toggled off.

**Decision:** Option A. The two datasets are genuinely different (CF4++ velocity grid
vs CF-4 density, different resolution/extent); "reuse" means resampling unrelated data
and a load-order dependency between layers that should be independent. The δ channel
travels with the velocity it was derived from — more honest for seeding. User added:
density is seeding-only, so it doesn't need high res — but velocity and δ share the
same 128³ cube and **velocity** sets the resolution floor, so 128³ stays. Also decided
to **drop cosmic-flow's `densityVolume` display** — the main app already has a density
volume layer; a second CF4++-δ view would be redundant.

## Q2: World placement — reuse the scalar-volume frame machinery vs port the baked cube

**The question:** cosmic-flow bakes the cube as a centred `[-1,1]` cube. The main
renderer places cubes via a model/invModel matrix + frame-kind (the CF-4 density
path). How does the velocity cube get into world space?

**Considerations:**
- **Option A (reuse scalar-volume frame machinery):** give the cube `origin`/`extent`/
  `frameKind`, build its model matrix with `buildCubeModelMatrix`, feed `model`/
  `invModel` into the flow shaders. Flow shares the galaxy + density frame exactly.
- **Option B (port the baked `[-1,1]` placement + hand-tuned transform):** less shader
  surgery, but a second placement convention that can silently drift.

**Decision:** Option A. The whole point of integration is that flow overlays the real
galaxy field, so it *must* share the galaxies' frame; the renderer already solved this
for density volumes. Cost: adapt the flow shaders to consume `model`/`invModel` — and
this is arguably *more* correct than the standalone tool. (Verification deferred to
implementation: confirm CF4++ box and CF-4 density assume the same Hubble `h`.)

## Q3: Render-on-demand — flow keeps the GPU awake while on

**The question:** The engine is render-on-demand (sleeps at rest). Both flow modes
animate continuously. How does that reconcile?

**Considerations:**
- **Option A (flow-enabled ⇒ continuous render until off):** one term added to the
  reschedule predicate. Honest, simple, matches the existing auto-rotate pattern.
- **Option B (freeze when camera still):** keeps render-on-demand pristine but a frozen
  velocity field is a still image — defeats the point.
- **Option C (advect animates, streamline freezes):** mode-dependent; saves battery on
  streamline but loses the pulse cue and adds a branch.

**Decision:** Option A. An animated overlay needs frames; skymap already has this exact
pattern (auto-rotate). The cost is paid only when the user opts in, and default-off
(Q5) keeps cold-start render-on-demand intact.

## Q4: Buffer allocation across the two mutually-exclusive modes

**The question:** Modes never render simultaneously. cosmic-flow allocates *both*
buffer sets (~106 MB). How should the main app allocate?

**Considerations:**
- **Option A (two sets up front, ~106 MB):** instant switch, ~53 MB idle permanently.
- **Option B (one shared set, ~53 MB, reseed on switch):** advect/streamline share the
  same buffers; switching reseeds (already a first-class op). Halves footprint; cost is
  a one-frame reseed on toggle.
- **Option C (lazy alloc/free per switch):** churny, no win over B.

**Decision:** Option B. Mutually-exclusive modes need one set + a reseed on switch, not
two allocations. `MAX_PARTICLES` stays a single tunable knob.

## Q5: Capacity & default-on ambiguity

**The question:** User said "default on 40k points." Buffer size? And does "default on"
mean the *layer* is enabled by default?

**Decision:** Buffer is sized to **capacity**, not runtime count. Capacity = 40k
(slider ceiling = default), giving **≈21.3 MB** for the shared set (trail dominates:
40k×32×16 B = 20.5 MB). Layer is **default-OFF** (Option A of the clarification) — flow
is an opinionated, GPU-heavy opt-in overlay; default-off keeps the cold-start light and
respects mobile battery.

## Q6: Tone-mapping — flow's own exposure/contrast vs the shared tonemap

**The question:** cosmic-flow has a private tonemap with per-viz exposure/contrast. The
main renderer tonemaps one shared HDR target once. What happens to flow's knobs?

**Considerations:**
- **Option A (drop flow's tonemap; ribbons are additive emitters into the shared HDR,
  governed by global exposure/toneMapCurve; intensity is a pre-blend multiplier):**
  one scene, one tonemap.
- **Option B (keep flow exposure/contrast as a pre-additive local curve):** tone-maps
  twice; two exposure controls fight.

**Decision:** Option A, and **cut** flow's exposure/contrast entirely. Ribbons are
emitters like the point sprites; they inherit the global tonemap for free. Only
flow-local brightness control is the user **intensity** multiplier.

## Q7: Build pipeline shape + home

**The question:** Where does the extractor live, how is it wired, and what about the
arbitrary-axis admission in cosmic-flow's extractor?

**Considerations / findings:** The extractor header literally says it *intentionally
ignored* frame alignment ("we label the three array axes z,y,x arbitrarily") — so
frame-correct extraction is a **work item**, not just verification. Also:
`rawDataRegistry` already has `cf4.density-mean → d_mean_CF4pp.npy`, the same δ array
the CF4++ npz carries — confirming the velocity cube and CF-4 density share provenance.
Precedent: `build-mcpm` = Python core + tsx wrapper + registry.

Initial recommendation homed it under `tools/volumes/`. **User pushed back:** it's a
flow field, not a volume — animated, time-based, a completely different visual.

**Decision:** New **`tools/flow/`** family dir: `extractFlowField.py` (frame-correct)
+ `buildFlowField.ts` wrapper, npm `build-flow-field`, raw npz registered
`cf4pp.vfield-npz`, provenance README, output added to `syncR2` ALLOW. Naming
discipline carries into `src/` — flow is a peer layer (`flowField`), never a
`VolumeFieldId`.

## Q8: On-disk format — sibling format vs generalize `scalarFieldFormat`

**The question:** Scalar volumes are single-channel `r16float`; the flow cube is
4-channel RGBA16F. New format or generalize?

**Considerations:**
- **Option A (sibling `flowFieldFormat`):** own magic, reuse the frame-header struct,
  4-channel payload. Scalar format stays simple.
- **Option B (generalize `scalarFieldFormat` with a `channels` field):** one shared
  codec; loader derives `GPUTextureFormat` from channel count.

**Decision:** Option B (user choice). One shared codec; existing fields become
`channels=1`. Implication: a **format version bump** — the loader's "regenerate"
guard fires, forcing a re-emit of `mcpm` + `cf4-density` alongside the new
`build-flow-field`.

## Q9: Where flow's parameter state lives

**The question:** Params split across SettingsPanel (user) and DebugPanel (dev). Single
slice vs split ownership?

**Decision:** Single source of truth. Initially "a `settings.flow` slice"; then the
user asked whether a store was needed, then **reversed to wanting a data store for
consistency**. Final: a **`createFlowFieldStore`** (per-type store, `FilamentStore`-
shaped) is the single source of truth — consistent with the project's per-type-store
data-layer direction. No separate `settings.flow` slice (for a single layer,
master-enabled == layer-enabled, owned by the store). Demand-driven loading falls out:
the cube loads on first enable. GPU resources stay on the renderer; the store holds
status/settings only.

## Q10: Fate of the standalone cosmic-flow tool

**The question:** Once flow lives in `src/`, the standalone tool overlaps. Keep,
retire, or rewire?

**Considerations:**
- **Option A (keep as-is sandbox):** two implementations → drift.
- **Option B (retire entirely after parity):** single impl, no drift, but loses the
  isolated tuning surface.
- **Option C (rewire to a thin workbench driving the canonical `src/` module):** keep
  the shell + a small `createFlowHarness` adapter that mirrors a slice of `initGpu` and
  drives the real flow renderer. One implementation, fast isolated iteration. Cost: the
  adapter tracks the renderer's constructor/deps.

**Decision:** Option C. User wants a thin harness for **tuning and presentation**.
Rewire cosmic-flow → **`tools/flow-workbench/`** driving the canonical module (zero
drift), built as the **final** plan step; delete the duplicated `visualizations/` tree.

## Q11: Reconciling the seed pass's separate submit with one-encoder-per-frame

**The question:** cosmic-flow seeds in its *own* submit to dodge a writeBuffer/submit
race on a shared `seedFlag` uniform. The main engine does one encoder + one submit per
frame. How to reconcile? (User asked for the most robust + elegant option.)

**Considerations:**
- **Option A (renderer owns an out-of-band reseed submit):** proven, but preserves the
  fragile shared-mutable-uniform design and works around it.
- **Option B (two-encoder frame on reseed):** invasive to `renderFrame`.
- **Option C (re-architect to a per-buffer flag):** removes the race but rewrites the
  seeding path.
- **Option D (delete the mutable flag — dedicated `seed` entry point + explicit shared
  compute BGL; reseed-vs-steady is expressed as *which passes are encoded*, so reseed
  rides the normal frame encoder):** removes the root cause; engine stays
  one-encoder-per-frame with zero special submit.

**Decision:** Option D. The race's root cause is carrying a one-shot signal in a mutable
shared uniform — the exact anti-pattern the codebase already avoids ("bake per-instance
data / select the pipeline, don't mutate a uniform mid-frame"). D removes the failure
mode rather than scheduling around it. Asked whether this generalizes: it's the existing
house rule (already obeyed by the render-only renderers); flow is the first compute
renderer and **sets the compute precedent**, but no cross-renderer abstraction is
extracted now (the second compute renderer is the time to consolidate).

## Q12: Default mode on first enable — advect vs streamline

**The question:** Which mode shows on first toggle, given flow overlays a dense galaxy
field?

**Considerations:**
- **Advect:** most "alive"/unambiguous motion, but 40k drifting dots can read as noise
  over the starfield.
- **Streamline:** legible flow topology, pulse supplies motion without competing dots,
  calmer first impression.

**Decision:** **Advect** (user choice). The iconic hero look; streamline remains a
switch away.

## Q13: Structure labels — port cosmic-flow's catalog vs reuse existing

**The question:** cosmic-flow ships a `structureCatalog` (Virgo, Great Attractor,
Shapley…). The main app's structure layer (cluster/SC/group, reinforced by the
nearby-galaxy-groups merge) already labels these.

**Considerations:**
- **Option A (prune cosmic-flow's catalog, reuse existing structure labels):** one
  source of truth; flow converges toward labels that already exist.
- **Option B (port flow-specific labels):** redundant, second source of truth.

**Decision:** Option A. "Everything is already there" — flow flows toward the existing
structure labels, ships none of its own.

## Resolved by codebase convention (no grill needed)

- **Depth/occlusion:** the HDR pass has **no depth buffer** (all layers emissive). Flow
  ribbons are additive, no depth test/write; `HDR_PASSES` order is cosmetic (additive
  commutes); placed among the structure layers; no occlusion against galaxies.
- **Picking:** flow is non-interactive — no pick write, no `selectionEncoding` code.
