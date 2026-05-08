# ROSAT All-Sky Survey (RASS) — Cluster X-ray Halos

## What it is

The hot intracluster medium (ICM) — the diffuse 10⁷–10⁸ K plasma trapped in the gravitational well of every massive galaxy cluster — glows in the soft X-ray band (0.1–2.4 keV) by thermal bremsstrahlung. It is, by far, the most visually distinctive thing about a cluster: galaxies are the punctuation, but the X-ray halo is the volume. From space, a Coma-like cluster is a softball-sized luminous blob with hundreds of galaxies embedded in it, not a swarm of points in vacuum.

The canonical all-sky map of this emission is the **ROSAT All-Sky Survey (RASS)** — the only true full-sky soft-X-ray survey ever completed (1990–1991, ROentgen SATellite, Max-Planck-Institut für extraterrestrische Physik / NASA HEASARC). RASS is legacy data by modern standards (eROSITA's DR1 supersedes it in the western galactic hemisphere with ~25× the sensitivity), but it has two unbeatable properties for a "render every cluster the user can see" use case: it covers the whole sky, and it has been thoroughly photometered into a compact derived catalog.

That derived catalog is the **MCXC — Meta-Catalogue of X-ray detected Clusters** (Piffaretti et al. 2011, *A&A* 534, A109; VizieR `J/A+A/534/A109`). MCXC homogenises a dozen RASS-derived cluster catalogs (NORAS, REFLEX, BCS, eBCS, MACS, etc.) into one table of ~1740 clusters with consistent X-ray luminosity (L_X), characteristic radius (R_500, the radius enclosing 500× the critical density), and mass estimates — i.e. they did the per-cluster X-ray photometry once, and we get to consume the result.

We use **MCXC as the data source, not raw ROSAT cutouts.** This is the central architectural call this spec defends.

## Why we need it (which shell, what role)

**Shells 6 (Virgo Supercluster) and 7 (Laniakea).**

In shell 6 the camera sits ~30–500 Mpc from the Local Group and the user has just been told "the universe is lumpy at the supercluster scale." Galaxy points alone do convey lumpiness, but they undersell the gravitational story: a cluster is not just denser by a factor of a few in galaxy count, it is a **bound thermal system** whose hot gas dominates the visible mass. Rendering Virgo, Coma, Hydra-Centaurus, Norma and Perseus as soft purple-white halos around their galaxy concentrations turns a slightly-clumpier point cloud into an obvious physical structure: "those glowing balls are cluster cores; those are where gravity has won."

In shell 7 the same halos act as landmarks for the Laniakea flow story — the Great Attractor sits at Norma, the Shapley Concentration is a chain of bright halos, Laniakea's "basin of attraction" pulls toward the Shapley region. Without the halos these are abstract names attached to nothing; with them they're the visible peaks the flow vectors point at.

Why the existing cluster catalogs (Abell, ACO) aren't enough on their own: they give us *positions* and *richness classes* but no continuous luminosity / extent measurement. We need an actual physical size (R_500) and brightness (L_X) to draw a halo at the right scale.

## Acquisition

- **Primary source: MCXC at VizieR**
  - URL: `https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/A+A/534/A109`
  - Authentication: none
  - Format: VizieR fixed-width ASCII (same shape as the `data/raw/J_ApJS_199_26_ReadMe`-style catalogs we already parse for 2MRS); we pull the `mcxc.dat` table plus the `ReadMe` byte-layout descriptor.
  - Size raw: ~250 KB for the full 1743-row catalog plus the long-form ReadMe.
- **Optional secondary (deferred): RASS exposure-corrected sky maps** at HEASARC.
  - URL: `https://heasarc.gsfc.nasa.gov/FTP/rosat/data/sky/SkyMaps/`
  - Format: FITS images, HEALPix-aliased per-band tiles. ~2 GB raw for the full sky, soft band only.
  - We do **not** ingest these for v1 — see "Recommendation" below — but the URL is documented so a future eROSITA-replacement pass knows where to start.

Both downloads land in `data/raw/xray/` next to their ReadMes. MCXC is a one-shot manual `curl` (the catalog has not changed since 2011 and almost certainly will not until an eROSITA-derived MCXC2 appears).

## Recommendation: parametric halos, no per-cluster cutouts

The temptation is to fetch a ROSAT image cutout per cluster, atlas them like skymap already does for galaxy thumbnails, and texture each halo with its real X-ray morphology. We **do not** recommend this for v1, for three reasons:

1. **Bandwidth cost.** Even at 64×64 pixels per cluster, 1740 cutouts × 4 bytes/pixel × 4 bands = ~110 MB of FITS data, and FITS does not compress well. The thumbnail-atlas system was designed for lazy on-demand fetches of one galaxy at a time; loading every cluster's image up-front blows the per-shell budget set in [`00-data-sources.md`](00-data-sources.md) (we allocated 30 MB for shell 6's overlay, not 110 MB).
2. **Visual fidelity is poor at our scales.** RASS has ~2 arcmin angular resolution. A typical cluster at 100 Mpc subtends ~30 arcmin, so we get maybe a 15-pixel image — barely better than a single splat — and that image has a noisy non-cluster background swamping the faint outskirts. The morphology we'd render would be more "RASS shot noise" than "cluster physics."
3. **The science already lives in MCXC.** Piffaretti et al. did the careful per-cluster photometry — beta-model fits, background subtraction, K-correction — and distilled it to two numbers per cluster: L_X (integrated 0.1–2.4 keV luminosity, in 10⁴⁴ erg/s) and R_500 (the radius enclosing mean overdensity 500× critical, in Mpc). Those two numbers fully specify a **standard isothermal beta-model** surface-brightness profile, which is the model the original photometry assumed anyway. Rendering from (L_X, R_500) reproduces what MCXC measured, with no shot-noise penalty and at any resolution we want.

