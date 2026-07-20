# Body normal-map shading (Moon-first) — design

**Date:** 2026-07-20
**Status:** design approved, awaiting plan
**Branch:** `feat/body-normal-maps`

## Summary

Give the airless textured bodies real surface relief that catches the sun at the
terminator, by sampling a tangent-space **normal map** in the shared
`texturedBody` fragment — the same technique Earth already uses. The normal map
is **baked from an elevation heightfield** (identical to how Earth bakes its
`normal` kind from GEBCO), so the relief is real topography, not a fake derived
from the albedo.

Scope is **Moon-first**: prove the whole path (fetch → bake → tier → runtime →
shader) end-to-end on the Moon (best-quality DEM), then add Mercury as a
fast-follow once the shape is confirmed.

## Background

The Moon/Mercury/moon terminator recently read as a hard "pixel-sharp" step —
that turned out to be a `pow(0,0)=NaN` bug (fixed in #463), not a shading-model
gap. With the night floor restored, the terminator is a smooth cosine fade. The
*next* increment of realism is genuine relief: crater rims and basin walls that
self-shade near the terminator instead of a perfectly smooth sphere.

The shading model is already proven — Earth's dedicated fragment
(`bodies/earth/fragment.wesl`) builds a per-fragment TBN basis, decodes the baked
RG normal map, reconstructs Z, and perturbs the shading normal. The *shared*
`texturedBody` path (every non-Earth textured sphere) does **not** do this yet:
its `VSOut` carries no tangent and its fragment samples only the surface map. And
the Moon/Mercury rows carry no elevation source to bake from.

**Non-goal (explicit):** slope self-shading only — **no cast shadows**. Long
shadows thrown by a crater rim across its floor need parallax/horizon mapping or
a heightfield raymarch; that is a separate, later feature. A normal map perturbs
the *shading normal* only.

## Ground preparation

Per `refactor-ground` (run 2026-07-20, shape approved). Two prep PRs land before
the feature so the feature is a data delta, not a bolt-on.

### Ideal shape

```
# data delta ─────────────────────────────────────────────────────────────
BODY_TEXTURE_REGISTRY.moon.kinds : { surface:'large' } → { surface:'large', normal:'medium' }
TEXTURE_SOURCES.moon            : + normal: { native: 'textures.moonElevation' }
rawDataRegistry                 : + 'textures.moonElevation'  (ldem_16_uint.tif, gitignored)
buildTextures                   : + per-body exaggeration knob (Moon wants strong relief)

# shared shader helper (Prep A) ────────────────────────────────────────────
NEW lib/normalMap.wesl :  fn perturbNormal(Ng: vec3<f32>, T: vec3<f32>, encRG: vec2<f32>) -> vec3<f32>
earth/fragment.wesl    :  inline TBN block → call perturbNormal(...)   (behaviour-preserving)

# renderer consolidation (Prep B) ──────────────────────────────────────────
texturedBodyRenderer :  setTexture(id, bmp) → setMap(id, kind, bmp)
                        KIND_CFG = { surface: { binding:2, format:'rgba8unorm-srgb', placeholder:[128,128,128,255] } }
bodyTextureSlotRegistry commit : non-Earth branch routes by entry.kind → setMap(id, kind, bmp)

# feature ──────────────────────────────────────────────────────────────────
texturedBodyRenderer KIND_CFG : + normal: { binding:4, format:'rgba8unorm', placeholder:[128,128,255,255] }
texturedBody/io.wesl          : (unchanged — no tangent varying)
texturedBody/fragment.wesl    : + @binding(4) normalTexture; T = normalize(cross(vec3(0,0,1), n));
                                n = perturbNormal(n, T, textureSample(normalTex, samp, uv).rg)
```

### Missing joints (verdict)

1. **TBN math lives only in `earth/fragment.wesl`** → mirroring into `texturedBody`
   would copy sign-convention-laden code = **bolt-on**. Prep A extracts
   `lib/normalMap.wesl`.
2. **`texturedBody` has no tangent** → *not* a blocker. Computed in-shader as
   `cross(vec3(0,0,1), N)` — the mesh pole is +z by construction
   (`uvSphereMesh`), so this is the exact east tangent. Growth, feature-local; it
   deliberately avoids mirroring Earth's tangent-VBO wiring (which *would* be a
   bolt-on: a new mesh attribute + `@location(2)` + VBO).
3. **`texturedBodyRenderer` per-body maps are hand-wired parallel fields**
   (surface@2, ring@3) → a normal@4 would be the 3rd parallel field across ~5
   sites = **bolt-on**. Prep B folds the sphere's *own* maps behind
   `setMap(id, kind)` + a per-kind config, mirroring `earthRenderer.setMap(kind,…)`
   which already does exactly this. The **ring** binding stays separate — it is a
   host-keyed shadow strip (different slot key, no flipY, no mips, non-evicted), a
   genuinely different resource, not another sphere map.
