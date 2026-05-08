# Cluster catalogs (Abell, ACO, MCXC)

## What it is

Three classical galaxy-cluster catalogs, merged and deduplicated into one small "where the clusters are" table:

- **Abell 1958** — George Abell's original "Rich Clusters of Galaxies" catalog, compiled from Palomar Observatory Sky Survey plates. Northern hemisphere only (δ ≥ −27°). 2712 entries. The single most influential cluster catalog of the 20th century; nearly every famous cluster name (Coma, A2151 = Hercules, A426 = Perseus, A2199, A1656, …) traces back to here.
- **ACO 1989** — Abell, Corwin & Olowin extended the original to the southern hemisphere (Hydra, Centaurus, Norma, Shapley, Fornax, …). 4073 entries when combined with Abell 1958, with overlap in the equatorial band.
- **MCXC 2011** — Meta-Catalog of X-ray-detected Clusters of galaxies, Piffaretti et al. 2011. ~1743 entries. The crucial complement: each entry has an **X-ray luminosity** L_X (a clean mass proxy, much less prone to projection effects than optical richness), a **redshift** (so we can place it in 3D), and a **mass estimate** M500. Not every Abell cluster is in MCXC (low-z + low-mass clusters often lack archival X-ray detections), and not every MCXC entry has an Abell name (some are CIZA / RXC / 4XMM serendipitous detections), so we need both.

The merged output is small: ~4000 unique clusters at maybe 60 bytes each = ~240 KB raw, ~50 KB after we drop everything we don't render.

## Why we need it (which shell, what role)

Used by **shell 6 (Virgo Supercluster)** and **shell 7 (Laniakea)**.

Two distinct rendering uses, with very different selectivity:

1. **Named-cluster overlay (~50 entries).** As the camera approaches shell 6, prominent clusters get a label and a soft halo billboard centred on the brightest cluster galaxy. We do not want 4000 labels — only the famous ones (Virgo, Coma, Perseus, Centaurus, Hydra, Fornax, Hercules, Shapley, Norma, Pisces-Perseus, …). Selection is by X-ray luminosity / richness, capped at the top ~50, with a manual whitelist override so the canonical names are guaranteed present even if their L_X happens to fall just below the cut.
2. **Invisible "is this a galaxy cluster member?" lookup (all 4000).** When the user clicks a galaxy on shell 6, the InfoCard wants to say "in the Virgo cluster" or "outskirts of the Coma cluster". We do this with a sky-position + redshift proximity check against the full cluster table. No render, no GPU upload — just a small in-memory KD-tree on the engine side. This is also handy for shell 7, where the X-ray flag drives the optional ROSAT halo intensification (see [data/08-rosat-xray.md](08-rosat-xray.md)).

The catalog is **not** the source of cluster X-ray maps — that's ROSAT (separate spec). It only provides centres, names, distances, and a single mass/richness scalar per cluster.

## Acquisition

All three catalogs are mirrored at VizieR (CDS Strasbourg) and download as fixed-width ASCII with companion ReadMe files describing byte offsets. No authentication, no rate limits worth worrying about for a one-shot fetch.

| Catalog | VizieR ID | URL | Format | Raw size |
|---------|-----------|-----|--------|----------|
| Abell 1958 | VII/110A | `https://cdsarc.cds.unistra.fr/viz-bin/cat/VII/110A` | fixed-width `.dat` + ReadMe | ~150 KB |
| ACO 1989 | VII/97 | `https://cdsarc.cds.unistra.fr/viz-bin/cat/VII/97` | fixed-width `.dat` + ReadMe | ~250 KB |
| MCXC 2011 | J/A+A/534/A109 | `https://cdsarc.cds.unistra.fr/viz-bin/cat/J/A+A/534/A109` | fixed-width `.dat` + ReadMe | ~200 KB |

Download is a one-time manual `curl` (or `wget -r`) into `data/raw/clusters/`. The total raw payload is ~600 KB, so we check it into the repo (unlike the multi-hundred-MB source catalogs that live only on R2 build hosts). That guarantees deterministic builds even if VizieR has a bad day.

The companion ReadMe files (`ReadMe_VII_110A`, `ReadMe_VII_97`, `ReadMe_J_A+A_534_A109`) **must** be saved alongside the data — they are the byte-offset spec the parser relies on, exactly as we already do for SDSS / 2MRS / GLADE in `data/raw/`.

## Parsing

