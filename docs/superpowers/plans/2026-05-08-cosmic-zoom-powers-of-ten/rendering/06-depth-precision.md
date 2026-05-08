# Depth precision across the 9-shell scale range

**Status:** Rendering deep-dive. Sister spec to [`05-floating-origin.md`](./05-floating-origin.md); refines the depth-buffer story sketched in [`00-scale-architecture.md`](./00-scale-architecture.md) (Piece 3 + the per-shell near/far table).
**Required for:** Every shell that renders opaque geometry. Pure-additive passes (CMB skybox, label overlays) escape most of this; everything else lives or dies by it.

## 1. The depth-precision problem

A perspective projection maps an eye-space point at distance `z_eye` to a clip-space depth `z_clip / w_clip`. With the standard OpenGL/D3D matrix this works out to:

```
depth(z_eye) = (far / (far - near)) * (1 - near / z_eye)
```

The shape of that curve is the heart of the problem. The dominant term, `1 - near/z_eye`, is **a hyperbola**, not a line. Most of the [0, 1] depth range gets spent on the first few near-plane lengths; the back half of the frustum gets a sliver.

Concretely, with `near = 0.1` and `far = 1000` (a far/near ratio of 10⁴, fairly tame):

| `z_eye` | normalized depth | what fraction of the buffer is left |
|---------|------------------|--------------------------------------|
| 0.1     | 0.0              | 100%                                 |
| 0.2     | 0.500            | 50%                                  |
| 1.0     | 0.900            | 10%                                  |
| 10.0    | 0.990            | 1%                                   |
| 100.0   | 0.999            | 0.1%                                 |
| 1000.0  | 1.000            | 0%                                   |

Half the depth buffer is consumed in the first doubling of distance from the near plane. By the time you're at 10× near, you have one-tenth of the buffer left to resolve the *remaining 99%* of the visible world.

On a 24-bit unorm depth buffer (16.7M codes, the WebGPU baseline guarantee on `depth24plus`), that back-tenth is ~1.6M codes spread over a 990-unit range — about 1 code per 6 × 10⁻⁴ units of distance. Sounds fine, until you realize that **the codes aren't uniformly spaced in eye-space either** because of the hyperbola: at `z_eye = 100` the spacing is ~6 cm per code; at `z_eye = 999` it's ~60 m per code. Two galaxy disks 30 m apart at far-plane distance occupy the *same* depth code and z-fight.

The whole story compresses to: **depth precision is hyperbolic in eye-space distance, biased aggressively toward the near plane, and gets worse as `far/near` grows.**

## 2. Why one near/far cannot serve all 9 shells

Naively, we'd love a single projection matrix with `near = 1 km` and `far = 14 Gpc`. That's a `far/near` of ~10²². Plug into the formula above: anything past 1 cm beyond the near plane writes the same depth value as the far plane. The buffer is *constant* across virtually the entire frustum. Every renderable z-fights with every other renderable. The depth buffer becomes pure noise.

Even cleverness can't save this. Reverse-Z (section 4) buys ~6 extra bits of usable range. A 32-bit float depth buffer (section 6) buys another ~5 bits of effective resolution near the far plane. Stacked, you get `far/near ≈ 10⁸` before things break — five orders of magnitude *short* of what the cosmic zoom needs in a single matrix.

So we don't try. The whole architecture in [`00-scale-architecture.md`](./00-scale-architecture.md) exists to slice that 10²² ratio into nine independent passes, each comfortably under 10⁵, where standard depth-buffer math works.

## 3. Per-shell near/far derivation

The rule we apply for every shell:

- **`near` = (smallest visible feature in the shell) × 0.1**, so the smallest object is at ~10× the near plane and gets reasonable precision.
- **`far` = (largest visible volume in the shell) × 1.1**, so the outermost feature is just inside the frustum without wasted depth budget past it.

