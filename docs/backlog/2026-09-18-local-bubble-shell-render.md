# Render the Local Bubble as a Fresnel shell

**Status:** needs-design — the data pipeline shipped in PR #755; the renderer has
a converged design but no spec. Per CLAUDE.md the next step is `refactor-ground`
**before** a spec is written, so the spec can carry a filled "Ground preparation"
section.

## What already shipped (PR #755)

`npm run fetch-local-bubble` + `npm run build-local-bubble` bake O'Neill+ 2024's
shell surface into the gitignored `data/localBubble/local-bubble-shell.f32`. Column
layout, frame, licence and provenance are in
[`data/raw/localBubble/README.md`](../../data/raw/localBubble/README.md) — read
that first, it is not repeated here.

Two facts from the bake that drive everything below:

- **The surface is star-shaped** — one radius per sky direction, Sun at the
  origin. It is a radius field `r(l, b)`, not a mesh: no topology to import.
- **Smoothing is load-bearing.** Displaced raw, the fit's jumps between candidate
  dust walls render as radial spikes, not a shell. Median-then-mean at 2.5°
  recovers the membrane and heals the 40 NaN sight lines upstream ships.

`tools/localBubble/previewLocalBubbleShell.ts` renders the baked surface offline
with the shading the real pass would use (adaptive mesh, smooth per-pixel
Fresnel, additive, 3×3 supersampled). **It is the look oracle for every tuning
decision below, and a throwaway once the pass lands.**

## Renderer design (converged, unspecced)

### Geometry — adaptive, baked, not a uniform sphere

Displace a sphere by `r(l, b)`. A uniform icosphere does not work: measured on
the real surface, displaced edges run **7.6 pc at the median and 148 pc at the
tail** — one triangle spanning most of the structure, at the chimney (where a
fixed angular edge stretches at 536 pc) and across steep radial slopes. Matching
that tail uniformly costs ~21M triangles; adaptive refinement on displaced edge
length reaches 7.7 pc max in 569k
(`tools/utils/geo/refineMeshByEdgeLength.ts`, target 4 pc).

WebGPU has no tessellation shaders, and the shell is completely static, so the
adaptive mesh wants baking at build time (vertex + index buffers) rather than a
vertex shader sampling the radius texture. Note this loses to the texture on
size — see **Open: runtime format**.

Shade with **smooth per-pixel normals**. Flat face normals make the mesh visible
whatever its density, because the Fresnel term jumps at every edge.

### Shading

`horizonShell` is the existing idiom and the closest prior art:
`src/services/gpu/shaders/horizonShell/fragment.wesl` — `pow(1 - abs(dot(N,V)), 3)`,
additive HDR, `discard` on miss. The difference is that its radius is a
constant; here it comes from the baked field.

Additive, `depthWrite: false`, so the blend is order-independent and the layered
folds read without a sort. **Open:** whether `depthCompare` stays on so nearer
stars occlude the far wall — depends on whether the star passes write depth.

### Slab — NEAR0, and it is the only option

- `COSMO_NEAR_MPC = 0.01` (10 kpc) at `src/services/engine/frame/slabs.ts:120`.
  The bubble is 0.07–0.6 kpc, **entirely inside COSMO's near plane**. The comment
  on that constant records the same failure for the Milky Way impostor: _"Anything
  drawing INSIDE 10 kpc cannot live on this slab."_
- NEAR0 is infinite-far reversed-Z (`SLAB_REVERSED_Z[NEAR0] = true`,
  `slabs.ts:105` → `mat4d.perspectiveReverseZ`, `zFar` omitted), so
  `foregroundFrustum`'s far plane is inert and the shell cannot be far-clipped at
  any zoom depth. Its near plane scales with altitude, so it cannot be
  near-clipped either.
- NEAR0's frame is `{ kind: 'world-mpc', originRelative: true }` and
  `RENDER_ORIGIN_MPC` is the Sun — which is the origin the radial map is defined
  about. The model matrix is effectively identity-plus-scale; no rebase.
- The visibility window below **straddles COSMO's 10 kpc near plane**, so a
  COSMO variant would clip across most of the shell's own visible range.

**Do not widen NEAR0's `distanceRangeM`.** It is `starSphereRangeM`, the painter
key merging NEAR0 with body rows (`foregroundChainOrder`). An additive,
depth-write-off shell contributes no depth-bearing content. The field looks like
it wants updating and does not.

