# Local Group Catalog (NED-LVC + UNGC)

## What it is

A curated catalog of every known galaxy within roughly 3 Mpc of the Milky Way — the **Local Group** plus its immediate "Local Volume" envelope. The two complementary upstream sources:

- **NED Local Volume Catalog (LVC)** — NASA/IPAC Extragalactic Database's living compilation of nearby galaxies, indexed and cross-referenced against the entire NED holdings. URL: `https://ned.ipac.caltech.edu/uri/NED::LVC`. ASCII tables with name, position, redshift, distance, magnitudes, and morphology.
- **Updated Nearby Galaxy Catalog (UNGC)** — Karachentsev, Makarov & Kaisina 2013, AJ 145, 101. The canonical scholarly catalog: ~870 galaxies with curated distances (mostly TRGB/Cepheid based, far better than redshift-derived for nearby galaxies where peculiar velocities dominate). VizieR identifier `J/AJ/145/101`.

Together they cover ~80–100 confirmed Local Group members within ~3 Mpc plus a halo of ~700 more galaxies extending to ~10 Mpc. We use both: UNGC for the curated distances and morphology, NED-LVC as the cross-check and naming-authority backstop.

## Why we need it (which shell, what role)

**Shell 4 (Local Group).** This shell zooms from ~100 kpc (just outside the Milky Way's halo) out to ~5 Mpc (where the Local Group dissolves into the surrounding Local Sheet). The hero data is the dwarf-galaxy population: dozens of tiny faint companions to the Milky Way and M31 that simply do not exist in any of skymap's existing catalogs.

Why existing catalogs are insufficient:

- **2MRS** is K-band-flux-limited (Ks ≤ 11.75). Most Local Group dwarfs are far too faint to clear that threshold. Only the brightest dozen or so (M31, M33, LMC, SMC, NGC 6822, IC 10, NGC 185, NGC 147, ...) appear.
- **GLADE** inherits 2MRS's cuts plus HyperLEDA's heterogeneous coverage. Dwarf coverage is patchy and the distances are unreliable below ~5 Mpc because peculiar velocities swamp the Hubble flow.
- **SDSS** has near-zero overlap with the Local Group (the SDSS footprint avoids the galactic plane; M31 is at low galactic latitude, and most dwarfs are too low surface brightness for SDSS's photometric pipeline anyway).

So shell 4 needs a small, custom, high-quality catalog where each entry has been hand-curated by the nearby-galaxy community. UNGC is exactly that catalog. Without it, the Local Group shell would render maybe 10 dots; with it, ~80–100, including the famous-but-faint companions (Sculptor, Fornax, Draco, Ursa Minor, Leo I, Leo II, ...) that make the shell visually convincing and pedagogically honest.

## Acquisition

- **NED-LVC**
  - URL: `https://ned.ipac.caltech.edu/uri/NED::LVC`
  - Authentication: none (public NASA service)
  - Format: HTML index plus ASCII / VOTable per-object endpoints. We pull the bulk ASCII export.
  - Size raw: ~few hundred KB (depending on cuts)
- **UNGC**
  - URL: `https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/AJ/145/101`
  - Authentication: none
  - Format: VizieR fixed-width ASCII (matches the byte-layout style of `data/raw/J_ApJS_199_26_ReadMe`-shaped files we already parse)
  - Size raw: ~500 KB for the full catalog including the long-form ReadMe

Both downloads are recorded in [`../data/00-data-sources.md`](00-data-sources.md) and land in `data/raw/local-group/` alongside their VizieR ReadMes. The download is a one-shot manual step (`curl` commands documented in the build script header) — these catalogs update on multi-year cadence, not nightly, so automating the fetch buys nothing.

## Parsing

- **Code path**: `tools/parsers/parseUNGC.ts` (new) and `tools/parsers/parseNedLvc.ts` (new), invoked from `tools/buildLocalGroup.ts`. Both parsers follow the existing `tools/parsers/parse2MRS.ts` shape: synchronous file read, byte-offset extraction per the ReadMe, return `ParsedLocalGroupRecord[]`.
- **Schema we extract** (from UNGC; NED-LVC fills gaps):

```ts
export type ParsedLocalGroupRecord = {
  name: string;          // canonical name, e.g. "M31", "Sculptor", "LMC"
  ra: number;            // J2000 right ascension, degrees
  dec: number;           // J2000 declination, degrees
  distanceMpc: number;   // best curated distance (TRGB > Cepheid > TF > redshift)
  absMag: number;        // absolute B-magnitude (UNGC col Bmag - 5*log10(D*1e6/10))
  morphologyCode: number; // de Vaucouleurs T-type, integer -6..+10
  membership: 'LG' | 'LV'; // Local Group proper vs broader Local Volume
};
```

- **Fields we drop**: HI mass, surface brightness, position-angle, axial ratio, environment indices, Tully-Fisher metadata. None are needed for shell 4's fuzzy-dwarf rendering — the renderer just needs position, distance, brightness, morphology.

## Filtering / cross-matching

Cuts applied:

1. **Distance ≤ 3 Mpc by default** (configurable in the build script). This captures the canonical Local Group plus its immediate environs without bleeding into the Local Sheet's territory (handled by shell 5's Tully 2GC catalog).
2. **Drop entries with no curated distance.** A handful of UNGC rows are flagged "tentative member"; we keep them only if they have a TRGB or Cepheid distance.
3. **Cross-match against existing skymap catalogs to deduplicate.** This is the load-bearing step:
   - Match by name first (e.g., "M31" / "NGC 224" / "Andromeda" all collapse to one entry — UNGC provides the alias list).
   - Then by position (1 arcmin tolerance) against `2mrs.bin` and `glade-medium.bin`.
   - For each match: prefer the UNGC distance and morphology (curated), but record a `dedupKey` so the runtime can suppress the duplicate point in 2MRS/GLADE when shell 4 is active. The dedup happens **at render time**, not by editing the existing bins — keeps the existing catalogs untouched and the shell logic local.

The output `localgroup.bin` therefore contains the **authoritative** version of each Local Group / Local Volume galaxy. Shell 4 hides any 2MRS/GLADE point whose `dedupKey` matches a localgroup entry.

## Output binary format

See [`10-binary-formats.md`](10-binary-formats.md) (section: "Local Group v1"). Per-record layout, 32 bytes:

```
offset  size  type    field
   0     4    f32     x (Mpc, supergalactic-X)
   4     4    f32     y (Mpc, supergalactic-Y)
   8     4    f32     z (Mpc, supergalactic-Z)
  12     4    f32     absMag
  16     2    i16     morphologyCode (T-type * 10, fixed-point so we keep half-types like 9.5)
  18     2    u16     nameIndex (offset into the names table)
  20     4    u32     dedupKey (FNV-1a of canonical name, used for runtime dedup against 2MRS/GLADE)
  24     4    f32     distanceMpc (kept separately for the LG barycentre overlay)
  28     4    u32     membership flags (bit 0: Local Group, bit 1: Local Volume, bits 2-31 reserved)
```

Plus a trailing **names table**: a length-prefixed UTF-8 blob, indexed by `nameIndex`. Names are short (mean ~6 bytes) so the table is ~600 bytes for 100 records.

Total file size for ~100 records: header (16) + 100 * 32 + names (~600) ≈ **3.2 KB**. Well under the 10 KB target — small enough to **commit directly to the repo** at `public/data/localgroup.bin` rather than ship via R2. A 3 KB blob isn't worth a separate fetch, isn't worth the R2 round-trip, and embedding it means shell 4 has zero network dependency.

(If the broader Local Volume cut is ever extended to ~10 Mpc, the file grows to ~25 KB — still fine to commit.)

## Build script

- **File**: `tools/buildLocalGroup.ts`
- **Run command**: `npm run build-local-group` (added to `package.json`; also wired into the umbrella `npm run build-shell-data` per [`00-data-sources.md`](00-data-sources.md))
- **Idempotent**: yes — deterministic output for fixed input bytes, including stable name-table ordering (sorted by descending absolute magnitude so the brightest galaxies sit first, useful for label-priority ordering downstream).
- **Approximate runtime**: <1 s. The catalogs are tiny.

The script's responsibilities:

1. Parse UNGC (primary).
2. Parse NED-LVC (supplementary; fills missing distances or morphologies).
3. Merge by name with UNGC winning on conflicts.
4. Apply distance and quality cuts.
5. Convert J2000 RA/Dec + distance to supergalactic Cartesian (the same coordinate system shell 4 renders in — see [`rendering/03-coordinate-systems.md`](../rendering/03-coordinate-systems.md)).
6. Compute `dedupKey` for each record.
7. Write `public/data/localgroup.bin`.
8. Emit a `localgroup.report.txt` log (record count, brightest/faintest, cross-match hits) so a human can sanity-check the output.

## Licensing & attribution

- **NED** is a NASA-funded service; data is public-domain but **NASA's NED-use policy requires citation** of the relevant primary references plus an acknowledgement of NED itself. Standard form: *"This research has made use of the NASA/IPAC Extragalactic Database (NED), which is funded by the National Aeronautics and Space Administration and operated by the California Institute of Technology."*
- **UNGC** requires citation of Karachentsev, Makarov & Kaisina 2013, AJ, 145, 101 (also known as Karachentsev+13). The earlier "Catalog of Neighboring Galaxies" (Karachentsev+04, AJ 127, 2031) is the foundation paper and is conventionally cited alongside.
- Both will be added to the repo-root `CREDITS.md` and shell 4's overlay credit line ("Local Group: NED LVC / Karachentsev+13").

## Risks

- **Naming collisions are real.** "M110" / "NGC 205" / "Andromeda VIII" overlap in confusing ways across catalogs. The dedup logic must be tested with a fixture covering the known-difficult cases. See [`tests/tools/buildLocalGroup.test.ts`](../../../tests/tools/buildLocalGroup.test.ts) (will be created with the implementation).
- **NED's HTML scrape can break** if IPAC restyles the page. Mitigation: prefer the VizieR copy of the LVC when available; fall back to a cached snapshot in `data/raw/local-group/ned-lvc-snapshot.txt` if the live fetch fails.
- **Distance estimates have uncertainties of 10–30%**, much larger than what the shell-4 visuals suggest. We accept this; pedagogically the shell is about the *grouping*, not millimetre-precise positions. A future enhancement could render a faint distance-uncertainty halo per dwarf.

## Sample / test data

A 6-galaxy fixture lives at `tests/fixtures/local-group-mini.txt`: M31, M33, LMC, SMC, Sagittarius dSph, and Sculptor. Covers the parser, the supergalactic conversion, the absolute-magnitude derivation, and one dedup hit (M31 also appears in 2MRS).

## References

- Karachentsev, Makarov, Kaisina 2013, *AJ*, 145, 101 — UNGC paper.
- Karachentsev et al. 2004, *AJ*, 127, 2031 — original CNG.
- NED Local Volume Catalog: `https://ned.ipac.caltech.edu/uri/NED::LVC`
- VizieR UNGC: `https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/AJ/145/101`
- McConnachie 2012, *AJ*, 144, 4 — comprehensive review of Local Group satellites; useful sanity check on membership.
