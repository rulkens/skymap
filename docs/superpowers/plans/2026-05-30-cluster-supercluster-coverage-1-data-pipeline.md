# Plan 1 — Cluster/Supercluster Coverage: Data + Build Pipeline

**Goal:** Produce `public/data/clusters.ccat` + `public/data/clusters_meta.json`
from the MCXC + MSCC catalogs via `npm run build-clusters`, migrate the
hand-curated anchors into a bundled seed JSON, and extract the genuinely
shared curation helpers so `buildFamous` and `buildClusters` stop
duplicating them. No runtime/render changes (those are Plan 2).

**Architecture:** Build-time only. New tool `tools/clusters/buildClusters.ts`
mirrors `tools/famous/buildFamous.ts`: parse raw catalogs → distance/radius
derivation → threshold + featured-dedup → emit a numeric `.ccat` (via the
new `src/data/clusterCatalogFormat.ts`) paired with a `clusters_meta.json`
string sidecar (mirroring the `famous.bin` / `famous_meta.json` pairing).
The featured tier moves from `src/data/clusterAnchors.ts` into
`data/cluster_anchors.seed.json`; `clusterAnchors.ts` is deleted and its
pure `raDecDistToEqCart` helper becomes `src/utils/math/raDecDistToEqCart.ts`.

**Tech Stack:** TypeScript (tools tsconfig), `tsx` runner, Vitest. Same
binary-format idiom as `galaxyCatalogFormat.ts` (DataView header + Float32
record view). Raw paths through `tools/utils/io/rawDataRegistry.ts`. No new
deps.

**Decision record:** [ADR 0003 — Cluster catalog loading](../../adrs/0003-cluster-catalog-loading.md) (Accepted) — why the `.ccat` format exists and the featured-sync/bulk-async split.

> **For agentic workers:** read the spec
> (`docs/superpowers/specs/2026-05-30-cluster-supercluster-coverage-design.md`)
> and `docs/superpowers/conventions/plan-style.md` before starting. Project
> conventions in `CLAUDE.md` override defaults: `type` aliases never
> `interface`; `Vec3`/`Vec2` aliases never raw tuples; single-function files
> take the function's name; didactic comments; route raw paths through
> `rawDataPath`; never `git add -A`. Use the
> `superpowers:test-driven-development` skill per task.

---

## Conventions for this plan

- **Coordinate frame.** Equatorial-Cartesian Mpc, the same right-handed
  frame every `GalaxyCatalog`, the filament binary, and `raDecDistToEqCart`
  use (`+X`→RA 0h, `+Y`→RA 6h, `+Z`→Dec +90°). The bulk build derives
  positions from RA/Dec(deg) + `redshiftToDistanceMpc(z)`; the featured seed
  uses RA(hours)/Dec(deg)/distMpc via `raDecDistToEqCart`.
- **Significance.** Raw physical quantity in the `.ccat` (`M500` for
  clusters, `Nm` for superclusters) — normalization happens at decode/render
  (Plan 2), not at build, so the file stays a faithful catalog record.
- **Commit cadence.** One commit per task after its tests pass.

---

## Task 1 — Register MCXC + MSCC raw data

**Files:** `tools/utils/io/rawDataRegistry.ts` (modify),
`tools/fetch/fetchClusterCatalogs.ts` (new),
`data/raw/mcxc/README.md` (new, committed),
`data/raw/mscc/README.md` (new, committed),
`data/raw/mcxc/mcxc.dat.sha256` (new, committed),
`data/raw/mscc/mscc.dat.sha256` (new, committed),
`package.json` (modify — add `fetch-clusters`), `.gitignore` (modify),
`tests/tools/utils/io/rawDataRegistry.test.ts` (modify).

**Raw catalog data is NOT committed.** Mirror the CF-4 pattern exactly: the
`.dat` tables AND their VizieR `ReadMe`s are **gitignored** and fetched on
demand; only a provenance `README.md` + a `.sha256` checksum per table are
committed. (See `cf4.table2`/`cf4.readme` = gitignored, `cf4.sha256` =
committed, fetched via `npm run fetch-cf4` — `rawDataRegistry.ts:208-231`,
`.gitignore:103,109`.)

Registry keys:

| key | path | source |
|---|---|---|
| `mcxc.table` | `data/raw/mcxc/mcxc.dat` | gitignored |
| `mcxc.readme` | `data/raw/mcxc/ReadMe` | gitignored |
| `mcxc.sha256` | `data/raw/mcxc/mcxc.dat.sha256` | committed |
| `mscc.table` | `data/raw/mscc/mscc.dat` | gitignored |
| `mscc.readme` | `data/raw/mscc/ReadMe` | gitignored |
| `mscc.sha256` | `data/raw/mscc/mscc.dat.sha256` | committed |

