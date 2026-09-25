# Søndermarken mesh body on Earth — design

**Status:** approved in session 2026-09-25 (rulings below). PR 2 of the Søndermarken landing; PR 1 (mesh-body tiers, #821) shipped.

## Goal

The workbench photogrammetry scan of Søndermarken (2019 leaf-on crop, group `soendermarken-crop-2019`, asset `mesh-cropped`) draws on Earth's terrain in the main app as a mesh body, at its true georeferenced position and height, with the terrain cut away underneath so the scan's lawn — up to 3 m below the DHM terrain in places — shows.

## The source

`public/data/geo3d/groups/soendermarken-crop-2019/assets/mesh-cropped/mesh.glb` (workbench output): 470,046 triangles, one primitive, one material, `POSITION` + `TEXCOORD_0` only (no normals), one 8192² JPEG. Frame: ENU metres, +X east, +Y north, +Z up, origin at the group anchor (55.67, 12.53, 18.53 m DVR90). The crop does NOT surround its origin: x ∈ [−428, −212], y ∈ [−145, 106], z ∈ [7.4, 44.1] — the park is ~216 × 251 m centred ~320 m west of the anchor. The anchor is shared with the whole-park group on purpose and is not moved.

DVR90 is the app's DHM terrain datum, so heights need no geoid shift. Throwaway spike (2 m cells, scan placed at its true height): the scan's ground is below DHM by > 0.1 m in 56 % of cells, median −0.23 m, p5 −1.32 m, min −3.2 m, no tilt.

## Rulings

- **Lighting:** default mesh-body PBR; the scan's baked sunlight is lit a second time (accepted).
- **Tiers:** `small` = meshopt-simplified to 150k triangles + 2048 textures; `medium` = full mesh + 4096 textures. Both from the one raw GLB.
- **Seat kind:** `MeshSeatKind = 'resting' | 'anchored'` on `SurfaceFixedSite`. Rovers are `resting` (today's behaviour). The park is `anchored`.
- **Origin:** the build shifts the mesh so its origin sits at a site authored at the crop centre: translation = ENU(site − source anchor). No runtime change for placement.
- **Height:** absolute — the source anchor's DVR90 height; no terrain sample.
- **Terrain hole:** fragment discard in the surface-tile shaders via a baked outline mask, outline shrunk ~2 m inward.
- **Picking:** the park is not pickable (search / fly-to still reach it).
- **Manifest:** ships through `build-meshes` as a normal `meshes/<key>` body so `manifest.json` and the R2 allow-list cover it.
- **Packaging:** one PR, prep as its own commits first.

## Design

### Data

```ts
// src/@types/scene/MeshSeatKind.d.ts
export type MeshSeatKind = 'resting' | 'anchored';
//  resting  — site = the recentred mesh's origin; seat height = highest drawn ground within the
//             bounding radius; up fitted to the slope; the Blender AO/contact prebake is required.
//  anchored — the mesh's source is georeferenced; the build shifts its origin onto the site; seat
//             height = the source anchor's height; up = the anchor's up seen from the site; no
//             prebake stamps, no contact decal; not pickable.

// SurfaceFixedSite gains `readonly seat: MeshSeatKind` (required; 4 rover rows get 'resting').
// Its latDeg comment: geodetic on Earth (tiles map WGS84 lat straight onto the sphere).

// tools/utils/io/meshSources.ts
export type MeshTierSource = { readonly raw: RawDataKey; readonly triangles?: number }; // absent = full mesh
// MeshSourceEntry.tiers: Partial<Record<Tier, MeshTierSource>>   (7 existing rows: { raw: 'meshes.<key>' })
// MeshSourceEntry.georeferenced?: { anchor: GeodeticAnchor; holeOutline: string }  // required iff an anchored site uses the key
//   GeodeticAnchor = { latDeg; lonDeg; heightM }  (heightM on the host terrain's datum — DVR90 on Earth)
//   holeOutline = repo path of the committed ring (data/geo3d/soendermarken-crop-2019/mesh.outline.json, ringM in source ENU metres)

// Generated MeshAssetRow gains `hole?: { lonMinDeg; latMinDeg; lonSpanDeg; latSpanDeg }`
// — the lat/lon rect the baked mask `meshes/<key>_hole.webp` (untiered, like `_contact`) covers.
```

Rows: `MESH_SOURCES.soendermarken` (raw `meshes.soendermarken`, small `{ triangles: 150_000 }`, medium full; licence CC BY 4.0, attribution "Contains skråfoto © Klimadatastyrelsen (CC BY 4.0), photogrammetry by Alexander Rulkens"), `SURFACE_FIXED_SITES` row `{ id: 'soendermarken', hostId: 'earth', latDeg: 55.670015, lonDeg: 12.524611, altitudeM: 0, seat: 'anchored' }` (crop-bounds centre), a `SEED_MESH_BODIES` row, a `surfaceLocked` rotation row with heading putting body +X on east, and a raw-registry row `meshes.soendermarken` → `data/raw/meshes/soendermarken/mesh.glb` (gitignored, copied from the workbench output, checksum in `meshes.sha256`).

### Build (`tools/meshes/buildMeshes.ts`)

- **Normals:** a missing `NORMAL` gets area-weighted smooth normals (`computeSmoothNormals`), replacing today's silent `[0,0,1]` fallback. Must verify the scan's mean normal points up (+Z); if the winding is inverted, the build flips it.
- **Simplify:** a tier with `triangles` is simplified with meshoptimizer's `MeshoptSimplifier` (UV-preserving: attribute-aware, seams respected) to within ±5 % of the target; the texture cap is still `tierToTexturePx(tier)`.
- **Anchored origin:** for a georeferenced key, skip the centroid recentre and translate by `−ENU_anchor(site)` (local tangent plane; the 320 m offset's curvature error is ~1 cm). `boundingRadiusM` / `minZ` are then measured from that origin. No `groundOffsetM` read for the site (its `altitudeM` is 0).
- **Hole mask:** rasterise `holeOutline` (shifted by the same translation, eroded 2 m inward) into an R8 mask over its lat/lon bounding rect at ~0.5 m/px, written as `meshes/<key>_hole.webp`; emit `hole` on the row.
- **Prebake gate:** `meshGroundUpSource` treats only `resting` sites as seated, so anchored keys need no AO/contact stamps and get no contact decal.
- **Guard:** a georeferenced key without an anchored site, or an anchored site whose key is not georeferenced, throws.

### Site heights (`tools/textures/buildSiteGroundHeights.ts`)

One dispatch on `site.seat`: `resting` → today's footprint fit; `anchored` → height = `georeferenced.anchor.heightM`, up = the anchor's up in the site's ENU ≈ normalize([−dx/R, −dy/R, 1]) with (dx, dy) = ENU(site − anchor). Anchored rows read no tile manifest.

### Runtime

- **Load:** `meshFetcher` fetches `_hole.webp` alongside `_contact.webp` when the row has `hole`; the loaded `MeshAsset` carries it.
- **Terrain hole:** the surface-tile pipeline gains one bind group, present on every fragment variant: the hole mask texture + a 16 B uniform (hole rect: lon/lat min in radians, 1/span). Hosts with no loaded holed mesh bind a 1×1 zero mask. The vertex stage emits one varying `holeUv` from the tile's own lat/lon lattice minus the rect origin (the subtraction keeps f32 precision); the fragment discards where the mask > 0.5. The hole appears only while the mesh asset is resident — outside its load radius the terrain is whole, which is correct because the mesh isn't drawn. One holed mesh per host (a second throws at module load; growth to an array layer when needed).
- **Picking:** `meshBodiesPass.drawPick` skips bodies whose site is `anchored`.

## Ground preparation

Checkpoint run 2026-09-25 (sketch + greenfield cross-check). Prep commits, sequenced first:

1. **Seat kind** — `MeshSeatKind` + required `seat` on `SurfaceFixedSite` (rovers `resting`); `meshGroundUpSource` keys "seated" off `resting`. Joint for J1/J3 (no per-site rule slot at `buildSiteGroundHeights.ts:50-55`; "seated ⇒ prebake" at `buildMeshes.ts:534-548`).
2. **Computed normals** — replaces the silent +Z fallback (`buildMeshes.ts:330`). No change for today's meshes (all carry normals).
3. **Tier spec objects** — `MeshTierSource { raw, triangles? }` for the 7 existing rows. Joint for J5.

Dropped by the height ruling: the per-host site-height generator prep (anchored rows read no manifest). Greenfield divergences: runtime terrain sampling rejected (seat is build-time); outward hole growth rejected (the base globe under a hole is drawn at −430 m, so a hole wider than the mesh opens a pit).

## Risks

- The mask's lat/lon rect is affine to the scan's ENU only locally — fine at 250 m.
- Terrain LOD changes the rim height; the 2 m inward erosion keeps terrain overlapping the scan's edge (a small terrain step there is the accepted seam).
- Download weight: medium ≈ 470k triangles + 4K atlas.

## Out of scope

- R2 sync (on the user's word after merge, from main).
- Multiple holes per host; holes for non-mesh reasons.
- Re-lighting / de-lighting the scan.

## Adjacent (backlog)

- The workbench feeds DVR90 heights in as ellipsoidal (~36 m shared bias). Not this PR: app terrain and scan are both DVR90.
