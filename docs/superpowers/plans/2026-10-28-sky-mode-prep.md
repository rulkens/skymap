# Sky mode prep: line near-plane fix, near floor at standing height, 1.7 m surface check — plan

> **Spec.** `specs/2026-10-28-sky-mode-design.md` §3.3, P1, P3 and P4. The spec rides #949 and lands
> with it. P2 (the lens) shipped separately as #949.
> **Gate.** `npm run typecheck`, `npm test`, CI's build, and the eye checks named per task. P1 and P4
> are shader/render work, so **no task lands without its shots**.

## P1. Segment quads survive an endpoint behind the eye

### Finding: an epsilon threshold cannot be right

`expandSegmentQuad` (`lib/segmentQuad.wesl`) divides both endpoints by their clip w, so an endpoint
behind the eye (w < 0) flips its NDC and the quad folds across the screen. The backlog's fix shape,
and `missionTrail/vertex.wesl`'s local copy, slide the behind end to `w = eps`. No single `eps`
works:

- **Above the near plane, it cuts visible line.** A segment passing 10 m beside the eye with a far
  end 10⁹ m away crosses the screen centre at depths of a few km. Truncating it at any `eps` above
  the near plane makes the line visibly end mid-screen instead of sweeping out to the edge. A
  relative `eps` (a fraction of the far end's w) has this failure.
- **Far below the near plane, it drowns in rounding.** A clip w computed in f32 for a point ~100 Mpc
  out carries ~10⁻⁵ Mpc of noise, so a slide to `w = 10⁻²⁴` can land at a slightly negative w and
  fold again.
- The near plane is the only correct threshold. The line shaders cannot see it: `CameraUniforms`
  carries no near, and its depth convention differs per slab.

### Shape: a homogeneous screen tangent, and a behind end at infinity

The screen direction of a segment, taken at its in-front endpoint, has a division-free form that
holds whatever the sign of the other endpoint's w:

```wgsl
// d(x/w)/dt at A along A→B = (xb·wa − xa·wb) / wa² — positive scale, any wb.
fn segmentScreenTangent(aClip: vec4<f32>, bClip: vec4<f32>) -> vec2<f32> {
  return normalize(bClip.xy * aClip.w - aClip.xy * bClip.w);
}
```

When both endpoints are in front this equals `normalize(bNdc - aNdc)` (the scale is `wa·wb > 0`),
so the in-front path is unchanged.

- **One endpoint behind.** The visible part (the in-front end out to the eye plane) projects to a
  ray from the in-front end's NDC along that tangent. The behind corner becomes
  `frontNdc ± tangent * (length(frontNdc) + 4)`, which is past the screen edge from any start. It
  takes the front endpoint's z and w.
- **Both endpoints behind:** return `vec4(0)`, a degenerate quad.
- **Contract change.** The returned z/w are the selected endpoint's, or the front endpoint's for a
  behind corner. This is safe because all four users draw depthless:
  - constellations: additive, no depth;
  - markerLines: OVER with a z clamp;
  - missionTrail: z pinned to 0.5·w;
  - filaments: to verify in its pass before landing.

### Tasks

- `lib/segmentQuad.wesl`:
  - Add `segmentScreenTangent`.
  - Make `expandSegmentQuad` use it, and place a behind corner as above.
  - Refresh the header, which still says "two renderers".
- `constellations/vertex.wesl`: the gap step's tangent comes from `segmentScreenTangent`. It
  currently divides by w and folds the same way. A both-behind segment returns early.
- `bodies/missionTrail/vertex.wesl`:
  - Delete the local `W_EPS` slide.
  - Its `relKm` varying needs the eye-plane crossing for a behind corner. Pin what the fragment
    reads it for before choosing between the world-space crossing (computed in metres, where its
    0.01 m threshold is sound) and dropping it.
- **Shots, before and after.** Keep the before shots as the repro:
  - a constellation straddling the view edge from Earth (`focus=body-earth`, a figure behind the
    camera's shoulder);
  - the dome rig on a figure spanning the front/side seam (`?dome`);
  - a mission trail passing behind the camera;
  - a marker leader line whose anchor is behind the eye.
- **Backlog.** Delete "Constellation segments need a near-plane clip before quad expansion" (index
  line + `docs/backlog/2026-09-23-constellation-segment-near-plane-clip.md`) in the same commit.

## P3. The near floor sits below standing height

- **Change.** Lower `MIN_NEAR_MPC` (`utils/camera/foregroundFrustum.ts:57`, ~6.2 m) to ~0.5 m
  (`1.6e-23` Mpc), below `SKY_EYE_HEIGHT_M` = 1.7 m with margin.
- **Why it's safe.** NEAR0 is reversed-Z with an infinite far (`foregroundFrustum.ts:51-55`), so
  depth precision does not care.
- **Re-read every reader that cites it.**
  - `labelLeaderLine.ts:37`, `rebaseViewProj.ts:50`, `near0SelectionRingPass.ts:155`,
    `pivotRadiusMpc.ts:25`, and the doc comment block itself.
  - Any test that pins the value.
- **Shots must be unchanged:** the Søndermarken and Everest fly-to presets and Earth from orbit.

## P4. The surface at 1.7 m, repro-first

- **Set-up.** Debug-pose the body arm at 1.7 m, bypassing the ~15 m `SURFACE_STANDOFF_RADII` floor
  for the shot only. Do this over land (Søndermarken), over sea (Øresund) and on Mars (Jezero).
- **Shots.** Shoot the horizon and the ground at −30°.
- **Rule.** Fix only what the shots show. If nothing reproduces, P4 drops and the ledger records the
  shots.

## P5. Spec correction — landed on #949

#947 precesses Earth's pole, so the spec's equatorial grid is now the grid **of date**, and RA zero is
the host's vernal equinox for every host. The fix rode #949, the PR that carries the spec.

## Status (2026-10-30)

- **P1 done.**
  - **Harness:** in an offscreen WebGPU harness (SwiftShader) the old helper draws eye-crossing
    segments as wedges; the new one draws constant-width lines on a CPU reference projection, and
    segments with both ends in front are unchanged.
  - **Shaders:** all linked entry shaders (158) compile clean in Chrome's WGSL compiler.
  - **In-app shots (since #948 made them possible here):** main vs this branch on the dome rig and
    on Earth from orbit, both with constellations on. Both views are unchanged; the only difference
    is the live clock moving Hubble's label.
  - **Repro:** the bug case itself is the harness pair. A 60° or dome view of real constellations
    rarely puts a figure line across the eye plane, so the in-app pair is the no-regression check.
- **P3 done.** Søndermarken (1.5 km) and Everest (12 km) are unchanged against main (≤ 4 pixels of
  compression noise).
- **P4 moves to the feature PR.**
  - **Why:** the repro needs an eye at 1.7 m, and every body-arm path floors the eye at the ~15 m
    `SURFACE_STANDOFF_RADII`. Only the sky rung reaches standing height.
  - **So:** it becomes the feature plan's first eye check, before the grids. The rule stands: fix
    only what the shots show.
