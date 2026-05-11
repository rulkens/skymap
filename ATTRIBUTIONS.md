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
  catalog metadata (`data/famous_galaxies.seed.json`).
- **Reference:** Paturel et al. 2003, A&A 412, 45; Makarov et al. 2014, A&A
  570, A13.
- **Licence:** Publicly released; cite the papers above.

### 2MASS Extended Source Catalog (XSC)

- **Use:** Per-galaxy super-coadd shape data (`sup_phi`, `sup_ba`) fetched via
  Vizier `VII/233/xsc`, used to enrich 2MRS rows with photometric
  orientation.
- **Reference:** Jarrett et al. 2000, AJ 119, 2498.
- **Licence:** Publicly released; cite the paper above.

## Volume reconstructions

The two scalar-field overlays drawn underneath the point cloud (CF-4 DM
density and MCPM Cosmic Web; opt-in via `?volumes=1` in production) are
derived from third-party scientific reconstructions that carry their own
citation requirements.

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

## Imagery

### Curated galaxy thumbnails (`public/images/famous/*.webp`)

Per-galaxy 256×256 WebP thumbnails fetched at build time from one of two
sources, with the source recorded per-entry in
`data/raw/wikipedia_famous_cache.json`:

#### Wikipedia / Wikimedia Commons (primary source)

- **Use:** Article hero images for ~25 of the 75 famous-galaxy entries.
  Each comes from the Wikipedia REST `/page/summary/<title>` endpoint's
  `originalimage.source` URL, then resized + radial-faded by
  `tools/fetchFamousImages.ts`.
- **Licences:** Mix of CC-BY-SA 4.0, CC-BY 4.0, public-domain
  (NASA / ESA / Hubble), and ESO with required attribution. Each image's
  per-file licence is what governs its redistribution; the cache JSON
  retains the full Wikipedia API response, which is enough to mechanically
  reconstruct the attribution chain back to the upload page on
  Wikimedia Commons.
- **Caution for redistribution:** if this repository's `public/images/famous/`
  is ever redistributed (e.g. as part of a published binary), each
  individual image's attribution string + licence should be enumerated
  in a per-file table or sidecar. The CC-BY-SA portion in particular
  forces share-alike on derivative atlases.

#### DESI Legacy Imaging Surveys (fallback source)

- **Use:** Sky cutouts from
  <https://www.legacysurvey.org/viewer/cutout.jpg> for entries Wikipedia
  failed to provide (Wikimedia Commons HTTP 429 rate-limit during the
  initial fetch run). Layer fallback chain: `ls-dr10` → `sdss` →
  `unwise-neo7`.
- **Reference:** Dey et al. 2019, AJ 157, 168.
- **Licence:** DESI Legacy data products are publicly released for
  scientific and educational use. The Legacy Surveys data is composed
  of imaging from the DECaLS (Dey, Schlegel, Lang et al.), MzLS (Silva,
  Lang et al.), BASS (Zou, Zhou et al.), and unWISE (Lang, Hogg, Schlegel)
  surveys. Acknowledgements per
  <https://www.legacysurvey.org/acknowledgment/>.

### Galaxy descriptions

The 1–3 sentence editorial blurbs in the famous-galaxy InfoCard come from
two sources:

- **20 hand-curated entries** (M31, M33, M51, M81, M82, M104, etc.) — written
  by the project author, MIT-licensed alongside the rest of the source.
- **~50 auto-extracted entries** — the `extract` field of the Wikipedia REST
  `/page/summary/<title>` response. CC-BY-SA 4.0; attribution chain back
  to the Wikipedia article is recorded in
  `data/raw/wikipedia_famous_cache.json`.

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
- **Vizier TAP** (`https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync`) —
  used by `tools/fetch2massXsc.ts` to fetch 2MASS XSC shape data via ADQL.
- **NED — NASA/IPAC Extragalactic Database**
  (`https://ned.ipac.caltech.edu/byname?objname=…`) — linked from the
  InfoCard "Catalogues" row for famous galaxies. Read-only; no programmatic
  access at build time.

## NPM dependencies

The runtime + build-time JavaScript dependencies are listed in
[`package.json`](package.json). Notable third-party libraries:

- **react / react-dom** (MIT) — UI framework.
- **gl-matrix** (MIT) — vector / matrix math.
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
