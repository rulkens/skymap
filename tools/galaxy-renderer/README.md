# Galaxy Renderer

A WebGPU dev tool that draws a single **procedural, parametric
Hubble-sequence galaxy** — a closed-form Gaussian-mixture emission field, a
dust-column map, HII shells, and (off at boot, scheduled for deletion) a
legacy bag of instanced star sprites — behind an HDR bloom pipeline, tunable
to match real astrophotography. It is the instrument for judging whether that
richer representation is "up to par" to eventually replace the main renderer's
per-galaxy point billboard on close approach.

This is a sibling dev tool, like `tools/flow-workbench/` and
`tools/famous-curator/` — its own self-contained Vite + React + TS app, not
part of the skymap runtime bundle.

## Launch

```bash
npm run galaxy-renderer
```

Then open <http://localhost:5400>. The port (5400) is deliberately clear of
the main app (5173), the curator (5200), and the flow-workbench (5300), so
all four can run side-by-side.

## Controls

- **Drag** — orbit the camera around the galaxy.
- **Right-drag / middle-drag** — pan the orbit target.
- **Wheel** — zoom in/out (damped, clamped range).
- **Idle** — after 2.5 s without input, auto-rotate resumes.
- **Controls panel** (right) — Hubble-type chips, the analytic-field / arms /
  HII / star-formation / dust-cloud sections, the debug-view crossfades, every
  generator/render/LOD slider, a randomize-everything button, the multi-galaxy
  perf-test toggle, and the JSON preset row.

## Compare workflow

The left-hand compare panel (toggled from the HUD) validates the procedural
model against real astrophotography. Pick one of eight reference chips
(M100, NGC 6946, M58, M104, M31, a giant elliptical, the LMC, and the Milky
Way) to see its photo, facts, and viewing geometry; **Load preset** copies
its tuned params and pose onto the live galaxy, **Match view** just moves
the camera. **Auto-fit** runs a coordinate-descent search at a reduced star
budget, streaming a live score (0–100, colour-graded) and progress note
while it iterates, with a stop button to cut it short; when it settles it
renders a match report (dominant arm count, axis ratio, dust index —
photo vs. render). The Milky Way has no reference photo, so its auto-fit
button stays disabled.

Presets are JSON, not browser storage: **Download** saves the current
galaxy + render + LOD settings as `galaxy-<type>-<timestamp>.json`,
**Upload** restores a previously downloaded file, and **Copy** puts the
same JSON on the clipboard for pasting elsewhere.

## Generation

