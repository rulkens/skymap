# Galaxy Renderer

A WebGPU dev tool that draws a single **procedural, parametric
Hubble-sequence galaxy** — hundreds of thousands of instanced star sprites
behind an HDR bloom pipeline — tunable to match real astrophotography. It
ports a proven spike into the repo as a first-class instrument for judging
whether that richer representation is "up to par" to eventually replace the
main renderer's per-galaxy point billboard on close approach.

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
- **Controls panel** (right) — Hubble-type chips, every generator/render/LOD
  slider, a randomize-everything button, the multi-galaxy perf-test toggle,
  and the JSON preset row.

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
`generateDust.wesl`, both linked from the shared `lib/generate.wesl` (bind
group, population builders, RNG). Changing a galaxy's params triggers exactly
one dispatch of this pair (`createGalaxyEngine`'s `setParams`), not a
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
`mulberry32` generators that run once, CPU-side, inside
`packGenerationUniforms`, producing the handful of _shared_ values every GPU
invocation reads (arm phase, pitch, weight, meander amplitude/frequency/phase,
...). Those values ride the UBO as plain floats; the GPU never draws them
itself.

### Re-derived main-seed values

A few more galaxy-level values also come from a CPU-side serial draw rather
than the per-invocation hash — from `seed` itself, not a family seed.
`packGenerationUniforms` runs a fresh `mulberry32(seed)` stream and draws, in
fixed order: the bar tilt angle (via `computeBarGeometry`, unconditionally
for every category), then the seven irregular-galaxy clump centres if the
category is `'irregular'`, then the 34 lenticular dust-cloud centres if the
category is `'lenticular'`. A galaxy is only ever one category, so at most
one of the two centre blocks actually draws. Reproducing this draw order
CPU-side, once per galaxy, is what lets every GPU invocation read the same
shared geometry instead of each needing to re-derive it independently.

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
`lib/generate.wesl` sets how sharply the lanes cross), while an antisymmetric
cubic bow (`BAR_LANE_BOW`) peels the lane ends outward toward the arm roots,
in the spiral's own rotational sense. Both are live-tuned knobs at the top of
`buildBarDust`.

## Rendering

Each frame draws in five passes: additive stars, then absorptive dust
(multiplicative transmittance, so it darkens and reddens whatever's behind
it), then a bright-pass extracts the HDR highlights, which feed a 5-level
dual-filter bloom pyramid (Karis firefly-suppressed averaging on level 0
only, plain box averaging on the deeper levels), and a final composite pass
adds the bloom back onto the scene, tone-maps, grades, and gamma-encodes to
the canvas.

Every constant in the pass chain — screen-size clamps, LOD hashes, blend
weights, tonemap curves — is a verbatim, cited port of the spike's
`galaxy-engine.js` (camera, uniforms, pipelines, frame loop) and
`galaxy-shaders.js` (the WGSL shipped inline in the spike, now split into
the seven WESL files under `src/engine/shaders/`); see the shader/engine
source comments and
[`docs/superpowers/plans/2026-07-02-galaxy-renderer-02-engine-and-shaders.md`](../../docs/superpowers/plans/2026-07-02-galaxy-renderer-02-engine-and-shaders.md)
for the full line-cited port map.

## Status

Feature-complete: model, engine, shaders, the full control panel, the
compare/auto-fit panel, and JSON presets are all live. See
[`docs/superpowers/specs/2026-07-02-galaxy-renderer-tool-design.md`](../../docs/superpowers/specs/2026-07-02-galaxy-renderer-tool-design.md)
for the full design.
