# Volume raymarch acceleration — design

Status: approved shape, pre-plan. Branch: `worktree-volume-raymarch-acceleration`.

## Problem

The scalar-volume raymarch (`src/services/gpu/shaders/scalarVolume/fragment.wesl`)
is a fixed 128-step fragment march over the cube's back faces with no
empty-space skipping and no LOD. Measured against the shipped MCPM medium cube
(178×300×182, f16):

- **95.2% of samples are provably zero** under the shipped transfer function
  (contrast 1.7, trim 0.3 → hard cutoff 0.362): only 4.77% of voxels
  contribute; 70.5% of 8³ bricks are entirely below the cutoff. At the
  TF-independent floor (value > 0), 73.4% of voxels are exact zeros and 63.5%
  of 8³ bricks are empty.
- The pass costs 0.6–1.4 ms at the existing harness poses — cheap only because
  it runs at 1/3 linear resolution (`renderTargets.ts` `'volume'` row,
  `scale: 3`) with a hard 128-step cap. That budget position blocks the goals.
- The wire is uncompressed and un-edge-cached: a verified production GET of
  `mcpm-medium` transferred all 19,437,696 bytes, no `content-encoding`,
  `cf-cache-status: DYNAMIC`.

Goals (user-stated): headroom for more simultaneous cubes, less download
pressure, higher-resolution handling at 60 fps. No specific slow view is being
chased; this is known-debt cleanup, and the look is allowed to change where it
changes for the better (less aliasing, less shimmer).

## Design

Three stages, each independently measurable and landable. Stage order is
dependency order: the perf pose gates 1–2; savings from 1–2 fund 3.

### Stage 0 — transport-level gzip (extracted to its own PR)