So v1 ships per-cluster (L_X, R_500), and shell 6's renderer evaluates a beta-model splat in WGSL — `Σ(r) ∝ (1 + (r/r_c)²)^(-3β + 0.5)` with β ≈ 2/3 and r_c ≈ R_500 / 7 (the canonical cluster ratio). This is cheap to evaluate per fragment, gives us smooth halos at any zoom, and is honest to what RASS-derived photometry actually constrains.

The trade we accept: every cluster looks like an idealised round halo. We lose the visible asymmetry of merging clusters (Bullet, A754, A2256). For pedagogical "where are the cluster cores" purposes this is fine; for a future "cluster physics deep-dive" feature we revisit.

## Parsing

- **Code path**: `tools/parsers/parseMCXC.ts` (new), invoked from `tools/buildClusters.ts` (extended — see "Build script" below). Same shape as `tools/parsers/parse2MRS.ts`: synchronous file read, byte-offset extraction per the ReadMe, return `ParsedMCXCRecord[]`.
- **Schema we extract**:

```ts
export type ParsedMCXCRecord = {
  name: string;       // canonical MCXC ID, e.g. "MCXC J1259.7+2756" (= Coma)
  altName: string;    // best-known alternate name, e.g. "ABELL 1656" / "Coma"
  ra: number;         // J2000 right ascension, degrees
  dec: number;        // J2000 declination, degrees
  redshift: number;   // spectroscopic z
  lX: number;         // 0.1-2.4 keV luminosity within R_500, in 10^44 erg/s
  r500Mpc: number;    // characteristic radius, Mpc
  m500: number;       // M_500 mass estimate, in 10^14 M_sun (kept for tooltip text)
};
```

Fields we drop: per-source-catalog provenance flags, individual L_X uncertainties, NORAS/REFLEX/MACS membership bits, alternative mass estimators. None matter for rendering; the tooltip can quote a single mass figure without flagging the source-of-source.

## Filtering / cross-matching

Cuts applied:

