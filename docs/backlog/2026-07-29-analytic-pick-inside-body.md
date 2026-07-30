# A camera inside a body makes its analytic pick claim the whole screen

Found in review of PR #520 (the analytic pick sphere). Not observed in use — the
camera has to be inside a body's radius, which takes a full zoom-in.

## Mechanism

`spherePick.wesl`'s fragment casts a ray from `camPosLocal` and keeps the near
positive root. `hitUnitSphere` reports a hit whenever `roots.y > 0`, and with the
camera inside the unit sphere `c = |ro|² − 1 < 0`, so the discriminant is
positive for **every** direction and `roots.x < 0 < roots.y`. The near-root
`select` therefore falls through to `roots.y` — the exit point on the far
interior wall — and every fragment of the proxy writes that body's `packedId`.

The proxy covers the whole screen from in there, because `cullMode: 'front'`
keeps the shell's interior facing the camera. So the pick buffer is uniformly
that one body.

This is a change. Under the previous back-face-culled mesh a camera inside the
body had every triangle culled, so the body was not pickable at all from within.

## Reachability

`MIN_DISTANCE_MPC = 1e-17` (`src/utils/camera/clampDistance.ts:25`). Earth's
radius is ~6371 km ≈ 2.06e-16 Mpc, so the orbit-distance floor sits about 20×
**inside** Earth. Nothing stops the camera entering a body today.

## Why it may not matter, and where it does

The depth written is the far interior wall, so anything genuinely between the
camera and that wall still wins the depth test — the fill only claims pixels
nothing else covers. Two consequences are real though:

- Clicking empty sky from inside a body selects that body.
- From inside Earth, Earth's far wall is _nearer_ than the Moon, so the Moon
  becomes unclickable — the fill out-picks it rather than losing to it.

## Options

1. **Discard when the camera is inside.** `if (dot(ro, ro) < 1.0) { discard; }`
   at the top of `fsPick` restores the mesh's behaviour exactly and makes the
   conversion strictly non-regressive. One line.
2. **Keep the fill, cap the depth.** Write the _near_ wall's depth instead so the
   body loses to anything outside it. Preserves "you are inside Earth, so Earth
   is what you are looking at" while fixing the Moon case.
3. **Leave it.** Defensible if the deep-zoom work ends up putting a surface floor
   on the camera anyway, which would make the whole case unreachable.

Decide this alongside Earth deep zoom, which is the work that will actually drive
the camera to this range — that is why it is filed rather than fixed in #520.

## Also noted in the same review

The `0.214%` inscribed-silhouette deficit quoted in several places
(`texturedBody/vertex.wesl`, the analytic-sphere spec and grill session) is the
**edge-midpoint** figure, where only one of the two 7.5° tessellation steps
applies. Near a facet diagonal both combine, giving `1 − cos(5.3°) ≈ 0.43%`. No
conclusion anywhere depends on which figure is used (`PROXY_SCALE = 1.05` clears
both). `lib/analyticSphere.wesl` and `sphereTessellation.ts` now state the bound;
the remaining sites are worth a sweep if someone is in those files anyway.

## Files

- `src/services/gpu/shaders/bodies/spherePick.wesl` — `fsPick`, the ray and the
  discard.
- `src/services/gpu/shaders/lib/analyticSphere.wesl` — `hitUnitSphere`'s root
  selection.
- `src/services/gpu/renderers/bodies/bodyPickRenderer.ts:274` — `cullMode`.
- `src/utils/camera/clampDistance.ts:25` — the distance floor that makes it
  reachable.
