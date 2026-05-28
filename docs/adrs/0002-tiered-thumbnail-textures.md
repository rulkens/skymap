# ADR 0002 — High-Resolution Famous Thumbnails Live in a `texture_2d_array`, Not a Second Atlas

- **Status:** Accepted
- **Date:** 2026-05-28
- **Decision-makers:** rulkens
- **Supersedes:** —
- **Superseded by:** —
- **Related:** [`docs/superpowers/specs/2026-05-28-famous-galaxy-high-res-lod-design.md`](../superpowers/specs/2026-05-28-famous-galaxy-high-res-lod-design.md)
  is the implementation spec this ADR justifies.

## Context

### The atlas as it stands

The textured-disk path renders every galaxy whose apparent diameter
crosses ~24 px through a single 2048² RGBA texture atlas, sliced
into 256 fixed-size 128 × 128 slots
(`src/services/gpu/resources/textureAtlas.ts`). LRU eviction by
`lastSeenFrame` keeps visible thumbnails alive; the atlas is shared
across SDSS, DSS, and Famous sources. One bind group, one draw,
no per-galaxy GPU resource churn.

The atlas resolution is a compromise driven by the SDSS / DSS cutout
services, which return ~256 × 256 thumbnails natively — downsizing
to 128 produces the cleanest result for a small galaxy in a
wide-field cutout. 128 px is more than the SDSS / DSS thumbnails
deserve and considerably less than the curated famous WebPs deserve:
the `famous-curator` already emits 1024 × 1024 `full.webp` files
for 52 of the 75 famous galaxies (see
`public/images/famous-curated/<id>/full.webp`), and bumping the
camera close enough to fill the screen with one of those galaxies
exposes the 128 → on-screen upscaling clearly.

### The forcing question

What's the right place to put a higher-resolution-on-close-approach
texture, given that:

1. The 256-slot homogeneous atlas can't host 1024 px slots: a
   256-slot 1024 px atlas would be 256 × 1024² × 4 bytes = **1 GB**
   GPU memory. Even a single tier of 16 × 1024² slots is 64 MB,
   which dwarfs the existing 16 MB atlas.
2. Per-galaxy GPUTextures with their own bind groups conflict with
   the existing "one atlas, one bind group, one draw" architecture.
3. The catalog only has ~75 famous galaxies total; in practice the
   camera is "close enough" to at most 2-4 of them at once.

The actual concurrent-high-res-galaxy count is small. The atlas's
many-slot homogeneous design doesn't pay its keep at this tier.

## Decision

**High-resolution famous-galaxy textures live in a
`texture_2d_array` GPU resource with N=8 layers, each layer sized
by the active source-set tier (1024 px at medium/large, 512 px at
small / mobile).**

Specifically:

- One GPU texture object created with `dimension: '2d'`,
  `size: [layerSide, layerSide, N]`, format RGBA8.
- Each layer is a complete (0,0) - (1,1) UV space holding one
  famous galaxy's `full.webp` (resized at decode to `layerSide`).
- One bind group binds the array texture + a linear sampler.
- The textured-disks pipeline declares the array binding alongside
  the existing atlas binding. The fragment shader samples both;
  the per-instance `hiResLayerIdx` attribute (sentinel −1 = no
  high-res slot allocated) selects whether the array sample
  contributes to the output, with a per-instance crossfade alpha
  blending the two sources across the 200 → 260 px apparent-
  diameter band.
- LRU-by-recent-apparent-diameter allocates / recycles layers when
  more than 8 famous galaxies enter the trigger band.
- Tier-awareness drops out of the constructor: instantiate at the
  tier-derived `layerSide` and the rest of the architecture is
  identical across tiers.
- Memory bound: N × layerSide² × 4 bytes. 32 MB at medium / large,
  8 MB at small.

The decision is intentional about two things it is NOT:

- **Not a second atlas.** A second atlas with larger slots
  (a "tiered atlas-of-atlases" architecture) was the obvious
  generalisation of the existing pattern but doesn't pay for itself
  here: the homogeneous-many-slots design optimises for the case
  where dozens or hundreds of galaxies need slots simultaneously,
  which is exactly not the case at this resolution tier.
- **Not per-galaxy bespoke GPUTextures + bind groups.** This was
  considered (Option A in the brainstorm) but produces N draws per
  frame for high-res galaxies and N bind groups to manage. The
  array form keeps the renderer at one bind group + one draw per
  pass while preserving the "each galaxy gets its own dedicated
  texture region" intent.

## Consequences

### Positive

- Memory bound is small and predictable (≤32 MB) — well below
  what a homogeneous large-slot atlas would cost.
- Bind-group count stays at the existing low number; one new
  bind group regardless of how many high-res galaxies the camera
  passes near.
