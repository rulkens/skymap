# Body shape split: bounds vs surface

**Raised:** 2026-09-12, follow-on to the bounding-radius prep PR (mesh bodies
stopped wearing a surface `radiusM`). That PR fixed the CURRENCY at the mesh
arm and the SelectionRow; this is the shape the fix stops short of.

## The shape

Every `SceneBody` arm carries `bounds: { sphereRadiusM }` — the renderer
footprint: slab near planes and painter intervals, load radii, occluder
spheres, glint apparent size, caption lift, focus framing, zoom floor.

Only the celestial arms carry `surface: { radiusM, oblateness }` — the
altitude lane: `h/R`, the regime arm, the surface camera, orbit-drag damping,
the zoom taper, lat/lon pick, atmosphere ground sphere.

Radius as a viewer-facing FACT moves to `BODY_FACTS` for planets, and is
simply absent for meshes (a bake hull is not a property of the object).

`PivotFraming` is then built from `bounds` plus an optional `surface`, with no
null-radius encoding to mean "no ground".

## Cost

~45 files read `radiusM` today, across renderer passes, the camera lane, the
selection/InfoCard path and the seed makers. Worth doing on the next body-shape
touch, not on its own.
