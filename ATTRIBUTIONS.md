# Attributions

Skymap's source code is MIT-licensed (see [LICENSE](LICENSE)). This file
enumerates the third-party data, imagery, and software that the project
depends on, together with their licences and the references their authors
ask be cited. It is the project's good-faith effort to give credit where
credit is due — if anything is missing or mis-attributed, please open an
issue.

---

## Source code

The TypeScript / WGSL / React source under `src/`, `tools/`, and `tests/`
is © Alexander Rulkens, MIT-licensed. See [LICENSE](LICENSE).

## Catalogue data

### SDSS — Sloan Digital Sky Survey

- **Use:** Spectroscopic galaxy positions, redshifts, and `ugriz` photometry,
  exported via SDSS SkyServer SQL queries. Reference catalog file lives
  under `data/` (gitignored).
- **Licence / citation:** SDSS data products are publicly released; the
  collaboration asks that publications using SDSS cite Abdurro'uf et al.
  2022 (DR17) or the DR18 release paper as appropriate. See
  <https://www.sdss.org/collaboration/citing-sdss/>.

### 2MRS — 2MASS Redshift Survey

- **Use:** All-sky near-IR-selected redshift catalogue (J/H/Ks photometry +
  cz), parsed from the public ASCII release.
- **Reference:** Huchra et al. 2012, ApJS 199, 26.
- **Licence:** Publicly released; cite the paper above.

### GLADE v2.3 — Galaxy List for the Advanced Detector Era

- **Use:** Compilation of nearby galaxies for gravitational-wave electromagnetic
  follow-up, with cross-matched B-band photometry, distances, and PGC IDs.
- **Reference:** Dálya et al. 2018, MNRAS 479, 2374.
- **Licence:** CC-BY 4.0 / publicly released; cite the paper above.

### HyperLEDA — Lyon-Meudon Extragalactic Database

- **Use:** Per-galaxy axis-ratio, position-angle, and isophotal-diameter data
  fetched via the `fG.cgi` JSON-ish endpoint at
  <http://atlas.obs-hp.fr/hyperleda/>. Used for both the GLADE orientation
  enrichment cache (`data/raw/hyperleda_pa.csv`) and the famous-galaxy
  catalog metadata (`data/seeds/famous_galaxies.seed.json`).
- **Reference:** Paturel et al. 2003, A&A 412, 45; Makarov et al. 2014, A&A
  570, A13.
- **Licence:** Publicly released; cite the papers above.

### 2MASS Extended Source Catalog (XSC)

- **Use:** Per-galaxy super-coadd shape data (`sup_phi`, `sup_ba`) fetched via
  Vizier `VII/233/xsc`, used to enrich 2MRS rows with photometric
  orientation.
- **Reference:** Jarrett et al. 2000, AJ 119, 2498.
- **Licence:** Publicly released; cite the paper above.

### DESI DR1 — Dark Energy Spectroscopic Instrument

- **Use:** DR1 large-scale-structure clustering catalogs (the four NGC tracer
  files `BGS_BRIGHT`, `LRG`, `ELG_LOPnotqso`, `QSO`), cone-filtered at build
  time to a narrow 2.5° deep cone around Corona Borealis. Positions +
  redshifts feed the point cloud; only `BGS_BRIGHT` carries photometry.
