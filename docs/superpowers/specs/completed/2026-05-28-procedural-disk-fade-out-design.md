# Procedural-disk fade-out for famous-galaxy thumbnails — design

> **Scope.** First of three specs splitting the "famous-galaxy thumbnail
> quality" backlog (the other two — high-resolution LOD and in-app
> calibration — get their own specs and aren't covered here).
> **Status.** Brainstormed 2026-05-28, implemented inline same day.
>
> **Implementation note (2026-05-28).** During implementation we pivoted
> from the shader-side smoothstep design specified below to a CPU-side
> precompute in the procedural-disk subsystem. See the
> [implementation addendum](#implementation-addendum-cpu-side-precompute)
> at the end of the file for the rationale and the actual shape of the
> shipped change.

> **Superseded (2026-07-10):** the two-walks premise below no longer holds —
> one shared walk now feeds both planners; see
> [ADR 0009](../../../adrs/0009-unified-disk-planner-walk.md).

## Problem

When the camera flies close enough to a famous galaxy that its curated
WebP (`/images/famous/<id>.webp`) loads into the texture atlas, the
`texturedDisks` pass renders the photo as a true-ellipse-projected
quad — but the `proceduralDisks` pass *also* renders an ellipse with
a procedural pattern (spiral arms, colour gradient) at the same
position. The two layers blend, and the procedural pattern bleeds
through gaps in the WebP wherever the photo has dark pixels.

The bleed-through is a consequence of an intentional design choice in
`texturedDisks/fragment.wesl:50-54`: the fragment shader uses a
luminance-derived alpha gate (`lumAlpha(lum, 0.05, 0.30)`) so dark sky
becomes transparent. For SDSS / DSS cutouts — a small galaxy centred
in a wide-field photo dominated by sky — this is correct: the procedural
disk fills the rest of the ellipse with structure beyond what the
cutout shows. For curated famous WebPs, where the whole disk is photo
content of the galaxy, the transparency lets the procedural show
through cleanly visible gaps in the spiral arms. The user perceives
two competing layers instead of one polished image.

## Goal

When a galaxy has a curated famous WebP loaded *and* its on-screen
apparent diameter is large enough that the textured disk is the
dominant visual, fade the procedural-disk layer out so the photo isn't
fighting the procedural pattern. Smooth crossfade — no pop at the
exact frame the bitmap becomes ready.

## Approach: shader-side fade, mirroring the points pattern

The `points` renderer already computes its own fade-out against the
procedural-disk pass entirely in-shader, using the apparent-pixel
diameter the vertex stage already has plus global uniforms for the
band start / end (`points/vertex.wesl:200-206`):

```wesl
let crossfadeOut = 1.0 - smoothstep(u.pxFadeStart, u.pxFadeEnd, apparentDiameterPx);
```

No per-frame CPU-side write — just per-instance + global-uniform inputs.
The procedural-disk renderer is the asymmetric one: its `crossfadeAlpha`
(fade-in against points) is computed CPU-side every frame in
`proceduralDiskSubsystem.ts`, written into each instance.

This spec extends the points pattern: the procedural-disk shader
computes its fade-*out* (against the textured-disk pass) using exactly
the same kind of shader-side smoothstep, gated by a per-instance
`isFamousBitmap` flag the engine writes **once** at bitmap-upload
time.

### Shader contract

```wesl
// New per-instance attribute on the procedural-disk instance buffer.
// 0.0 by default; 1.0 once the famous WebP for this galaxy is uploaded
// to the atlas. Set back to 0.0 on LRU eviction (rare in practice).
@location(N) isFamousBitmap: f32

// In the procedural-disk vertex (or fragment) stage:
let fadeOutFactor = smoothstep(u.pxFadeStartTex, u.pxFadeEndTex, apparentDiameterPx);
let procFadeOut = 1.0 - fadeOutFactor * isFamousBitmap;
out.alpha *= procFadeOut;
```

### Logic table

| `isFamousBitmap` | apparent diameter | `procFadeOut` | Behavior |
|---|---|---|---|
| 0.0 (no famous WebP loaded — covers galaxies with no bitmap, with SDSS cutout, or with DSS cutout) | any | 1.0 | Procedural at full alpha — current behavior preserved exactly. |
| 1.0 (famous WebP loaded), apparent diameter below fade band | below `pxFadeStartTex` | 1.0 | Procedural still full alpha — textured disk hasn't started fading in either. |
| 1.0, in fade band | between `pxFadeStartTex` and `pxFadeEndTex` | 1.0 → 0.0 | Smooth crossfade in lockstep with textured-disk fade-in. |
| 1.0, beyond fade band | above `pxFadeEndTex` | 0.0 | Procedural hidden; textured disk owns the pixels. |

### Why the band uniforms are the same as textured-disks' fade-in

The textured-disk fade-in is computed CPU-side in
`texturedDiskSubsystem.ts:210-214` as
`distFade = smoothstep((px - APPARENT_SIZE_THRESHOLD_PX) / FADE_BAND_PX)`.
By promoting `APPARENT_SIZE_THRESHOLD_PX` and `APPARENT_SIZE_THRESHOLD_PX + FADE_BAND_PX`
to global shader uniforms (`pxFadeStartTex`, `pxFadeEndTex`), the
procedural-disk fade-out and the textured-disk fade-in use the
identical band — they crossfade in lockstep with no tuning needed.
If the band ever changes, both shaders pick it up from the same
uniform source.

## Components touched

- **`src/@types/rendering/ProceduralDiskInstance.d.ts`** — add the
  `isFamousBitmap: number` field. The current 48-byte / 12-float
  layout has 4 padding floats already (the documented `vec4` slot
  alignment); `isFamousBitmap` consumes one without stride change.
- **`src/services/gpu/renderers/proceduralDiskRenderer.ts`** — write
  the new field into the appropriate padding slot at instance-buffer
  encoding time; declare the matching `@location` in the vertex layout.
- **`src/services/gpu/shaders/proceduralDisks/io.wesl` + `vertex.wesl`
  (or `fragment.wesl`)** — declare the new vertex attribute, plumb to
  the alpha multiplication.
- **`src/services/gpu/shaders/proceduralDisks/`** (uniform additions) —
  add `pxFadeStartTex: f32`, `pxFadeEndTex: f32` to the shared
  Uniforms struct. The texturedDisks renderer either reads from the
  same shared uniform constants (preferred) or duplicates them; the
  Constant Source of Truth lives in `texturedDiskSubsystem.ts`'s
  `APPARENT_SIZE_THRESHOLD_PX` / `FADE_BAND_PX` exports.
- **`src/services/engine/subsystems/texturedDiskSubsystem.ts`** — at
  the existing bitmap-upload site (near line 201 where
  `bitmapReadyTime.set(key, performance.now())` is called), write
  `isFamousBitmap = 1.0` to the matching slot in the procedural-disk
  instance buffer if and only if the request was for a famous WebP.
  The caller already knows this — it's the `famousId` input passed
  to `fetchGalaxyBitmap` (`FetchGalaxyBitmapInput.famousId`); a
  truthy `famousId` at request time means the famous-WebP branch in
  `galaxyImageFetcher.ts:42-54` ran. No fetcher interface change
  needed.
- **Atlas eviction hook**. When the atlas LRU evicts a slot that
  held a famous WebP, the corresponding procedural-disk instance
  must have `isFamousBitmap = 0.0` written back, or the procedural
  layer will stay hidden under a galaxy that no longer has a
  texture. The atlas today may not expose an eviction callback to
  consumers — adding one (or threading the consumer's
  callback through the existing slot-release path) is part of this
  spec's scope. In practice famous-WebP eviction is rare (few
  famous galaxies, atlas typically large enough); the plan may
  choose to defer the eviction hook as a follow-up task if its
  implementation cost dominates.