Each galaxy is built by two GPU compute passes — `generateStars.wesl` and
`generateDust.wesl`, both linked from the shared `galaxyGen/generate.wesl` (bind
group, population builders, RNG). Changing a galaxy's params triggers exactly
one dispatch of this pair (`createGalaxyModel`'s `setParams`), not a
per-frame step: the CPU side carves _layouts_ — for every star and dust
population, a `(start, iterations, stride, populationId)` range — with cheap
pure arithmetic (`carveStarLayout` / `carveDustLayout`), packs one
`GENERATION_UBO`-shaped uniform buffer (`packGenerationUniforms`), and
dispatches `ceil(capacity / 256)` workgroups per pass. Every invocation reads
its own `(populationId, iteration)` out of the carved ranges and writes
exactly one star or dust record — no serial hand-off between invocations, no
shared mutable state.

### Determinism: a stateless hash, not a shared stream

Every star/dust value the shaders draw comes from
`pcg4d(seed, populationId, starIndex, drawSlot)` — a stateless 4D hash (the
PCG family, Jarzynski & Olano) keyed on four u32 inputs, not a serial RNG
stream advanced one draw at a time. That is the only shape that works across
a compute dispatch of potentially millions of parallel invocations: there is
no way to share one mutable generator's state the way a single-threaded loop
can. The contract this gives is exact and CPU-free — the same `GalaxyParams`
always produce the same GPU buffer contents, byte for byte — but byte-compat
with a CPU-side reference implementation replaying one serial draw per star
was explicitly waived, since a stateless hash has no way to reproduce that
exact draw order. The two approaches are statistically similar (same
population shapes, same distributions) but not byte-identical.

### The seed family

Four seed fields drive independent layers of a galaxy's personality, each its
own draw stream so dialling one never perturbs another:

| Seed        | Controls                                                             | Runs as                              |
| ----------- | -------------------------------------------------------------------- | ------------------------------------ |
| `seed`      | star/dust placement — the value every `pcg4d` draw is keyed on       | a stateless hash, per GPU invocation |
| `asymSeed`  | lopsidedness, plus each arm's phase/pitch/weight/meander personality | a real `mulberry32` stream, CPU-side |
| `clumpSeed` | along-arm beading — the clump sub-personality of each arm            | a real `mulberry32` stream, CPU-side |
| `waveSeed`  | each arm's high-frequency waviness                                   | a real `mulberry32` stream, CPU-side |

The three family seeds don't feed the per-invocation hash — they seed genuine
`mulberry32` generators that run once, CPU-side, inside `describeGalaxy`,
producing the handful of _shared_ values every GPU invocation reads (arm phase,
pitch, weight, meander amplitude/frequency/phase, ...). Those values ride the
UBO as plain floats; the GPU never draws them itself.

### Re-derived main-seed values

A few more galaxy-level values also come from a CPU-side serial draw rather
than the per-invocation hash — from `seed` itself, not a family seed.
`describeGalaxy` runs a fresh `mulberry32(seed)` stream and draws, in fixed
order: the bar tilt angle (via `computeBarGeometry`, unconditionally for every
category), then the seven irregular-galaxy clump centres if the category is
`'irregular'`, then the 34 lenticular dust-cloud centres if the category is
`'lenticular'`. A galaxy is only ever one category, so at most one of the two
centre blocks actually draws. Reproducing this draw order CPU-side, once per
galaxy, is what lets every GPU invocation read the same shared geometry instead
of each needing to re-derive it independently.

### Over-allocation and dead points

`starBuf`/`dustBuf` are sized to the carved _capacity_ — a population's
iteration count, not a count of stars that will actually turn out visible. A
capacity slot's invocation can come back dead (an out-of-range radial draw
that exhausts its resample budget, a dust candidate that fails its keep
gate) without shrinking the buffer; a dead record rasterizes as a zero-alpha
billboard, costing a wasted draw but never a visible artifact. **The HUD's
star/dust counts are therefore planned capacities, not live counts** — the
sum of each population's `iterations` (star side) or the full capacity (dust
side, since every dust population is stride 1). Actual visible counts run a
few percent lower, the same slack every carved population always reserves
against its own worst case.

### Dust budgets: resample-to-budget, not a candidate cap

Each dust population's budget (`carveDustLayout`) is a target the shader
_always meets_, not a ceiling on how many candidates it evaluates. The dust
compute pass runs one thread per output slot and hash-resamples a
population's candidate space — re-hashing at a fresh retry slot each
attempt — until that slot lands an accepted candidate. In seed-limited
regimes (a barred preset with a short bar and few arm-seed candidates, say)
this resample-with-replacement design emits particles up to the full budget
in cases where sampling a candidate list once, straight through, would have
under-emitted. That richer output was accepted at the visual gate as the
intended behaviour.

### Bar dust lanes

`buildBarDust` shapes a barred spiral's two dust lanes after real
barred-spiral morphology (NGC 1300 / NGC 1365) rather than as straight
parallel rails: each lane hugs its bar half's leading edge, then the pair
swaps sides through the nucleus via a tanh S-curve (`BAR_LANE_S_STEEP` in
`galaxyGen/generate.wesl` sets how sharply the lanes cross), while an antisymmetric
cubic bow (`BAR_LANE_BOW`) peels the lane ends outward toward the arm roots,
in the spiral's own rotational sense. Both are live-tuned knobs at the top of
`buildBarDust`.

## Rendering

**The whole chain is the main app's, not this tool's.** The tool is only
useful if a look tuned here transfers, so nothing about the image is
hand-matched: the shaders are the runtime's `shaders/milkyWayCloud/`,
`shaders/milkyWayField/`, `shaders/galaxyGen/`, `shaders/additiveUpsample/`,
`shaders/bloom/` and `shaders/compositor/` trees, symlinked into this tool's
WESL root (see `wesl.toml`), and the post passes that drive them are the
runtime's `createAdditiveUpsample`, `createBloomPyramid` and
`createCompositor`. Editing any of those shaders changes both apps.

`src/engine/`'s own [README](src/engine/README.md) maps that tree: which folders
are the sprite tier (v1), which the analytic field (v2), and which are neither.