Each catalog is a fixed-width `.dat` with a known ReadMe layout. We add three parsers under `tools/parsers/`, mirroring the existing pattern (`parseSdss.ts`, `parseTwoMrs.ts`, `parseGlade.ts`):

- `tools/parsers/parseAbell.ts`
- `tools/parsers/parseAco.ts`
- `tools/parsers/parseMcxc.ts`

Each emits an array of a small intermediate type:

```ts
export type ParsedCluster = {
  catalog: 'abell' | 'aco' | 'mcxc';
  catalogId: string;        // 'A1656', 'ACO 3526', 'MCXC J1259.4+2755'
  raDeg: number;            // ICRS, decimal degrees
  decDeg: number;           // ICRS, decimal degrees
  redshift: number | null;  // z; null if unknown (Abell mostly, ACO sometimes)
  richness: number | null;  // Abell richness count; null for MCXC
  lx500: number | null;     // 1e44 erg/s, MCXC only
  m500: number | null;      // 1e14 Msun, MCXC only
  hasXray: boolean;         // true iff the cluster appears in MCXC
};
```

Per-catalog field extraction:

- **Abell**: cols 1-4 ACO number, 6-7 RA hours / 9-10 RA mins (B1950, must precess), 18-19 Dec degrees / 21-22 Dec mins, col 36-37 richness count, col 39-44 estimated z (often blank for distance-class clusters with no spec-z). The B1950→J2000 precession matters; we already have a tiny implementation in `src/utils/celestial.ts` we can reuse.
- **ACO**: superset of Abell with southern entries and revised positions; J2000 already (per the ReadMe), so no precession.
- **MCXC**: J2000, gives `_RAJ2000`, `_DEJ2000`, `z`, `L500`, `M500`, plus a primary `Name` field.

Drop everything else (galactic coords, BM type, NED-link strings, …). Keep file noise low.

## Filtering / cross-matching

After all three parsers run, we have ~8500 records (with overlaps). The dedup pass runs once:

1. Concatenate all three lists.
2. Sort by RA.
3. For each record, search forward for any later record within **10 arcmin** sky separation (a generous cluster-core radius — projected core radius of a typical cluster at z = 0.05 is ~5 arcmin) and within **Δz = 0.01** when both have redshifts. If found, merge into the same cluster.
4. Merge rule: prefer MCXC for position + redshift (X-ray centroids are tighter than optical), prefer Abell for the canonical short name (`A1656` is what people call Coma — `MCXC J1259.4+2755` is not). Set `hasXray = true` if any merged input was MCXC. Take the **max** richness and the **max** L_X across merged inputs.

Output: ~4000 unique `MergedCluster` records.

Then the **named-overlay filter** (a separate pass producing a separate field of the binary, not a separate file):

1. Score each cluster: `score = lx500 ?? (richness * 0.05) ?? 0`. (The 0.05 multiplier is a hand-calibrated bridge so an Abell richness-3 cluster scores comparable to a 1×10⁴⁴ erg/s X-ray cluster — see Wen+ 2012 for the empirical relation.)
2. Sort descending.
3. Take top 50.
4. Union with a `FAMOUS_CLUSTER_WHITELIST` constant (Virgo / A1656 Coma / A426 Perseus / Centaurus / Hydra / Fornax / Norma / Shapley 8 / Hercules / Pisces-Perseus). Whitelist matches by Abell number primarily, MCXC name secondarily.
5. Set the `isFamous` flag on those records.

No cross-match into our existing point clouds at build time. The runtime "what cluster is this galaxy in?" query is a separate concern (see [shells/06-virgo-supercluster.md](../shells/06-virgo-supercluster.md)).

## Output binary format

One file: `public/data/clusters.bin`. Format follows the existing `magic + version + count` header convention from `src/data/pointCloudFormat.ts`, defined in [`data/10-binary-formats.md`](10-binary-formats.md) under section "Cluster catalog v1".

Header (16 bytes): `magic = 'CLUS'` (4) + `version = 1` u32 (4) + `count` u32 (4) + `pad` u32 (4).

Per record (32 bytes, 4000 records → 128 KB ≈ ~50 KB gzipped over the wire):

| Offset | Bytes | Type    | Field        | Notes                                           |
|--------|-------|---------|--------------|-------------------------------------------------|
| 0      | 4     | f32     | raDeg        | J2000                                           |
| 4      | 4     | f32     | decDeg       | J2000                                           |
| 8      | 4     | f32     | redshift     | NaN if unknown                                  |
| 12     | 4     | f32     | massScore    | Combined L_X / richness scalar (see filter §)   |
| 16     | 4     | u32     | flags        | bit 0 = hasXray, bit 1 = isFamous, bits 2-31 reserved |
| 20     | 4     | u32     | nameOffset   | byte offset into trailing string blob            |
| 24     | 8     | —       | reserved     | zero; reserved for a future `pgcOfBcg` u32 + pad |