The `.dat` + `ReadMe` files are **already present** in this worktree (fetched
2026-05-30), so the downstream build tasks run immediately; the fetcher
exists for fresh clones + reproducibility.

**Fetcher** (`tools/fetch/fetchClusterCatalogs.ts`, model on
`tools/fetch/fetchCosmicflows4.ts`): download into `data/raw/{mcxc,mscc}/`
from the CDS FTP archive —
- MCXC: `https://cdsarc.cds.unistra.fr/ftp/J/A+A/534/A109/{mcxc.dat,ReadMe}`
- MSCC: `https://cdsarc.cds.unistra.fr/ftp/J/MNRAS/445/4073/{mscc.dat,ReadMe}`

then verify each `.dat` against its committed `.sha256` (fail loud on
mismatch — mirror `fetchCosmicflows4`'s checksum handling).

- [ ] Add the six registry entries (paths above), with `upstream` URLs +
  `readme` cross-links, mirroring the `cf4.*` shapes.
- [ ] Write the fetcher; add `"fetch-clusters": "tsx tools/fetch/fetchClusterCatalogs.ts"`
  to `package.json` (next to `fetch-cf4`).
- [ ] Compute + commit `mcxc.dat.sha256` + `mscc.dat.sha256`.
- [ ] Write `data/raw/mcxc/README.md` + `data/raw/mscc/README.md` (provenance:
  upstream URL + VizieR id, the verified byte-layout summary from Tasks 2–3,
  fetch date, row counts 1743/601, sha256).
- [ ] `.gitignore`: whitelist ONLY the committed files (near
  `!/data/raw/cf4/README.md` `.gitignore:103` + `!/data/raw/cf4/table2.dat.sha256`
  `.gitignore:109`): `!/data/raw/mcxc/README.md`, `!/data/raw/mscc/README.md`,
  `!/data/raw/mcxc/mcxc.dat.sha256`, `!/data/raw/mscc/mscc.dat.sha256`. The
  `.dat` + `ReadMe` stay gitignored under the wholesale `/data/` ignore.
- [ ] Test `rawDataPath resolves mcxc + mscc keys to absolute paths`
  asserting `rawDataPath('mcxc.table')`/`rawDataPath('mscc.table')` end with
  the registered relative paths and are absolute.
- [ ] `npm test -- rawDataRegistry` passes; `npm run fetch-clusters` re-fetches
  cleanly + checksums verify. Commit (fetcher, registry, READMEs, sha256s —
  **never** the `.dat`/`ReadMe`).

---

## Task 2 — `parseMcxc` parser

**Files:** `tools/parsers/parseMcxc.ts` (new),
`tests/tools/parsers/parseMcxc.test.ts` (new).

Byte offsets below are VERIFIED against the committed `data/raw/mcxc/ReadMe`
and confirmed against real rows of `mcxc.dat` (2026-05-30). Use the decimal
`RAdeg`/`DEdeg` columns — do NOT parse the sexagesimal h:m:s/d:m:s columns.

**Verified byte layout (1-indexed inclusive, per ReadMe):**

| field | bytes | format | notes |
|---|---|---|---|
| MCXC id | 1–12 | A12 | `JHHMM.m+DDMM` |
| OName | 14–31 | A18 | usually the RXC/REFLEX designation (`RXC J…`) |
| AName | 33–86 | A54 | Abell (`ANNNN`/`SNNNN`) / UGC / popular name; often blank |
| RAdeg | 109–115 | F7.3 deg | **decimal degrees** |
| DEdeg | 117–123 | F7.3 deg | **decimal degrees**, signed |
| z | 141–146 | F6.4 | |
| M500 | 190–196 | F7.4 | 10¹⁴ M☉ |
| R500 | 198–204 | F7.4 | Mpc (ready-made) |

Lines are right-trimmed and **variable length** (rows without Notes/overlap
columns are ~204 chars; richer rows ~305). All fields above end by byte 204,
so they're present on every row — but slice by offset and tolerate short
lines (don't assume a fixed 323 width).

**Signature:**
```ts
export type McxcRow = {
  id: string;            // MCXC primary id, e.g. 'J1259.7+2756'
  raDeg: number;         // RAdeg column — already decimal degrees [0,360)
  decDeg: number;        // DEdeg column — already decimal degrees [-90,90]
  z: number;             // redshift
  m500: number;          // total mass, 10^14 Msun
  r500Mpc: number;       // characteristic radius, Mpc (ready-made)
  oName: string;         // 'Other name' — usually RXC designation ('' if blank)
  aName: string;         // 'Alternative name' — Abell/UGC/popular ('' if blank)
};
export function parseMcxc(raw: string): McxcRow[];
```

**Behaviour:** fixed-offset slice per the table above; `RAdeg`/`DEdeg` are
parsed directly as decimal degrees (no sexagesimal conversion); blank
`OName`/`AName` → `''` (trim); skip comment/blank lines.

- [ ] Build a small hand-crafted fixture (3–4 rows copied verbatim from the
  real `mcxc.dat`, exact column alignment) as a test constant. Include one
  row with a populated `AName` (e.g. row 0 `UGC 12890`) and one with blank
  `AName` (e.g. row 1).
- [ ] Test `parseMcxc reads decimal RAdeg/DEdeg, z, M500, R500` asserting
  row 0 ≈ `{raDeg: 0.030, decDeg: 8.274, z: 0.0396, m500: 0.7373, r500Mpc: 0.6296}`
  (~1e-3 tol).
- [ ] Test `parseMcxc reads a signed southern declination` asserting a
  negative `decDeg` row (e.g. row 1 `-2.625`).
- [ ] Test `parseMcxc returns blank AName as empty string` on a row whose
  `AName` column is all spaces.
- [ ] Test `parseMcxc skips comment and blank lines`.
- [ ] Implement against the verified offsets. `npm test -- parseMcxc` → passes.
  Commit.

---

## Task 3 — `parseMscc` parser

**Files:** `tools/parsers/parseMscc.ts` (new),
`tests/tools/parsers/parseMscc.test.ts` (new).

Byte offsets VERIFIED against `data/raw/mscc/ReadMe` + real `mscc.dat` rows
(2026-05-30). The `mscc.dat` and `sscc.dat` share this layout; we use
`mscc.dat` only (601 all-sky superclusters).

**Verified byte layout (1-indexed inclusive):**

| field | bytes | format | notes |
|---|---|---|---|
| Seq | 1–3 | I3 | id number 1–601 → render as `MSCC NNN` |
| SCLs | 6–21 | A16 | Einasto 2001 cross-ref (unused) |
| Nm | 24–25 | I2 | member-cluster count, range [2/42] |
| RAdeg | 27–32 | F6.2 deg | **decimal degrees** |
| DEdeg | 34–39 | F6.2 deg | **decimal degrees**, signed |
| z | 41–45 | F5.3 | [0.01/0.15] |
| dmax | 47–51 | F5.1 | h₇₀⁻¹ Mpc (raw units) |

Lines are variable length (trailing `memCl` member list, bytes 53+, varies);
all fields above end by byte 51.

**Signature:**
```ts
export type MsccRow = {
  id: string;       // 'MSCC ' + Seq (e.g. 'MSCC 1')
  raDeg: number;    // RAdeg — already decimal degrees
  decDeg: number;   // DEdeg — already decimal degrees, signed
  z: number;        // mean redshift
  nm: number;       // member-cluster count [2,42]
  dmaxMpc: number;  // max member-pair separation, h70^-1 Mpc (raw units)
};
export function parseMscc(raw: string): MsccRow[];
```

**Behaviour:** fixed-offset slice; `RAdeg`/`DEdeg` parsed directly as decimal
degrees. `dmaxMpc` returned in raw `h70^-1 Mpc` units — the `h70 → Mpc`
conversion + halving lives in `buildClusters` (Task 10), so the parser stays
a faithful column reader.

- [ ] Hand-built fixture (3–4 rows copied verbatim from `mscc.dat`).
- [ ] Test `parseMscc reads decimal RAdeg/DEdeg, z, Nm, dmax` asserting
  row 0 ≈ `{id: 'MSCC 1', raDeg: 0.77, decDeg: -26.72, z: 0.064, nm: 9, dmaxMpc: 50.6}`.
- [ ] Test `parseMscc reads a signed positive declination` (e.g. row 1
  `+09.77` → `9.77`).
- [ ] Test `parseMscc skips comment and blank lines`.
- [ ] Implement. `npm test -- parseMscc` → passes. Commit.

---

## Task 4 — `clusterCatalogFormat` binary format

**Files:** `src/data/clusterCatalogFormat.ts` (new),
`src/@types/data/ClusterCatalog.d.ts` (new),
`tests/data/clusterCatalogFormat.test.ts` (new).

Mirror `galaxyCatalogFormat.ts` structurally (magic+version+count header,
fail-loud version mismatch, Struct-of-Arrays catalog type, DataView header
+ Float32 record view). Record is fixed-size, 4-byte aligned.

**Catalog type (`src/@types/data/ClusterCatalog.d.ts`):**
```ts
import type { Vec3 } from '../math/Vec3';
export type ClusterCategoryByte = 0 | 1; // 0 = cluster, 1 = supercluster
export type ClusterCatalog = {
  readonly count: number;
  readonly positions: Float32Array;        // count*3, equatorial-Cartesian Mpc
  readonly physicalRadiusMpc: Float32Array; // count
  readonly apparentRadiusMpc: Float32Array; // count
  readonly significance: Float32Array;      // count (raw M500 / Nm)
  readonly category: Uint8Array;            // count, ClusterCategoryByte values
};
```
(Voids are NOT in the `.ccat` — featured-only; so the category byte only
ever holds cluster/supercluster. Reserve higher values for a future void
bulk source rather than special-casing now.)

**Binary layout (little-endian):**

```
── HEADER (16 bytes) ──────────────────────────────────────────────
0    4   magic    = "CCAT" (0x54414343)
4    4   version  = 1 (uint32)
8    4   count    = number of structures (uint32)
12   4   reserved = 0

── PER-RECORD (24 bytes) ──────────────────────────────────────────
0    4   posX               (float32, Mpc)
4    4   posY               (float32)
8    4   posZ               (float32)
12   4   physicalRadiusMpc  (float32)
16   4   apparentRadiusMpc  (float32)
20   4   significance       (float32, raw M500 / Nm)
── (category byte packed into the high byte of a trailing u32 slot) ─
```

Decision to pin: keep the record cleanly 4-aligned. Use a **28-byte**
record where bytes 24..27 hold `category` (u8) at offset 24 + 3 padding
bytes (zeroed). Total file size = `16 + count * 28`.

| field | offset | type |
|---|---|---|
| posX | 0 | f32 |
| posY | 4 | f32 |
| posZ | 8 | f32 |
| physicalRadiusMpc | 12 | f32 |
| apparentRadiusMpc | 16 | f32 |
| significance | 20 | f32 |
| category | 24 | u8 |
| padding | 25..27 | zeroed |

**Signatures:**
```ts
export function encodeClusterCatalog(catalog: ClusterCatalog): ArrayBuffer;
export function decodeClusterCatalog(buf: ArrayBuffer): ClusterCatalog;
export function emptyClusterCatalog(): ClusterCatalog;
```
`decode` throws `'bad magic — not a CCAT file'` on magic mismatch and
`` `unsupported cluster-catalog version: ${v} — please regenerate the .ccat via "npm run build-clusters"` `` on version mismatch (mirror
`galaxyCatalogFormat.ts:145-156`, but with the build-clusters message).

- [ ] Test `encode→decode round-trips positions, radii, significance, category`
  for a 2-record catalog (one cluster, one supercluster), asserting exact
  float-array equality and category bytes.
- [ ] Test `encoded file size is 16 + count*28`.
- [ ] Test `decode rejects bad magic` (write `'SKMP'` magic, expect throw
  containing `'CCAT'`).
- [ ] Test `decode rejects wrong version` asserting the message contains
  `build-clusters`.
- [ ] Test `emptyClusterCatalog has count 0 and zero-length arrays`.
- [ ] Implement. `npm test -- clusterCatalogFormat` → passes. Commit.

---

## Task 5 — Extract `raDecDistToEqCart` to a util

**Files:** `src/utils/math/raDecDistToEqCart.ts` (new),
`tests/utils/math/raDecDistToEqCart.test.ts` (new). Defers deletion of
`clusterAnchors.ts` to Task 7.

Move the function verbatim from `clusterAnchors.ts:52-58` (single-function
file, filename = export name). Keep the `SkyCoord → Vec3` signature.

**Signature:** `export function raDecDistToEqCart(c: SkyCoord): Vec3;`

- [ ] Test `raDecDistToEqCart places RA 0h Dec 0 on +X` (assert `[d,0,0]`
  within 1e-9 for `distMpc=10`).
- [ ] Test `raDecDistToEqCart places RA 6h Dec 0 on +Y`.
- [ ] Test `raDecDistToEqCart places Dec +90 on +Z`.
- [ ] Create the util file; re-export it from `clusterAnchors.ts` temporarily
  (so existing imports keep compiling until Task 7) OR update the two
  importers (`buildStaticAnchorPois.ts`, `auditCf4Anchors.ts`) — choose the
  re-export to keep this task small; Task 7 finishes the cutover.
- [ ] `npm test -- raDecDistToEqCart` + `npm run typecheck` → green. Commit.

---

## Task 6 — `parseClusterSeed` + featured seed JSON

**Files:** `data/cluster_anchors.seed.json` (new),
`tools/parsers/parseClusterSeed.ts` (new),
`tests/tools/parsers/parseClusterSeed.test.ts` (new),
`tools/utils/io/rawDataRegistry.ts` (modify — add `clusters.seed` key),
`.gitignore` (modify — whitelist the seed JSON).

Mirror `tools/parsers/famousSeed.ts` (hand-rolled fail-loud validation, no
zod). The seed is the single source of truth for featured structures.

**Entry type + signature:**
```ts
export type ClusterSeedEntry = {
  id: string;                 // url-safe, unique (e.g. 'virgo-m87')
  names: string[];            // ordered, primary first
  commonName?: string;        // display label
  abell?: string;             // Abell/ACO designation where known, e.g. 'A1656' (Coma)
  category: 'cluster' | 'supercluster' | 'void';
  raHours: number;            // [0,24)
  decDeg: number;             // [-90,90]
  distMpc: number;            // > 0
  physicalRadiusMpc: number;  // > 0
  apparentRadiusMpc: number;  // > 0 (== physical for SC/void)
  description: string;
};
export function validateClusterSeedEntry(e: ClusterSeedEntry): ClusterSeedEntry;
export function parseClusterSeed(rawJson: string): ClusterSeedEntry[];
```

**Validation rules** (fail loud, message names the offending `id`): non-empty
`id`; non-empty `names`; `category` in the union; `raHours` in `[0,24)`;
`decDeg` in `[-90,90]`; `distMpc`/`physicalRadiusMpc`/`apparentRadiusMpc`
finite + `> 0`; `description` a string; duplicate `id` across the file is a
hard error.

**Seed JSON content:** migrate every entry from `CLUSTER_ANCHORS` (11),
`SUPERCLUSTER_ANCHORS` (6), `VOID_ANCHORS` (3) in `clusterAnchors.ts:86-250`
— preserving each anchor's `physicalRadiusMpc`/`apparentRadiusMpc`/`distMpc`
and the per-anchor citation as the `description`. Set `category` per source
table. **Fill `abell` for cluster entries whose Abell number is known**
(Coma→`A1656`, Hercules→`A2151`, Perseus→`A426`, Centaurus→`A3526`,
Hydra I→`A1060`, A2199→`A2199`, Norma→`A3627`; omit for non-Abell clusters
like Virgo/Fornax/Ophiuchus and for all SCs/voids). Derive `id` from the
existing slug rule (`buildStaticAnchorPois.ts:66`
`slug()`), WITHOUT the category prefix (the prefix is re-added by the
consumer in Plan 2). Grow to ~25–30 entries by adding recognizable
structures (e.g. Leo / A1367, Corona Borealis SC) — pick from textbook
clusters/SCs, fill RA/Dec/dist/radii from NED/literature, write a 1-sentence
description each. Voids ride along here (featured-only).

- [ ] Add `clusters.seed` registry entry → `data/cluster_anchors.seed.json`,
  `kind: 'file'`, `source: 'committed'`; `.gitignore` whitelist line near
  `!/data/famous_galaxies.seed.json` (`.gitignore:83`).
- [ ] Author `data/cluster_anchors.seed.json` (migrated + extended entries).
- [ ] Test `parseClusterSeed accepts the bundled seed file` (read the real
  file via `rawDataPath('clusters.seed')`, assert length ≥ 25 and every
  entry has a category in the union).
- [ ] Test `parseClusterSeed rejects out-of-range raHours` (>= 24 throws,
  message names the id).
- [ ] Test `parseClusterSeed rejects duplicate ids`.
- [ ] Test `parseClusterSeed rejects non-positive distMpc`.
- [ ] Test `validateClusterSeedEntry rejects unknown category`.
- [ ] Implement parser. `npm test -- parseClusterSeed` → passes. Commit.

---

## Task 7 — Delete `clusterAnchors.ts`, re-point consumers

**Files:** `src/data/clusterAnchors.ts` (delete),
`tools/volumes/auditCf4Anchors.ts` (modify),
`src/data/buildStaticAnchorPois.ts` (modify — interim; Plan 2 rewrites it),
`src/@types/data/ClusterAnchor.d.ts` (delete or keep — see below),
`tests/**` (update any importer).

The audit (spec §9) re-points to the featured seed via `parseClusterSeed`.
`buildStaticAnchorPois` still needs to produce the same POIs for now; the
minimal interim change is to read the seed JSON. **However** — Plan 2 owns
the full `buildStaticAnchorPois` rewrite (sync seed read + `featured` flag).
To keep plans cleanly separable, in THIS task:

- [ ] Re-point `auditCf4Anchors.ts`: replace the
  `import { CLUSTER_ANCHORS, raDecDistToEqCart } from '../../src/data/clusterAnchors'`
  (`auditCf4Anchors.ts:27`) with `parseClusterSeed` (read
  `rawDataPath('clusters.seed')`) filtered to `category === 'cluster'`, mapped
  through the new `raDecDistToEqCart` util. The audit maps each seed entry's
  `{ raHours, decDeg, distMpc }` into the util — `ClusterSeedEntry` is a
  superset of `SkyCoord`, so it passes directly.
- [ ] Update `buildStaticAnchorPois.ts` to import `raDecDistToEqCart` from
  the new util path and drop the `clusterAnchors` re-export crutch from
  Task 5. (Leave its seed-vs-constant data source for Plan 2 — but it can no
  longer import the deleted constants, so for the interim have it read +
  parse the seed JSON synchronously via a Vite JSON import. This is exactly
  Plan 2's target shape, so doing it here is fine and avoids a broken
  intermediate; Plan 2 then only ADDS the `featured`/`significance` fields.)
- [ ] Delete `src/data/clusterAnchors.ts`. Keep `ClusterAnchor.d.ts` only if
  still referenced (the audit now uses `ClusterSeedEntry`); if nothing imports
  it, delete it and `SkyCoord.d.ts` stays (still used by the util).
- [ ] Update/replace `tests/data/buildStaticAnchorPois.test.ts` expectations
  if the slug set changed (it should NOT — same ids).
- [ ] `npm run typecheck` clean (no dangling `clusterAnchors` imports);
  `npm test` green. Commit.

---

## Task 8 — Extract `writeMetaSidecar` + refactor buildFamous

**Files:** `tools/curation/writeMetaSidecar.ts` (new),
`tests/tools/curation/writeMetaSidecar.test.ts` (new),
`tools/famous/buildFamous.ts` (modify).

Spec §8: extract only genuinely shared, domain-neutral helpers. `buildFamous`
emits `famous_meta.json` by hand (`buildFamous.ts:73-79,124-137`); factor
the `id → human-readable strings, indexed by local-idx` emission.

**Signature:**
```ts
export type MetaSidecarEntry = {
  id: string;
  names: string[];
  description: string;
  [key: string]: unknown; // domain-specific extras (famous `type`/`commonName`,
                          // cluster generated blurb) pass through untouched
};
export function writeMetaSidecar(entries: readonly MetaSidecarEntry[], path: string): void;
```
**Behaviour:** writes `JSON.stringify(entries, null, 2)` to `path` (the
domain-neutral act); callers build the `entries` array with whatever extra
fields their domain needs (famous keeps `type`/`commonName`; clusters add a
generated description). The helper does NOT impose a schema beyond
`id`/`names`/`description` being present — keep the per-domain seed schemas
out of it (spec §8 "what stays per-domain").

- [ ] Test `writeMetaSidecar writes pretty-printed JSON array indexed by order`
  (write to a tmp path, read back, assert parsed array equals input incl.
  extra fields).
- [ ] Test `writeMetaSidecar preserves domain-specific extra fields`
  (entry with a `type` key round-trips).
- [ ] Implement helper.
- [ ] Refactor `buildFamous.ts` to build its `metaByIdx` array (unchanged
  shape) and call `writeMetaSidecar(metaByIdx, resolve(outDir,'famous_meta.json'))`
  instead of the inline `writeFileSync(... JSON.stringify ...)` at
  `buildFamous.ts:137`.
- [ ] `npm test -- writeMetaSidecar` passes; re-run `buildFamous` is not
  required for tests but `npm run typecheck` must be clean. Commit.

---

## Task 9 — Extract `dedupeByProximity`

**Files:** `tools/curation/dedupeByProximity.ts` (new),
`tests/tools/curation/dedupeByProximity.test.ts` (new).

Spec §8 + §4.5: curated-wins 3D-proximity merge — any bulk candidate within
proximity of a featured anchor is dropped. New green-field helper (buildFamous
does not currently dedupe against featured anchors; this is shared-by-design
for buildClusters, and buildFamous may adopt it later — do NOT force
buildFamous onto it in this plan).

**Signature:**
```ts
export type ProximityPoint = { worldPos: Vec3 };
export function dedupeByProximity<C extends ProximityPoint>(
  featured: readonly { worldPos: Vec3; radiusMpc: number }[],
  candidates: readonly C[],
  floorMpc: number,
): C[];
```
**Behaviour:** returns the subset of `candidates` whose 3D distance to EVERY
featured anchor exceeds `max(anchor.radiusMpc, floorMpc)`. A candidate within
`max(radiusMpc, floorMpc)` of ANY featured anchor is dropped (the curated,
hand-tuned version wins — prevents Coma drawing twice). Distance in
equatorial-Cartesian Mpc (positions already in that frame). Pure; preserves
candidate order.

- [ ] Test `dedupeByProximity drops a candidate inside a featured anchor's radius`
  (anchor radius 6, candidate 2 Mpc away → dropped).
- [ ] Test `dedupeByProximity keeps a candidate beyond all anchors`
  (candidate 50 Mpc from the only anchor → kept).
- [ ] Test `dedupeByProximity applies the floor when an anchor radius is tiny`
  (anchor radius 0.5, floor 3, candidate 1 Mpc away → dropped by floor).
- [ ] Test `dedupeByProximity preserves input order of kept candidates`.
- [ ] Implement. `npm test -- dedupeByProximity` → passes. Commit.

---

## Task 10 — `buildClusters` build script + `build-clusters` npm script

**Files:** `tools/clusters/buildClusters.ts` (new),
`tests/tools/clusters/buildClusters.test.ts` (new),
`package.json` (modify — add `build-clusters`).

Mirror `buildFamous.ts` (CLI + importable `main`, fileURLToPath guard,
`process.stderr.write` logging). Pure logic (threshold + dedup + encode) is
factored into exported functions so it's testable without disk I/O.

**Tunable threshold constants** (top of file, with didactic comments):
```ts
const MCXC_M500_MIN = /* tuned → ~top 300 clusters by mass */;
const MSCC_NM_MIN   = /* tuned → ~top 75 SCs; Nm ∈ [2,42], so ≈6 lands ~75 */;
const Z_MAX = 0.15;                 // distance cut on both catalogs
const APPARENT_MULTIPLE = /* ≈1.5–2 */; // R500 → apparentRadiusMpc for clusters
const DEDUPE_FLOOR_MPC = /* small floor */;
```

**Exported pure transform (testable):**
```ts
export type ClusterBuildEntry = {
  id: string;                      // url-safe slug of names[0]
  worldPos: Vec3;
  physicalRadiusMpc: number;
  apparentRadiusMpc: number;
  significance: number;            // raw M500 / Nm
  category: ClusterCategoryByte;   // 0 cluster, 1 supercluster
  names: string[];                 // display names; names[0] is the label
  abell: string | null;            // Abell/ACO designation if detected, e.g. 'A2670' / 'S0805'
  description: string;             // generated (templates below)
};

export function buildClusterEntries(
  mcxc: readonly McxcRow[],
  mscc: readonly MsccRow[],
  featuredSeed: readonly ClusterSeedEntry[],
): ClusterBuildEntry[];
```

**Abell-designation extraction (exported helper, testable in isolation):**
```ts
// Scans OName + AName for an Abell/ACO designation. MCXC homogenizes these
// as 'ANNNN' (rich Abell) or 'SNNNN' (ACO southern supplement) — see the
// mcxc ReadMe history note. Returns the normalized token (e.g. 'A2670',
// 'S0805') or null. Prefer AName; fall back to OName.
export function extractAbell(oName: string, aName: string): string | null;
```
**Behaviour:** match the first token of the form `/\b([AS])0*(\d{1,4})\b/` in
`aName`, else in `oName`; normalize to `${prefix}${number}` with leading
zeros stripped (so `A 2670`, ` A2670`, `ACO 2670` → `A2670`). No match → null.
Superclusters have no Abell designation (`abell = null` for all MSCC entries).

**Description templates (exact):**
- cluster: `` `X-ray cluster · M500 = ${m500.toFixed(1)}×10¹⁴ M☉ · z = ${z.toFixed(3)}` ``
- supercluster: `` `Supercluster · ${nm} member clusters · z = ${z.toFixed(3)}` ``

**`buildClusterEntries` behaviour:**
1. **MCXC → cluster entries**: keep rows with `z <= Z_MAX` and
   `m500 >= MCXC_M500_MIN`. `worldPos` from `(raDeg,decDeg)` +
   `redshiftToDistanceMpc(z)` (convert deg→the frame; reuse the famous
   `entryToXyz` math but RA already in degrees). `physicalRadiusMpc = r500Mpc`;
   `apparentRadiusMpc = APPARENT_MULTIPLE * r500Mpc`; `significance = m500`;
   `category = 0`. `abell = extractAbell(oName, aName)`. **Name priority
   Abell → `aName` → `oName` → MCXC `id`**: prefer the Abell designation when
   present (most recognizable), else the non-empty `aName` (UGC/popular), else
   `oName` (RXC/REFLEX designation), else the MCXC `id`. `names = abell ?
   [abell, ...uniqueNonEmpty(aName, oName)] : [bestName]` (Abell first so the
   label shows it; keep other catalog names as alternates). `id` = url-safe
   slug of `names[0]`. `description` = the cluster template above.
2. **MSCC → supercluster entries**: keep `z <= Z_MAX` and `nm >= MSCC_NM_MIN`.
   `worldPos` from `(raDeg,decDeg)` + `redshiftToDistanceMpc(z)`.
   `physicalRadiusMpc == apparentRadiusMpc = (dmaxMpc / h70 → Mpc) / 2`
   (pin the `h70` constant from existing `constants.ts`/`HUBBLE_*` — read
   `redshiftToDistanceMpc.ts` imports; use the same `H0` basis). `significance
   = nm`; `category = 1`; `abell = null` (superclusters have no Abell id).
   `names = [msccRow.id]` (e.g. `'MSCC 1'`); `id` = slug of it; `description`
   = the supercluster template above.
3. **Dedup against featured**: build the featured anchor list from
   `featuredSeed` (worldPos via `raDecDistToEqCart`, radius =
   `apparentRadiusMpc`); run `dedupeByProximity(anchors, allEntries,
   DEDUPE_FLOOR_MPC)`.
4. Return the surviving entries.

**`main` behaviour:** parse both raw tables (`rawDataPath('mcxc.table')`,
`rawDataPath('mscc.table')`), `parseClusterSeed(readFileSync(rawDataPath('clusters.seed')))`,
call `buildClusterEntries`, build a `ClusterCatalog` from the entries,
`encodeClusterCatalog` → `public/data/clusters.ccat`, and
`writeMetaSidecar(entries.map(toMeta), 'public/data/clusters_meta.json')`
where `toMeta` maps each entry to the sidecar shape (local-idx parallel to
the `.ccat`):
```ts
type ClusterMetaEntry = {
  id: string;            // base slug (runtime prefixes 'cluster-bulk-' etc.)
  names: string[];       // display names; names[0] is the label
  abell: string | null;  // Abell/ACO designation if any, e.g. 'A2670'
  description: string;   // generated one-liner
};
// toMeta = ({ id, names, abell, description }) => ({ id, names, abell, description })
```

- [ ] Test `buildClusterEntries excludes clusters below the M500 threshold`
  (fixture row under `MCXC_M500_MIN` → not present).
- [ ] Test `buildClusterEntries excludes structures beyond Z_MAX`.
- [ ] Test `buildClusterEntries sets apparentRadiusMpc = APPARENT_MULTIPLE × R500`
  for a surviving cluster.
- [ ] Test `buildClusterEntries collapses supercluster physical == apparent radius`
  asserting `physicalRadiusMpc === apparentRadiusMpc` and `= dmax/2` (converted).
- [ ] Test `buildClusterEntries drops a bulk entry near a featured seed anchor`
  (place an MCXC row at Coma's seed position → suppressed; one far away →
  kept). This is the "Coma doesn't draw twice" guarantee.
- [ ] Test `extractAbell finds Abell/ACO tokens in AName or OName`
  (`'A2670'`→`'A2670'`; `' A 2670'`→`'A2670'`; aName blank + oName `'A1656'`
  →`'A1656'`; `'UGC 12890'`→`null`; ACO southern `'S0805'`→`'S0805'`).
- [ ] Test `buildClusterEntries prefers the Abell designation for the name`
  (row with Abell in `aName` → `names[0]` is the Abell token and `abell` is
  set; row with only `oName` RXC + no Abell → `names[0]` is the RXC name and
  `abell` is null; row with all blank → `names[0]` is the MCXC `id`).
- [ ] Test `buildClusterEntries sets abell null for superclusters`.
- [ ] Test `buildClusterEntries tags category 0 for MCXC, 1 for MSCC`.
- [ ] Implement `buildClusterEntries` + `main`. `npm test -- buildClusters`
  → passes.
- [ ] Add `"build-clusters": "tsx tools/clusters/buildClusters.ts"` to
  `package.json` scripts (alphabetical, next to `build-cf4-density`).
- [ ] Run `npm run build-clusters` once manually; confirm
  `public/data/clusters.ccat` + `public/data/clusters_meta.json` exist and
  the `.ccat` decodes (the round-trip test already covers decode). Commit.

---

## Task 11 — Re-point the run-order docs

**Files:** `CLAUDE.md` (modify), `data/raw/mcxc/README.md` (modify),
`data/raw/mscc/README.md` (modify).

- [ ] Add the run order to `CLAUDE.md`: `npm run fetch-clusters` (downloads
  the gitignored MCXC/MSCC tables, like `fetch-cf4`) → `npm run build-clusters`
  ("after `npm run build-tiers`", consistent with `build-famous`). Note the
  `.ccat` + `clusters_meta.json` artefacts are gitignored under `public/data/`,
  and that the raw `.dat`/`ReadMe` are gitignored (only README + sha256 committed).
- [ ] Cross-reference the spec in both READMEs.
- [ ] No test; `npm run typecheck` + `npm test` still green (sanity). Commit.

---

## Definition of done (Plan 1)

- `npm run build-clusters` emits `public/data/clusters.ccat` +
  `public/data/clusters_meta.json`.
- `clusterAnchors.ts` is deleted; `raDecDistToEqCart` lives at
  `src/utils/math/raDecDistToEqCart.ts`; the CF-4 audit reads the seed JSON.
- `writeMetaSidecar` + `dedupeByProximity` exist under `tools/curation/`,
  with buildFamous using `writeMetaSidecar`.
- `npm test` + `npm run typecheck` green. No runtime/render behaviour change
  (verified: the running app still draws the same featured anchors — now
  sourced from the seed JSON via `buildStaticAnchorPois`).
