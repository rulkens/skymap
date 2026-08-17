# Earth's caption pick stamp out-picks whatever occludes Earth

Observed in the pick debug overlay while orbiting Earth with the Moon transiting
in front of it: the Moon's sphere pick covers Earth correctly, but a small disc
at Earth's screen centre punches through the Moon and resolves to `Source.Earth`.
Clicking the Moon anywhere outside that disc selects the Moon.

Pre-existing, and unrelated to the analytic sphere work — `bodyGlintsLayer` and
the depth bands are untouched by it, and the stamp wins against a fixed band
regardless of how the sphere's depth is produced.

## Mechanism

`bodyGlintsLayer.drawPick` (`bodyGlintsLayer.ts:318-330`) emits an ~18 px pick
point at Earth's centre, forced to `PICK_BAND_EARTH_EPS = 5.0e-4` — the
shallowest of the three glint priority bands, chosen so Earth out-picks the Moon
and every planet _at glint scale_.

A resolved sphere is supposed to escape the bands by keeping true depth, but on
NEAR0 that only happens close in. The near plane is adaptive —
`near = camDistance × 1e-4` (`foregroundFrustum.ts`) — and NEAR0 is reversed-Z
with an infinite far plane, so an object at view depth `d` with the camera at
orbit distance `D` gets `z/w = (D × 1e-4) / d`. It beats the Earth band only when

```
(D × 1e-4) / d  >  5e-4     ⟺     d < D / 5
```

Orbiting Earth, the Moon sits at roughly Earth's own depth (`d ≈ D`), so its
`z/w ≈ 1e-4` — a factor of 5 under the band. The stamp wins.

`pickDepthBands.wesl:36-39` already states the general threshold ("a glint
deliberately LOSES to a resolved sphere nearer than ~orbitDistance/4"; the Earth
band's exact figure is `D/5`). What it does not carry through is the case where
a _third_ body sits between the camera and Earth's centre.

## Why the guard that exists does not cover it

The stamp is gated on `earthCaptionPickable` — Earth is seeded, and the camera is
within `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC`. There is no condition on Earth
actually being at glint scale. The comment at `bodyGlintsLayer.ts:311-314`
addresses the resolved case and dismisses it:

> when Earth is resolved and large the extra 18 px point overlapping the sphere
> pick is harmless — it writes the SAME `Source.Earth` id `earthLayer`'s sphere
> pick writes

That holds for Earth-point vs Earth-sphere, which is the only overlap it
considers. It stops holding the moment anything occludes Earth, because the
stamp's forced band ignores the occluder's depth too.

## Approach options

1. **Gate the stamp on Earth being at glint scale.** The stamp exists for the
   sub-pixel case; a resolved Earth already has a sphere pick that needs no help.
   `partitionBodiesByPresentation` already computes exactly this test for every
   other body (`resolved = diameterPx >= BODY_GLINT_MAX_PX`, 3 px), and Earth is
   the one body excluded from that partition. Smallest change, and it deletes the
   dismissed-overlap comment rather than refining it.
2. **Give the stamp true depth when Earth is resolved.** Keeps coverage
   continuous across the transition but re-introduces the nearness-vs-importance
   braid the bands exist to remove, and needs a threshold anyway — so it is
   option 1 with extra steps.
3. **Widen the escape: raise resolved spheres above every band unconditionally.**
   Addresses the whole class rather than Earth alone (any glint stamp can occlude
   any resolved sphere beyond `D/4`), but changes pick priority globally and
   wants its own think.

Option 1 is the narrow fix; option 3 is the honest one if the same symptom shows
up for a planet glint over a resolved moon. Worth checking whether it does before
choosing.

## Files

- `src/services/engine/frame/passes/bodyGlintsLayer.ts:297-330` — the stamp, its
  gate, and the comment that dismisses the overlap.
- `src/services/gpu/shaders/lib/pickDepthBands.wesl` — the bands and the
  `~orbitDistance/4` reasoning.
- `src/services/engine/frame/partitionBodiesByPresentation.ts:48,102` —
  `BODY_GLINT_MAX_PX` and the `resolved` test every other body uses.
- `src/services/engine/frame/foregroundFrustum.ts` — `NEAR_RATIO = 1e-4`, which
  sets where the `D/5` boundary lands.
