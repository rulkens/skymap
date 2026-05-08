# Tully 2-Group Catalog (2GC)

## What it is

The Tully 2-Group Catalog (2GC), published by R. Brent Tully in 2015 (ApJ 802, 96), is a catalog of **galaxy group memberships** derived from the 2MASS Redshift Survey (2MRS). Tully ran a friends-of-friends-style group finder on the ~44,000 2MRS galaxies and produced ~27,000 distinct "groups" — where a "group" can be anything from a single isolated galaxy (a one-member group, present for completeness) to a rich cluster like Virgo with hundreds of members.

The catalog is essentially a **lookup table**: given a 2MRS galaxy, which group is it gravitationally bound to? It does not redefine galaxy positions, magnitudes, or redshifts — those live in 2MRS already. It only adds the group-membership attribute and a few group-level summary quantities (group center, group bulk velocity, group K-band luminosity, virial radius estimates).

This is **the** authoritative dataset for "what cluster does this galaxy belong to" out to ~300 Mpc (the depth where 2MRS is reasonably complete). It's the same input that drives most modern Local Universe flow studies and is the parent catalog from which Cosmicflows-4 draws its galaxy-distance dataset.

## Why we need it (which shell, what role)

Two shells use this dataset:

- **Shell 5 (Local Sheet, outer scale 30 Mpc)**: galaxy points are coloured by group ID. The visual goal is to make the eye *see* that galaxies are not random — they cluster. Coloring isolated galaxies grey and assigning saturated palette colors to the largest dozen groups in view (Virgo, Fornax, Eridanus, Antlia, Centaurus, etc.) reveals the supergalactic plane structure organically, without needing to draw extra geometry.
- **Shell 6 (Virgo Supercluster, outer scale 500 Mpc)**: cluster identification. We use the Tully group catalog as a "where are the clusters" index — joined to the Abell/MCXC catalog (see [`06-cluster-catalogs.md`](06-cluster-catalogs.md)), the largest Tully groups are exactly the rich clusters we want to label and overlay X-ray halos on. Tully gives us the membership lists; Abell/MCXC give us the canonical names.

Critically, Tully 2GC **only joins to existing 2MRS records**. It does not change which galaxies render. It is purely an attribute join: each rendered 2MRS point picks up an extra `groupId: u16` slot that the shader reads to look up a per-group color from a small uniform array.

## Acquisition

- **Primary URL**: VizieR catalog `J/AJ/149/171` — `https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/AJ/149/171`
- **Mirror**: Tully's own data page (Hawaii) — `http://edd.ifa.hawaii.edu/` under "2MRS Groups". Use this only as a fallback; VizieR is more stable.
- **Authentication**: none required (public anonymous access).
- **Format**: ASCII fixed-width tables. VizieR ships two tables for this catalog:
  - `table1.dat` — one row per group (~27,000 rows). Group ID, center, mean velocity, member count, K-band luminosity, virial radius.
  - `table2.dat` — one row per galaxy-group association (~44,000 rows). 2MRS galaxy ID, parent group ID, projected radius from group center.
  Both come with a `ReadMe` describing the byte offsets — drop it in `data/raw/` next to the data and consult it the same way we already do for 2MRS and GLADE.
- **Size (raw)**: ~3 MB compressed, ~10 MB uncompressed across both tables and the ReadMe.

## Parsing

- **Code path**: new file `tools/parsers/tullyGroups.ts`. Mirror the layout of the existing `tools/parsers/twoMrs.ts` fixed-width parser — read the ReadMe, write a small `byte-offset → field` map, slice each line, parse numbers with `parseFloat` (with `Number.isFinite` guards), and yield records.
- **Schema we use**:

```ts
type TullyGroupRow = {
  groupId: number;        // u16, 1..~27000; 0 reserved for "ungrouped"
  ra: number;             // group center, degrees J2000
  dec: number;            // group center, degrees J2000
  cz: number;             // mean recessional velocity, km/s (CMB frame)
  memberCount: number;    // u16, 1..~hundreds
  logLk: number;          // log10(L_K / L_sun), group total K-band luminosity
  virialRadiusMpc: number;// virial radius estimate, Mpc
};

type TullyMembershipRow = {
  twoMrsId: string;       // 2MASS XSC designation, "JHHMMSSss+DDMMSSs" form
  groupId: number;        // matches TullyGroupRow.groupId
};
```

- **Schema we drop**: per-galaxy projected radius (we don't need it for rendering; group geometry is summarized by `virialRadiusMpc`), K-band magnitude duplicates (already in 2MRS), and the various velocity-frame conversion columns Tully includes for completeness.

## Filtering / cross-matching

- **Distance cut**: drop groups with `cz < 0` (handful of Local Group members with negative velocities — Tully gives them group memberships but their `cz` is below zero; we keep the membership but ignore the group bulk velocity for those).
- **Member-count cut**: keep all groups, even singletons. Singletons are useful: they tell the renderer "this galaxy is *not* part of a group, color it grey." Without them we'd have to invent a sentinel.
- **Cross-match key**: 2MASS XSC designation. The 2MRS records already loaded by skymap carry the same `twoMrsId` string (it's the catalog's primary key — see `tools/parsers/twoMrs.ts`). The cross-match is a clean exact-string equality join, not the messy positional matching we need for SDSS↔GLADE.
- **Cross-match coverage**: Tully 2GC is built *from* 2MRS, so coverage should be ~100%. In practice we expect 1–2% of 2MRS records to lack a Tully group entry — these are sources Tully's group finder rejected (typically very low surface brightness or velocity outliers). Assign `groupId = 0` for those and let them render grey.
- **Cross-match against SDSS / GLADE**: we deliberately **do not** propagate group IDs to non-2MRS galaxies in this first version. SDSS and GLADE galaxies in shell 5 render uncoloured (or with a faint per-shell tint) until a future enhancement back-propagates groups via positional matching. Doing it right needs a redshift-space group finder we don't want to build now; doing it crudely (nearest 2MRS galaxy's group) would assign random distant SDSS galaxies to nearby groups and lie about structure. Leaving them uncoloured is the honest minimal version.