"Smallest feature" means the smallest *resolvable* object the shell renders, not the camera's closest-approach distance. We rely on the floating-origin shift (see [`05-floating-origin.md`](./05-floating-origin.md)) to keep camera-relative `z_eye` values inside the chosen range; the user can't actually fly closer than `near` because the camera-target distance is clamped per-shell.

Shell-by-shell, with the rationale:

| # | Shell                 | Smallest feature   | Largest volume | Near    | Far    | far/near |
|---|-----------------------|--------------------|----------------|---------|--------|----------|
| 1 | Solar System          | Sun (~0.005 AU)    | 200 AU         | 0.01 AU | 200 AU | 2 × 10⁴  |
| 2 | Stellar Neighborhood  | star (~0.01 pc)    | 200 pc         | 0.001 pc| 200 pc | 2 × 10⁵  |
| 3 | Milky Way             | nebula (~0.1 kpc)  | 200 kpc        | 0.01 kpc| 200 kpc| 2 × 10⁴  |
| 4 | Local Group           | galaxy (~0.01 Mpc) | 20 Mpc         | 0.001 Mpc| 20 Mpc| 2 × 10⁴  |
| 5 | Local Sheet           | group (~1 Mpc)     | 200 Mpc        | 0.1 Mpc | 200 Mpc| 2 × 10³  |
| 6 | Virgo Supercluster    | cluster (~10 Mpc)  | 1000 Mpc       | 1 Mpc   | 1000 Mpc| 10³     |
| 7 | Laniakea              | supercluster (~100 Mpc)| 2000 Mpc   | 10 Mpc  | 2000 Mpc| 200     |
| 8 | Cosmic Web            | filament (~1 Gpc)  | 20 Gpc         | 100 Mpc | 20 Gpc | 200      |
| 9 | Observable Universe   | shell (~10 Gpc)    | ∞              | 1 Gpc   | ∞      | ∞        |

Note shell 2 is the worst case at `2 × 10⁵`. With reverse-Z + 32f depth that's still extremely comfortable. Most shells sit in the 10²–10⁴ regime, which would work even on a 16-bit unorm.

## 4. Reverse-Z: why mapping near→1, far→0 wins

The standard convention is `near → 0, far → 1` in clip-space depth. Reverse-Z flips that: `near → 1, far → 0`. The visible geometry is the same; the depth comparison flips from `LESS` to `GREATER`; the buffer clears to 0 instead of 1.

The reason it's a win is a happy collision of two non-uniformities that *cancel out*:

1. **The perspective hyperbola** concentrates depth values near the near plane (section 1).
2. **IEEE 754 floating-point** concentrates representable values near zero. A `f32` has the same number of representable values in `[0.5, 1.0]` as it does in `[0.001953125, 0.00390625]` — both intervals get ~8.4M codes. The density of representable floats grows exponentially as you approach 0.

In **standard Z**, the near plane (where the hyperbola already gives you tight spacing) maps to depth = 0 (where floats are densely packed). Both effects pile up near the near plane; the far plane gets the worst of both worlds.

In **reverse Z**, the near plane maps to depth = 1 (sparsely spaced floats) and the far plane maps to depth = 0 (densely spaced floats). The float density compensates for the hyperbolic compression. The result is **near-uniform precision in eye-space across the entire frustum**.

Empirically this is worth ~6–10 bits of effective depth range. A 24-bit reverse-Z buffer behaves like a 30-bit standard-Z buffer for our purposes; a 32-bit float reverse-Z buffer behaves like nothing else does, period.

For implementation: the projection matrix swaps two rows. Or equivalently, we multiply the standard projection by `diag(1, 1, -1, 1) * translate(0, 0, 1)` post-build. The depth comparison op in the pipeline descriptor changes from `less` (or `less-equal`) to `greater` (or `greater-equal`). The depth clear value changes from `1.0` to `0.0`. Three small changes; everywhere else the renderer is unchanged.

## 5. Infinite-far perspective for the outermost shell

