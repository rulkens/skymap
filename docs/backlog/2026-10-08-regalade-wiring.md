# Wire REGALADE into the galaxy build

> **Backlog item** · `needs-design` · area: Engine & State (data pipeline)
> **Promote to:** brainstorm → `refactor-ground` → spec → plan. The parser is in; everything after it is open.

## Current state (verified 2026-10-08)

`tools/parsers/regalade.ts` parses VizieR J/A+A/706/A284 (`regalade.dat`, 348-byte fixed-width, 71,485,705 rows, ~25 GB) into `ParsedRecord` shape minus `source`, tested against 20 verbatim rows (`tests/fixtures/regalade/sample.dat`). Raw files are registered (`regalade.dat`, `regalade.readme`) with a provenance README at `data/raw/regalade/README.md`. Nothing reads the parser yet: no `Source` code, no `buildAllBins` branch, no `.bin`, no UI row.

Facts the design can lean on (all measured on the file head, see the README's "Format notes"):

- `Dist` is a **luminosity** distance; the parser already inverts it through the pipeline cosmology, so the renderer honours REGALADE's recommended distance (v2 priority chain, outlier guards, DistTmean for GSC-blue rows) with no per-row special case.
- `Refzin`/`r_DistInput`/`r_R1` index the paper's Table 1, not the `IdCat` bits. Spectroscopic parents are 3, 4, 7; the parser surfaces `spectroscopicZ` only for those.
- Photometry is Kron g/r/i/z from PS1 / DELVE / LS DR9 / LS DR10 (`r_gmag`), so the colour spec cannot reuse SDSS `g−r` calibration verbatim.
- The authors' "thin" CSV RA bins 404; the gzipped `.dat` on the CDS FTP is the only scripted download. The 11 GB FITS is on Google Drive (no scripted access).

## Open questions

1. **Replace vs. add.** REGALADE already merges GLADE1, GLADE+, SDSS, DESI DR1, Cosmicflows, NED-LVS. Stacking it on today's SDSS > 2MRS > GLADE > DESI `crossMatch` either dedupes most of it away or double-renders; the natural shape is REGALADE *replacing* GLADE (and possibly the DESI patches) as the all-sky baseline, with SDSS kept for its spec-z precision and 2MRS for its local-volume tooling (PGC → CF4 override). Decide before assigning a `Source` code: codes are append-only and persisted.
2. **Volume.** 71.5 M rows against a ~0.3–2.5 M point budget per tier. `gMAG` (absolute g) is on every row with photometry (`subsampleByAbsMag` fits); fRel / Flag rows are a cheap first cut; the octree LOD is the real answer for the large tier — investigated in [`docs/research/2026-10-08-galaxy-octree-streaming.md`](../research/2026-10-08-galaxy-octree-streaming.md).
3. **Dedup tolerance.** `crossMatch` matches at 5″ AND |Δz|/(1+z) < 1 %. REGALADE's `z` is placed from `Dist`, which for photo-z rows is a trimmed mean with ~10–20 % scatter: matching against SDSS spec-z rows by that rule will leave duplicates. Match by position only inside REGALADE's own `MatchOff` radius, or compare `spectroscopicZ` where both sides have one.
4. **Quality cuts.** `fRel = 1` (only in lower-reliability catalogs, ~20 % of the head sample) and `Flag = 1` (redshifts inconsistent > 10 %) are not cut by the parser; decide per tier. `classByte` is 0 today — fRel/Flag/`r_gmag` bits are candidates once `sourceClass.ts` has a branch for them.
5. **Ingest.** Stream `regalade.dat` through `readline` + `parseRegaladeLine` like GLADE, or pre-cut with a TAP/ADQL query (Dist, gMAG) into a smaller file; a fetcher (`npm run fetch-regalade`) is owed either way, plus the `.sha256` sidecar and an `ATTRIBUTIONS.md` entry when a `.bin` ships.
6. **Licence.** None stated anywhere; ask the authors before redistributing derived `.bin` files.