4. **Commit dispatch ignores `kind` for non-Earth bodies**
   (`bodyTextureSlotRegistry` always calls `setTexture`) → `moon:normal` would
   clobber the surface. Folded into Prep B (route by `entry.kind`).

### Prep PRs (each before the feature PR)

- **Prep A — `lib/normalMap.wesl`.** Extract `perturbNormal(Ng, T, encRG)` from
  Earth's fragment; Earth calls it. Behaviour-preserving; verified visually
  against Earth (the TBN sign convention is the thing to confirm unchanged).
- **Prep B — `texturedBodyRenderer.setMap` + kind-routed commit.** Replace
  `setTexture` with `setMap(id, kind, bmp)` driven by `KIND_CFG` (surface only,
  binding 2 — behaviour-neutral, byte-identical output); route the non-Earth
  commit branch by `entry.kind`. Ring path untouched. Tests updated to the new
  method surface.

## Design (post-prep)

### 1. Assets & pipeline

- **Source:** NASA SVS *CGI Moon Kit* `ldem_16_uint.tif` — 5760×2880, 16-bit
  unsigned LOLA elevation (half-meters, ref sphere 1737.4 km), centered 0°
  longitude to match the Solar System Scope albedo map. ~31.7 MB.
  URL: `https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif`
  (verified 2026-07-20). Fetched **once** into `data/raw/textures/`, resume-cached
  like every other texture source — announce before pulling.
- **`rawDataRegistry`:** add `textures.moonElevation` (source: `gitignored`,
  upstream URL, fetcher `fetchTextures`), mirroring `textures.earthElevation`.
- **`TEXTURE_SOURCES.moon`:** add `normal: { native: 'textures.moonElevation' }`.
  Its `native` names the ELEVATION input; `buildTextures`' `normal` branch bakes
  the Sobel gradient (it does NOT name the normal map's own pixels — same as
  Earth).
