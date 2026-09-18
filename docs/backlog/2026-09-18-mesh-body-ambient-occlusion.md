# Mesh bodies: ambient occlusion and a contact decal

**Raised:** 2026-09-18, user asked how to get AO onto the mesh bodies. Brainstormed
to convergence that session; the measurements landed as `npm run report-site-terrain`
(#756), which also seated the rovers on the terrain slope. Two separable efforts —
only the second has open questions.

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
runtime by `SITE_GROUND_UPS_ENU` tilting the whole rover (#756). The two never interact.

Smell worth a guard: "is this thing seated?" is scene knowledge, living in
`surfaceFixedSites.ts`, and a `SOURCES` flag is a second hand-maintained copy of it.
Cheap test — every flagged key is referenced by a `SURFACE_FIXED_SITES` row, and no
unflagged key is.

## B — the contact decal (needs design)

This is stage 1 of [mesh-body-shadows](2026-09-12-mesh-body-shadows.md); that item
keeps stage 2. The same Cycles bake produces it: with the ground plane present, the
plane's own AO atlas IS the contact shadow, sun-independent, exactly as that item
describes it. Orient it by `SITE_GROUND_UPS_ENU`, the plane the wheels are
seated on — one derivation, so wheels and shadow cannot disagree.

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

## Ground preparation

Not run. `refactor-ground` goes before the spec.