Shell 9 (Observable Universe) is special: its "far plane" is the edge of the observable universe, and we don't want a hard clip there. We use an **infinite-far reverse-Z projection**: `far → ∞`, which collapses the projection matrix to a particularly clean form (the `(far/(far-near))` term becomes `1`, the `(-near*far/(far-near))` term becomes `-near`).

With reverse-Z, this is **harmless**: the far plane in reverse-Z is depth = 0, and `lim(far→∞)` of the depth function still maps the visible volume into [0, 1]. Nothing renders past it because there is nothing past it; the matrix just stops caring about a far clip distance.

The combination *infinite-far + reverse-Z + 32f depth* is the configuration most modern engines (Unreal 5, idTech 7, every space sim built since ~2015) use for their outer-scale view. We're applying the same tool for the same reason.

## 6. Depth buffer format

WebGPU offers four depth formats per the [spec](https://www.w3.org/TR/webgpu/#depth-formats):

| Format             | Bits | Required? | Notes                                  |
|--------------------|------|-----------|----------------------------------------|
| `depth16unorm`     | 16   | optional  | rarely useful at scale                 |
| `depth24plus`      | ≥24  | required  | implementation-defined precision        |
| `depth24plus-stencil8` | ≥24+8 | required | with stencil                          |
| `depth32float`     | 32   | required  | true f32 depth                          |
| `depth32float-stencil8` | 32+8 | optional | with stencil                          |

For reverse-Z, **`depth32float` is dramatically better than `depth24plus`**, because the whole point of reverse-Z is to exploit f32's density-near-zero. A 24-bit unorm has *uniform* code spacing — reverse-Z still helps (it eliminates the hyperbolic bias) but you don't get the exponential density bonus. A 32-bit float gives both effects.

We use `depth32float` for every shell's depth attachment. The cost is 2× memory per pixel vs `depth24plus` (4 bytes vs 3 effective bytes after alignment), which at 1920 × 1080 × 2 attachments (current + crossfade neighbor) is about 16 MB of VRAM. Budget-irrelevant.

## 7. Per-shell depth attachment, orchestrator wiring

Each shell's render pass owns its own depth attachment. The orchestrator in `src/services/engine/runFrame.ts` allocates **two** `depth32float` textures matching the canvas size: `depthA` and `depthB`. At the start of each shell pass:

1. Bind the depth attachment for this shell (the active shell gets `depthA`; the crossfade neighbor, if any, gets `depthB`).
2. Set `depthLoadOp: 'clear'`, `depthClearValue: 0.0` (reverse-Z).
3. Set `depthStoreOp: 'store'` (we keep the result around in case section 8's inter-shell occlusion lands later).
4. Bind the shell's per-shell projection matrix from `perShellProjection.ts`.
5. Run the shell's renderers with `depthCompare: 'greater'`.

When the user transitions from shell N to N+1, the two attachments alternate roles. After the transition completes, the inactive attachment stays allocated but its contents become don't-care.

The depth attachments live in the orchestrator, not in any single renderer. This is the same separation as the existing color attachment.

## 8. Inter-shell occlusion (open question)

[`00-scale-architecture.md`](./00-scale-architecture.md) flags this in its "Open questions" #1. Nothing here resolves it. Two pure-rendering options when we revisit:

- **Manual depth resolve at composite.** Sample both shells' depth textures in a fullscreen pass; emit the closer one's color where it wins. Requires reverse-Z depths to be in the *same eye-space scale*, which they are not, so we'd need to remap. Doable; non-trivial.
- **Painter's-algorithm only.** Outermost shell first; inner shells composited on top with their fade alpha. Geometry-correct only when shells don't overlap in screen-space, which during transitions they always do. Cheap; visually approximate.

For v1: painter's-algorithm only, accept the artifact. Flag for later. Track in [`00-scale-architecture.md`](./00-scale-architecture.md).

## 9. Z-fighting in dense regions even within a shell

Per-shell near/far doesn't eliminate z-fighting; it merely keeps it manageable. Two surfaces 1 m apart in shell 4 (Local Group, near=1 kpc, far=20 Mpc) are still ~3 × 10⁻¹⁰ of the depth range apart. With reverse-Z + 32f that's resolvable everywhere except right at the far plane — but two surfaces 1 m apart at 20 Mpc are sub-pixel anyway.

Where it bites: **dense face-on geometry near the camera.** Example: M31's disk in shell 4 contains overlapping H II region sprites within a few hundred parsecs of each other; the camera in shell 4 can be 100 kpc away, putting both surfaces well inside the resolvable depth range, but their **own** spacing is small enough to z-fight if they're billboarded coplanarly.

Mitigations, in order of preference:

1. **Don't render coplanar billboards.** Stagger them in depth by a sub-pixel jitter (~10⁻⁴ of camera distance). Cheap; invisible.
2. **Sort and disable depth-write for transparent sprites.** Write color, skip depth. The painter's algorithm handles ordering. This is what the existing `quadRenderer.ts` already does for galaxy thumbnails — keep the convention.
3. **Use polygon offset.** WebGPU exposes `depthBias` in the pipeline descriptor. Useful for opaque surfaces (e.g., a galactic disk plane plus a halo); not for transparency.
4. **Render dense regions with a single fused mesh.** If two H II regions are always coplanar, merge them at build time into one quad with a packed texture. Eliminates the conflict entirely.

For v1 we expect to need (1) and (2). (3) and (4) are escape hatches.

## 10. Test methodology

There is no automated test for "did we get z-fighting." The eye is the test instrument. Procedure for each shell:

1. Boot the dev server with the shell active.
2. Pick a target near the **far** end of the shell (worst-case for z-fighting).
3. Orbit the camera around it slowly. Look for shimmer along edges.
4. Pick a target near the **near** end. Repeat. Look for clipping pop-in (would indicate near plane is too generous).
5. Fly the camera from near plane to far plane in a straight line. Look for any color discontinuity across geometry (would indicate two surfaces swapping depth precedence mid-flight).

If a shimmer is found: capture it (browser screen recording), then check (a) is reverse-Z actually enabled (`depthCompare: 'greater'`, clear value `0.0`), (b) is the depth format `depth32float`, (c) is the floating-origin shift active for this frame (the shell's renderer must be receiving shell-relative coordinates, not absolute Mpc).

A useful smoke test for the matrix itself: render a wireframe grid in the YZ plane spanning the full near-to-far range; in a healthy reverse-Z setup the grid lines should be visually distinguishable across the entire visible range. In a broken setup, lines past ~50% of the range smear into one another.

## 11. References

- [`./00-scale-architecture.md`](./00-scale-architecture.md) — the per-shell projection table this doc justifies.
- [`./05-floating-origin.md`](./05-floating-origin.md) — sister spec; the camera-relative coordinate shift that keeps eye-space `z` inside each shell's near/far range.
- [`../decisions/0006-information-pacing.md`](../decisions/0006-information-pacing.md) — referenced in scale-arch; *not* relevant to depth precision (UX pacing).
- WebGPU spec, depth formats: <https://www.w3.org/TR/webgpu/#depth-formats>.
- "Depth Precision Visualized," Nathan Reed, 2015 — the canonical writeup of reverse-Z. <https://developer.nvidia.com/content/depth-precision-visualized>.
- "Maximizing Depth Buffer Range and Precision," Outerra blog, 2012 — the classic infinite-far + reverse-Z derivation in a planet-renderer context. <https://outerra.blogspot.com/2012/11/maximizing-depth-buffer-range-and.html>.
- `src/services/engine/runFrame.ts` (existing) — where the per-shell depth attachment wiring will land.
- `src/services/engine/scale/perShellProjection.ts` (planned, per scale-arch) — owns the matrix construction including the reverse-Z swap.