## Data flow

1. Engine per-frame loop iterates galaxies, computes `apparentSizePx`,
   and (for galaxies above threshold) enqueues a thumbnail fetch via
   `galaxyImageQueue` if not already cached.
2. The fetch resolves; bitmap is uploaded to the atlas;
   `bitmapReadyTime` is set; **new:** if the bitmap came from the
   famous-WebP branch, `isFamousBitmap = 1.0` is written to the
   procedural-disk instance buffer slot for this galaxy.
3. On subsequent frames the procedural-disk vertex stage reads the
   per-instance `isFamousBitmap` and computes `procFadeOut` from the
   shader-side smoothstep against `apparentDiameterPx` + the global
   band uniforms. The fragment-stage output alpha is multiplied by it.
4. The textured-disk fade-in (driven by `fadeAlpha = distFade × loadFade`
   computed CPU-side, unchanged from today) ramps the photo in on the
   same band, producing a visible crossfade.
5. If the user flies away, `apparentDiameterPx` shrinks back through
   the band, `procFadeOut` returns to 1.0, procedural fades back in;
   textured-disks fades out symmetrically. No additional CPU work.

## Edge cases

- **Bitmap fetch fails / aborts**: `isFamousBitmap` stays 0.0,
  procedural unchanged. Correct — there's no photo to replace it.