An audit of every R2-served data file showed the wire is unoptimised across
the board — no compression anywhere (mcpm-large ships 148 MB that gzips to
31 MB; filaments.bin 30 MB → 3.4 MB) and no edge caching at all
(`cf-cache-status: DYNAMIC` on every probe, because `.bin`/`.scfd` aren't on
Cloudflare's default cacheable-extension list). That outgrew this spec: it is
a deploy-infrastructure change spanning every catalog, so it ships as its own
PR from main (branch `wire-compression`): gzip-at-upload with
`Content-Encoding: gzip` metadata behind a per-file eligibility predicate
(everything except the in-format-gzipped star bins and the incompressible
flowfield), proper `content-type`, the `fetchWithProgress` clamp
(content-length becomes compressed size while the stream yields decompressed
bytes), and a documented manual Cloudflare Cache Rule for the data domain.

Two principles from the analysis stay recorded here because they shaped this
spec: compression is a per-payload transport concern, NOT a format concern —
the flowfield's 90% ratio is the asymmetry that rules out an SCFD-level
"v4 gzip" bump — and the star bin's in-format gzip doesn't generalise (that
format was co-designed with its compressor; a generic voxel array wasn't).

This spec's remaining stages assume the wire PR lands independently; nothing
below depends on it.

### Stages 1+2 — GPU-built pyramids + the shader rewrite

All derived structures are built **on the GPU at upload time**; the CPU only
uploads mip level 0, exactly as today. Enabled by core-spec
`GPURenderPassColorAttachment.depthSlice` (render to a slice of a 3D texture;
shipped in Chrome, Metal-shaped so Safari-clean, done in wgpu). `r16float` is
color-renderable in base WebGPU.

**New primitive: `generateMipChain3d`** (sibling of `gpu/lib/generateMipChain`,
same idiom — per-(level, slice) blit passes in one encoder, one submit). Two
fragment variants:

- *box*: one trilinear tap positioned between the two parent slices — an exact
  2×2×2 box filter. Fills the volume texture's own mip chain (texture gains
  `RENDER_ATTACHMENT` usage + `mipLevelCount`).
- *max*: 8 explicit taps, `max()` reduction. Builds a small max-value pyramid
  (own r16float 3D texture, base = volume dims / 8, with its own mip levels)
  used for skipping.

**Shader rewrite** (`scalarVolume/fragment.wesl`), the feature proper:

1. *Empty-space skipping, TF-adaptive.* Per step, read the max pyramid at a
   coarse level; if the cell's max value is below the live cutoff — derived in
   the shader from the same `contrast`/`trim` uniforms that drive
   `applyContrastWindow`'s deadband (`deadband − 0.05`, the smoothstep floor)
   — advance by that cell's extent instead of sampling. MERF-style multi-level
   check (coarse first, refine on hit). Because the cutoff is computed from
   live uniforms, slider changes retune skipping instantly with **nothing to
   rebuild** — the pyramid stores data (max values), not policy.
2. *Cone-footprint LOD.* Sampled mip level from the ray's pixel footprint:
   `lod = log2(coneDiameter / voxelSize)`, `coneDiameter = 2·t·tan(θ_pixel)`.
   Kills the distant-view supersampling aliasing that the temporal jitter
   dither currently papers over — attacking the stationary-shimmer complaint
   at its cause.
3. *Honest step sizing.* Replace `stepLength = (tMax − tMin)/128` — which makes
   sample density a function of camera distance — with step ∝ the LOD'd voxel
   size (bounded iteration cap for safety). Quality becomes a function of
   what's on screen.

Uniform additions (voxel size in local space, pixel cone angle): the per-field
uniform grows 256 → 272 bytes, as anticipated in `volumeFieldRenderer.ts`.

Early ray termination and per-fragment jitter are kept.

### Stage 3 — spend the savings

Raise the volume offscreen from `scale: 3` toward 2 (`renderTargets.ts:197`),
gated on before/after harness numbers from the new pose. Not planned in detail
in advance; the measurement decides how far to go.

## Ground preparation

Ideal-diff pass run 2026-08-12. Every touchpoint lands as growth at an
existing seam: a codec-untouched transport change, a new `gpu/lib` primitive
beside its 2D sibling, a binding added to the renderer's single shared
BGL/pipeline, a value edit in the render-target table, a new row in
`perfScenarios.ts`. No new branch on any discriminant, no mirrors. The SCFD
"presentation stays out of the binary" rule is preserved — mips and the max
pyramid are derived at load, never stored.

**Prep (lands before feature commits): one item.** A `volume-inside` perf
scenario — camera inside the MCPM cube facing dense filaments — because the
best existing pose measures the raymarch at 1.4 ms, barely above run-to-run
noise, so stages 1–3 would otherwise have no before/after gate.

Considered and dropped: `decodeScalarField` sync→async (only needed by the
withdrawn in-format compression); CPU-side Chebyshev distance map and CPU mip
building (replaced by the GPU pyramid path); consolidating the three volume
fetchers' shared fetch+decode shape (nothing new lands there — no trigger).

## Non-goals / follow-ups

- **Temporal reprojection** — rejected as a primary lever: skymap is
  fly-through-heavy, history invalidates constantly, ghosting on fog-like
  fields. The kept half is analytic-integration-friendly step sizing.
- **Multi-cube single-march** (N cubes → one traversal sampling all resident
  fields per step) — the biggest structural lever for "more cubes", held for
  a follow-up spec, decided after Stage 3's numbers say whether per-cube
  division sufficed.
- **Brick pool / page table / out-of-core streaming** (Kiln-style) and
  **Gaussian/Gabor representation changes** — out of scope; revisit only if a
  future cube outgrows `maxTextureDimension3D` or VRAM.
- **Adjacent finding, not folded in:** the R2 custom domain edge-caches
  nothing for `.scfd` (default cacheable-extension list) — likely also worth
  checking for `.bin`. A Cloudflare Cache Rule on the data domain fixes TTFB
  independently of this work.

## Testing

- Pure helpers (`mipLevelCount3d`, uniform packing, the TS side of any shared
  cutoff derivation) get unit tests; GPU passes and WGSL are exercised by the
  perf harness and visual checkpoints, not vitest.
- Per stage: harness before/after on `volume-inside` (plus `local-group` as
  the regression canary), quoted from MERGED medians per the perf skill.
- Visual checkpoint EARLY in the shader stage (first working skip build, not
  the polished one), per standing feedback — a zero-area or skip-everything
  bug reads as a fake perf win otherwise.
