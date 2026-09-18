# Mesh bodies: ambient occlusion and seated orientation

**Raised:** 2026-09-18, user asked how to get AO onto the mesh bodies. Brainstormed
to convergence that session; the measurements landed as `npm run report-site-terrain`
(#756). Three separable efforts — only the third has open questions.

The mesh shader's environment term (`envSplitSum`) is the body's only ambient and it
reaches every texel unattenuated — `meshBody/fragment.wesl`'s header says as much.
Cavities are lit as brightly as open surfaces: rover under-decks, Hubble's aperture,
Voyager's dish, the petunia foliage.

## A — baked AO, in the R channel already on disk (ready)

Bake, not SSAO. SSAO would need a G-buffer the renderer does not have, and would have
to run inside the mesh body's `body-m` slab row before the next row clears depth
(`renderTargets.ts`: "this buffer only ever holds the LAST row's value"). It is also
off-posture — every body-lighting effect here is analytic or precomputed.

Ship it as R of the existing `_mr` map, the glTF ORM convention: `fragment.wesl:48`
reads `.gb` and drops R, `buildMeshes.ts:474` writes `r: 0`. No new bind-group slot,
no new file, no extra bytes over the wire.

- `meshPrebake.py` `BAKE_PASSES` — one AO row. Drive it with a
  `ShaderNodeAmbientOcclusion` into Emission Color baked as `EMIT`, through the
  existing `swap_to_emission` machinery: that gives an explicit Distance input
  instead of fighting Cycles' global AO knobs.
- `flatten_materials` — link the AO atlas into the exporter's `glTF Material Output`
  node group's `Occlusion` input; the exporter then packs it into R of the same ORM
  image it already builds from the roughness and metallic atlases.
- `buildMeshes.ts` — metalRough fallback `r: 0` becomes `255` (unoccluded). A source
  whose glTF carries a SEPARATE `occlusionTexture` is dropped today; composite its R
  into the `_mr` PNG at bake time so there is still one texture slot forever.
- `fragment.wesl` — sample `.rgb`, thread `ao` into `envSplitSum` (one call site).
  Multiply the ENV term only, never `direct`: that is the glTF semantic and correct
  here, since the probe _is_ the ambient. Use a multi-bounce curve on the diffuse half
  and a roughness-aware specular-occlusion term on the specular half, or metals
  reflect the probe straight through their own trusses.

LANDMINE — `only_local` on the AO node must stay False, or scene occluders contribute
nothing: the bake still succeeds, the atlas just comes out unchanged.

OPEN — `whale` and `petunias` bypass the prebake (Sketchfab GLBs with their own maps),
and Sketchfab assets frequently ship AO already burned into the diffuse. Hand-check
before applying, or skip those two. They are also where AO pays off most.

### The ground plane, for seated bodies

A rover's underside sees mostly ground, and the probe — captured from the body's
centre — does not know that. Add a procedural occluder plane for the AO bake only.

- Per-key flag in `meshPrebake.py`'s `SOURCES`: `curiosity`, `perseverance`, `mer`.
  No mesh key is shared between a seated body and a floating one today (`mer` backs
  both Spirit and Opportunity, both on Mars).
- Create it AFTER `join_meshes` — that function deletes every non-joined object, so a
  plane parked in the `.blend` never survives to the bake — and remove it before
  `flatten_materials` so it cannot leak into the export.
- Position and extent come from `bounds(obj)`, already computed in `main()` and
  currently only logged. The plane sits at `lo[1]` — **+Y, not +Z**: all three rovers
  are modelled up = +Y, and `bodyFromSource` rotates up onto body +Z only later, in
  `buildMeshes.ts`.
- Do not select it for the bake; it is an occluder, not a bake target.

Over-darkening is not the risk it looks like. `envSplitSum`'s diffuse samples the probe
along the surface normal, so an underbelly normal already points at Mars and picks up
Mars-coloured bounce. AO multiplies that — the hue survives, only the intensity goes.

The plane stays flat in the model's own source frame; terrain slope is handled at
runtime by tilting the whole rover (effort B). The two never interact.

Smell worth a guard: "is this thing seated?" is scene knowledge, living in
`surfaceFixedSites.ts`, and a `SOURCES` flag is a second hand-maintained copy of it.
Cheap test — every flagged key is referenced by a `SURFACE_FIXED_SITES` row, and no
unflagged key is.

## B — seated orientation from the height tiles (ready)

`rotationSurfaceLocked` derives up from `normalize(bodyPos − hostPos)`, the radial
direction, so a rover stands bolt upright while the ground tilts under it. Measured
2026-09-18 with `npm run report-site-terrain`: Curiosity 9.67° (84.5 cm of gap across
the vehicle), Perseverance 9.91° (69.5 cm), Spirit 3.59° (15.1 cm). Re-run the tool
rather than trusting these numbers after a re-bake.

Bake a `Vec3` up per site beside `SITE_GROUND_HEIGHTS` and substitute it for the radial
`up`. NOT a quaternion applied afterwards: that rotates the heading too, so
`headingDeg` would stop meaning azimuth from north. Substituting `up` lets the existing
north/east/heading construction re-derive around it for free — one parameter, one line.
There is no `Quat` type in `@types/math/` in any case; orientation data here is `Mat3`.

`buildSiteGroundHeights` already re-runs at the end of a non-dev Mars tile bake, so a
baked up-vector row is self-maintaining the way `groundOffsetM` already is. Both
helpers exist: `terrainUpEnu` and `tilePostAtLatLon` (#756).

Baseline is the body's own footprint, not one post — though measured sensitivity is
only ~0.5° out of ~10°, so any sane baseline does. One post reads tile quantisation.

Add a small deliberate sink (`contactSinkM`) alongside. At the 1 m HiRISE DTM posts the
terrain does not know about the rock under a wheel, so residual error is guaranteed,
and floating reads far worse than slight clipping — especially with a decal under it.

## C — the contact decal (needs design)

This is stage 1 of [mesh-body-shadows](2026-09-12-mesh-body-shadows.md); that item
keeps stage 2. The same Cycles bake produces it: with the ground plane present, the
plane's own AO atlas IS the contact shadow, sun-independent, exactly as that item
describes it. Once B lands, the decal orients with the same plane the wheels were
seated against — one derivation, so wheels and shadow cannot disagree.

OPEN — the rendering route:

- A ground-aligned quad at a constant offset above the surface, depth-tested against
  the terrain tiles. Self-contained, and works on a host with no tile pyramid.
- Or sampled in the terrain fragment shader itself: four Mars sites, projected into the
  site's ground plane, multiplied into the surface colour. No offset, no z-fighting, no
  LOD coupling — but it touches `surfaceTile` shading and its uniforms.

If the quad wins: `geometricResidualM` is decoded in `decodeHeightTileHeader.ts` and
then dropped (`ResidentHeightLookup` keeps none), so an offset derived from it needs
new plumbing. A constant is fine in practice — the decal is only legible close up,
where the deepest band is resident.

## Data note — Opportunity's site has no terrain under it

Its z17 tiles carry 0.66 m of relief across a whole 163 m tile, against 12–32 m at the
other three. One metre over 163 m on Endeavour's rim is fill, not data: its 1.04° tilt
is noise and the ground renders flat. `marsSurfaceBake.ts`'s window check passes
because it tests the declared band bounds, not data coverage.

OPEN — fix here (re-bake against a DTM that covers it, or move the proxy lat/lon),
defer, or accept. Both MER lat/lons are eyeballed proxies already, as
`surfaceFixedSites.ts` says.

## Ground preparation

Not run. `refactor-ground` goes before the spec.