- **Atlas LRU evicts the slot**: `isFamousBitmap` written back to 0.0,
  procedural fades back in. The atlas eviction path
  (`textureAtlas.ts`) needs to call out to the procedural-disk buffer;
  current code may not have that hook — adding it is part of the
  spec's scope.
- **Galaxy with `apparentDiameterPx` below the fade band but bitmap
  loaded**: `procFadeOut = 1.0`, procedural at full alpha. Correct —
  the photo wouldn't be visible enough to dominate either.
- **Brief load-fade overlap**: the textured-disks fade-in has a brief
  `loadFade` ramp (`LOAD_FADE_MS` after bitmap upload, currently ~200 ms)
  that smooths the bitmap pop-in. The procedural fade-out under this
  design ignores `loadFade` — it tracks `distFade` only. During the
  ~200 ms overlap window after bitmap upload (only relevant if the
  user is parked in the fade band when the bitmap arrives), both
  layers are partially visible. Acceptable in practice; if it reads
  janky in smoke testing, a follow-up could promote `bitmapReadyTime`
  to a per-instance attribute and compute `loadFade` shader-side
  from a `currentTimeMs` uniform.

## Scope

**In scope (this spec):**

- Procedural-disk fade-out gated by the famous-WebP source path only.
- Shader-side smoothstep against apparent pixel diameter + global
  band uniforms.
- One-time CPU write per bitmap-upload event (and per LRU eviction).
- Promotion of `APPARENT_SIZE_THRESHOLD_PX` / `FADE_BAND_PX` to global
  shader uniforms so the textured and procedural passes use the
  identical band.

**Explicitly out of scope (separate specs / future work):**

- Suppression for SDSS / DSS thumbnails. These are intentionally
  excluded because their lumGate transparency relies on the procedural
  disk filling the ellipse around a small galaxy in a wide-field
  cutout — suppressing the procedural here would show black sky where
  it shouldn't be. Re-evaluate when cutout quality improves (high-res
  LOD spec, per-galaxy cutout sizing, DESI source — see project memory
  `project_thumbnail_quality`).
- High-resolution famous-WebP LOD on close approach (Issue #2 of the
  three-spec split; separate design doc).
- In-app famous-image calibration (alignment / scale / rotation)
  with sidecar JSON storage (Issue #3 of the three-spec split;
  separate design doc; warrants its own ADR for the calibration
  storage choice).
- Renderer-interface-extraction plan integration. That plan moves
  fade GPU resources into a `FadeRegistry`; this spec lands on top
  of the current fade-writing code. The refactor will absorb the
  one new write site as another fade output when it lands.
- The current CPU-computed `crossfadeAlpha` (procedural-disk
  fade-IN against points) is not migrated to shader-side in this
  spec, even though it could be using the same pattern. Same band
  promotion would apply. Tracked as a follow-up cleanup.

## Testing

- **Unit (Vitest):** `ProceduralDiskInstance` encoder / decoder
  round-trips `isFamousBitmap` at the correct byte offset.
- **Unit:** texturedDiskSubsystem upload path writes `isFamousBitmap = 1.0`
  for famous bitmaps and `0.0` (or no write) for SDSS / DSS bitmaps,
  using a stubbed fetcher that returns either kind.
- **Unit:** atlas eviction path writes `isFamousBitmap = 0.0` back
  when a famous-WebP slot is evicted.
- **Visual smoke (manual):** fly to M31 (or any famous galaxy with a
  curated WebP); confirm:
  - Procedural disk visible at far distance.
  - As camera approaches, procedural fades out as the WebP fades in;
    no visible procedural pattern under the photo once close.
  - Fly away; procedural fades back in symmetrically.
- **Visual regression (manual):** repeat the approach at an SDSS-only
  galaxy (e.g. an SDSS-source galaxy with no famous match); confirm
  the procedural still shows through the SDSS cutout's transparent
  sky pixels — current behavior preserved.

## Why not the alternatives we considered

- **CPU-side per-frame `textureCoverage = fadeAlpha` mirror** —
  works, but adds a per-frame CPU write per visible disk for the
  fade band, and is asymmetric with the points-pass pattern that
  already computes its crossfade shader-side. Rejected in favour of
  the shader-side smoothstep.
