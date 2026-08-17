# No atmospheric haze once the camera is inside the atmosphere

Seen during the analytic-sphere spike: descending through Earth's atmosphere, the
haze over the disc disappears and the raw surface colour comes back. Deferred out
of the analytic-sphere grill
([session](../grill-sessions/analytic-sphere-primitive-2026-07-28.md)).

This is **not** a regression from the analytic conversion. It is a consequence of
the atmosphere shell being proxy geometry, and the shell fragment's own header has
documented the case since the shell shipped
(`atmosphere/shell/fragment.wesl:28-31`).

## Mechanism

The shell is a proxy sphere scaled to the atmosphere-**top** radius
(`atmosphereShellLayer.ts:91-98`), drawn with `cullMode: 'none'` so both walls
rasterise (`atmosphereShellRenderer.ts:394-403`). The fragment splits duty by
`@builtin(front_facing)` (`shell/fragment.wesl:153-158`):

- **near wall** (front-facing) renders only ground-hitting rays — this is the
  over-disc aerial perspective, the haze;
- **far wall** (back-facing) renders only ground-missing rays — the limb and sky.

Put the camera inside the shell and the near wall is behind the eye. No front faces
rasterise, so the branch that carries the haze has no fragments. The far wall still
draws, so the limb and sky survive; every down-looking ray loses its haze and the
planet reads at full surface albedo.

The geometry is the whole problem: a shell has no surface between the camera and
the planet once the camera is inside it. Nothing in the fragment can fix this —
the fragment is already correct for the fragments it gets, and it already handles
the camera-inside case for the rays it does see (`tNear = max(0, top.x)`,
`shell/fragment.wesl:134`).

## Reachability

`MIN_DISTANCE_MPC = 1e-17` (`clampDistance.ts:25`). Earth's atmosphere top is
`SCENE_EARTH.radiusKm + 100` = 6471 km ≈ 2.1e-16 Mpc
(`atmosphereParams.ts:108-109`), so the orbit-distance floor sits about 20× inside
the shell. Six other planets carry atmosphere rows
(`atmosphereParams.ts:106-250`), all reachable the same way.

## The named fix

`atmosphereShellLayer.ts:20-21` already calls it: "Per-pixel scene-depth-aware
aerial perspective (arbitrary occluder depth, in-atmosphere descent) is the
deferred froxel upgrade." That is the aerial-perspective half of Hillaire's 2020
technique — a low-resolution 3D volume (typically 32×32×32 rgba16f) covering the
near camera range, marched once per frame in a compute pass, then sampled per
pixel at the fragment's scene depth. It replaces the near wall's job entirely and
solves the in-atmosphere case as a side effect, because a full-screen pass has
fragments everywhere regardless of where the camera sits.

## Approach options

1. **Full froxel volume (the named upgrade).** Bake the aerial-perspective volume
   alongside the existing three LUTs — the renderer already owns a per-body bundle
   with two startup bakes and one per-frame bake
   (`atmosphereShellRenderer.ts:141-161,549-587,600-620`), so a fourth table is
   growth at an existing seam. Then a full-screen pass samples it at scene depth.
   Buys correct haze on _arbitrary_ occluders (a moon transiting the disc, the
   ring) as well as the in-atmosphere case. Largest of the three; needs the
   foreground depth target readable as a sampled texture, which no pass does today.

2. **Full-screen pass reusing the existing shell fragment.** Keep the LUTs, swap
   the proxy for a full-screen primitive when the camera is inside the shell; the
   fragment's ray reconstruction and ground test work unchanged. Much smaller than
   option 1 and reuses the calibrated look. Open question that has to be answered
   first: the shell pipeline depth-tests but writes no depth
   (`atmosphereShellRenderer.ts:404-410`), and a full-screen primitive has no
   meaningful interpolated depth, so it would need `@builtin(frag_depth)` from the
   analytic near-wall intersection to keep cross-body occlusion. That is the same
   `fragDepthFromLocal` shape `lib/analyticSphere.wesl:200-203` already provides.

3. **Leave it, and floor the camera above the surface instead.** The Earth deep-zoom
   work (`project_earth_surface_virtual_texture`) may put a surface floor on the
   camera anyway, which would make the descent regime a fly-over rather than a
   fly-through. Defensible only if that floor lands above the atmosphere top, which
   is 100 km up — unlikely for a surface-zoom feature.

Options 2 and 1 compose: 2 is a staging post, not a different destination.

## Files

- `src/services/gpu/shaders/atmosphere/shell/fragment.wesl:28-31,134,153-158` —
  the documented case, the camera-inside clamp, the wall split.
- `src/services/gpu/renderers/atmosphere/atmosphereShellRenderer.ts:394-410` —
  `cullMode: 'none'`, the depth profile.
- `src/services/engine/frame/passes/atmosphereShellLayer.ts:20-21,91-98` — the
  deferred-froxel note and the proxy compose.
- `src/services/engine/frame/encodeAtmosphereSkyView.ts` — the per-frame bake a
  fourth table would join.
- `src/utils/camera/clampDistance.ts:25` — the distance floor that makes it
  reachable.