Trailing variable-length blob: UTF-8 names, NUL-terminated, referenced by `nameOffset`. Names are short (`'A1656'`, `'Virgo'`, `'MCXC J1259.4+2755'`), average ~12 bytes; blob is ~50 KB.

The runtime decoder lives in `src/data/clusterFormat.ts`. It returns `Cluster[]` plus a `KdTree<Cluster>` indexed on `(raDeg, decDeg)` for the sky-position lookup. Same shape as the existing famous-galaxy decoder; keep it didactic.

## Build script

- **File**: `tools/buildClusters.ts`
- **Run command**: `npm run build-clusters` (also wired into `npm run build-shell-data`)
- **Idempotent?** Yes — given the same `data/raw/clusters/` inputs, output bytes are deterministic. Sort order is stable (`raDeg` then `catalogId` lexicographic) so dedup output never reorders between runs.
- **Approximate runtime**: <1 second. The catalogs are tiny. Most of the time is reading three files.

The script: parse all three → merge → dedup → score → emit `clusters.bin` + a sidecar `clusters-meta.json` with the count, build timestamp, and source-catalog versions for the credits page.

## Licensing & attribution

All three are public catalogs hosted at VizieR / CDS, which permits free reuse with citation. No NC clause, no API key, no take-down risk. Citations:

- Abell, G. O. 1958, ApJS, 3, 211 (`1958ApJS....3..211A`)
- Abell, G. O., Corwin, H. G., Jr., & Olowin, R. P. 1989, ApJS, 70, 1 (`1989ApJS...70....1A`)
- Piffaretti, R., Arnaud, M., Pratt, G. W., Pointecouteau, E., & Melin, J.-B. 2011, A&A, 534, A109 (`2011A&A...534A.109P`)
- VizieR, CDS Strasbourg (`2000A&AS..143...23O`)

Add to `CREDITS.md` under a "Cluster catalogs" subsection. Shell 6's overlay credit line becomes "Galaxies: GLADE / 2MRS • Clusters: Abell+ACO+MCXC".

## Risks

- **B1950 → J2000 precession on Abell**: easy to forget; will manifest as ~0.5° centroid offsets at high declination. Add a regression test that pins A1656 (Coma) within 1 arcmin of the modern position (RA 12h59m48s, Dec +27°58′).
- **Dedup over-merge near the equatorial overlap**: the 10-arcmin radius is generous; two genuinely distinct clusters at different redshifts could get merged if Δz is unknown for one of them. Mitigation: when one side has `redshift = null`, require sky separation < 3 arcmin instead of 10. Test with the Virgo region, which has multiple clumps within a few degrees.
- **Famous whitelist drift**: the whitelist hard-codes names. If we ever rename the famous-galaxy schema or the Abell numbering changes upstream (it won't), the lookup silently misses. Mitigation: a unit test asserts every whitelist entry resolves to exactly one merged cluster.

## Sample/test data

`tests/fixtures/clusters/` ships:

- `abell-sample.dat` (10 lines around Coma)
- `aco-sample.dat` (10 lines around Centaurus)
- `mcxc-sample.dat` (10 lines around Virgo + Coma)
- `expected-merged.json` — the expected `MergedCluster[]` output of the dedup over those samples, hand-curated.

The build script unit test parses the samples and asserts the merged output matches `expected-merged.json` byte-for-byte after re-encoding. This is the same TDD pattern used by the SDSS / 2MRS / GLADE parser tests.

## References

- Abell 1958, "The Distribution of Rich Clusters of Galaxies", ApJS 3, 211.
- Abell, Corwin & Olowin 1989, "A catalog of rich clusters of galaxies", ApJS 70, 1.
- Piffaretti et al. 2011, "The MCXC: a meta-catalogue of X-ray detected clusters of galaxies", A&A 534, A109.
- Wen, Han & Liu 2012, "A catalog of 132,684 clusters of galaxies identified from SDSS DR8", ApJS 199, 34 — for the L_X ↔ richness scaling we crib in the famous-cluster scoring.
- VizieR catalog browser: https://vizier.cds.unistra.fr/viz-bin/VizieR
- CDS ReadMe format: https://cds.unistra.fr/doc/catstd.htx
