# Survey sky overlays (HiPS)

**Readiness:** `needs-design`.

The follow-up the user named for sky mode (the draft spec's §10, archived with tag `archive/sky-mode`:
`git show archive/sky-mode:docs/superpowers/specs/2026-10-28-sky-mode-design.md`):
ultra-high-res all-sky imagery from many surveys and wavelengths, from the Planck CMB through
Fermi, ROSAT, GALEX, DSS2 colour, 2MASS and WISE. The standard is IVOA **HiPS**
(Hierarchical Progressive Surveys): HEALPix-tiled image pyramids, streamed by Aladin and Stellarium
Web, published for hundreds of surveys by CDS (alasky) and others. Deep orders reach
sub-arcsecond pixels.

What sky mode v1 already holds open:

- The lens lives in the sky pose, so arcsecond zoom only lowers `SKY_FOV_MIN_DEG` once
  `npm run perf` allows it.
- The host equatorial frame built for the grids is the frame every survey is drawn in, with a fixed
  rotation for galactic-frame surveys.
- Survey layers sit between the stars and the atmosphere composite, with a per-survey opacity. The
  grids already draw above them.

Open questions for its brainstorm:

- Stream from the public servers, or mirror tiles to R2? That brings in cache, CORS, per-survey
  licences and attribution (read `docs/DEPLOY.md`).
- Should surveys also work outside sky mode, as the backdrop of the normal camera?
- How to pick wavelengths and blend several surveys, and how a survey composes with the measured
  starfield and the Milky Way layer, so stars are not counted twice.
- Tile LOD planning against the narrow-lens screen-space load sky mode's perf pass measures.

**Narrow-lens detail (2026-11-10, owner: "backlog all").** The sky lens now reaches 1′, and three things run
out of data first: the star field empties below about 0.3° (the Gaia cut is G < 14, ~40 stars/deg²; 1′ wants
~10⁴/deg², G ≈ 19–20, ~530M stars and an out-of-core bake), famous galaxies blur below about 30′ (every
hi-res image is 1024² of the whole galaxy; M31's core is a flat wash at 5′), and the Moon. A DSS2 or PanSTARRS
HiPS layer for narrow fields would cover the stars and the galaxy cores at once; the Moon has its own line.
