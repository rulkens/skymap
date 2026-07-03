# GPU compute-shader galaxy generation — design

**Status:** approved design, awaiting plan.
**Builds on:** `tools/galaxy-renderer/` as shipped in PR #402
(spec: `specs/completed/2026-07-02-galaxy-renderer-tool-design.md`).

## Goal

Move per-star/per-dust-particle generation from the CPU worker into WebGPU
compute passes. The sole motivation is **speed**: regeneration drops from
hundreds of milliseconds of worker time + buffer transfer to a ~1–2 ms
dispatch inside the frame. Everything the speed unlocks is in scope:

- structural sliders regenerate **live** (the 130 ms debounce dies),
- auto-fit probes become near-interactive (no behaviour change — it just
  gets faster),
- every multi-galaxy background extra gets **its own params** instead of a
  transformed copy of the main galaxy's buffers.

**Byte-compatibility with the CPU model is explicitly waived** (user
decision). Same params must still always produce the same galaxy — the
determinism _contract_ survives, its _mechanism_ changes.

## Non-goals

- Main-app integration (unchanged: bounded adapter behind
  `GalaxyEngineHandle`, after renderer unification / #385).
- Any render-pass change. The five-pass HDR chain, the vertex shaders, and
  the stride-8 vertex layouts are untouched.
- Auto-fit budget tuning (keeps `fitStars: 220000`).
- Catalog-driven parameterisation.

## Considered and rejected

- **Unified emission kernel** (4 spatial primitives + population param
  table instead of 11 builders): roughly halves the WGSL surface, but is a
  reinterpretation, not a port — visual character drifts, the tuned stage
  patches + reference presets would need a re-tune pass, and the parity
  harness degrades to a sanity check. Rejected in favour of a **faithful
  builder-by-builder port**; revisit only if a future population addition
  makes the per-builder shader cost bite.
- **Hybrid (GPU stars, CPU dust):** keeps the worker + transfer machinery
  alive, forfeiting most of the simplification payoff. Rejected.
- **Atomic compaction + indirect draw:** both blend modes are
  order-independent (stars additive, dust multiplicative), so it would even
  be visually safe — but it makes buffer contents irreproducible for the
  parity harness and buys nothing measurable at these counts over
  over-allocation. Rejected.

## Architecture

### What stays CPU (and stays vitest-tested)

`classifyHubbleType`, `splitStarBudget`, the capacity formula, stage
patches, `PARAM_SPEC`, presets, the matcher, `buildExtraSpecs` — plus one
new pure function:

```ts
// packs GalaxyParams + per-population budget ranges + palettes + the
// extra's rigid transform into the generation UBO; byte-level tested like
// packCameraUniforms
export function packGenerationUniforms(
  params: GalaxyParams,
  budget: StarBudget,
  extra: ExtraGalaxySpec | null, // null = the main galaxy (identity transform)
): ArrayBuffer;
```

### What moves to WGSL

The 11 population builders (`src/model/populations/*`), `makeWarpOffset`,
`tempColor`, `hiiPalette`, and value noise — ported function-for-function
into a shared WESL lib (`shaders/lib/generate.wesl`) consumed by two
compute entry points:

- **`generateStars.wesl`** — bulge, bar, disk, spiral arms, halo, globular
  clusters, irregular clumps.
- **`generateDust.wesl`** — arm dust, bar dust, lenticular dust, irregular
  dust.

Each pass is dispatched over the **capacity** of the target buffer; a
thread maps to one output slot. The CPU-carved per-population ranges
(from `splitStarBudget`, same as today) tell each thread which builder's
math to run — a range lookup, not divergent per-population entry points.

### RNG: stateless hash

The serial mulberry32 streams (whose draw _order_ was the old contract)
are replaced by a stateless hash:

```wgsl
fn rand(seed: u32, populationId: u32, starIndex: u32, drawSlot: u32) -> f32
```

(PCG-family mix; exact constants chosen in the plan.) Draw sites inside
each ported builder are numbered statically as `drawSlot` values;
rejection-sampling loops advance `drawSlot` by a per-iteration stride, so
retries never collide with sibling draws. The four seed params keep their
family roles as hash inputs — `seed` main placement, `asymSeed` asymmetry,
`clumpSeed` clump placement, `waveSeed` warp/wave — so the per-family seed
dice in the UI behave exactly as before.

Determinism contract, restated: **same params → same buffer contents**,
independent of dispatch size, workgroup layout, and machine (integer hash;
the usual last-ULP `sin/cos` caveat carries over from the CPU model).

### Variable counts: over-allocation + dead points

Builders whose CPU form rejection-samples retry **up to 8 iterations** in
the thread, then write a **dead point** (size 0 — a degenerate billboard
rasterizes nothing). Slots between a population's actual count and its
capacity are dead points too. Expected dead fraction is a few percent of
vertices; no compaction, no atomics, no indirect draws. The
overflow-throwing writers' job (capacity is never exceeded) becomes
structural: capacity _is_ the dispatch size.

### Buffers and engine surface

Star/dust buffers keep their exact stride-8 layouts and gain
`STORAGE` alongside `VERTEX` usage. `GalaxyEngineHandle` is **unchanged
for consumers**. Internally:

- `setParams` = write generation UBO + dispatch both passes + submit; the
  returned promise resolves after submit (generation and draw share the
  queue, so ordering is guaranteed without a readback).
- The worker (`worker/generateGalaxy.worker.ts`), its transfer path, and
  the bridge's 130 ms debounce + fitting-suppression logic are **deleted**.
  Structural sliders go through the same live path render sliders use
  today.
- Extras: one dispatch per background galaxy with its own params, rigid
  transform folded in via the UBO — `bakeExtraTransform` and the CPU
  buffer-copy machinery are deleted.
- Bind groups are built at the compute pipelines (layout `'auto'` never
  crosses pipelines — house WebGPU rule).

## Testing

- **vitest (permanent):** all remaining CPU-side pure functions, including
  byte-level tests for `packGenerationUniforms` and range-carving against
  `splitStarBudget`.
- **Parity harness (mid-branch only):** a dev-only readback check
  comparing GPU output against the CPU model **statistically** — per-
  population live counts, radial/flux histograms, mean colour — never
  bytes. Meaningful precisely because this is a faithful port.
- **CPU model lifecycle:** _keep until parity, then delete._ The CPU
  builders + worker stay through development as the harness reference;
  the branch's final task deletes them, the worker, and the harness
  together, once the visual gate passes.
- **Visual gate (user):** reference presets still match their photos;
  live-drag structural sliders; seed dice per-family behaviour; extras
  with unique params; auto-fit end-to-end.
- WGSL work follows the house shader-meticulousness rule: no confidence
  without visual verification, `createShaderModuleWithDevLog`-style
  compile logging if diagnostics are needed.

## Risks

- **Draw-slot bookkeeping** is the fiddly heart of the faithful port: each
  builder's CPU draw sequence must be enumerated into stable slot indices.
  Mitigation: the parity harness catches misnumbered slots as statistical
  drift; per-builder tasks keep the enumeration reviewable.
- **Slider-drag dispatch storms:** live regen on drag means a dispatch per
  input event. Generation shares the frame's command encoder and the
  render scheduler already coalesces to one frame per RAF, so the natural
  ceiling is one regen per frame. No debounce reintroduced.
- **iOS/WebKit strictness** (house gotcha): compute shaders validated on
  iOS before the branch closes; an invalid pipeline would silently kill
  whole frames.