1. **z ≤ 0.3** (~1200 Mpc co-moving). Clusters past z = 0.3 are off-screen by the time shell 7 ends, and MCXC's selection function gets messy at high-z anyway.
2. **L_X ≥ 0.05 × 10⁴⁴ erg/s.** Drops the faintest groups that would render as sub-pixel halos. Keeps ~1500 of the 1743 entries.
3. **Cross-match against the cluster catalog** ([`06-cluster-catalogs.md`](06-cluster-catalogs.md)) to attach (L_X, R_500) to existing Abell/ACO entries. Match by:
   - **Name** first (MCXC's `altName` column gives the Abell number for ~85% of rows — direct join).
   - **Position** for the rest (5 arcmin tolerance, plus z within 10% — clusters are big and the catalogs disagree on centroid by a few arcmin routinely).
4. **Unmatched MCXC clusters** (those with no Abell counterpart, mostly southern-sky ACO-only or pure X-ray detections) are kept and added to the cluster list as new entries — MCXC is the more complete catalog at faint end.

The output: every cluster row in `clusters.bin` gains two extra fields. Clusters with no MCXC match get sentinel values (L_X = 0, R_500 = 0) and shell 6's renderer skips drawing a halo for them.

## Output binary format

See [`10-binary-formats.md`](10-binary-formats.md) (section: "Clusters v2 — MCXC extension"). The cluster format gains 8 bytes per record:

```
offset  size  type    field
... (existing v1 cluster fields, see 06-cluster-catalogs.md) ...
  N+0    4    f32     lX     (10^44 erg/s, 0 if no MCXC match)
  N+4    4    f32     r500Mpc (Mpc, 0 if no MCXC match)
```

We bump the cluster format to v2 — old `clusters.bin` decode loudly with the standard "magic + version mismatch, regenerate via `npm run build-clusters`" message, matching the existing pattern in `src/data/pointCloudFormat.ts`. Total file growth: ~1500 clusters × 8 B = 12 KB. Negligible.

The mass M_500 is **not** stored in the binary — it's derived from L_X via the Pratt+09 L–M scaling at runtime if the tooltip wants it, saving 4 B/cluster and keeping the binary minimal.

## Build script

- **File**: extend `tools/buildClusters.ts` (do **not** spawn a separate `tools/buildXraySidecar.ts`). The cluster catalog is one logical artefact; splitting MCXC into a sidecar means shell 6 has to fetch and join two small files instead of one, plus we lose deterministic ordering between the two outputs. The MCXC join is a parser concern, not a runtime concern.
- **Run command**: `npm run build-clusters` (already exists for v1; extended to also read MCXC).
- **Idempotent**: yes — deterministic output for fixed inputs, with stable name-table and record ordering.
- **Approximate runtime**: <2 s for the full join.

Build steps added:

1. Parse MCXC via the new parser.
2. Cross-match MCXC against the existing Abell/ACO records.
3. Emit a `clusters.report.txt` log: total clusters, MCXC-matched count, brightest cluster (sanity check: should be Coma or Perseus or Ophiuchus), faintest L_X kept.

## Licensing & attribution

- **ROSAT data** is fully public-domain (NASA / MPE joint mission, all data released without restriction). No license, just custom: cite the mission paper (Truemper 1993) when raw RASS pixels are used. Since we use only derived photometry, the mission citation is courtesy, not required.
- **MCXC catalog** requires citation of Piffaretti, Arnaud, Pratt, Pointecouteau & Melin 2011, *A&A*, 534, A109. Plus a VizieR acknowledgement: *"This research has made use of the VizieR catalogue access tool, CDS, Strasbourg, France."*
- Both go in repo-root `CREDITS.md` and shell 6's overlay credit line ("X-ray halos: ROSAT / MCXC (Piffaretti+11)").

## Risks

- **Beta-model assumption hides cluster physics.** Mergers, cool cores, sloshing — all invisible. Acceptable for v1 (see Recommendation rationale); document as a known visual simplification in the shell 6 spec's "limitations" section.
- **R_500 is a soft-edged radius.** A naive halo rendered out to R_500 looks too small (the X-ray emission visibly extends to ~2 R_500 in deep observations). The renderer should evaluate the beta profile out to ~3 R_500 and let the falloff do the visual work — don't hard-clip at R_500.
- **MCXC redshifts have a heterogeneous mix of spec-z and phot-z** at the faint end. For halo *position* this matters at the few-percent level; well within the visual tolerance at shell-6 scales.
- **eROSITA will obsolete MCXC** in some unspecified future once the eROSITA-DR1 western-hemisphere cluster catalog (eRASS1-CL, Bulbul+24) matures. The format-versioning strategy means dropping in v3 with eROSITA fields is straightforward — see "Alternative" below.

## Alternative considered: eROSITA DR1

eROSITA (the X-ray instrument on Spektr-RG, 2019–) has surveyed the X-ray sky to ~25× ROSAT's sensitivity. The first data release (eROSITA-DE DR1, 2024) contains an excellent western-hemisphere cluster catalog with ~12,000 clusters, vastly better photometry, and resolved morphology for the brightest few hundred.

**We chose ROSAT/MCXC for v1 anyway**, for two concrete reasons:

1. **Sky coverage.** eROSITA-DE DR1 covers only the western galactic hemisphere; the Russian half (eROSITA-RU) is unreleased and politically blocked indefinitely. A "missing half the sky" cluster overlay would be visually jarring and pedagogically dishonest in a tour that explicitly shows the *whole* observable universe.
2. **Catalog maturity.** MCXC has been refereed, cross-validated, and used in literally hundreds of papers since 2011. The eROSITA cluster pipelines are still settling — published completeness and selection functions remain in flux, and a v1 ship-it timeline cannot afford to track that.

**v2 plan**: once eROSITA-RU lands (or the western-hemisphere-only limitation becomes acceptable for some reason), drop eROSITA-DR1 in as a parser alongside MCXC, prefer it where available, fall back to MCXC outside its footprint. The binary format already accommodates this — only L_X and R_500 are stored, both surveys produce both numbers in the same units, and the eROSITA-derived values just slot in.

## Sample / test data

A 5-cluster fixture lives at `tests/fixtures/mcxc-mini.txt`: Coma (`MCXC J1259.7+2756`), Perseus (`MCXC J0319.7+4130`), Virgo (`MCXC J1230.7+1220`), Norma (`MCXC J1614.6-6047`), and Centaurus (`MCXC J1248.4-4118`). Covers the parser, the J2000 → SGCart conversion, the L_X / R_500 unit handling, and one Abell-name join (Coma → A1656). The Centaurus row exercises the southern-sky / negative-declination path that the SDSS-derived test fixtures don't.

## References

- Piffaretti, Arnaud, Pratt, Pointecouteau, Melin 2011, *A&A*, 534, A109 — MCXC paper (doi:10.1051/0004-6361/201117079).
- Truemper 1993, *Science*, 260, 1769 — ROSAT mission overview.
- Pratt, Croston, Arnaud, Boehringer 2009, *A&A*, 498, 361 — L_X–M_500 scaling relation (used for runtime mass derivation).
- VizieR MCXC: `https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/A+A/534/A109`
- HEASARC RASS archive: `https://heasarc.gsfc.nasa.gov/docs/rosat/rass.html`
- Bulbul et al. 2024, *A&A*, 685, A106 — eROSITA-DE DR1 cluster catalog (deferred to v2, documented for future reference).