- **`BODY_TEXTURE_REGISTRY.moon`:** `kinds` gains `normal: 'medium'` (4k ceiling —
  a normal map downsamples cleanly; matches Earth's `normal` ceiling). This one
  edit auto-joins `ALL_BODY_TEXTURE_KEYS`, slot minting, and demand/release
  wiring.
- **`buildTextures`:** already bakes `normal` via `bakeNormalOnce`/`bakeNormalMap`
  (pure, unit-tested). Two additions:
  - a **per-body exaggeration** value (today `DEFAULT_EXAGGERATION = 4` is global;
    the Moon's relief wants a stronger, eye-tuned gain). A small per-body override
    table (default = the const), the same data-gate shape as
    `LIMB_DARKENING_PARAMS`.
  - the source is a **16-bit TIFF**; `bakeNormalMap` takes an 8-bit `Uint8Array`
    heightfield. `sharp(...).greyscale().raw()` yields 8-bit by default — confirm
    the build downconverts. 8-bit height quantization can lightly terrace very
    smooth slopes (Earth already lives with this); acceptable for v1.
- **`fetchTextures`:** derives its raw-source set from `TEXTURE_SOURCES`, so
  `moon.normal` joins the fetch automatically once the source row exists.

### 2. Shared shader helper — `lib/normalMap.wesl` (Prep A)

```wgsl
// Perturb a geometric normal by a tangent-space normal-map sample.
// Ng    : geometric unit normal (renormalized), body-local frame
// T     : unit tangent (+u = east), body-local frame — caller supplies it
// encRG : the map's raw RG in [0,1] (linear); nx,ny decode to [-1,1], nz reconstructed
fn perturbNormal(Ng: vec3<f32>, T: vec3<f32>, encRG: vec2<f32>) -> vec3<f32> {
  let nxy = encRG * 2.0 - 1.0;                    // [0,1] → [-1,1]
  let nz  = sqrt(max(1.0 - dot(nxy, nxy), 0.0));  // reconstruct +z
  let Tn  = normalize(T - Ng * dot(Ng, T));       // Gram-Schmidt against Ng
  let Bt  = cross(Ng, Tn);                         // +v = north (bake's G axis)
  return normalize(Tn * nxy.x + Bt * nxy.y + Ng * nz);
}
```

A flat sample `encRG == (0.5, 0.5)` → `nxy == 0`, `nz == 1` → returns `Ng`
unchanged: the data-gate identity. Earth's fragment switches to call this with
its interpolated tangent (unchanged result); `texturedBody` calls it with the
in-shader `T = normalize(cross(vec3(0,0,1), n))`.

### 3. `texturedBodyRenderer` — `setMap` + normal binding

Prep B introduces `setMap(id, kind, bmp)` + `KIND_CFG`. The feature adds one
config row:

```
KIND_CFG = {
  surface: { binding: 2, format: 'rgba8unorm-srgb', placeholder: [128,128,128,255] },
  normal : { binding: 4, format: 'rgba8unorm',      placeholder: [128,128,255,255] },  // LINEAR
}
```

- `BodyResources` holds a `maps: Map<TextureKind, GPUTexture>` (replacing the
  single `texture` field; `ringTexture` stays separate).
- `buildBindGroup` binds each configured kind's map-or-placeholder at its binding.
- `setMap` uploads with `flipY: true` + a full mip chain for **both** kinds (the
  normal map is linear, so mip averaging is correct; relief fades toward flat as
  the body shrinks — the desired behaviour).
- The bind-group layout gains binding 4 (`texture: { sampleType: 'float' }`); the
  fragment declares `@group(0) @binding(4)`.
- `clearTexture` frees the evictable sphere maps (surface + normal); the ring +
  uniform buffer are left intact, as today.

**Format note:** the normal map MUST be `rgba8unorm` (linear), never
`-srgb` — the RG channels are numeric slope data, not colour. sRGB decode would
corrupt the gradient.

### 4. `texturedBody` vertex/fragment

- **Vertex/io: unchanged.** No tangent varying — the fragment computes it.
- **Fragment:**
  ```wgsl
  let n  = normalize(in.normalLocal);
  let T  = normalize(cross(vec3<f32>(0.0, 0.0, 1.0), n));         // +z pole ⇒ east tangent
  let np = perturbNormal(n, T, textureSample(normalTexture, bodySampler, in.uv).rg);
  // np replaces n in litShade(...) and the Minnaert noL = dot(np, sunDir).
  ```
  Pole degeneracy (`n ≈ ±z`) yields a near-zero `T`; `perturbNormal`'s
  `normalize` + the vanishing relief at the poles make this visually harmless
  (guard only if a pole artefact shows in the visual pass).
- The flat-normal placeholder (`(0.5,0.5,1)` decoded) means a body **without** a
  `normal` map perturbs by zero → shades **identically to today**. No uniform
  flag — the placeholder is the data-gate, exactly like the ring/surface
  placeholders.

### 5. Commit dispatch (Prep B)

`bodyTextureSlotRegistry`'s non-Earth branch routes by `entry.kind`:
`surface`/`normal` → `texturedBodyRenderer.setMap(entry.bodyId, entry.kind, bmp)`.
`ALL_BODY_TEXTURE_KEYS` already yields `moon:normal` once the registry row exists;
the slot mints, fetches, and evicts with no further wiring.

## Testing

- `bakeNormalMap` — already pure-unit-tested; the per-body exaggeration override
  gets a data-gate resolution test (absent body → default), no numeric
  restatement.
- `texturedBodyRenderer` — structural: `setMap` accepts each configured kind;
  the bind group binds a normal texture at binding 4; the normal placeholder is
  the linear flat-normal texel; `clearTexture` frees the sphere maps.
- `bodyTextureSlotRegistry` — `moon:normal` commit routes to
  `setMap('moon', 'normal', …)`, not `setMap('moon', 'surface', …)`.
- Shader (`perturbNormal`, tangent, format) — verified **visually over HMR** (the
  TBN sign convention + relief lighting on the correct side of a ridge). The
  shared helper inherits Earth's established convention; a JS mirror of WGSL
  `pow`/`cross` would be a contrived restatement the project avoids.
- Fetch/build outputs are gitignored build artefacts — no test.

## Deploy

After the Moon normal tiers build, `sync-r2-secure` from the **main** worktree
(new `moon-normal-*.png` tiers) — same sequence as any texture change. Announce
the ~31.7 MB source fetch before pulling; the built tiers are small.

## Follow-ups / open

- **Mercury** (fast-follow): the raw USGS MESSENGER DEM is only offered at 64 ppd
  (~0.5–1 GB). Cleaner small route: a one-time USGS "Map a Planet 2" resample to
  ~8k GeoTIFF, hosted like our other sources — resolve when picked up. A
  `docs/backlog/` detail file tracks it.
- **Earth tangent simplification** (backlog): Earth still bakes a tangent VBO into
  `cubeSphereMesh`; it could compute `cross(z, Ng)` in-shader and shed the
  attribute, matching `texturedBody`. Not needed here.
- Other airless bodies (Mars/MOLA, the moons) join by adding a source row +
  `normal` registry kind — table-driven, zero new code.
