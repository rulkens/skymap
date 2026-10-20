# Small bodies as mission shape-model meshes (phases 2–4)

Phase 1 (Phobos + Deimos as meshes) shipped in #926/#927 (spec under
`docs/superpowers/specs/completed/`); this file holds its leftovers and the
rest of the programme. Prototype viewer (17 bodies, phone-sized, relief + colour
maps): <https://claude.ai/artifact/789req9L8sFa4UWH6eHPSz>.

## Sources (verified 2026-10-16)

Mission teams' own shape models, mostly ~3.1M facets, from NAIF's SPICE
archive (PSI's PDS host now sits behind a Cloudflare bot challenge; NAIF does not).

| Body | File (NAIF unless noted) | Facets | Colour map |
| --- | --- | --- | --- |
| Bennu | `pds/pds4/orex/.../bennu_g_00880mm_alt_obj_0000n00000_v020.bds` (also NASA SVS GLB 5069) | 3.4M | USGS `Bennu_global_ShapeV20_GndControl_ROLOphase_ALBEDO_8bit_v6.tif` |
| Ryugu | `pds/pds4/hyb2/.../ryugu_shape_spc_3m_v20200323.bds` | 3.1M | — |
| Eros | `generic_kernels/dsk/asteroids/eros/near-a-msi-5-erosshape-v1_0_512q.bds` | 3.1M | — |
| Itokawa | `generic_kernels/dsk/asteroids/itokawa/hay_a_amica_5_itokawashape_v1_0_512q.bds` | 3.1M | — |
| Didymos / Dimorphos | `pds/pds4/dart/.../didymos_g_01165mm_spc_..._v003.bds`, `dimorphos_g_00243mm_spc_..._v004.bds` | 3.1M each | — |
| Vesta | `DAWN/kernels/dsk/dawn_vesta_grv_icq0512_v1.bds` | 3.1M | USGS `Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd.tif` |
| Ceres | `DAWN/kernels/dsk/dawn_ceres_grv_icq0256_v2.bds` | 0.8M | USGS `Ceres_Dawn_FC_DLR_global_20ppd_Oct2015.tif` |
| 67P | `ROSETTA/kernels/dsk/ROS_CG_M001_OSPCLPS_N_V1.OBJ` | 1.2M | — |
| Lutetia / Šteins | `ROSETTA/kernels/dsk/ROS_LU_K780_…OBJ`, `ROS_ST_K020_…OBJ` | 785k / 20k | — |
| Tempel 1 | `ROSETTA/kernels/dsk/TEMPEL1_9P_K032_THO_V01.OBJ` | 32k | — |
| Arrokoth | `pds/data/nh-…/dsk/mu69_porter_2024_v01.bds` | 41k | — |
| Donaldjohanson | `pds/pds4/lucy/…/lcy_donj_k548_iso20m_v10.bds` | 548k | — |
| Hyperion | PDS SBN `saturn_satellite_shape_models_V1_0/data/hyperion_30k_plt.tab` (Thomas 2018) | 29k | none usable |

Licence check still owed for JAXA (Ryugu) and ESA/LAM (67P, Lutetia, Šteins).

## Prototype findings to carry over

- Colour maps registered by cross-correlating high-passed albedo against the
  baked relief: Bennu, Vesta, Ceres at 0° (peaks 19, 20, 14); Phobos +4.5° (peak
  5.5, confirmed on Stickney). Deimos' USGS basemap is shaded relief, not
  albedo — drop it.
- Lon/lat relief maps smear on non-star-shaped bodies: 67P and Arrokoth need a
  ray-cast bake onto a UV atlas (or ship geometry only); Itokawa's neck is borderline.
- The renderer reads **tangent-space** normals (`meshBody/fragment.wesl`); the
  prototype baked object-space, so the bake converts.

## Phase 1 leftovers

- **Featured cards + thumbnails** (declined for phase 1): a card in the
  palette's Solar System tab (`featuredTabs.ts`) is what gives a body its card
  thumbnail (`SHOT_CARD_IDS`, then `npm run capture-featured`). Draft blurbs:
  Phobos — "The larger of Mars's two moons, 27 km long and marked by the 9 km
  crater Stickney. It orbits so low that Mars's tides will pull it apart within
  about 50 million years." Deimos — "The smaller, outer moon of Mars, about 15 km
  across. A thick blanket of dust fills its craters, so it looks smoother than Phobos."
- **Mars eclipse on mesh moons:** a self-hosted mesh moon draws unshadowed
  (`meshBodiesPass` skips the umbra when `hostId === body.id`); the sphere path
  had no eclipse either, but the mesh path could take Mars as the occluder.
- **Seed albedo twice:** `importMesh.py` repeats the `scenePlanets.ts` seed
  albedos with no guard against drift.
- Also out of phase-1 scope: mesh-surface camera following (the floor is the
  bounding sphere), Deimos colour, a DSK reader (OBJs only today).

## Phases

2. **Vesta, Ceres, Bennu** — colour + relief; heliocentric orbits via `probe()`-style
   SBDB elements; IAU rotation rows; prime meridian of each model frame verified
   against W0 (Vesta's Claudia vs IAU-2015 frames are the known trap).
3. **Eros, Ryugu, Itokawa, Lutetia, Šteins, Tempel 1, 67P, Arrokoth,
   Donaldjohanson, Hyperion** — catalogue scale, non-star-shaped bake, and how a
   user finds a 500 m body (labels, palette, camera approach, body facts).
   Hyperion's chaotic spin is authored; 67P's spin period drifted across perihelion.
4. **Didymos + Dimorphos** — needs [barycentric orbit pairs](2026-08-16-barycentric-orbit-pairs.md).

Related: [relief displacement](2026-10-03-body-relief-displacement.md), mesh-body
sun shadows (index line under Rendering), mesh-format consolidation (same).