### Visibility — a window, not a ramp

Ruled by the user: **invisible from inside**, fades in on the way out, gone
before the Galaxy is the subject, and absent at solar-system / Earth scale.

That is two composed `SCALE_FADE_BANDS` rows
(`src/services/engine/presentation/scaleFadeBands.ts`), exactly the shape the
`zoneOfAvoidance` + `zoneOfAvoidanceRecede` pair already uses:

```ts
// Keyed on: CAMERA distance from the render origin, Mpc. The render origin IS
// the Sun, which IS the shell's own centre — no separate anchor row needed.
localBubble:       { fullAt: 1.5 kpc, goneAt: 0.6 kpc },  // out of the shell
localBubbleRecede: { fullAt: 4 kpc,   goneAt: 10 kpc },   // before the Galaxy
```

Sized from apparent diameter (R ≈ 300 pc typical, ~600 pc toward the chimney):
1.5 kpc → ~22°, 4 kpc → ~8.6°, 10 kpc → ~3.4° (a blob). **Eye-tuned, not
derived.** The outer edge deliberately matches the `constellations` recede band
(1→10 kpc) — both are solar-neighbourhood chrome that shears on pull-back, so
they should probably share the symbol.

Gate in the pass's `enabled`, not just shader alpha (project rule: "opacity 0 ⇒
no render"; `horizonShellPass` is the precedent). This also removes any concern
about the extreme-zoom regime: the pass never runs below 0.6 kpc.

### Frame

The bake stays in the source's **galactic** frame deliberately, so a frame error
shows as a visible rotation rather than wrong bytes on disk. skymap's world frame
is **supergalactic**; `src/data/superGalacticTransform.ts` already builds the
basis from `galacticToCartesian(137.37, 0)` and `(47.37, 6.32)`. The renderer
applies it — nothing new to derive.

### Where it goes

A Layer per [`src/layers/README.md`](../../src/layers/README.md) —
`src/layers/localBubble/` with `settings/ load/ render/ passes/ present/ types/`.
Shaders stay at `src/services/gpu/shaders/localBubble/` (shaders do not move into
a Layer).

## Open questions

1. **Smoothing radius.** 2.5° is eye-tuned and unresolved. Too little and the
   spines return; too much and the chimney flattens. `--smooth-deg` re-bakes
   against the preview. **A human ruling.**
2. **Runtime format.** The bake writes 4 f32 planes, 1024×512 = **8.39 MB, with
   no header and no `allowDataFile` entry**, deliberately: the format is this
   feature's call, and inventing one in the data PR would be a guess to undo.
   f32 is overkill (radii span 77–536 pc; f16 gives ~0.25 pc against ~8 pc of
   real detail after smoothing). `d_inner`/`d_outer`/`thick` only ship if the
   double-walled shell is rendered. Likely target ~1 MB: `d` alone, f16,
   1024×512. A baked adaptive mesh instead would be ~6.8 MB and hard-codes the
   tessellation, so the texture probably wins.
3. **Does it survive the background?** The visibility window sits where the Milky
   Way impostor is at full strength (`milkyWayApproachSun` is full at ≥2 kpc) and
   the Gaia catalog is fully crossfaded in inside 8 kpc. A thin additive membrane
   may simply not read against that. **This is the biggest risk to the feature
   and it can only be settled in the app, not in the offline preview.**

## The near-free follow-on: the Per-Tau Shell

Build the primitive to take a radial map + a centre and the **Per-Tau Shell**
costs almost nothing: a near-sphere at 218 pc with r = 78 pc (Bialy et al. 2021,
ApJL 919 L5), i.e. the same primitive with a constant radius map.

Worth it because the two together render a real relationship rather than a
caption: **Taurus sits on both surfaces at once** — its near face is the Local
Bubble wall, its far face the Per-Tau near side, and the leading interpretation
is that Taurus formed in the compressed seam between them (Soler et al. 2023,
A&A 675 A206, finds converging gas flows consistent with exactly that).
Perseus, at ~300 pc, is beyond the Local Bubble and belongs to Per-Tau alone.

Recommendation: ship the Local Bubble alone first, but do not braid the shell
primitive to a single instance.