- **Hard cut instead of smoothstep** — `isFamousBitmap` as a binary
  gate with no fade. Cheaper, but produces a visible pop at the
  exact frame `isFamousBitmap` flips. Smoothstep is cheap.
- **Source-type gate (always suppress for famous regardless of
  bitmap state)** — adding `is_famous` as a per-instance flag
  independent of bitmap upload, suppressing procedural whenever
  apparent size grows past the band. Rejected: if the bitmap hasn't
  loaded yet (slow fetch, network hiccup), the user would see a
  black hole where the galaxy should be until the fetch completes.
- **Per-source weighted suppression (Path 2 in brainstorm)** —
  per-instance `bitmapSuppression: f32` with engine-computed weight
  for SDSS / DSS based on angular-size-in-cutout. Tabled for a
  future spec when cutout quality is improved enough to make the
  heuristic meaningful. The current design generalises trivially:
  rename `isFamousBitmap` → `bitmapSuppression`, change the CPU
  write site to compute a weight, no shader rewrite.

## References

- `src/services/gpu/shaders/texturedDisks/fragment.wesl:50-54` —
  current luminance-derived alpha gate.
- `src/services/gpu/shaders/points/vertex.wesl:194-206` — the
  shader-side crossfade pattern this design mirrors.
- `src/services/engine/subsystems/texturedDiskSubsystem.ts:210-214` —
  CPU-side `distFade × loadFade` computation; band constants here.
- `src/utils/network/galaxyImageFetcher.ts:42-54` — famous-WebP
  branch (the source path that should set `isFamousBitmap = 1.0`).
- `src/@types/rendering/ProceduralDiskInstance.d.ts:28-43` — current
  instance layout; documents the 4 padding floats one of which the
  new field consumes.
- Project memory `project_thumbnail_quality` — the original 2026-05-03
  backlog this spec partially addresses. Memory is stale on shader
  paths (predates orientation-disks); use as historical context only.

---

## Implementation addendum: CPU-side precompute

The spec above describes a shader-side smoothstep gated by a per-instance
`isFamousBitmap: f32` flag and two new global uniforms (`pxFadeStartTex`,
`pxFadeEndTex`) shared with the textured-disk pass. Reading the existing
code surfaced a simpler shape that produces the same visible behavior
without the band-uniform plumbing or atlas-eviction hook.

**What changed in implementation:**

- The per-instance attribute is `procFadeOut: f32 ∈ [0, 1]` rather than
  the binary `isFamousBitmap` flag. Default is 1.0 (no fade-out — current
  behavior preserved). Famous-with-loaded-bitmap entries get a ramped
  value in [0, 1] computed from apparent diameter.
- The smoothstep lives in `proceduralDiskSubsystem.ts` (CPU), not in
  `proceduralDisks/vertex.wesl` (shader). The shader does one multiply
  in the fragment output.
- The gate predicate is `cloudSource === Source.Famous && atlas.isLoaded(key)`
  evaluated each frame in the subsystem. No new shared state, no atlas
  eviction hook, no fetcher interface change — eviction is implicit
  because the atlas state is queried every frame.
- The band reuses `APPARENT_SIZE_THRESHOLD_PX` and `FADE_BAND_PX` from
  `texturedDiskSubsystem.ts` directly (importing the constants). No
  promotion to shader uniforms.

**Why this is simpler:**

The procedural-disk subsystem already rebuilds its full
`ProceduralDiskInstance[]` array every frame and uploads it as the
instance buffer — the "one-time write" framing in the original spec
was misleading. Computing one extra scalar per famous galaxy in TS
costs nothing measurable next to the per-frame walk that's already
happening. The shader-side smoothstep would have required two new
uniforms, an atlas-eviction subscription chain, and a fetcher
interface change for no behavioural difference.

**What's preserved from the spec:**

- The shape of the change (one per-instance attribute, one shader
  multiply).
- The famous-only scope (SDSS / DSS thumbnails still keep the
  procedural underneath).
- The smooth ramp through the textured-disks fade-in band so the
  two passes crossfade in lockstep.
- The logic table from the "Approach" section above remains
  semantically correct — `procFadeOut` is `1 - fadeOutFactor * isFamousBitmap`
  precomputed.

**What's deferred to a follow-up if desired:**

- Reverting to the shader-side smoothstep if a future renderer change
  benefits from the band uniforms living in the shader. The generalisation
  is trivial: replace the precomputed scalar with the binary flag and
  expose the band as uniforms.
