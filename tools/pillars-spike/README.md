# Pillars of Creation — volumetric spike

A standalone WebGPU spike: a physically-motivated volumetric rendering of a
Pillars-of-Creation-like star-forming column complex (M16's "Elephant
Trunks"), independent of the skymap runtime so the look can be iterated on
in isolation.

```bash
npm run pillars-spike   # → http://localhost:5500
```

Drag to orbit, wheel to zoom. The panel exposes the volumetric terms
(density, rim glow, starlight, ambient, anisotropy), the display chain
(exposure, bloom, tone-map curve), a render-scale quality select, and a
"new cloud" reseed.

## How the picture is made

Two one-time compute bakes, then a per-frame raymarch:

1. **Density bake** (`generateField.wesl`) — three capped-cone SDF columns
   rising from a base mound, domain-warped and erosion-noised by 5-octave
   fbm, baked to a 160×224×160 rgba8 3D texture: dust density,
   emissive-gas density, temperature noise, detail noise.
2. **Light bake** (`bakeLight.wesl`) — per voxel, Beer-Lambert
   transmittance marched toward each of the 3 ionizing stars, plus a
   6-direction ambient-occlusion average; sqrt-encoded to 8 bits. This is
   what makes the rims physical: emission ∝ density × (UV·T/d²) peaks in
   the thin skin where dense gas first meets unattenuated starlight — no
   rim-light hack. Dispatched in 8 z-slab submits for GPU-watchdog
   headroom.
3. **Raymarch** (`nebula.wesl`) — 128 jittered steps of single-scattering
   transport: chromatic Beer-Lambert extinction (blue extinguishes faster
   → dust visibly reddens what's behind it), two-lobe Henyey-Greenstein
   in-scatter with per-channel shadowing recovered analytically as
   pow(T, tint), Hα/[OIII] ionization-front emission, cool ambient fill.
   The fragment composites the shared procedural background starfield
   behind its own transmittance so background stars redden and dim through
   the columns (chromatic dst-blending isn't expressible in
   fixed-function blend without dual-source support).
4. **Stars** (`stars.wesl`) — HDR billboards with diffraction spikes; the
   vertex stage micro-marches star→camera transmittance so stars dim and
   redden behind dust.
5. **Bloom + composite** — the galaxy-renderer's dual-filter pyramid
   (soft-threshold bright pass, Karis-averaged downsample, additive tent
   upsample; 6 levels) and tone-map composite (ACES default), plus a
   grain dither against dark-gradient banding. The composite also
   upscales from the render-scale-sized HDR target to the canvas.

Uniform byte layouts are mirrored by pure TS packers
(`src/engine/pack*.ts`) whose offsets are locked by tests under
`tests/tools/pillars-spike/` — the WGSL struct, the packer, and the test
must change together.

## Relationship to the main app

None at runtime — that's the point of the spike. If it graduates, the
natural landing spots are: the bloom chain and chromatic-extinction ideas
into `src/services/gpu/`, and the nebula itself as a close-approach POI
layer. The shaders deliberately follow the runtime's conventions (WESL,
`?static` linking, didactic headers, back-face volume rasterisation,
jittered marching) to keep that path short.