- **Reference:** DESI Collaboration et al. (2026), "Data Release 1 of the
  Dark Energy Spectroscopic Instrument", AJ 171, 285
  (ads: [2026AJ....171..285D](https://ui.adsabs.harvard.edu/abs/2026AJ....171..285D)).
- **Licence:** CC BY 4.0.
- **Required acknowledgment** (verbatim, per
  <https://data.desi.lbl.gov/doc/acknowledgments/>):

  > This research used data obtained with the Dark Energy Spectroscopic Instrument (DESI). DESI construction and operations is managed by the Lawrence Berkeley National Laboratory. This material is based upon work supported by the U.S. Department of Energy, Office of Science, Office of High-Energy Physics, under Contract No. DE–AC02–05CH11231, and by the National Energy Research Scientific Computing Center, a DOE Office of Science User Facility under the same contract. Additional support for DESI was provided by the U.S. National Science Foundation (NSF), Division of Astronomical Sciences under Contract No. AST-0950945 to the NSF's National Optical-Infrared Astronomy Research Laboratory; the Science and Technology Facilities Council of the United Kingdom; the Gordon and Betty Moore Foundation; the Heising-Simons Foundation; the French Alternative Energies and Atomic Energy Commission (CEA); the National Council of Humanities, Science and Technology of Mexico (CONAHCYT); the Ministry of Science and Innovation of Spain (MICINN), and by the DESI Member Institutions.

### Gaia DR3 — ESA Gaia mission

- **Use:** The G<14 slice of the `gaiadr3.gaia_source_lite` main catalog
  (positions, `G` magnitude, `BP−RP` colour) — the bright-star raw input to
  skymap's star bin, fetched via the ESA Gaia TAP service by
  `npm run fetch-gaia`. Provenance + column contract in `data/raw/gaia/README.md`.
- **Reference:** Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1 (Gaia DR3).
- **Licence:** Gaia data are publicly released under the Gaia Data Licence
  (<https://www.cosmos.esa.int/web/gaia-users/license>); cite the paper above.
- **Required acknowledgment** (verbatim, per ESA's canonical credit page
  <https://gea.esac.esa.int/archive/documentation/GDR3/Miscellaneous/sec_credit_and_citation_instructions/>,
  fetched 2026-07-14 — this is the canonical in-repo copy):

  > This work has made use of data from the European Space Agency (ESA) mission Gaia (https://www.cosmos.esa.int/gaia), processed by the Gaia Data Processing and Analysis Consortium (DPAC, https://www.cosmos.esa.int/web/gaia/dpac/consortium). Funding for the DPAC has been provided by national institutions, in particular the institutions participating in the Gaia Multilateral Agreement.

### Bailer-Jones geometric / photogeometric distances

- **Use:** Per-star geometric (`r_med_geo`) and photogeometric
  (`r_med_photogeo`) distance estimates from `external.gaiaedr3_distance`,
  joined onto the Gaia DR3 main-catalog rows on `source_id` to place bright
  stars in 3D.
- **Reference:** Bailer-Jones et al. 2021, AJ 161, 147.
- **Licence:** Publicly released via the Gaia archive; cite the paper above.

### GCNS — Gaia Catalogue of Nearby Stars

- **Use:** The `external.gaiaedr3_gcns_main_1` 100 pc supplement (parallax +
  photometric distance for 331,312 nearby stars), filling in the local
  volume below the G<14 main-catalog cut.
- **Reference:** Gaia Collaboration, Smart et al. 2021, A&A 649, A6.
- **Licence:** Publicly released via the Gaia archive; cite the paper above.
  The Gaia mission acknowledgment under **Gaia DR3** applies to this table as well.

### Gillessen et al. 2017 — Galactic-Centre S-star orbits

- **Use:** The 39 bound S-star orbits drawn around Sagittarius A\*. Two
  different tables, both hand-transcribed into the repository rather than
  fetched at build time (they are 39 and ~100 rows, not a catalogue):
  - `J/ApJ/837/30/table3` — the fitted orbital elements (semi-major axis,
    eccentricity, inclination, node, argument of pericentre, pericentre
    epoch, period), plus the K magnitude and early/late spectral flag that
    set each star's colour and size. Transcribed to
    `src/data/bodies/sStarElements.ts`, one verbatim source line per row.
    The 40th published row, S111, is excluded as unbound (e = 1.092).
  - `J/ApJ/837/30/table5` — the astrometric measurements. ~34 epochs each
    for S2, S12 and S38 are held as a test fixture
    (`tests/fixtures/sStarAstrometry.json`) and used as the acceptance
    oracle for the sky-frame conversion; they are never rendered.
- **Reference:** Gillessen, Plewa, Eisenhauer, Sari, Waisberg, Habibi,
  Pfuhl, George, Dexter, von Fellenberg, Ott & Genzel 2017, ApJ 837, 30
  (ads: [2017ApJ...837...30G](https://ui.adsabs.harvard.edu/abs/2017ApJ...837...30G)).
- **Licence:** Publicly released via CDS VizieR; cite the paper above.
- **Related:** table5's coordinate origin is a best estimate of Sgr A\*'s
  radio position (±0.2 mas at epoch 2009.0), per **Plewa et al. 2015,
  MNRAS 453, 3234** — the floor on the fixture's residuals, and the reason
  the acceptance test allows a few sigma rather than exact closure.

### Abd El Dayem et al. 2026 — S301

- **Use:** One additional row in `src/data/bodies/sStarElements.ts`, the
  40th bound orbit rendered around Sagittarius A\*. The paper's Extended
  Data Table 2 gives two degenerate orbital solutions for this star; the
  transcribed row uses Solution A (the headline values quoted in the
  paper's abstract), with Solution B recorded in the row's comment.
- **Reference:** Abd El Dayem, K., Abuter, R., Aimar, N., et al. (GRAVITY
  Collaboration) 2026, "Discovery of a star sensitive to the spin of
  Sgr A\*", Nature, doi:10.1038/s41586-026-10894-w
  ([arXiv:2607.12664](https://arxiv.org/abs/2607.12664)).
- **Licence:** Published paper; cite it above.

### GRAVITY Collaboration — the Galactic-Centre distance and black-hole mass

- **Use:** R₀ = 8178 pc, which sets the angular-to-linear scale for every
  S-star orbit (1″ = 8178 AU) and places Sgr A\* — and with it the Milky Way
  impostor's hub — in the scene. The same source's M = 4.297 × 10⁶ M☉ gives
  the Schwarzschild radius the InfoCard quotes pericentres against.
- **Reference:** GRAVITY Collaboration (Abuter et al.) 2019, A&A 625, L10.
- **Licence:** Publicly released; cite the paper above.

### Pecaut & Mamajek 2013 — main-sequence temperature/radius scale

- **Use:** The representative effective temperatures and radii assigned to
  S-stars by brightness and spectral class (`src/data/bodies/sStarAppearance.ts`).
  Gillessen's table carries neither, so each class is a small
  brightness-ordered table spot-checked against this scale — a
  representative appearance, not a measurement.
- **Reference:** Pecaut & Mamajek 2013, ApJS 208, 9.
- **Licence:** Publicly released; cite the paper above.

### JPL Solar System Dynamics — planetary and satellite mean elements

- **Use:** The J2000 Keplerian element table (`src/data/bodies/orbitalElements.ts`)
  that positions every solar-system body AND draws its orbit trail: the eight
  major planets from "Keplerian Elements for Approximate Positions of the Major
  Planets" (<https://ssd.jpl.nasa.gov/planets/approx_pos.html>), each with its
  per-Julian-century rates; the Moon and thirteen planetary satellites from
  "Planetary Satellite Mean Orbital Parameters"
  (<https://ssd.jpl.nasa.gov/sats/elem/>), each with its own Laplace-plane pole.
- **Reference:** JPL Solar System Dynamics group, NASA/Caltech. The planetary
  fit is Standish's; see the approximate-positions page above for its stated
  validity interval and residuals.
- **Licence:** Public domain (US Government work). Credit: "NASA/JPL-Caltech".

### Hipparcos-2 — the re-reduced Hipparcos catalogue

- **Use:** The `hip2.dat` bright-star table (VizieR I/311), cross-matched to
  Gaia via `gaiadr3.hipparcos2_best_neighbour`, to supply the naked-eye bright
  stars that saturate or fall outside Gaia's faint-limited photometry.
- **Reference:** van Leeuwen 2007, A&A 474, 653 (VizieR I/311).
- **Licence:** Publicly released via CDS VizieR; cite the paper above.

### MCXC — Meta-Catalogue of X-ray galaxy Clusters

- **Use:** Cluster positions, redshifts, and X-ray-derived mass/radius
  (VizieR J/A+A/534/A109), feeding the structure catalog
  (`tools/structures/buildStructures.ts` → `public/data/structure-catalog/`).
- **Reference:** Piffaretti et al. 2011, A&A 534, A109.
- **Licence:** Publicly released via CDS VizieR; cite the paper above.

### MSCC — Main SuperCluster Catalogue

- **Use:** Friends-of-Friends supercluster groupings of Abell/ACO clusters
  (VizieR J/MNRAS/445/4073), feeding the structure catalog
  (`tools/structures/buildStructures.ts` → `public/data/structure-catalog/`).
- **Reference:** Chow-Martínez et al. 2014, MNRAS 445, 4073.
- **Licence:** Publicly released via CDS VizieR; cite the paper above.

## Volume reconstructions

The scalar-field overlays drawn underneath the point cloud (CF-4 DM density,
MCPM Cosmic Web, and the Edenhofer dust volume) are derived from third-party
scientific reconstructions that carry their own citation requirements.

### CF-4 / CF4++ — Cosmicflows-4 dark-matter density reconstruction

- **Use:** A 128³ Bayesian dark-matter density reconstruction in a
  1000 Mpc supergalactic-Cartesian box, derived from the CF-4 peculiar-
  velocity catalog. Skymap consumes only the `d_mean_CF4pp` mean-density
  array (mean across 10 000 HMC posterior samples); the per-cell standard
  deviation is also published in the upstream `.npz` and is the natural
  future input for an uncertainty-aware overlay.
- **Source:** Courtois et al. 2025 ensemble release at
  <https://projets.ip2i.in2p3.fr/cosmicflows/>.
- **References:**
  - Courtois et al. 2025, A&A (CF4++ ensemble),
    [arXiv:2502.01308](https://arxiv.org/abs/2502.01308).
  - Tully et al. 2023, ApJ (CF-4 distance catalog),
    [arXiv:2209.11238](https://arxiv.org/abs/2209.11238).
- **Licence:** CF-4 data products are publicly released for research and
  visualisation use; cite both papers above in any derived work. If a
  future Skymap revision swaps in the Valade et al. 2024 HAMLET cube
  (Nature Astronomy, [arXiv:2409.17261](https://arxiv.org/abs/2409.17261)),
  add that citation as well.

### MCPM SDSS Cosmic Slime VAC — Monte Carlo Physarum Machine trace density

- **Use:** A 712×1200×728 trace-density cube produced by fitting the
  Monte Carlo Physarum Machine (slime-mould) algorithm to SDSS DR17
  galaxies. Skymap downsamples it to three tiers
  (`mcpm_sdss_d{2,4,8}.npy`) at build time and renders the tier matching
  the user's data-tier selection.
- **Source:** SDSS DR17 Cosmic Slime Value-Added Catalog
  `SDSS_z_44-476mpc`, distributed at
  <https://www.sdss4.org/dr17/data_access/value-added-catalogs/?vac_id=cosmic-web-environmental-densities-from-mcpm-slimemold>
  via the upstream `trace.bin.bz2` blob on the SDSS SAS.
- **References:**
  - Wilde et al. 2023 (SDSS Cosmic Slime VAC release paper),
    [arXiv:2301.02719](https://arxiv.org/abs/2301.02719).
  - Elek et al. 2021 (Polyphorm / MCPM algorithm + visualisation
    convention), [arXiv:2009.02441](https://arxiv.org/abs/2009.02441).
  - Burchett et al. 2020 (original MCPM-on-galaxies application that
    motivated the VAC), [arXiv:1910.05344](https://arxiv.org/abs/1910.05344).
- **Licence:** SDSS Value-Added Catalogs are publicly released under the
  collaboration's standard data-release terms; cite the references above
  in any derived work, plus the SDSS DR17 paper (Abdurro'uf et al. 2022)
  alongside the standard SDSS catalog acknowledgement listed in the
  Catalogue data → SDSS section.
- **Software dependency:** the maintainer extraction step uses
  [pyslime](https://github.com/jnburchett/pyslime) (Burchett, MIT) to
  decode the upstream `trace.bin` into a NumPy array. pyslime is a
  research-grade reader, not a runtime dependency of Skymap; the runtime
  consumes its f16-quantised SCFD output, not pyslime directly.

### Edenhofer et al. 2024 — parsec-scale Galactic 3D dust map

- **Use:** A continuous local-neighbourhood extinction-density
  reconstruction out to 1.25 kpc from the Sun. Skymap rebakes the upstream
  mean reconstruction into three tiered `.scfd` volumes
  (`edenhofer-dust-{small,medium,large}.scfd`, tracked by `allowDataFile`)
  and redistributes them from `public/data/scalar-field/`.
- **Reference:** Edenhofer et al. 2024, "A parsec-scale Galactic 3D dust map
  out to 1.25 kpc from the Sun", A&A 685, A82
  (DOI [10.1051/0004-6361/202347628](https://doi.org/10.1051/0004-6361/202347628)).
- **Source:** Zenodo [10.5281/zenodo.8187943](https://doi.org/10.5281/zenodo.8187943)
  (`mean_and_std_healpix.fits`), fetched by `data/raw/edenhofer/fetch_edenhofer.sh`.
- **Licence:** CC BY 4.0; cite the paper above.

## Imagery

### Curated galaxy thumbnails (`public/images/famous/*.webp`)

Per-galaxy famous-galaxy thumbnails come from two pipelines. Most entries are
now **hand-curated** via the famous-galaxy curator; a minority fall back to the
older auto-fetch path.

#### Curated overrides (primary source)

- **Use:** Hand-picked press and amateur-astrophotography images, one per
  famous-galaxy entry, selected through the curator tool
  (`tools/famous-curator`) and processed into a star-masked, radial-faded
  WebP trio under `public/images/famous-curated/<id>/`. The override index is
  `data/seeds/famous_curated_overrides.json`, which records the **`sourceUrl`,
  `license`, and `author`/credit line for every curated image** — that file is
  the authoritative per-entry attribution record.
- **Source institutions** present in the current override set:
  - **NOIRLab / NOAO** (KPNO, CTIO, and legacy NOAO press images,
    <https://noirlab.edu/public/images/>) — credit lines of the form
    "KPNO/NOIRLab/NSF/AURA/…".
  - **ESO — European Southern Observatory** (<https://www.eso.org/public/images/>),
    used with ESO's required attribution.
  - **Vera C. Rubin Observatory** ("RubinObs/NOIRLab/SLAC/NSF/DOE/AURA").
  - **ESA / Hubble & NASA** public-domain press releases.
  - **ESA / Euclid / Euclid Consortium** (NGC 6822), CC BY-SA 3.0 IGO.
  - **Sloan Digital Sky Survey** image cutouts.
  - **Wikimedia Commons** uploads (most curated entries link an
    `en.wikipedia.org/.../media/File:` page), authored by individual
    astrophotographers — e.g. Adam Block / Mount Lemmon SkyCenter /
    University of Arizona, Chuck Ayoub, and others named in the override file.
  - **Digitized Sky Survey 2 (DSS2)** frames for a few low-surface-brightness
    dwarfs.
- **Licences:** recorded per entry; the current set spans CC0, CC BY (2.0–4.0),
  CC BY-SA (3.0–4.0), and public domain.
- **Unresolved licences:** three entries currently carry `"license": "unknown"`
  in the override file (at the time of writing: `c17` and `c18`, both DSS2 /
  amateur frames via theskylive.com; and `c29`, a `noirlab.edu` sourceUrl that
  is de-facto CC BY 4.0 per NOIRLab's blanket clause below but hasn't been
  recorded as such). These must be resolved to a concrete licence — or the
  image replaced — before `public/images/famous*/` is redistributed as a
  standalone published artefact. (All `noirlab.edu`-sourced entries are CC BY
  4.0 per NOIRLab's image licence.)

#### Auto-fetch fallback (Wikipedia → DESI Legacy)

For entries without a curated override, `tools/famous/fetchFamousImages.ts`
fetches a thumbnail automatically, recording the source per-entry in
`data/raw/wikipedia_famous_cache.json`:

- **Wikipedia / Wikimedia Commons** — the Wikipedia REST
  `/page/summary/<title>` endpoint's `originalimage.source`, resized +
  radial-faded. Licences are a mix of CC-BY-SA 4.0, CC-BY 4.0, public-domain
  (NASA / ESA / Hubble), and ESO with required attribution; the cache JSON
  retains the full API response so the attribution chain back to the
  Commons upload page is reconstructible.
- **DESI Legacy Imaging Surveys** — sky cutouts from
  <https://www.legacysurvey.org/viewer/cutout.jpg> (fallback chain
  `ls-dr10` → `sdss` → `unwise-neo7`) for entries Wikipedia failed to provide.
  Reference: Dey et al. 2019, AJ 157, 168. The Legacy Surveys data combines
  imaging from DECaLS (Dey, Schlegel, Lang et al.), MzLS (Silva, Lang et al.),
  BASS (Zou, Zhou et al.), and unWISE (Lang, Hogg, Schlegel); acknowledgements
  per <https://www.legacysurvey.org/acknowledgment/>.

**Caution for redistribution:** if `public/images/famous*/` is ever
redistributed as a published binary, each individual image's attribution
string + licence should be enumerated in a per-file table or sidecar (the
override file already holds this for curated entries). The CC-BY-SA portion in
particular forces share-alike on derivative atlases, and the `unknown`-licence
entries above must be resolved first.

### Galaxy descriptions

The 1–3 sentence editorial blurbs in the famous-galaxy InfoCard come from
two sources:

- **20 hand-curated entries** (M31, M33, M51, M81, M82, M104, etc.) — written
  by the project author, MIT-licensed alongside the rest of the source.
- **~50 auto-extracted entries** — the `extract` field of the Wikipedia REST
  `/page/summary/<title>` response. CC-BY-SA 4.0; attribution chain back
  to the Wikipedia article is recorded in
  `data/raw/wikipedia_famous_cache.json`.

### Planetary, lunar & ring surface textures

The textured solar-system bodies (`src/data/bodies/bodyTextureRegistry.ts`) and
the ≤1 MB boot placeholder atlas (`public/data/images/textures/body-atlas.webp`,
a 13-tile mosaic emitted by `tools/textures/buildTextures.ts`) are derived —
downsampled into runtime tiers, and in two cases baked into normal maps — from
three public sources. The raw sources are gitignored; per-file provenance,
upstream URLs, and licences live in `tools/utils/io/rawDataRegistry.ts`
(the `textures.*` rows) and `tools/utils/io/textureSources.ts`.

#### Solar System Scope — planet & moon albedo maps

- **Use:** Full-colour equirectangular surface maps for Mercury, Venus (cloud
  tops), Mars, Jupiter, Saturn, Uranus, Neptune, and the Moon, plus the Saturn
  ring radial-alpha strip.
- **Source:** <https://www.solarsystemscope.com/textures/>.
- **Licence:** CC BY 4.0. Attribution: "Textures by Solar System Scope
  (solarsystemscope.com), licensed under CC BY 4.0."

#### NASA — Earth & Moon imagery

All public domain; NASA asks that credit go to the named observatory / program.

- **Earth surface** — Blue Marble Next Generation (August 2004 topography +
  bathymetry), NASA Earth Observatory (<https://visibleearth.nasa.gov/>). Both the
  whole-globe base texture and the streamed surface tile pyramid come from this
  one month, the former from the 21600×10800 equirect and the latter from the
  eight 21600×21600 quadrants.
- **Earth night lights** — Black Marble 2016, NASA Earth Observatory / NASA
  Goddard Space Flight Center, Suomi NPP VIIRS.
- **Earth water mask** (feeds the material/roughness map) — Blue Marble Next
  Generation land/water mask, NASA Earth Observatory. Preserved via the Internet
  Archive after NASA retired the NEO bluemarble archive.
- **Earth relief** (baked into the normal map — a build input, never shipped as
  runtime pixels) — GEBCO_08-derived grayscale topography/bathymetry, NASA Earth
  Observatory, imagery by Jesse Allen using GEBCO_08 grid data.
- **Earth clouds** — Blue Marble cloud composite, NASA Goddard Space Flight
  Center, Reto Stockli.
- **Moon relief** (baked into the normal map — a build input, never shipped as
  runtime pixels) — NASA Scientific Visualization Studio "CGI Moon Kit" LOLA
  elevation.

#### EOX IT Services — EOxCloudless (Sentinel-2)

- **Use:** A second, deeper surface tile band (z8–z13) over a set of
  world-wide regions (cities including Copenhagen, Amsterdam, and Tokyo;
  landmarks including the Grand Canyon and Mount Everest — see
  [`eoxRegions.ts`](tools/fetch/eoxRegions.ts) for the full list), layered on
  top of the whole-globe Blue Marble band above — flying down over one of
  those regions resolves Sentinel-2 detail instead of stopping at Blue
  Marble's z7 floor.
- **Source:** <https://cloudless.eox.at>, EOX IT Services GmbH. The
  `s2cloudless-2025` layer is used.
- **Licence:** CC BY-NC-SA 4.0 upstream; used with written permission from
  EOX IT Services GmbH (email, September 2026). Attribution: "EOxCloudless
  https://cloudless.eox.at by EOX IT Services GmbH (Contains modified
  Copernicus Sentinel data 2025). Published under CC BY-NC-SA 4.0; used in
  skymap with written permission from EOX IT Services GmbH."

#### GeoDanmark / Klimadatastyrelsen — orthophoto (Søndermarken)

- **Use:** A third, deepest surface tile band (z14–z19) over Søndermarken,
  Copenhagen, layered on top of the EOX band above — flying down over that
  patch resolves 10 cm/px orthophoto detail instead of stopping at EOX's z13
  floor. Leaving the patch drops back to EOX z13 with no on-screen indication.
- **Source:** `wms.datafordeler.dk`, Datafordeler / Klimadatastyrelsen. Layer
  `geodanmark_2025_10cm`, vintage forår (spring) 2025.
- **Licence:** CC BY 4.0. Attribution: "Ortofoto © GeoDanmark /
  Klimadatastyrelsen (CC BY 4.0)."

#### USGS Astrogeology — Galilean moon mosaics

- **Use:** Global surface mosaics for Io, Europa, Ganymede, and Callisto
  (Voyager + Galileo SSI). Europa and Callisto ship single-channel and are
  hue-tinted at build time (the `monoTint` treatment in the body-texture registry).
- **Source:** USGS Astrogeology Science Center,
  <https://planetarymaps.usgs.gov/>.
- **Licence:** Public domain. Credit: "NASA / USGS".

#### USGS Astrogeology — Pluto/Charon mosaics (New Horizons)

- **Use:** Global surface mosaics for Pluto and Charon (LORRI + MVIC), 300 m/px
  equirectangular, 8-bit stretched from the 32-bit originals. Both ship
  single-channel. Charon is hue-tinted at build time (the `monoTint` treatment
  in the body-texture registry); Pluto's mosaic instead supplies luminance for
  the `panSharpen` treatment below — a derived product, neither the raw mosaic
  nor the raw NASA colour map.
- **Source:** USGS Astrogeology Science Center,
  <https://planetarymaps.usgs.gov/>.
- **Licence:** Public domain (Astropedia access constraints: none; use constraints: cite authors).
  Credit per the Astropedia record: "New Horizons Team" (primary author), originators "NASA,
  Johns Hopkins University Applied Physics Laboratory, Southwest Research Institute, Lunar and
  Planetary Institute", published by USGS Astrogeology Science Center, 2017.

#### NASA — Pluto derived colour (New Horizons MVIC)

- **PIA11707** — New Horizons global colour map of Pluto, which NASA describes
  as "based on a series of three color filter images obtained by the
  Ralph/Multispectral Visual Imaging Camera". NASA attaches no colour-type
  label to it, so that it is **enhanced** rather than natural colour is an
  inference, from two independent things. (a) Olkin et al. 2017, _AJ_ 154, 258,
  say of their own renderings from that same three-broadband-filter set — blue,
  red and near-IR "displayed in the blue, green, and red color channels,
  respectively" — that "These images are enhanced color (not natural color as
  perceived by the human eye)"; the paper never mentions PIA11707, so this
  carries only as far as the product family. (b) We measured it: fitting
  PIA11707's chroma against the true-colour image below recovers a ~6.4×
  anisotropic chroma stretch, so the two renderings of the same data
  demonstrably disagree on saturation. skymap uses PIA11707 only as a chroma
  source — that fitted calibration inverts the stretch before any pixels reach
  a runtime texture, and PIA11707 itself is never shipped.
  **Source:** NASA Photojournal (PIA11707),
  <https://science.nasa.gov/photojournal/pluto-color-map> (the legacy
  `photojournal.jpl.nasa.gov/catalog/PIA11707` URL now redirects here).
  **Licence:** Public domain. **Credit:** NASA/JHUAPL/SwRI.
- **"True Colors of Pluto"** (P_COLOR_2_TRUE_COLOR) — natural-colour New
  Horizons MVIC disc view, of which NASA's page says "The processing creates
  images that would approximate the colors that the human eye would perceive".
  Used only as the calibration reference the PIA11707 chroma-inversion fit is
  derived against (not a build input, kept for reproducibility). **Source:**
  <https://science.nasa.gov/resource/true-colors-of-pluto/>. **Licence:**
  Public domain. **Credit:** NASA/JHUAPL/SwRI/Alex Parker.

## Fonts

### Cormorant Garamond — display serif

- **Use:** The label font. Vendored as `CormorantGaramond-SemiBold.ttf` in two
  places — `data/raw/fonts/` (baked into the MSDF label atlas by
  `tools/fonts/buildFontAtlas.ts`) and `tools/site/fonts/` (rasterised into
  `public/og-image.jpg` by `tools/site/makeOgImage.ts`) — and additionally
  loaded live from Google Fonts by `index.html` for the 2D UI chrome
  (`--font-family-display` in `src/styles/global.css`).
- **Designer:** Christian Thalmann (Catharsis Fonts).
- **Source:** <https://fonts.google.com/specimen/Cormorant+Garamond>.
- **Licence:** SIL Open Font License 1.1.

## Shaders

### Milky Way impostor — "Spiral galaxy" by mrange

The volumetric raymarched fragment shader at the heart of
`src/services/gpu/shaders/milkyWayImpostor.wgsl` is a port of the
"Spiral galaxy" ShaderToy by **mrange**.

- **Original:** https://www.shadertoy.com/view/wsBBWD
- **Author profile:** https://www.shadertoy.com/user/mrange
- **Licence:** CC0 (public domain dedication, declared in the original
  source's leading `// License CC0: Spiral galaxy` comment).
- **Use:** WGSL port serves as the procedural Milky Way at the world
  origin so the user has a meaningful "here" to anchor on. The vertex
  stage was rewritten from the ground up to use a world-anchored view-
  aligned billboard driven by the engine's real camera; the fragment
  stage's raymarched render logic (bulge sphere, exponential disk,
  star-cell sampling, dust integral) is structurally a line-by-line
  port with WGSL-syntax adjustments and skymap-specific output
  sanitisation (NaN masking, disk-extent envelope). Display-space
  post-processing (gamma, contrast, vignette) was deleted so the
  engine's HDR tone-map pass can run on a clean linear-light input.

## Vendored data

### d3-celestial — constellation line data

- **Use:** IAU constellation stick-figure vertices, vendored at
  `data/raw/constellations/constellations.lines.json` and resolved at build
  time to real 3D star positions, shipped as `public/data/constellations.json`.
- **Source:** [d3-celestial](https://github.com/ofrohn/d3-celestial) by
  Olaf Frohn, `data/constellations.lines.json`.
- **Licence:** BSD-3-Clause.

## External services / APIs

These services are queried at build-time or read-only at runtime; no data
flows from skymap to them.

- **Wikipedia REST API** (`https://en.wikipedia.org/api/rest_v1/page/summary/...`)
  — descriptions + images for the famous-galaxy enrichment pass.
  Wikipedia content is CC-BY-SA 4.0.
- **HyperLEDA fG.cgi** (`http://atlas.obs-hp.fr/hyperleda/fG.cgi`) — used by
  `tools/fetchHyperLeda.ts` and `tools/expandFamousFromCatalogs.ts` to fetch
  per-galaxy metadata.
- **DESI Legacy viewer cutouts**
  (`https://www.legacysurvey.org/viewer/cutout.jpg`) — used by
  `tools/fetchFamousImages.ts` for the thumbnail fallback path.
- **VizieR TAP** (`https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync`) —
  used by `tools/fetch2massXsc.ts` to fetch 2MASS XSC shape data via ADQL, and
  as the one-off source for the hand-transcribed Gillessen S-star tables (and
  the check that verified that transcription). CDS asks that use of VizieR be
  acknowledged: "This research has made use of the VizieR catalogue access
  tool, CDS, Strasbourg, France (DOI: 10.26093/cds/vizier)." The original
  description of the service is Ochsenbein, Bauer & Marcout 2000, A&AS 143, 23.
- **NED — NASA/IPAC Extragalactic Database**
  (`https://ned.ipac.caltech.edu/byname?objname=…`) — linked from the
  InfoCard "Catalogues" row for famous galaxies. Read-only; no programmatic
  access at build time.

## NPM dependencies

The runtime + build-time JavaScript dependencies are listed in
[`package.json`](package.json). Notable third-party libraries:

- **react / react-dom** (MIT) — UI framework.
- **wgpu-matrix** (MIT) — vector / matrix math.
- **vite** (MIT) — dev server + bundler.
- **vitest** (MIT) — test runner.
- **@vitejs/plugin-react** (MIT) — React refresh / JSX transform.
- **@webgpu/types** (BSD-3) — WebGPU TypeScript declarations.
- **typescript** (Apache-2.0) — typechecker / transpiler.
- **prettier** (MIT) — code formatter.
- **sharp** (Apache-2.0) — image processing for the thumbnail pipeline.
- **tsx** (MIT) — TypeScript runner for tools scripts.
- **@types/\* packages** (MIT) — type stubs.

Each dependency's licence and full attribution is enumerated in its own
`node_modules/<package>/LICENSE` after `npm install`.