## Output binary format

A small **sidecar binary** at `public/data/tully-groups.bin`, separate from `2mrs.bin`. We do *not* extend the 2MRS binary format because (a) versioning the existing format breaks every other consumer, (b) the join is a pure attribute lookup that the shader can do on the fly via a small SSBO/uniform.

The sidecar has two sections:

```
Header (16 bytes):
  magic      u32  = 0x54475250  ("TGRP")
  version    u16  = 1
  groupCount u16
  memberCount u32
  reserved   u32

Groups section (groupCount × 16 bytes):
  groupId           u16
  memberCount       u16
  ra                f32  // degrees J2000
  dec               f32  // degrees J2000
  cz                f32  // km/s
  // virialRadiusMpc + logLk packed as two f16? deferred; not needed until shell 6 cluster halos.

Membership section (memberCount × 12 bytes):
  twoMrsIdHash      u64  // FNV-1a of the 2MASS XSC designation string
  groupId           u16
  pad               u16
```

Total expected size: 27,000 × 16 + 44,000 × 12 + 16 = **~960 KB**. Comfortably within the "~200 KB" budget the parent doc cited if we drop the membership section and let the runtime rebuild it from a co-loaded JSON lookup, but storing both keeps the runtime path branchless. Final size lands ~1 MB; well under the 5 MB cited in `00-data-sources.md` and harmless on R2.

The reason for hashing the 2MRS ID into a `u64` rather than storing the 18-char string: the membership section becomes 12 bytes/row instead of 30+, and the runtime side already builds a `Map<twoMrsId, hash>` while decoding the 2MRS bin (cheap, one-time). Collision risk on 44k entries with FNV-1a-64 is negligible (~10⁻¹¹).

Reference: [`data/10-binary-formats.md`](10-binary-formats.md) §5 (sidecar attribute formats) once written.

## Build script

- **File**: `tools/buildTullyGroups.ts`
- **Run command**: `npm run build-tully-groups` (added to `package.json`); also called by the master `npm run build-shell-data` script.
- **Pipeline**:
  1. Read `data/raw/J_AJ_149_171/table1.dat` and `table2.dat`.
  2. Parse via `tools/parsers/tullyGroups.ts`.
  3. Filter (drop groups with no surviving members after the few cuts above).
  4. Hash member 2MRS IDs with the same FNV-1a-64 we'll use at runtime — extract this into `src/utils/fnv1a.ts` so build and runtime share the implementation (a class of bug we cannot afford: a hash mismatch silently un-joins everything).
  5. Encode and write `public/data/tully-groups.bin`.
- **Idempotent?**: yes. Same inputs → same output bytes. Safe to re-run; safe to commit-check the diff (there should be none).
- **Approximate runtime**: <2 s on a developer laptop. Fits comfortably in the build-shell-data sequence.

## Licensing & attribution

- **License**: NASA-funded research; the Tully 2015 catalog is freely redistributable with citation. No restrictive license clause; treat as "citation-required public data," same posture as 2MRS itself.
- **Required citation**: Tully, R. B. 2015, AJ, 149, 171 — "Galaxy Groups: A 2MASS Catalog."
- **CREDITS.md entry** (verbatim):
  > Galaxy group memberships: Tully (2015), AJ 149, 171, via VizieR J/AJ/149/171.
- **In-app credit**: shell 5's overlay credit line includes "Groups: Tully 2015."

## Risks

- **Low-impact**: the catalog is small, well-documented, and stable. The main risk class is **silent miss-joins** if the FNV hash differs between build and runtime, or if the 2MRS ID format differs slightly between the 2MRS bin parser and Tully's table — both are fully covered by a single round-trip test (build a bin, decode it, assert N% of 2MRS records resolve to a non-zero group ID).
- The catalog is a decade old; a few thousand 2MRS galaxies added in later 2MRS releases will have no Tully entry. They render grey, which is the correct behaviour.

## Sample/test data

A trimmed `tests/fixtures/tully-groups-sample.dat` covering ~50 groups including Virgo, Fornax, and a handful of singletons. Used by `tests/tools/parsers/tullyGroups.test.ts` and by the round-trip encode/decode test for `tully-groups.bin`. No need to ship the full catalog into the test fixture — fixture is committed, full catalog stays in `data/raw/` (gitignored).

## References

- Tully, R. B. 2015, *AJ*, 149, 171 — "Galaxy Groups: A 2MASS Catalog."
- Huchra, J. P., et al. 2012, *ApJS*, 199, 26 — the parent 2MRS catalog (already in skymap).
- VizieR catalog page: `https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/AJ/149/171`
- Tully's Extragalactic Distance Database: `http://edd.ifa.hawaii.edu/` (alternate distribution + later updates).