- One draw per pass on the textured-disks pipeline still suffices.
- Tier-awareness is a constructor argument, not a parallel
  architecture per tier.
- Each high-res galaxy gets a full (0,0) - (1,1) UV — no slot-UV
  arithmetic in the fragment shader for this tier.
- Generalises cleanly if a future spec needs a tiered scheme for
  another source type (e.g. SDSS): a new array with its own
  `layerSide` and N, bound at its own index.

### Negative

- The renderer's bind-group layout grows by one entry; the textured-
  disks pipeline now has both an atlas tile binding and an array
  binding. Future changes to that pipeline have one more thing to
  reason about.
- Two visual layers for famous galaxies in the 200 → 260 px crossfade
  band — the fragment shader samples both and blends. Slightly more
  fragment work in that band; negligible given the small number of
  pixels involved.
- LRU eviction during mid-crossfade can drop the high-res alpha to
  0 abruptly on the displaced galaxy. Acceptable per the spec's
  edge-case analysis; if it ever feels janky, a small follow-up
  could defer eviction of mid-crossfade layers.

### Risks (and what we're betting on)

- The bet: **typical fly-ins target 1-4 famous galaxies
  concurrently**. If users routinely view scenes with 10+ famous
  galaxies in the 200 → 260 trigger band, LRU thrash would erode
  the crossfade. The N=8 cap (vs 4) was chosen with a buffer for
  cluster views; if that turns out wrong we re-tune the cap, which
  is one constant.

## Alternatives considered

### Bigger primary atlas (rejected)

Bump `SLOT_SIDE` from 128 → 1024 on the existing atlas: 256 × 1024²
× 4 = 1 GB. Or limit to e.g. 64 slots: 64 × 1024² × 4 = 256 MB.
Either way, the SDSS / DSS thumbnails (source resolution ~256 px)
would upscale and look soft, *and* the memory budget for the
non-famous galaxies grows enormously for no benefit. Rejected.

### Second 2D atlas dedicated to high-res famous (initial recommendation, rejected after brainstorm)

A second 2048² atlas with 4 × 1024 px slots (mid / high tier) or
16 × 512 px slots (mobile). Same atlas class with different
constructor args. 16 MB additional GPU.

This was my initial recommendation. Discarded in favour of the
`texture_2d_array` form because:

- A 2D atlas's homogeneous-many-slots design assumes many
  concurrent occupants and uses slot-UV arithmetic to amortize the
  binding cost. At this tier the concurrent count is small (≤8)
  and there's no UV-arithmetic to amortize.
- The array form preserves each galaxy's full (0,0) - (1,1) UV
  space, which is conceptually cleaner for "this layer IS the
  image."
- Same bind-group / draw-call cost as the second atlas.

### Per-galaxy bespoke GPUTextures with their own bind groups (rejected)

Allocate a fresh `GPUTexture` per famous galaxy on close approach,
bind it as its own bind group, dispatch a separate draw per bound
texture (N=4 or 8 concurrent). LRU release on the texture objects.

Rejected: introduces N additional draws per frame for high-res
galaxies, and N bind groups to manage. Conflicts with the
existing "one atlas, one bind group, one draw" discipline without
producing materially different visual behaviour from the array
form. The array form delivers the same "each galaxy gets its own
dedicated texture region" intent with single-bind-group +
single-draw mechanics.

### Continuous-resolution server-side cutouts (rejected for famous; n/a)

The catalogued SDSS / DSS cutout services accept arbitrary pixel
sizes per request, which would in principle let the runtime fetch
exactly the right resolution per galaxy. This doesn't apply to
famous galaxies: the curator pre-processes specific images by
hand, and "fetch arbitrary-resolution" would require running
StarNet and the curator's manual crop pipeline on demand — neither
of which we want at runtime. Rejected for famous; not part of this
decision space.

### Single high-resolution variant without tier-awareness (rejected)

Always serve 1024 px regardless of tier. Mobile users pay the
same GPU-memory cost as desktop. Rejected because the existing
source-set tier system explicitly accommodates mobile constraints;
extending that pattern to thumbnail high-res is the same shape.

## Implementation notes

- The `texture_2d_array` is constructed at engine bootstrap once
  the active tier is known. A subsequent tier change destroys and
  recreates it at the new `layerSide` — covered in the spec's
  edge-case section.
- The fragment shader gates the array sample on
  `hiResLayerIdx >= 0`; the WGSL compiler is expected to
  branch-free here (a conditional `mix()` of array-sample-with-
  default vs atlas-tile), which is fine for this volume of draws.
- The companion spec covers the runtime fetcher path, the build
  step that ships `full.webp` to R2, and the `tools/deploy/syncR2.ts`
  ALLOW-list change. None of those are decisions for this ADR.
