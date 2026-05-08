# Binary Formats — Powers-of-Ten Shell Data

This document is the canonical reference for **every new on-disk binary format**
introduced by the cosmic-zoom plan. It sits one level above the per-source
specs (`data/01-*.md` through `data/09-*.md`): each of those documents
describes *where the bytes come from*; this document describes *how the bytes
are arranged after our build pipeline has chewed through them*.

If you are about to write `tools/buildXyz.ts`, this is the file that tells you
what the output should look like, byte for byte.

---

## 1. Why per-dataset formats (not a single generic schema)?

The obvious alternative would be a single "envelope" format — a typed,
self-describing container (Protobuf, FlatBuffers, Parquet, or a hand-rolled
TLV scheme) that could carry any of the new datasets. We considered this and
chose against it. The reasons matter and we want them written down so the next
person reaching for FlatBuffers knows why we didn't.

**Reason 1 — the existing pattern works.** `pointCloudFormat.ts` is the v4
incarnation of a format we have been iterating on since the first SDSS load.
It is 280 lines, has zero dependencies, encodes and decodes in microseconds,
round-trips NaN losslessly, and produces files the GPU can read directly into
vertex buffers without an intermediate copy. Every new shell dataset would
have to *outperform* that on its own native ground (small N, fixed schema,
GPU-bound consumer) to justify replacing it. None of them do. So we copy the
recipe.

**Reason 2 — schemas are radically different.** The Solar System ephemeris is
~12 records of 96 bytes. The Gaia DR3 cut is ~10 million records of 24 bytes.
The CF-4 density volume is a single 256³ float texture (no records at all,
just a raw 3D grid). A generic schema that bends to all three is necessarily
either *over-general* (expensive metadata, runtime dispatch on every read) or
*under-specified* (we end up serializing JSON-shaped data into a column store
nobody else understands). Per-dataset formats let each one carry exactly the
fields it needs and zero metadata it doesn't.

**Reason 3 — the consumer is also bespoke.** Each dataset feeds a *different*
renderer (orbit lines, point clouds, billboards, 3D textures, equirectangular
maps). Each renderer wants the bytes already shaped to its consumption
pattern — interleaved per-vertex for the points renderer, raw 3D float array
for `texture_3d<f32>`, equirectangular RGB8 for the CMB sphere shader.
Picking the on-disk layout to match the GPU upload path is a real win.

**Reason 4 — versioning stays local.** A schema change in the CF-4 density
field bumps `cf4DensityFormat.ts:VERSION` and forces regeneration of *that*
one bin. It does not invalidate anything else. With a unified envelope, we
either accept that any schema change touches every consumer or we add an
inner version inside the envelope — which is exactly the per-dataset version
we'd have anyway, just with extra wrapping.

The cost we accept is duplication: each `tools/buildXyz.ts` re-implements the
header writer, and each `src/data/xyzFormat.ts` re-implements the magic+version
guard. The duplication is ~30 lines per format and is *good* duplication —
flat, easy to read, no abstraction to learn.

---

## 2. Common header convention

Every format in this document begins with the same 16-byte header. Mirroring
`pointCloudFormat.ts`:

```
0       4     magic     ASCII (little-endian uint32)
4       4     version   uint32, monotonically increasing per-format
8       4     count     uint32 — number of records OR primary dimension
12      4     reserved  uint32 — zero for now, room for flags later
```

The `magic` is **per format** so the decoder can fail loud on a misnamed file
(e.g. a `cf4-density.bin` accidentally fed to the cluster decoder). Magic
values follow a 4-letter ASCII convention readable in `xxd`:

| Format | Magic ASCII | Magic uint32 (LE) |
|--------|-------------|-------------------|
| pointCloud (existing) | `SKMP` | `0x504d4b53` |
| solarsystem | `SKSS` | `0x53534b53` |
| stars | `SKST` | `0x54534b53` |
| localgroup | `SKLG` | `0x474c4b53` |
| tully-groups | `SKTG` | `0x47544b53` |
| clusters | `SKCL` | `0x4c434b53` |
| cf4-density | `SKCD` | `0x44434b53` |
| cf4-flow | `SKCF` | `0x46434b53` |
| xray-halos | `SKXH` | `0x48584b53` |

