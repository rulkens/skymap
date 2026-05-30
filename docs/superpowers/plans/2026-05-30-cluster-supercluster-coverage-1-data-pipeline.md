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
`data/raw/mcxc/README.md` (new), `data/raw/mscc/README.md` (new),
`.gitignore` (modify), `tests/tools/utils/io/rawDataRegistry.test.ts`
(modify or create).

Follow the CLAUDE.md "Adding a new raw data source" 5-step checklist. Add
four keys to `RAW_DATA` (dotted-lowercase, `kind`/`source`/`description`,
`upstream` + `readme` where applicable):

| key | path | kind | source |
|---|---|---|---|
| `mcxc.table` | `data/raw/mcxc/<vizier-file>.dat` | file | committed |
| `mcxc.readme` | `data/raw/mcxc/ReadMe` | file | committed |
| `mscc.table` | `data/raw/mscc/mscc.dat` | file | committed |
| `mscc.readme` | `data/raw/mscc/ReadMe` | file | committed |

- [ ] Download MCXC `J/A+A/534/A109` + MSCC `J/MNRAS/445/4073/mscc` table
  files + their VizieR ReadMes into `data/raw/mcxc/` and `data/raw/mscc/`.
  Pin the exact on-disk filenames in the registry `path` values. (These are
  small all-sky tables — committed, not gitignored.)
- [ ] Add the four registry entries with `upstream` URLs and `readme`
  cross-links (mirror the `cf4.table2` entry shape at
  `rawDataRegistry.ts:208-226`).
- [ ] Write `data/raw/mcxc/README.md` + `data/raw/mscc/README.md` with
  upstream URL, column/byte layout summary, fetch date, row counts (MCXC
  1,743 / MSCC 601).
- [ ] Add `.gitignore` whitelist exceptions for the four committed files +
  the two READMEs (near the existing `!/data/raw/cf4/README.md` block at
  `.gitignore:103`).
- [ ] Test `rawDataPath resolves mcxc + mscc keys to absolute paths`
  asserting `rawDataPath('mcxc.table')` and `rawDataPath('mscc.table')`
  end with the registered relative paths and are absolute.
- [ ] `npm test -- rawDataRegistry` → passes. Commit.

---

## Task 2 — `parseMcxc` parser

**Files:** `tools/parsers/parseMcxc.ts` (new),
`tests/tools/parsers/parseMcxc.test.ts` (new).

Consult `data/raw/mcxc/ReadMe` for exact byte offsets — do NOT guess.

**Signature:**
```ts
export type McxcRow = {
  id: string;            // MCXC primary id, e.g. 'J1259.7+2756'
  raDeg: number;         // RAJ2000 → degrees [0,360)
  decDeg: number;        // DEJ2000 → degrees [-90,90]
  z: number;             // redshift
  m500: number;          // total mass, 10^14 Msun
  r500Mpc: number;       // characteristic radius, Mpc (ready-made)
  oName: string;         // popular/Abell name ('' if blank)
  aName: string;         // alternative name ('' if blank)
};
export function parseMcxc(raw: string): McxcRow[];
```

**Behaviour:** fixed-width parse per the ReadMe; `RAJ2000`/`DEJ2000` are
sexagesimal (h:m:s / d:m:s) → convert to decimal degrees; blank `OName`/
`AName` → `''`; skip comment/blank lines.

- [ ] Build a small hand-crafted fixture (3–4 rows pasted from the real
  `.dat`, exact column alignment) as a test constant.
- [ ] Test `parseMcxc reads position, z, M500, R500 from fixed-width columns`
  asserting one row's `raDeg`/`decDeg` (decimal-deg, ~1e-3 tol), `z`, `m500`,
  `r500Mpc`.
- [ ] Test `parseMcxc converts sexagesimal RA/Dec to degrees` asserting a
  southern-dec row's sign + a >180° RA row.
- [ ] Test `parseMcxc returns empty names as empty strings` on a row whose
  `OName`/`AName` columns are blank.
- [ ] Test `parseMcxc skips comment and blank lines`.
- [ ] Implement against the ReadMe offsets. `npm test -- parseMcxc` → passes.
  Commit.

---

## Task 3 — `parseMscc` parser

