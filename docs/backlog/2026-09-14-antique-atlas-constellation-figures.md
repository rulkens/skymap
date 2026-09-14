# Antique-atlas constellation figures (Flamsteed 1729 / Bode 1801)

`deferred` — probe done 2026-09-13/14, results parked; pick up when the 18th-century sky style is wanted.

## Goal

An 18th-century celestial-chart look for the from-Earth sky: engraved constellation
figures as alpha PNGs pinned to the sky, on top of the existing stick figures. Sky
first; whether the style carries into deep space is undecided.

## Source material

- **Flamsteed, Atlas Coelestis (1729)**, Wikimedia Commons scans
  `File:Atlas_Coelestis_by_John_Flamsteed_(1729)_NNN.jpg`, pages 009–033 are the 25
  charts (~10,800 × 7,500 px), 034/035 the two planispheres. Sky-view orientation,
  sinusoidal (Sanson-Flamsteed) projection, epoch 1690, 1° dec / 5° RA / 5° ecliptic
  rulings. Covers 55 of the 88 modern constellations: no far south (Bayer's twelve
  only on the small southern planisphere), none of Lacaille's 14, no Scutum.
- **Bode, Uranographia (1801)**, Commons copies of the David Rumsey scans (hand-coloured,
  ~11,700 × 8,000 px), 20 plates, epoch 1801, covers everything incl. Lacaille. Plate XX
  (south pole) draws all 13 Bayer/Plancius figures and 12 of Lacaille's 14
  (Microscopium label-only, Sculptor a border sliver).
- Prior art: Stellarium's Hevelius sky culture (PNG + three HIP star anchors per
  figure, `index.json`); Hevelius plates are globe-view (mirrored), so unusable directly.

## What the probe established

Throwaway pipeline (Python; numpy/scipy/skimage + LaMa in the repo `.venv`), run on
Flamsteed Orion (020) and Gemini (011) and Bode XII (Orion) and XX (south pole):

- **Plate solve works and is cheap.** NCC template matching on the plate's own star
  glyph (generic blob detectors fail on Flamsteed's paper-centre rosettes; Gemini's
  solid stamps need a morphological route), Yale BSC precessed to the atlas epoch,
  projection + cubic distortion. Flamsteed: 139–162 stars, RMS ~6′ (the engraving's own
  floor), seeded automatically (sky→plate is a reflection; mirror the star cloud, then
  scale/rotation sweep + FFT translation). Bode: 532–633 stars, RMS 5–7′, but plate XX
  is **stereographic** and XII **equidistant conic**, not sinusoidal, and auto-seeding
  fails (too many glyphs) — 5–6 hand-read seed stars per plate. ~1 min compute/plate.
- **Grid removal is solved geometrically**: predict every ruling from the solve, track
  ridges sub-pixel (0.25–0.5 px residual), mask them. Morphological line detection
  fails over hatching. Only the ~600 px polar convergence disc on Bode XX is damaged.
- **Star masks**: catalog-gated detections with per-glyph footprints measured from
  the radial ink profile (rays + halo + 4–5 px margin). Flamsteed: 47/48 stars V<4
  covered. The one filled-centre "nebulous" stamp (θ Ori) needs a core-agnostic rescue.
  Bode plots his own catalogue to ~8ᵐ, so a V<7 BSC gate covers only ~25% of glyphs —
  needs a deeper catalog (Hipparcos) before Bode star removal is usable.
- **Figure cutouts**: morphological silhouette (close 32 / open 12) + watershed
  seeded by projected IAU boundaries. Flamsteed figures come out 80–95% complete
  (thin outline strokes, club tips, hands and lettering inside the figure need hand
  work; the Orion/Lepus cut needed a manual seed). Bode's finer hatching welds the
  whole plate into 3 blobs, so the watershed does all separation and cuts through
  line-work — per-figure seeds + hand rotoscoping of contacts, 30–60 min/figure.
- **Inpainting the holes with LaMa (big-lama, MPS)**: native scale, 1 px mask
  dilation, 512 px tiles, then a local ink-density match (LaMa fills thin holes too
  light). Thin rulings and star holes in hatching are convincingly filled (~23 dB
  PSNR on synthetic ground truth); the 33 px graduated equator/ecliptic ladders leave
  a faint seam. ~80 s per full plate.
- **Photoshop hand-off** worked: layered PSD (scan / flattened ink / inpainted ink /
  figure cutout with editable mask / reference tint layers per mask), driven by
  ExtendScript over `osascript`; clipboard is too small at this size, move pixels via
  `ArtLayer.duplicate` + channel → selection → fill.

## Estimates

- All 25 Flamsteed charts: ~40 min compute + 6–10 h of hand clean-up in Photoshop.
- Bode: solving all 20 plates ~1 day; figures worth it only for a dozen hand-picked
  southern figures to fill Flamsteed's gap, not the whole atlas.
- Renderer side (not started): sky-pinned textured quads per figure with the solved
  plate model giving per-figure RA/Dec anchors; the constellation layer already owns
  the 89 IAU figures and the MSDF label atlas has a Garamond face for captions.

## Where the probe artefacts were

Session scratchpad (temporary, `/private/tmp/claude-501/…/scratchpad/flamsteed/`,
2.9 GB): `REPORT.md`, `plate2/REPORT2.md`, `bode/REPORT_BODE.md`, `plate2/pipeline/`
(consolidated ~1,240-line runner), `ps/flamsteed_orion_plate_v2.psd`. If a copy was
kept, it lives wherever the user moved it; otherwise re-run from the recipes above.
Plate overview artifact: https://claude.ai/code/artifact/31fe9dc0-d784-4b81-82eb-c6096d93d625
