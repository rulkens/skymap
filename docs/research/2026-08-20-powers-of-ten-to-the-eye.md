# Powers of ten below z13: data survey from the Copenhagen band to a human eye

2026-08-20. Survey of what data exists (and doesn't) to continue the Earth deep-zoom
below the EOX s2cloudless floor, ending at a photogrammetric scan of a person lying in
Søndermarken (Frederiksberg) holding a banana for scale — an Eames _Powers of Ten_
homage; the original film's Chicago picnic site (Burnham Park) is already inside the
harvested `chicago` EOX bbox. Endpoint of the zoom: the eye.

## The ladder

Each rung ≈ one decade of resolution. The EOX band bottoms out at ~9.5 m/px N–S at
55.7°N (WGS84 z13, 256 px tiles); every rung below it is new data.

| Rung | Resolution | Frame            | Data                                                                                        | Status                                                               |
| ---- | ---------- | ---------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 0    | ~10 m/px   | Copenhagen metro | EOX s2cloudless z13                                                                         | shipped (#584, multi-region #596/#597)                               |
| 1–2  | 1 m–10 cm  | Søndermarken     | GeoDanmark ortofoto + Danmarks Højdemodel                                                   | backlog: `2026-08-20-geodanmark-ortho-band.md`                       |
| 3    | ~1 cm      | grass, blanket   | drone nadir photogrammetry of one patch                                                     | must shoot; drone rules near Frederiksberg Slot (army academy) + Zoo |
| 4    | ~1 mm      | person + banana  | full-body photogrammetric scan, in situ pose                                                | must shoot                                                           |
| 5    | ~0.1 mm    | face             | dedicated head scan, cross-polarized                                                        | must shoot                                                           |
| 6    | ~10 µm     | iris             | focus-stacked macro iris photos + **analytic** cornea/sclera (specular is shader, not data) | end of the data line; next decade = retina = medical imaging         |

Structural break at rung 3: web-mercator/WGS84 tiles stop making sense between 10 cm
and 1 cm. Rungs 3–6 are one georeferenced local asset stack — the renderer's first
non-point, non-quad, non-tile primitive (mesh or splat, fork open below) — built once,
shared by all four rungs.

## Danish open geodata (rungs 1–2)

- **GeoDanmark ortofoto (forår)**: national spring flight, 12.5 cm/px standard
  (15 cm GSD resampled), 10 cm where the municipality opts in (varies per year; check
  the `orto_foraar_10cm` coverage layer for Frederiksberg). 4-channel RGBNir, native
  EPSG:25832. Annual; 2025 vintage live. 10 cm ≈ usable to WGS84 z19 (0.149 m/px N–S,
  0.084 E–W at 55.7°N); z20 is upsampling.
- **Licence: CC BY 4.0** (Klimadatastyrelsen "frie geografiske data" terms; also covers
  Danmarks Højdemodel). Credit "Ortofoto © GeoDanmark / Klimadatastyrelsen (CC BY 4.0)"
  — same regime as the EOX credit, one more line in `ATTRIBUTIONS.md`. Harvest-to-R2 is
  fine.
- **Access — Datafordeleren, apikey services** (free key via Datafordeler
  Administration). The apikey endpoints are the _modernized_ ones and survive the
  platform transition; legacy username/password WMS/WMTS dies 2027-01-15, and the old
  predefined bulk "Filudtræk" was retired 2026-04-29 in favour of Fildownload (HTTPS).
  - WMS `https://services.datafordeler.dk/GeoDanmarkOrto/orto_foraar/1.0.0/WMS?apikey=…`
  - WMTS web-mercator `https://wmts.datafordeler.dk/GeoDanmarkOrto/orto_foraar_webm/1.0.0/WMTS?apikey=…`
    (layer `orto_foraar_webm`, matrix set `DFD_GoogleMapsCompatible`, JPEG)
- **CRS finding (the load-bearing one):** skymap's tile ladder is WGS84 geographic
  (`tileDeg = 180/2^z`); GeoDanmark WMTS grids are EPSG:3857/25832 — neither fits, so
  the EOX harvest-by-tile-index pattern does not transfer. Recommended path: WMS GetMap
  per skymap-grid tile with `CRS=EPSG:4326` (server reprojects; WMS 1.3.0 + 4326 means
  **lat,lon** BBOX axis order). Gated on an apikey spike; detail in the backlog brief.
- **Resolution ceiling survey:** 10 cm is the open ceiling. Hexagon's commercial DDO is
  12.5 cm (no sharper than public; summer flight is its selling point). Bespoke
  small-area flights reach 2.5–7 cm (Kortomatic demoed 2.5 cm over central Copenhagen)
  but buy at most one extra zoom level — the gap to rung 3 needs a drone regardless.
- **Also open, same licence:** Danmarks Højdemodel (0.4 m LiDAR DTM/DSM — terrain
  relief for rung 2) and Skråfoto oblique aerials (~5–10 cm, four compass directions —
  scouting + a possible self-built photogrammetric park mesh, see next section).
- Browser viewers: dataforsyningen.dk ("Se på kort"), skraafoto.dataforsyningen.dk.
  Older `sdfekort.dk`/`sdfikort.dk` bookmarks are dead (agency renamed twice).

## Google Photorealistic 3D Tiles — evaluated, rejected

Google's Earth mesh streams as OGC 3D Tiles (glTF) and third-party renderers are
explicitly permitted, but the Map Tiles API policy prohibits pre-fetching, storing,
caching, and offline use — the exact harvest-once → R2 → offline `record-tour` model
skymap is built on. Session-token root requests, per-request billing, and mandatory
Google-logo attribution add a live landlord dependency. Effective texture resolution
over Copenhagen is ~15–25 cm anyway — a prettier z17–z19, not progress toward rung 3.
Licence-clean alternative if a photoreal park mesh is ever wanted: build it ourselves
from Skråfoto + DHM (CC BY 4.0 permits derivatives).

## Photogrammetry & splat tooling (rungs 3–6)

Mesh pipelines:

- **RealityScan 2.x** (ex-RealityCapture, Epic): free under $1M revenue; the VFX-speed
  option; **Windows + NVIDIA CUDA only** — not runnable on this project's Mac.
- **Agisoft Metashape**: $179 Standard (one-time) does everything the art project
  needs; native Apple Silicon incl. GPU. Pro ($3,499) only adds surveying features
  (GCP georeferencing, orthomosaic/DEM export).
- **Apple Object Capture** (`PhotogrammetrySession`, free, in macOS): startlingly good
  at object scale (the banana), USDZ/OBJ + PBR maps at `raw` detail. Weak for people
  (subjects move across a capture; lying down helps), area mode unreliable past ~6 ft.
  Black box — no manual alignment rescue. Right tool for the first zero-cost
  experiments.
- Open source: COLMAP (BSD; the pose-solving backbone everything shares), Meshroom/
  AliceVision (MPL2), OpenDroneMap (AGPL; rung-3 orthos/DEMs).

Gaussian splats — the open fork for the person/field capture (grass, hair, eyelashes
favour splats over meshes; aligns with the parked volume-work representation pivot):

- **Brush** (Apache 2.0): splat trainer in Rust on wgpu, GPU work compiled to WGSL — no
  CUDA, trains natively on a Mac, runs in-browser. Same substrate as skymap's renderer.
- **OpenSplat** (AGPLv3): C++ trainer, Metal/MPS backend (~3 min/2k steps on M2). AGPL
  is fine for training (we ship output splats, not the trainer).
- Avoid the original Inria 3DGS repo (research-only licence); nerfstudio/gsplat
  (Apache 2.0) is the research workbench but wants CUDA.
- **Video is a valid input** (and the splat-world norm): ffmpeg frame extraction →
  COLMAP → trainer. Physics limits, not software: motion blur (shoot 4K60, move
  slowly), 4:2:0 compression. Fine through rung 4; rungs 5–6 stay stills +
  focus-stacking. Photos captured for photogrammetry feed splat trainers unchanged, so
  capture sessions don't have to pick the fork.

## Sources

- GeoDanmark ortofoto: <https://dataforsyningen.dk/data/981> ·
  <https://datafordeler.dk/dataoversigt/geodanmark-ortofoto/>
- Licence: <https://datafordeler.dk/vejledning/brugervilkaar/kds-geografiske-data/> ·
  <https://www.geodanmark.dk/home/vejledninger/vilkaar-for-data-anvendelse/>
- Datafordeler transition: <https://datafordeler.dk/Transition>
- Google Map Tiles policy: <https://developers.google.com/maps/documentation/tile/policies>
- RealityScan licence: <https://www.realityscan.com/license> · Metashape:
  <https://www.agisoft.com/buy/online-store/>
- Brush: <https://github.com/ArthurBrussee/brush> · OpenSplat:
  <https://github.com/pierotofy/OpenSplat>
