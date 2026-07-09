# DESI wedge — a patch table for different ways to drill through the data

**Date:** 2026-07-09
**Status:** Draft — awaiting user review
**Prerequisite:** the shipped DESI deep cone (`docs/superpowers/specs/completed/2026-07-07-desi-deep-cone-design.md`, PR #417)

## Goal

Ship a second DESI DR1 patch — a 2.5°-thick, 65°-long declination-band
**wedge** through the Corona Borealis supercluster — and, in doing so,
generalize the build pipeline's single hardcoded cone into a **patch
table**, so that each future drill geometry (a great-circle slab is the
known next candidate) is one table row plus one source registration, not
a cloned pipeline path.

The product intent is didactic: the patches are *different ways of
drilling through the same survey* — a pencil-beam core, a fan slice, and
later a flat slab — each toggleable independently, each showing what a
sampling geometry does to the same underlying data.

## Measured coverage (2026-07-09, local DR1 NGC FITS)

All numbers from a census against the four on-disk
`data/raw/desi/*.fits` clustering files (never re-download; see project
memory `project_desi_deep_cone`).

**Full dec band** (dec 30.65° ± 1.25°, all RA): 251,212 rows across
RA 109°–273°, but DR1 tiling west of RA ~200° is patchy — bins at
RA 135–155° and 175–180° are nearly empty, and 120–200° is thin and
moth-eaten. Would read as rendering artifacts.

**Chosen span — RA 205°–270°** (the contiguous uniformly-tiled arm,
10–15.5k rows in every 5° bin, cone center RA 231.85° near the middle):

| Tracer | Rows (pre-dedup) |
| ------ | ---------------- |
| BGS    | 67,952           |
| LRG    | 39,004           |
| ELG    | 42,420           |
| QSO    | 20,656           |
| total  | **170,032**      |

The cone lost ~24% of its pre-dedup rows to crossMatch (SDSS/2MRS/GLADE
own duplicates at higher priority); SDSS covers this strip heavily, so
expect the wedge to ship at roughly 130–150k rows post-dedup —
`desi-wedge.bin` ≈ 8–10 MB at 64 B/row. Well inside the renderer's
point budget.

**Geometry decision — dec band over great-circle slab** (user A/B,
2026-07-09). A constant-dec band is not planar in 3D: it is a section
of a cone around the celestial polar axis, bowing gently out of the
tangent plane by ~8% of depth at the arm tips (~400 Mpc at 5 Gpc). A
flat great-circle slab (tangent to the parallel at the CrB center,
plane pole RA 51.85° dec +59.35°) was measured as the alternative and
lost: 140,660 rows vs 170,032, with the western 10° thinning to
4–5k/bin (the plane droops to dec ~25.5° at the arm ends and exits the
well-tiled strip) and the dark-time tracers dropping hard (LRG −24%,
ELG −30%). The dec band's uniform density won — and it is the same
construction as the historic 1986 CfA "Great Wall" slice (dec
26.5°–32.5°); our band (29.4°–31.9°) sits inside it. The flat slab
remains a candidate future patch over a trimmed span (RA ~215–267,
~125k rows, uniform) where its flatness is genuinely clean.

## Design

### The patch table (build side)

`tools/catalog/desiCone.ts` is renamed to `tools/catalog/desiPatches.ts`
and its single `DESI_CONE` constant becomes a table. The existing
didactic header (the two-candidate compromise rationale for the cone
center) moves onto the cone row's comment.

```ts
export type DesiPatch = {
  key: string;               // 'cone' | 'wedge' | …
  source: Source;            // Source.DesiDeep | Source.DesiWedge | …
  binName: string;           // 'desi-deep' | 'desi-wedge' — the .bin stem
  makeFilter: () => (raDeg: number, decDeg: number) => boolean;
};

export const DESI_PATCHES: readonly DesiPatch[] = [
  { key: 'cone',  source: Source.DesiDeep,  binName: 'desi-deep',
    makeFilter: () => makeConeFilter(231.85, 30.65, 2.5) },
  { key: 'wedge', source: Source.DesiWedge, binName: 'desi-wedge',
    makeFilter: () => makeDecBandFilter(30.65, 1.25, 205, 270) },
];
```

`DesiTracerFileKey` + `DESI_TRACER_FILE_KEYS` stay in this module
unchanged — they are per-survey, not per-patch.

`loadDesi()` in `buildAllBins.ts` becomes `loadDesiPatch(patch)`; the
build loops `DESI_PATCHES`, feeds each patch's records into `crossMatch`
under its own source, and emits one `.bin` per patch. The
`desiConeCensus` diagnostic keeps importing the cone row's parameters
from the table.

### New filter util

`tools/utils/math/makeDecBandFilter.ts` (one symbol per file, focused
test):

```ts
export function makeDecBandFilter(
  decCenterDeg: number,
  halfThicknessDeg: number,
  raMinDeg: number,
  raMaxDeg: number,
): (raDeg: number, decDeg: number) => boolean;
```

A future great-circle patch adds `makeGreatCircleBandFilter` (plane-
normal dot-product test, same shape as `makeConeFilter`'s hoisted-trig
factory) — no other pipeline change.

### New source (runtime side)

- `Source.DesiWedge = 19` — append-only code (5-bit space, ≤30; rule in
  `sources.ts`'s docstring).
- `SOURCE_REGISTRY` entry mirrors DesiDeep: category `surveys`,
  tier-agnostic bin, **`visible: false`** (default-off specialist
  overlay — same stance as the cone). `initialState` seeds `enabled`
  from `visible` (shipped with the cone), so boot state is free.
- UI label: **"DESI Wedge"**.
- Hand-wiring mirrors DesiDeep in `slots/`, `assetWiring.ts`, `initGpu`,
  the demand table, and `tools/deploy/syncR2.ts`'s ALLOW list (add
  `desi-wedge.bin`). The per-source hand-wiring cost is a known
  entanglement tracked by the `source-registry-factory` backlog item —
  out of scope here; a *third* patch should weigh picking that item up
  first.

### Display

Identical to the cone: the physically-motivated synthetic tracer
magnitudes (LRG −22.8 / ELG −20.8 / QSO −25.5 — kept after a live A/B;
do **not** retune, rationale in `tools/parsers/desiTracerDisplay.ts`),
30 kpc default sizes, hashed fallback orientation. The wedge inherits
the same honest tracer shelves — the dim ELG stretch is the survey's
selection function, visible here as a dim annulus band across the fan.

### Cone↔wedge overlap — accepted, deliberately

~61% of the cone's sky area lies inside the band, so ~15k rows ship in
both bins. Deduping wedge-vs-cone at build time would punch a
rectangular hole in the wedge whenever the cone is toggled off. Both
sources are opt-in; enabling both draws the shared rows twice, slightly
brightening the seam — and makes the drill core visibly light up inside
the fan, which is the point of the multi-geometry visualization.

### Adding a future patch (the generalization's payoff)

1. One row in `DESI_PATCHES` (+ a new filter util if the geometry is
   new).
2. One `Source` code (append-only) + one `SOURCE_REGISTRY` entry.
3. Mirror the per-source wiring (slots / assetWiring / initGpu / demand
   table) — until `source-registry-factory` ships.
4. Add the bin to `syncR2.ts`'s ALLOW list.
5. `npm run build-tiers` + `npm run sync-r2-secure` from the **main**
   checkout (worktrees have their own `data/` — memory
   `project_worktree_data_isolation`).

## Testing

Mirrors the DesiDeep test set:

- `makeDecBandFilter` unit test (inside/outside dec edges, RA edges,
  no RA wraparound needed for 205–270).
- Source-mask literal updates (`tests/data/sources.test.ts`,
  `deriveSourceMasks.test.ts`) for code 19.
- Registry/initialState seeding already asserts `enabled ===
  entry.visible` generically — the wedge rides the existing assertions.
- Demand-table: DesiWedge absent from boot-fired sets (default-off).
- Build-side: `DESI_PATCHES` shape test (unique keys, unique sources,
  unique binNames).

## Out of scope (deferred)

- **Great-circle slab patch** — anticipated next patch; measured
  numbers above. Awaiting user go-ahead after the wedge ships.
- **`source-registry-factory`** — stays in the backlog; revisit at
  patch #3.
- **Fly-through clip** — the wedge is a natural third act for the
  deferred DESI clip (plan 2 of the cone spec); authored separately.
- **Stripe 82 / Coma second cone** — different beam, parked in
  `docs/backlog/2026-07-09-second-desi-deep-cone.md`, untouched.