The `count` field's meaning is per-format (records, voxels-per-side, etc.) —
documented inline below.

The `reserved` field is always written as zero. We reserve the right to
repurpose it as a feature-flag bitfield in a future minor version *without*
bumping the major version, provided existing decoders can ignore it safely.

---

## 3. Format catalog

### 3a. `solarsystem.bin` — JPL ephemeris snapshot

**Why a custom format for ~12 records?** Because (a) consistency with the rest
of the catalog beats a one-off JSON file, (b) the orbit-line renderer wants
the orbital elements packed exactly as it will read them, and (c) we want the
build script to fail loud if the upstream JPL Horizons response shape drifts
(which it has, twice, in the last decade). 12 records times a fixed schema is
a more constraining contract than "any JSON-shaped object".

The snapshot stores **Keplerian orbital elements at epoch J2000.0** for the
Sun, eight planets, Pluto, and the Moon (referenced to Earth, not the Sun) —
12 records total. We do not store ephemerides over time; the renderer
propagates positions analytically from these elements per frame, which is good
enough for a cinematic at the kilometer-to-AU scale.

```
── HEADER (16 bytes) ──────────────────────────────────────────────────
0       4     magic    = "SKSS" (0x53534b53)
4       4     version  = 1 (uint32)
8       4     count    = 12 (uint32) — number of bodies
12      4     reserved = 0

── PER-BODY RECORD (96 bytes) ─────────────────────────────────────────
0       4     bodyId            (uint32) — IAU NAIF ID (10=Sun, 199=Mercury, ...)
4       4     parentId          (uint32) — NAIF ID of central body (0 if heliocentric)
8       4     massKg            (float32) — mass in kilograms (cosmetic; for tooltip)
12      4     radiusKm          (float32) — equatorial radius for billboard size
16      4     semiMajorAxisAu   (float32) — a, in AU
20      4     eccentricity      (float32) — e, dimensionless
24      4     inclinationDeg    (float32) — i, degrees
28      4     longAscNodeDeg    (float32) — Ω
32      4     argPeriDeg        (float32) — ω
36      4     meanAnomalyDeg    (float32) — M at epoch
40      4     orbitalPeriodDays (float32) — derived but stored for cheap render
44      4     siderealRotHours  (float32) — for axis spin animation
48      4     axialTiltDeg      (float32) — obliquity
52      4     albedo            (float32) — bond albedo (cosmetic)
56      4     colorR            (float32) — surface tint, [0,1]
60      4     colorG            (float32)
64      4     colorB            (float32)
68      4     padding           (zeroed)
72     24     nameUtf8          (24 bytes) — null-padded UTF-8 ("Earth\0\0...")
```

Total file size: 16 + 12 × 96 = **1168 bytes**.

The `nameUtf8` is fixed-width-padded to keep records uniform (parsing
variable-length strings inside a record forces a two-pass decode). 24 bytes
is enough for "Pluto / 134340" and any future addition we might make. Extras
get truncated at build time with a loud warning.

We chose Keplerian elements, not state vectors. State vectors (position +
velocity at epoch) are smaller and let the renderer integrate forward, but
require a real numerical integrator and accumulate floating-point error.
Keplerian elements with Newton-iteration solving of Kepler's equation are
analytically stable, error-free over centuries, and the math is six lines.

### 3b. `stars.bin` — Gaia DR3 cut

**Why a custom format and not just CSV?** Because we are loading 10 million
stars per session and CSV parse time would dominate. Binary lets us mmap-style
read, do zero-copy uploads to vertex buffers, and skip the tokenizer entirely.

The Gaia cut contains stars within ~500 pc of the Sun, magnitude G < 16
(the apparent-magnitude limit for the naked-eye-to-binoculars range we want
shell 2 to feel lush at). See `data/02-gaia-stars.md` for the SQL cuts.

