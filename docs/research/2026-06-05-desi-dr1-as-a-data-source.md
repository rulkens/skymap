# DESI DR1 as a Skymap Data Source — Feasibility + Overlap Spike

**Date:** 2026-06-05
**Scope:** verify whether DESI's public catalog is usable as a new skymap survey source — confirm what's actually downloadable, its real format, and how much it overlaps the catalogs skymap already renders.
**Status:** **Deferred — blocked on rendering capacity** (see §6). Data is verified and viable; the renderer is the constraint. Revisit if/when the engine can handle ~10× more points.

---

## 1. Why this came up

The DESI April-2026 "completed 3D map" milestone (47M galaxies + quasars) prompted the question: is that dataset available, and should skymap ingest it? This doc records the verified answer so it isn't re-derived. The headline 47M figure is the **completed 5-year survey**, whose full public release is anticipated ~2027 — *not* something downloadable today. What *is* public (since **19 March 2025**, CC BY 4.0) is **DR1** (production codename `iron`): 18.7M spectra → 13.1M galaxies, 1.6M quasars, 4M stars.

---

## 2. Verified DR1 facts (ground truth, not docs)

All confirmed by reading real FITS headers + decoding sample rows via HTTP range requests against `https://data.desi.lbl.gov/public/dr1`. (Methodology in §7.)

Two candidate product families:

### 2a. LSS clustering catalogs — the skymap-shaped option
Path: `survey/catalogs/dr1/LSS/iron/LSScats/v1.5/<TRACER>_<CAP>_clustering.dat.fits`

