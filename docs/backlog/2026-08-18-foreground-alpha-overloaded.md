# `foreground:0`'s alpha channel is doing three jobs

Surfaced by the audit that accompanied the atmosphere shell's chromatic-extinction
fix (PR #574). Both defects below are real, were confirmed by reading, and were
deliberately left in place so the fix stayed one change.

## 1. Premultiplied source into a straight-alpha composite

`src/services/gpu/passes/compositor.ts:159-165` composites `foreground:0` with
`srcFactor: 'src-alpha'` / `dstFactor: 'one-minus-src-alpha'` — it reads the
target as **straight** (un-premultiplied) alpha, and the comment above it says so
explicitly. The atmosphere shell writes **premultiplied** rgb.

Over the disc `a = 1`, so the multiply is a no-op and nothing looks wrong. Over
empty sky the target ends at `(inScatter, coverage)` and the composite yields
`inScatter·coverage + hdr·(1 − coverage)` — the limb glow is scaled by its own
coverage a second time, so a thin low-coverage limb loses roughly a factor of
`coverage` in brightness.

`src/services/gpu/renderers/atmosphere/ringRenderer.ts:197-205` has the same
mismatch. `cloudShellRenderer` does **not** — it emits straight alpha, consistent
with the composite, which is the shape the other two should match.

Load-bearing consequence: `settings.earth.atmosphereExposure` is seeded at
**2.35**, and this double-attenuation is the most likely reason it had to go that
high. Fixing the composite without re-tuning that dial will make Earth's limb
jump.

## 2. One alpha cannot attenuate the background chromatically

After #574 the shell attenuates per channel, but only what lives in
`foreground:0` with it — i.e. the planet. Anything in the `hdr` target *behind*
the planet (starfield, galaxies, filaments) is weighted by the single alpha
channel, which stays luminance-collapsed by necessity. So a star occulted by
Earth's limb still dims **achromatically** while the limb beside it reddens
correctly.

Two ways out, neither cheap:

- **Dual-source blending** (`src1` / `one-minus-src1`), which is a WebGPU
  optional feature and would need a capability gate plus a fallback path.
- **Move the shell into the background's target** so one blend sees both, which
  reorders the pass graph and collides with the depth-testing the shell needs
  against the opaque planet.

## Why they belong together

Both are the same root: `foreground:0`'s alpha is simultaneously the coverage
mask, the compositor's background weight, and (pre-#574) the extinction factor.
#574 took the third job away from it. Deciding the alpha contract once — straight
vs premultiplied, and what the channel is allowed to mean — is the design work;
the two fixes fall out of that decision and should not be attempted separately.

Prior art in the same area: `docs/backlog/2026-07-31-layer-blend-declared-twice.md`
(`ContentLayer.blend` restating the pipeline's `GPUBlendState`) — the atmosphere
shell is now the case that breaks that correspondence outright, since it draws
two pipelines with two different blends under one `blend: 'over'` row.