**Files:** `tools/parsers/parseMscc.ts` (new),
`tests/tools/parsers/parseMscc.test.ts` (new).

Consult `data/raw/mscc/ReadMe` for offsets.

**Signature:**
```ts
export type MsccRow = {
  id: string;       // MSCC id
  raDeg: number;    // RAdeg (already decimal degrees)
  decDeg: number;   // DEdeg
  z: number;        // mean redshift
  nm: number;       // member-cluster count
  dmaxMpc: number;  // max member-pair separation, h70^-1 Mpc (raw units)
};
export function parseMscc(raw: string): MsccRow[];
```

**Behaviour:** `RAdeg`/`DEdeg` are already decimal degrees (no sexagesimal
conversion). `dmaxMpc` is stored in the catalog's `h70^-1 Mpc` units —
parser returns the raw value; the `h70 → Mpc` conversion + halving lives in
`buildClusters` (Task 8), so the parser stays a faithful column reader.

- [ ] Hand-built fixture (3–4 rows, exact alignment).
- [ ] Test `parseMscc reads RAdeg/DEdeg as decimal degrees` (no h:m:s
  conversion) asserting a known row.
- [ ] Test `parseMscc reads Nm and dmax` asserting integer `nm` and float
  `dmaxMpc` for a row.
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
table. Derive `id` from the existing slug rule (`buildStaticAnchorPois.ts:66`
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
const MSCC_NM_MIN   = /* tuned → ~top 75 superclusters by member count */;
const Z_MAX = 0.15;                 // distance cut on both catalogs
const APPARENT_MULTIPLE = /* ≈1.5–2 */; // R500 → apparentRadiusMpc for clusters
const DEDUPE_FLOOR_MPC = /* small floor */;
```

**Exported pure transform (testable):**
```ts
export type ClusterBuildEntry = {
  id: string;
  worldPos: Vec3;
  physicalRadiusMpc: number;
  apparentRadiusMpc: number;
  significance: number;            // raw M500 / Nm
  category: ClusterCategoryByte;   // 0 cluster, 1 supercluster
  names: string[];
  description: string;             // generated, e.g. 'X-ray cluster · M500 = … · z = …'
};

export function buildClusterEntries(
  mcxc: readonly McxcRow[],
  mscc: readonly MsccRow[],
  featuredSeed: readonly ClusterSeedEntry[],
): ClusterBuildEntry[];
```

**`buildClusterEntries` behaviour:**
1. **MCXC → cluster entries**: keep rows with `z <= Z_MAX` and
   `m500 >= MCXC_M500_MIN`. `worldPos` from `(raDeg,decDeg)` +
   `redshiftToDistanceMpc(z)` (convert deg→the frame; reuse the famous
   `entryToXyz` math but RA already in degrees). `physicalRadiusMpc = r500Mpc`;
   `apparentRadiusMpc = APPARENT_MULTIPLE * r500Mpc`; `significance = m500`;
   `category = 0`. `names` from `oName`/`aName` (non-empty first, else MCXC
   `id`); `id` = url-safe slug of the primary name. `description` generated.
2. **MSCC → supercluster entries**: keep `z <= Z_MAX` and `nm >= MSCC_NM_MIN`.
   `worldPos` from `(raDeg,decDeg)` + `redshiftToDistanceMpc(z)`.
   `physicalRadiusMpc == apparentRadiusMpc = (dmaxMpc / h70 → Mpc) / 2`
   (pin the `h70` constant from existing `constants.ts`/`HUBBLE_*` — read
   `redshiftToDistanceMpc.ts` imports; use the same `H0` basis). `significance
   = nm`; `category = 1`. `id` = slug of MSCC id; `description` generated.
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
where `toMeta` maps `{ id, names, description }` (local-idx parallel to the
`.ccat`).

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
- [ ] Test `buildClusterEntries names a cluster from OName, falling back to MCXC id`
  (row with blank `oName`/`aName` → `id` derived from the MCXC primary id).
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

- [ ] Add `build-clusters` to the data-pipeline run order in `CLAUDE.md`
  ("after `npm run build-tiers`", consistent with `build-famous`). Note the
  `.ccat` + `clusters_meta.json` artefacts and that they are gitignored under
  `public/data/`.
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