- **18 lean columns**, 117 bytes/row. Relevant ones: `RA`, `DEC` (deg, f64), `Z` (f64), `flux_{g,r,z,w1,w2}_dered` (nanomaggy, f32). Plus clustering weights + `TARGETID` (we'd ignore the weights).
- Split by **tracer × galactic cap**: BGS / LRG / ELG / QSO × NGC / SGC.
- File sizes 83–340 MB. **Total galaxy/QSO data rows ≈ 9.75M.**
- Already **galaxy-only, good-redshift, footprint-vetoed** — zero quality filtering needed.
- ❌ No shape/orientation columns (would use GLADE's no-PA fallback path).
- ⚠️ It's a clustering-*curated, weighted subsample* (paired with random catalogs), not "every object" — selection structure is baked in by design.

Per-tracer row counts (NGC + SGC):

| Tracer | rows | z range |
|---|---|---|
| BGS_BRIGHT | 3.96M | < 0.4 |
| LRG | 2.14M | 0.4–1.0 |
| ELG_LOPnotqso | 2.43M | 0.6–1.6 |
| QSO | 1.22M | 0.4–3.5 |

### 2b. Redshift VAC (Value-Added Catalog) — the rich-but-huge option
Path: `spectro/redux/iron/zcatalog/v1/zpix-main-{bright,dark}.fits`

- **117 columns**, 664 bytes/row. `zpix-main-bright` = 11.0M rows / 9.4 GB; `zpix-main-dark` = 12.8M rows / 11.3 GB; combined `zall-pix-iron` = 22 GB.
- Carries `TARGET_RA/DEC`, `Z`, **`SHAPE_R` / `SHAPE_E1` / `SHAPE_E2`** (Tractor ellipticity → axis ratio + position angle, which skymap renders), `SPECTYPE`, `ZWARN`, `MORPHTYPE`, `SERSIC`, full photometry.
- ❌ Mixes stars/galaxies/QSO → must filter `SPECTYPE=='GALAXY'` + `ZWARN==0`; `FLUX_R` can be negative (guard the log).

### Recommendation on product
Start from the **LSS clustering catalogs**: ~600 MB total, pre-cleaned, RA/Dec/Z + fluxes gives positions/magnitudes/colour out of the box. Both families share `TARGETID`, so orientation (`SHAPE_*`) can be grafted on later via a `TARGETID` join into the VAC without re-architecting.

---

## 3. Overlap with existing skymap catalogs

**Question:** is DESI mostly redundant with what skymap already renders (GLADE, SDSS, 2MRS, Milliquas)? **Answer: no — ~90% of DESI is new.** It extends the map *outward in depth*; it does not thicken the local volume skymap already has.

Method: 3″ on-sky position match (chance-match rate ~1e-4 at these densities) of representative spread samples against the full skymap catalogs. See §7.

### 3a. BGS (the local-volume overlap regime) vs GLADE ∪ SDSS ∪ 2MRS
600k DESI BGS sampled (21% of BGS_BRIGHT_NGC, full RA footprint):

| Already in… | % of DESI BGS |
|---|---|
| GLADE | 14.6% |
| SDSS (skymap CSV) | 5.1% |
| 2MRS | 0.1% |
| **Union** | **15.3%** → **84.7% new** |

It's a **depth cliff** — skymap (via GLADE) is ~complete to r≈15–16 then dies:

| DESI r-mag | already in skymap |
|---|---|
| 0–15 | 98.1% |
| 15–16 | 93.1% |
| 16–17 | 78.9% |
| 17–18 | 40.8% |
| 18–19 | 9.0% |
| 19+ | 5.4% |

The "faint" DESI galaxies are mostly ordinary galaxies that are simply *farther away* (out to z≈0.4), not intrinsically tiny.

### 3b. QSO vs Milliquas
400k DESI QSO sampled vs the full Milliquas v8 catalog (1.02M rows):

- **25.3% already in Milliquas → 74.7% new.** Flat across redshift (~23–30% at every z bin) because Milliquas v8 folds in SDSS DR16Q.
- (Upper bound: skymap's parser keeps only the spec-z subset, so *rendered* overlap is below 25%.)

### 3c. Net

| Tracer | ~rows | overlap | new |
|---|---|---|---|
| BGS | 3.96M | 15% (GLADE/SDSS) | 85% |
| QSO | 1.22M | 25% (Milliquas) | 75% |
| LRG | 2.14M | ~0% (analytic, not measured) | ~100% |
| ELG | 2.43M | ~0% (analytic, not measured) | ~100% |

**Overall DESI↔skymap overlap ≈ 10%.** DESI's unique contribution is the **deep galaxy population (BGS-faint + LRG + ELG)** that no current skymap layer covers.

---

## 4. Caveats on the overlap numbers

- 3″ position-only match; no redshift reconciliation (unnecessary at these densities).
- BGS/QSO samples are NGC-only; SGC assumed similar.
- LRG/ELG overlap is analytic (skymap has no catalog reaching those depths), not directly measured.
- SDSS CSV is capped at 500k rows (the SkyServer query limit) and is skymap's deliberately-far sample, so it contributes little overlap.
- Quick verification, not a publication-grade cross-match.

---

## 5. Integration shape (if/when unblocked)

Mechanically this slots into the existing pipeline (`add-data-source` skill maps the edit surface): FITS parser → `ParsedRecord[]` → crossMatch → `.bin` → new append-only `Source` code → tiering. Notes:

- **New FITS parser needed** — skymap has NPY but not FITS. It's a ~80-line big-endian binary-table reader (proven in the spike, §7).
- **nanomaggy → mag:** `mag = 22.5 − 2.5·log10(flux)`; guard `flux ≤ 0`.
- **Selection-function artifacts** — DESI is footprint-limited (hard NGC/SGC edges, fiber-assignment structure) with per-tracer `n(z)`. Dropped naively it reproduces both the SDSS wedge-pollution failure (keep it out of the DisPerSE density-field default) and the GLADE shell artifact (tracer `n(z)` edges become visible depth shells). Tier it as a deep/far-shell sample.
- The full 47M / DR2 release (~2027) is a drop-in catalog refresh on the same parser — don't over-fit to DR1 paths.

---

## 6. The blocker: rendering capacity

Skymap is **already at the interactive-render limit** for the current ~2.5M-point cloud. DESI adds ~10× more points (~9.75M from LSS alone, and that's before the 47M release). That is not viable on the current renderer.

**This is deferred, not rejected.** The trigger to revisit: a substantial rendering-engine improvement (e.g. GPU-side LOD/culling via BVH or compute shaders, progressive streaming, or a hierarchical point format) that lifts the interactive ceiling to ~25M+ points. When that lands, this doc + the verified facts above are the starting point — no re-derivation needed.

---

## 7. Reproducibility (spike methodology)

Throwaway scripts lived in `/tmp/desi_spike/` (ephemeral). The reproducible technique:

1. **No bulk download** — the DESI server throttles long sequential reads to a stall after ~10 MB. Instead, HTTP `Range` requests pull the FITS header (first ~1.5 MB) and then evenly-spaced row windows. Rows are HEALPix-ordered, so spread byte-offsets sample spread sky — ~25 windows ≈ a representative footprint sample. Cache the decoded sample to `.npy`.
2. **FITS read** — parse the ASCII 80-char-card headers to get `NAXIS1`/`NAXIS2`/`TFIELDS` + per-column `TTYPE`/`TFORM`; build a big-endian numpy structured dtype from `TFORM` letters (`D`=f8, `E`=f4, `K`=i8, `J`=i4, `I`=i2, `B`=u1, `nA`=string).
3. **Cross-match** — `scipy.spatial.cKDTree` on unit-sphere xyz; angular radius → chord length `2·sin(θ/2)`.
4. **skymap catalogs** — GLADE fixed-width (RA bytes 106–123, Dec 125–144), 2MRS (RA 18–26, Dec 28–36), SDSS CSV (cols `ra`/`dec`), Milliquas (RA 1–11, Dec 13–23).