```
── HEADER (16 bytes) ──────────────────────────────────────────────────
0       4     magic    = "SKST" (0x54534b53)
4       4     version  = 1 (uint32)
8       4     count    = N stars (uint32, ~10M)
12      4     reserved = 0

── PER-STAR RECORD (24 bytes) ─────────────────────────────────────────
0       4     x        (float32, parsecs in galactic cartesian)
4       4     y        (float32)
8       4     z        (float32)
12      4     magG     (float32) — apparent G-band magnitude
16      4     bp_rp    (float32) — colour index (BP - RP), drives temperature tint
20      4     padding  (zeroed) — keep record at 8-byte boundary
```

Total file size: 16 + count × 24. For count = 10M, file size ≈ **240 MB**
*before* compression. After we apply the spatial-tiering subset (see
`data/02-gaia-stars.md`), we expect the on-disk size of the medium tier
to land near 30 MB — see the size estimate in `data/00-data-sources.md`.

We deliberately do **not** store Gaia source IDs. The user can never click a
star (the renderer doesn't even register a hit), so the 8-byte ID per record
would cost 80 MB of disk for zero functional benefit. If we ever need clickable
stars, we'll bump to v2 and add a u64 ID slot, growing the record to 32 bytes.

The `padding` field exists *only* to align records to 8 bytes, which keeps
the underlying `Float32Array` view aligned and lets the GPU consume the
buffer without a copy-with-stride. The footnote here is identical in spirit
to the v4 padding rationale in `pointCloudFormat.ts`.

### 3c. `localgroup.bin` — Karachentsev / LVC

The Local Volume Catalog (Karachentsev+ 2013) has ~1000 dwarf galaxies inside
~10 Mpc. The schema looks a lot like our existing `PointCloud` records but
includes morphology fields (Hubble type, surface brightness) that the standard
SDSS/2MRS/GLADE pipeline does not carry. Rather than extend `pointCloudFormat`
(which would force a v5 bump for *all* point clouds and re-upload of every
existing tier), we give the LVC its own format.

```
── HEADER (16 bytes) ──────────────────────────────────────────────────
0       4     magic    = "SKLG" (0x474c4b53)
4       4     version  = 1 (uint32)
8       4     count    = N galaxies (uint32, ~1000)
12      4     reserved = 0

── PER-GALAXY RECORD (64 bytes) ───────────────────────────────────────
0       4     pgcId            (uint32) — HyperLEDA cross-match key
4       4     x                (float32, Mpc — supergalactic cartesian)
8       4     y                (float32)
12      4     z                (float32)
16      4     magV             (float32) — V-band absolute magnitude
20      4     diameterKpc      (float32) — D25 isophotal diameter
24      4     axisRatio        (float32) — b/a
28      4     positionAngleDeg (float32) — PA in [0,180)
32      4     hubbleType       (float32) — T-type, [-5, 10]
36      4     surfaceBrightness(float32) — μ_V at D25, mag/arcsec²
40      4     hiMassLogSolar   (float32) — log10(M_HI / M_sun), NaN if no HI
44      4     metallicityFeH   (float32) — [Fe/H], NaN if unknown
48     16     nameUtf8         (16 bytes) — "M31\0\0\0..."
```

Total file size: 16 + count × 64. For count ≈ 1000, file size ≈ **64 KB**.

`pgcId` is a `uint32`, not the `uint64` we use for SDSS objIDs, because PGC
numbers fit comfortably in 32 bits (the highest known PGC is ~7M). We narrow
the field to make the record fit a clean 64 bytes; cross-matches into
HyperLEDA are unaffected.

### 3d. `tully-groups.bin` — sidecar mapping 2MRS ID → group ID

This is a **sidecar** file. It does not stand alone — it is meant to be loaded
alongside `2mrs.bin` and used as a join table at upload time. The renderer
then colours / groups galaxies by their Tully group membership without having
to re-encode the entire 2MRS catalog.

```
── HEADER (16 bytes) ──────────────────────────────────────────────────
0       4     magic    = "SKTG" (0x47544b53)
4       4     version  = 1 (uint32)
8       4     count    = N rows (uint32, ~45000)
12      4     reserved = 0

── PER-ROW RECORD (16 bytes) ──────────────────────────────────────────
0       8     twoMrsId  (uint64) — 2MASS XSC ID, matches 2mrs.bin objID
8       4     groupId   (uint32) — Tully 2GC group number; 0 if isolated
12      4     groupRank (uint32) — 0 = brightest member, 1 = second, ...
```

Total file size: 16 + count × 16. For ~45000 rows, file size ≈ **720 KB**.

The records are **sorted by `twoMrsId` ascending**, so the runtime join can
be a single linear merge (both `2mrs.bin` and `tully-groups.bin` use the same
sort key on the same ID space). The build script asserts this sort and fails
loud if it's broken.

`groupId = 0` is the sentinel for "isolated galaxy, no group membership". We
considered omitting these rows entirely (saving ~30 % of disk) but kept them
because their presence makes the join trivially `O(N)` and the renderer can
distinguish "not in our table" from "explicitly known to be isolated".

### 3e. `clusters.bin` — Abell + ACO + MCXC merged

A merged catalog of rich galaxy clusters. Three upstream catalogs are
cross-matched at build time (see `data/06-cluster-catalogs.md`); the result
is one binary with an `originBitmask` field telling us which source(s) each
cluster came from.

```
── HEADER (16 bytes) ──────────────────────────────────────────────────
0       4     magic    = "SKCL" (0x4c434b53)
4       4     version  = 1 (uint32)
8       4     count    = N clusters (uint32, ~5000)
12      4     reserved = 0

── PER-CLUSTER RECORD (48 bytes) ──────────────────────────────────────
0       4     clusterId    (uint32) — internal sequential ID
4       4     x            (float32, Mpc)
8       4     y            (float32)
12      4     z            (float32)
16      4     redshift     (float32) — z, dimensionless; NaN if photometric only
20      4     richness     (float32) — Abell richness count, NaN if X-ray-only
24      4     velocityDisp (float32) — σ_v in km/s, NaN if unknown
28      4     radiusMpc    (float32) — Abell radius (1.5 Mpc / h) or R_500 if X-ray
32      4     originMask   (uint32) — bit 0 = Abell, 1 = ACO, 2 = MCXC
36     12     nameUtf8     (12 bytes) — "Coma\0\0\0..." or "A1656"
```

Total file size: 16 + count × 48. For ~5000 clusters, file size ≈ **240 KB**.

`originMask` is a bitfield, not an enum, because real clusters often appear in
**multiple** upstream catalogs — Coma is in both Abell (A1656) and MCXC, and
the bitmask preserves that provenance for the user-facing tooltip ("known
from Abell + MCXC"). Single-bit-set = unambiguous origin; multi-bit-set =
cross-matched.

### 3f. `cf4-density.bin` — 3D density volume

This is the odd one out: it has **no per-record schema**. The payload is a
flat 3D float texture, the same shape WebGPU's `texture_3d<f32>` will consume.
The header carries the volume dimensions and the world-space mapping.

```
── HEADER (48 bytes) ──────────────────────────────────────────────────
0       4     magic    = "SKCD" (0x44434b53)
4       4     version  = 1 (uint32)
8       4     count    = sideLength (uint32) — voxels per axis (cubic volume)
12      4     reserved = 0
16      4     boxMpc       (float32) — physical side length in Mpc
20      4     centerXMpc   (float32) — centre of volume in supergalactic Mpc
24      4     centerYMpc   (float32)
28      4     centerZMpc   (float32)
32      4     valueMin     (float32) — min density value (for shader normalize)
36      4     valueMax     (float32) — max density value
40      4     unitsCode    (uint32) — 0 = log(δ+1), 1 = M_sun/Mpc³, 2 = raw
44      4     headerPad    (zeroed)

── PAYLOAD (sideLength³ × 4 bytes) ────────────────────────────────────
Float32 voxels, x-major then y-major then z-major:
  index(i,j,k) = i + j × side + k × side²
Stored value at (i,j,k) = densityField sampled at world coordinate
  ( centerX + boxMpc * (i / side - 0.5),
    centerY + boxMpc * (j / side - 0.5),
    centerZ + boxMpc * (k / side - 0.5) )
```

Total file size: 48 + side³ × 4. For side = 256, file size ≈ **64 MB**.
For side = 128, ≈ **8 MB**.

Why an "extended" header (48 bytes, not 16)? Because the world-space mapping
is intrinsic to the file's meaning — without `boxMpc` and the centre, the
voxels are dimensionless garbage. We could have stored these as a sidecar
JSON, but a sidecar can drift from the binary; baking them into the file
header keeps them inseparable.

The `unitsCode` enum is forward-looking: the v1 build emits `unitsCode = 0`
(log overdensity) but we want consumers to assert what they got rather than
silently mis-interpret a future units change.

The voxel ordering (`x` fastest, then `y`, then `z`) matches WebGPU's
`texture_3d` expected memory layout: a `queue.writeTexture` call can hand
this buffer directly to the GPU with no transpose. **Critical**: if we ever
swap to z-fastest, we must also bump the version, because the GPU upload
path will silently produce a rotated rendering otherwise.

### 3g. `cf4-flow.bin` — flow vectors on regular grid

Companion to `cf4-density.bin`: same grid, but each voxel stores a 3-vector
(peculiar velocity in km/s) instead of a scalar density. Used to render flow
arrows on shell 7 ("matter is falling toward Shapley").

```
── HEADER (48 bytes) ──────────────────────────────────────────────────
[identical to cf4-density.bin, with magic = "SKCF" (0x46434b53)]

── PAYLOAD (sideLength³ × 12 bytes) ───────────────────────────────────
Per-voxel: [vx, vy, vz] as three Float32 km/s.
Voxel ordering identical to cf4-density.bin (x-major, y, z).
```

Total file size: 48 + side³ × 12. For side = 128, file size ≈ **24 MB**.

We considered packing density and flow into a single `vec4` texture
(density in `.w`, velocity in `.xyz`) and emitting one `cf4.bin` instead of
two. We chose two because the renderer often wants to fade them
**independently** — flow arrows on, density volume off, etc. — and forcing
both into one texture would mean re-uploading the full texture to disable
either, or burning a second sampler to do channel masking on the GPU. Two
files = two texture bindings = independent fade controls for free.

### 3h. `xray-halos.bin` — per-cluster L_X + R_500

Holds X-ray-derived properties for a subset of clusters in `clusters.bin`.

We **considered** extending `clusters.bin` v1 with X-ray fields and using NaN
sentinels for clusters without X-ray data. Decided against it: the X-ray
data covers only ~30 % of `clusters.bin` records, and storing 70 % NaN
records wastes bytes for a field most users will never see. A sidecar keyed
by `clusterId` is cheaper on disk and clearer semantically.

```
── HEADER (16 bytes) ──────────────────────────────────────────────────
0       4     magic    = "SKXH" (0x48584b53)
4       4     version  = 1 (uint32)
8       4     count    = N rows (uint32, ~1500)
12      4     reserved = 0

── PER-ROW RECORD (24 bytes) ──────────────────────────────────────────
0       4     clusterId   (uint32) — joins to clusters.bin clusterId
4       4     lxErgPerSec (float32) — X-ray luminosity, ergs/s (0.1–2.4 keV band)
8       4     r500Mpc     (float32) — radius enclosing 500× critical density
12      4     temperatureKeV (float32) — ICM temperature, NaN if unknown
16      4     beta        (float32) — beta-model index, NaN if no fit
20      4     padding     (zeroed)
```

Total file size: 16 + count × 24. For ~1500 rows, file size ≈ **36 KB**.

Sorted by `clusterId` ascending so the join with `clusters.bin` is a linear
merge, same approach as `tully-groups.bin`.

### 3i. `cmb.png` (or `.jpg`) — equirectangular CMB map

**Not a custom binary format.** The CMB map is a standard
8192 × 4096 equirectangular image (two pixels per square degree at the
equator, sufficient for the WMAP/Planck low-resolution rendering we want on
shell 9). We serve it as PNG (lossless) or JPEG (smaller, slight ringing in
hot/cold spots — acceptable since the map is intentionally blurred at this
display scale).

We deliberately *do not* invent a custom format here. Reasons:

- WebGPU's `createImageBitmap` + `copyExternalImageToTexture` consumes
  PNG/JPEG natively with zero parsing on our side.
- The CMB renderer wants exactly one texture, not a record array. There's
  no schema to specify.
- Future swaps (Planck → Planck PR5 → some new mission) just drop in a
  new image of the same dimensions. No version bump needed in our code.
- `data/09-planck-cmb.md` documents the image's colour mapping (the
  upstream pipeline applies the standard "cold blue / hot red" temperature
  ramp at downsample time, so the rendered colours are baked into the
  pixels — the shader is a straight texture sampler).

If we ever need to render the *raw* HEALPix temperature data (e.g. for an
interactive temperature-scale slider), we'll add `cmb-temp.bin` as an
explicit custom binary format at that point. Until then, the PNG/JPG is
the right call.

---

## 4. Versioning policy

Every format above carries a `version: uint32` at offset 4. This field is the
**only** thing the decoder uses to decide compatibility. Rules:

1. **Bump the version** the moment the byte layout changes incompatibly.
   "Incompatibly" means any of: field added, field removed, field reordered,
   field type changed, record size changed, voxel ordering changed,
   endianness changed (we'll never do this last one but state it explicitly).

2. **Reject older versions loudly** in the decoder. Mirror the
   `pointCloudFormat.ts:177` style:

   ```
   throw new Error(
     `unsupported version: ${version} — please regenerate the .bin via "npm run build-shell-data"`
   );
   ```

   The error message must name the **specific build script** that produces
   this file (not a generic "rebuild"). Users who hit this error are usually
   developers who pulled a schema bump without re-running the build; the
   error has to be a one-line fix recipe.

3. **Do not maintain backward compatibility in the decoder.** We are not
   shipping a public file format for third parties. Every `.bin` is an
   ephemeral build artefact that lives in R2; bumping the version and
   re-syncing is cheap. A multi-version decoder is dead code waiting to
   bit-rot.

4. **Bump the version even for backward-additive changes** (e.g. adding a
   field at the end of a record). The decoder checks for an exact match.
   Pedantic, but it surfaces accidental drift instantly during development.

5. **Reserved bytes are not a version-skip mechanism.** `reserved` may be
   repurposed in the same major version *only* if old decoders already
   ignore it (which they do — they read 16 header bytes and discard
   `reserved`). Any new use must default to "behaves identically when
   reserved = 0" so that existing v1 files keep working.

The existing build script `npm run build-tiers` regenerates `pointCloud`-format
binaries; the new `npm run build-shell-data` orchestrator (introduced by
`data/00-data-sources.md`) regenerates *all* the new formats above. We do
not promise atomic regeneration — each format is independent.

---

## 5. Decoder location

Every format gets exactly one decoder/encoder module under `src/data/`,
following the existing pattern:

| Format file | Module |
|-------------|--------|
| `solarsystem.bin` | `src/data/solarSystemFormat.ts` |
| `stars.bin` | `src/data/starsFormat.ts` |
| `localgroup.bin` | `src/data/localGroupFormat.ts` |
| `tully-groups.bin` | `src/data/tullyGroupsFormat.ts` |
| `clusters.bin` | `src/data/clustersFormat.ts` |
| `cf4-density.bin` | `src/data/cf4DensityFormat.ts` |
| `cf4-flow.bin` | `src/data/cf4FlowFormat.ts` |
| `xray-halos.bin` | `src/data/xrayHalosFormat.ts` |

Each module exports:

- `encode<Name>(data: <Name>): ArrayBuffer` — pure, no I/O.
- `decode<Name>(buf: ArrayBuffer): <Name>` — pure, no I/O.
- `empty<Name>(): <Name>` — used by the asset-loading subsystem when a
  shell is excluded at the current quality tier (see `emptyPointCloud` in
  `pointCloudFormat.ts:265` for the prototype).

The `<Name>` type itself lives in `src/@types/` (e.g.
`src/@types/SolarSystem.ts` exports `export type SolarSystem = { ... }`).
Per the project convention, **`type`, never `interface`**.

The build script `tools/buildXyz.ts` imports `encode<Name>` from
`src/data/<name>Format.ts`. The runtime loader (`src/services/engine/cloudLoader.ts`
or its successor) imports `decode<Name>`. Pure functions on both ends; no
class hierarchy, no abstract base class, no envelope.

---

## 6. Test strategy

Every format module gets **at least three Vitest tests** mirrored under
`tests/data/<name>Format.test.ts`:

1. **Round-trip happy path.** Construct a typical `<Name>`, encode, decode,
   assert deep-equal. This catches type mismatches, byte-offset slips, and
   alignment bugs.

2. **Magic and version rejection.** Hand-craft an `ArrayBuffer` with the
   wrong magic; assert the decoder throws "bad magic". Hand-craft one with
   `version = 0` and `version = 99`; assert the decoder throws the
   regenerate hint.

3. **NaN preservation** (for any format with `float32` measurement fields,
   which is most of them). Encode a record where one or more measurement
   fields are NaN; decode; assert NaN is preserved (use
   `expect(Number.isNaN(decoded.field[0])).toBe(true)`, not `toEqual(NaN)`,
   which fails because NaN !== NaN).

For volumetric formats (`cf4-density`, `cf4-flow`), add a fourth test:

4. **Voxel addressing.** Encode a small (e.g. 4³) volume where the value at
   each voxel is a function of `(i, j, k)` (e.g. `i + 10*j + 100*k`).
   Decode; assert each voxel's value matches the expected function.
   Catches voxel-ordering inversions (the most subtle and most rendering-
   wrecking class of bug for 3D textures).

For the sidecar formats (`tully-groups`, `xray-halos`), add a fifth test:

5. **Sort invariant.** Encode an unsorted input; decode; assert the output
   IDs are sorted ascending. Catches sort-skip regressions in the build
   script.

The pattern `tests/data/pointCloudFormat.test.ts` (existing) is the
reference implementation. Match its structure — describe blocks per
function, BDD-style test names, no shared setup state.

---

## 7. R2 vs commit policy

The deploy split documented in `CLAUDE.md` (Workers Assets for the static
shell, R2 for catalog `.bin` files) extends to the new formats. Cutoff is
**1 MB**:

| Format | Approx size | Storage |
|--------|-------------|---------|
| `solarsystem.bin` | ~1 KB | **commit** (`public/data/`) |
| `stars.bin` | ~30 MB (medium tier) | **R2** |
| `localgroup.bin` | ~64 KB | **commit** |
| `tully-groups.bin` | ~720 KB | **commit** |
| `clusters.bin` | ~240 KB | **commit** |
| `cf4-density.bin` | ~8–64 MB | **R2** |
| `cf4-flow.bin` | ~24 MB | **R2** |
| `xray-halos.bin` | ~36 KB | **commit** |
| `cmb.png` | ~5–20 MB | **R2** |

Why 1 MB? It's well under any per-file Cloudflare Workers Assets cap, well
under the per-file size at which `git clone` starts to feel slow, and
matches the threshold where the marginal cost of R2 (an extra deploy step,
a CORS rule, a `dataUrl()` lookup) starts to pay for itself.

Anything **committed** lives in `public/data/<name>.bin` and is served by
Vite (dev) or Workers Assets (prod) at the relative `/data/` path. The
`dataUrl()` helper still wraps the path so the runtime doesn't need to know
where any given file lives.

Anything on **R2** is uploaded by `tools/syncR2.ts` after every build that
touches it. The `ALLOW` list in that script must be extended with the new
filenames (`stars-medium.bin`, `cf4-density.bin`, `cf4-flow.bin`,
`cmb.png`) — failing to update `ALLOW` is the most common deploy-time
footgun and the symptom is "404 from skymap-data.rulkens.com".

`public/data/*.bin` (R2 candidates) stays gitignored, same as today. The
small committed `.bin`s do *not* match the gitignore (they're under 1 MB,
deterministic, infrequently regenerated, and their inclusion makes
`npm run dev` work out of the box without an R2 round trip).

CORS, cache-control, and the rest of the R2 deploy contract are unchanged
from `CLAUDE.md`'s "Deploy workflow" section. New files inherit those
settings automatically.

---

## Summary

- One header convention, nine custom formats, one piggybacked image format.
- Per-dataset versioning, per-dataset decoders, per-dataset tests.
- Small files in git, big files on R2, everything regenerated by
  `npm run build-shell-data`.
- The byte layouts above are the contract. Bump the version the moment
  they change.
