# Surface-fixed mesh bodies need their own camera regime

**Raised:** 2026-09-12, user visual pass on PR #693 (Voyager 1/2 + Mars rovers).
User ruled: backlog, not this PR; a NEW regime, not an extension of the Earth
surface camera and not a tweak of the orbit driver.

A rover is a surface-fixed mesh body: it sits on Mars at wheel height, so the
camera that frames it is itself a few metres above the ground. The orbit driver
it currently gets is the mesh-body one from #678 — pivot at the body, up vector
inherited from the arrival pose, drag scaled by `orbitRadPerPixel`'s altitude
damping against the HOST — and none of that knows there is a ground plane a
metre under the pivot.

## The symptom

Orbiting Curiosity at ~10 m: the horizon rolls as the drag turns, the camera
dips under the surface on the far side of a vertical drag, and the wheel/zoom
feel is the host-radius regime's, not a metre-scale one.

## What the regime needs

- **Up = local radial** at the site (`rotationSurfaceLocked`'s +Z), held fixed
  through the orbit: yaw around it, pitch clamped to stay above the ground.
- **Pivot at the body**, floor at the terrain: the camera never goes below
  `groundOffsetM` under the pivot.
- **Metre-scale drag/zoom**: `orbitRadPerPixel` and the `zoomedDistance` taper
  keyed on the mesh's `boundingRadiusM`, not the host's radius.
- Engaged by data: a `surfaceFixed` position-driver row selects the regime, no
  per-body flag (`PositionDriver` already discriminates it).

Adjacent: `docs/backlog/2026-09-12-body-bounds-vs-surface.md` (the bounds/surface
split this regime would read from).