The pass chain itself is `createGalaxyEngine.ts`'s `TIMING_SLOTS` docblock —
its one account, and the one that stays current; read it there rather than a
copy here. The shape: each tier splats into its OWN reduced-resolution
offscreen at `floor(canvas / divisor)` (sprites into the aggregate, the
analytic field, the dust-column map and the HII shells each at their own
divisor), then one FULL-resolution `scene` pass sums them into the
`rgba16float` HDR target and draws absorptive dust (multiplicative
transmittance, so it darkens and reddens whatever's behind it) over the
result. The reduced-resolution detour is the app's `mw-aggregate` row, for the
app's reason: a summed additive glow field is low-frequency, so it
reconstructs from a coarser target for free while its fragment cost (the
actual wall, measured) falls as the divisor's square. Dust stays full-res —
also the app's split — because it has to multiply the real accumulation and is
not the fill-bound half.

All eight of the app's `MILKY_WAY_TUNING_DEFAULTS` knobs therefore mean the
same thing here: `sizeScale` / `starIntensity` (spelled `starSizeScale` /
`exposure` in the app), the `starPxMin` / `starPxMax` sprite clamp, `softness`,
`lodApparent`, `starCount` (which rides `DEFAULT_GALAXY_PARAMS` here rather
than the render bag, since it feeds generation rather than compositing), and
the star target's `aggregateDivisor`. The two px knobs clamp in pixels OF THE
STAR TARGET, so the divisor and they are one trade — at divisor 2 a clamp of
48 is 96 screen pixels.

From HDR onward:
bright-pass → 5-level dual-filter pyramid (Karis firefly-suppressed averaging
on level 0 only) → the glow folded back into HDR **before** the tone curve →
one composite applying exposure and one of the app's five curves, straight to
a non-sRGB swap chain with no gamma encode. Every app-side default (exposure,
bloom strength, bloom threshold, tone curve) is imported from
`src/data/defaults.ts` rather than restated.

One post pass is deliberately tool-only: `grade.wesl` (saturation, vignette,
optional `pow(1/2.2)` encode), under the collapsed **TOOL-ONLY GRADE** panel
section. It is SKIPPED entirely at its identity defaults, so out of the box
this tool's pass chain is the app's pass chain exactly; moving one of those
three knobs is a visible departure from parity, kept available because
matching reference astrophotography sometimes wants it.

## Measuring performance

The HUD's first badge is **ms per frame, with fps second** — a rolling median
of the last 60 requestAnimationFrame deltas. That is the honest number: total
wall time per displayed frame, everything included, and the only reading here
that is additive or convertible to a frame rate. Compare two variants on it.
The median (rather than a mean) is what keeps one GC pause or shader recompile
from parking the readout several milliseconds high for a second afterwards.

Adding **`?gpuTimings`** to the URL turns on per-pass GPU timestamps, listed
under the badges in `TIMING_SLOTS` order: `stars`, `dustMap`, `field`, `hii`,
`scene`, `bloom`, `composite`, and `grade`. A timestamp pair can only bracket
a whole pass, which is what decides that split; several slots run only when
their tier has something to draw, and a slot that stops reporting drops out of
the list rather than freezing. `TIMING_SLOTS`'s own docblock in
`createGalaxyEngine.ts` says what each covers and what makes it drop. They come
from the runtime's `gpuTimingService`, imported rather than copied.

**Those per-pass numbers are ordinal.** A tile-based deferred GPU — every
Apple Silicon machine — overlaps passes, so a pass's begin/end timestamps
bracket wall time in which other passes were also executing. The spans rank
passes against each other and against their own history; they do not sum to a
frame and none converts to fps. There is deliberately no total rendered next
to them. The gate is off by default because attaching `timestampWrites`
perturbs a TBDR driver, and the wall clock has to stay clean.

Generation is not in the list: it dispatches once per `setParams`, not per
frame, so it never appears in a frame's measurement.

The engine around the passes — camera, orbit input, frame loop — began as a
port of a standalone `.js` spike that lived outside this repo, so the spike's
files are not findable here; the plan that ported it carries the full
line-cited port map
([`docs/superpowers/plans/completed/2026-07-02-galaxy-renderer-02-engine-and-shaders.md`](../../docs/superpowers/plans/completed/2026-07-02-galaxy-renderer-02-engine-and-shaders.md)).
The spike's draw shaders came over as a local `star.wesl` / `dust.wesl` pair
and have since been deleted, superseded by the runtime's `milkyWayCloud/`
shaders that grew out of them.

## Status

Model, engine, shaders, the full control panel, the compare/auto-fit panel and
JSON presets are all live; the analytic field that replaces the legacy star bag
is the work still in flight. See
[`docs/superpowers/specs/completed/2026-07-02-galaxy-renderer-tool-design.md`](../../docs/superpowers/specs/completed/2026-07-02-galaxy-renderer-tool-design.md)
for the original design and [`docs/research/milky-way/`](../../docs/research/milky-way/)
(its README indexes the files) for the field work.
