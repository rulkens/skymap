# Tools folder reorganization — design

**Date:** 2026-05-17
**Status:** Draft, awaiting user review
**Author:** Brainstormed with Claude

## Problem

`tools/` is a flat dump of 24 top-level `.ts` files. Discoverability is the
primary pain: `ls tools/` shows an alphabetised list that interleaves famous-
galaxy scripts with volume builders with deploy plumbing, and a reader has to
scan every filename to find the right script.

Three secondary issues compound the discoverability problem:

1. **Helper duplication.** Several utilities are literally copy-pasted between
   tool scripts. `applyMat3`, `transpose3`, `eqToSg`, and `percentileOf` all
   appear identically in `auditCf4Anchors.ts` and `verifyCf4Scfd.ts`.
   `loadWikipediaCache` / `saveWikipediaCache` appear identically in
   `fetchFamousImages.ts` and `expandFamousFromCatalogs.ts`. `makeMulberry32`
   in `buildFilaments.ts` is a copy of `src/utils/random/mulberry32.ts`.
2. **Folder name clash.** `tools/types/` holds two ambient `.d.ts` shims for
   third-party JS libraries with no types. The name collides with
   `src/@types/`, which is our canonical type registry — a reader naturally
   conflates them.
3. **Scattered R2 deploy plumbing.** `syncR2.ts`, `r2Cors.json`, and
   `r2-static/` all relate to the R2 upload step but sit at unrelated
   locations in the top-level listing.

## Goals

- Make `ls tools/` immediately convey what the pipeline does.
- Co-locate files that change together (famous cluster, volumes cluster,
  catalog cluster).
- Eliminate copy-pasted helpers by extracting them into a `tools/utils/`
  registry that mirrors the role `src/utils/` plays for browser code.
- Disambiguate `tools/types/` from `src/@types/`.

## Non-goals

- Rewriting any tool's behaviour. This is structural reorganisation only.
- Adding test coverage for the tool scripts themselves (only the newly
  extracted utils get tests).
- Cleaning up `src/utils/` or `src/@types/` beyond the targeted dedup with
  `tools/`.

## Approach

By-domain folder grouping, with a new `tools/utils/` peer to `tools/parsers/`.
Domains are chosen so that co-evolving files cluster: a "famous-galaxy"
change touches one folder; an "add a new volume tier" change touches one
folder; etc.

Two alternatives were considered and rejected:

- **By pipeline stage** (`fetch/build/verify/deploy/`) — clean mental model
  but `build/` would still be an 11-file dump, and the famous-galaxy files
  would scatter across `fetch/` and `build/`, reintroducing the original
  pain.
- **Minimal cleanup, no folder restructure** — fixes the small smells
  (rename `tools/types/`, colocate R2 stuff) but does not address the core
  discoverability problem.

## Target layout

```
tools/
  catalog/
    buildAllBins.ts
    crossMatch.ts
    subsampleByAbsMag.ts
    (csvToBin.ts deleted — see "Dead code" section)
  famous/
    buildFamous.ts
    expandFamousFromCatalogs.ts
    fetchFamousImages.ts
    famousImageProcessor.ts
  filaments/
    buildFilaments.ts
  volumes/
    buildMcpmVolume.ts
    buildCf4Density.ts
    buildScalarVolumeFixture.ts
    auditCf4Anchors.ts
    verifyCf4Scfd.ts
    extractMcpmCube.py
  fonts/
    buildFontAtlas.ts
  site/
    makeFavicon.ts
    makeOgImage.ts
  deploy/
    syncR2.ts
    r2Cors.json
    r2-static/
  fetch/
    fetch2massXsc.ts
    fetchHyperLeda.ts
    buildPgcAliases.ts          (fits "fetch" — dominant work is PGC chunk download)
  parsers/                       (unchanged location)
    common.ts
    famousSeed.ts
    glade.ts
    hyperledaMeandata.ts
    ndskl.ts
    npyReader.ts
    sdssCsv.ts
    twoMrs.ts
    wikipediaSummary.ts
    (floatToHalf.ts removed — moved to tools/utils/math/floatHalf.ts)
  utils/                         (new)
    math/
      mat3.ts                    applyMat3, transpose3
      coordinates.ts             eqToSg, sgToEq, eqCartToRaDecDist,
                                 voxelToEqCart, sgToVoxelIndex
      floatHalf.ts               f16BitsToFloat, f32ToF16Bits
                                 (consolidates both directions in one file)
      percentile.ts              percentileOf
    random/
      gaussian.ts                gaussian(rng) — Box-Muller transform
    io/
      jsonCache.ts               loadJsonCache<T>(path), saveJsonCache<T>(path, data)
      readIdSet.ts               readIdSet(path) → Set<string>
    cli/
      args.ts                    parseFlags(argv, schema)
    async/
      delay.ts                   delay(ms)
  vendor-types/                  (renamed from tools/types/)
    msdf-bmfont-xml.d.ts
    pngjs.d.ts
```

## Helper extraction map

### True duplicates eliminated by extraction or import

| Helper | Current locations | New home |
|---|---|---|
| `makeMulberry32` | `buildFilaments.ts:424` | Delete local copy; import from `src/utils/random/mulberry32.ts` |
| `applyMat3`, `transpose3` | `auditCf4Anchors.ts`, `verifyCf4Scfd.ts` | `tools/utils/math/mat3.ts` |
| `eqToSg` | `auditCf4Anchors.ts`, `verifyCf4Scfd.ts` | `tools/utils/math/coordinates.ts` |
| `sgToEq`, `eqCartToRaDecDist`, `voxelToEqCart` | `verifyCf4Scfd.ts` | `tools/utils/math/coordinates.ts` |
| `sgToVoxelIndex` | `auditCf4Anchors.ts` | `tools/utils/math/coordinates.ts` |
| `percentileOf` | `auditCf4Anchors.ts`, `verifyCf4Scfd.ts` | `tools/utils/math/percentile.ts` |
| `f16BitsToFloat` | `verifyCf4Scfd.ts` | `tools/utils/math/floatHalf.ts` (joins `f32ToF16Bits`) |
| `f32ToF16Bits` | `parsers/floatToHalf.ts` | `tools/utils/math/floatHalf.ts` (moved) |
| `loadWikipediaCache`, `saveWikipediaCache` | `fetchFamousImages.ts`, `expandFamousFromCatalogs.ts` | `tools/utils/io/jsonCache.ts` (generic `loadJsonCache<T>` / `saveJsonCache<T>`) |
| `loadHyperLedaCache`, `saveHyperLedaCache` | `expandFamousFromCatalogs.ts` | same — uses the generic helper |
| `readExistingIds` | `fetch2massXsc.ts` | `tools/utils/io/readIdSet.ts` |
| `readExistingPgcs` | `fetchHyperLeda.ts` | same — uses `readIdSet` |
| `parseFlags` | `fetchFamousImages.ts`, `expandFamousFromCatalogs.ts` | `tools/utils/cli/args.ts` (takes a small flag schema) |
| `gaussian` | `buildFilaments.ts` | `tools/utils/random/gaussian.ts` |
| `delay` | `expandFamousFromCatalogs.ts` | `tools/utils/async/delay.ts` |

### Dedup rule of thumb (`src/utils/` vs `tools/utils/`)

The split is by **runtime environment**, not by domain:

- **Browser-safe + domain math** (raDec ↔ cartesian, Schechter, vMaxWeight,
  `mulberry32`, etc.) lives in `src/utils/`. Tools may import freely from
  there.
- **Node-only + pipeline plumbing** (file I/O caches, CLI args, half-float
  bit-twiddling used only offline) lives in `tools/utils/`. Never imported
  by browser code.

This keeps `src/utils/` browser-bundleable and prevents accidental
`node:fs` leaks into the Vite bundle.

### Type imports

The inline `Mat3` and `Vec3` type aliases in `auditCf4Anchors.ts` and
`verifyCf4Scfd.ts` are duplicates of the canonical types in
`src/@types/math/Mat3.d.ts` and `src/@types/math/Vec3.d.ts`. The new
`tools/utils/math/mat3.ts` imports them from there. The two tool scripts
drop their local aliases and import from `tools/utils/math/`.

## Mechanical concerns

- **`package.json` scripts** — every `tsx tools/<file>.ts` invocation gets
  its new folder prefix (e.g. `tsx tools/buildAllBins.ts` →
  `tsx tools/catalog/buildAllBins.ts`). Approximately 13 script entries
  update.
- **`tsconfig.tools.json`** — already includes `"tools"` recursively. No
  config change needed.
- **Internal imports** — files moved into a subfolder need their relative
  imports re-pathed (`./parsers/...` → `../parsers/...`). Mechanical
  search-and-replace, verified by `tsc --noEmit`.
- **Git history** — use `git mv` (not delete + add) for every move so
  `git blame` survives the reorganisation.

## Testing

The tools/ tree has no test coverage today (the `tests/` suite targets
`src/` only). For the newly extracted utils — and only those — add focused
tests under `tests/tools/utils/`:

- `jsonCache.test.ts` — round-trip an object through `saveJsonCache` →
  `loadJsonCache`; verify `loadJsonCache` returns `{}` for a missing file
  (matching current behaviour of `loadWikipediaCache`).
- `readIdSet.test.ts` — read a fixture file; verify Set contents and
  empty-file handling.
- `parseFlags.test.ts` — exercise the schema for the two flag shapes
  currently in use (`{ '--no-cache': 'bool', '--dry-run': 'bool' }` and the
  one-off `--cache-only`-style flags).
- `delay.test.ts` — verify resolves after the specified ms (use fake timers).
- `mat3.test.ts` — round-trip a vector through `applyMat3(identity)`;
  `transpose3(transpose3(m)) === m`.
- `percentile.test.ts` — known sorted array, known value → known percentile.
- `gaussian.test.ts` — sample N draws with a fixed seed; assert mean ≈ 0,
  stddev ≈ 1 within tolerance.
- `floatHalf.test.ts` — round-trip representative floats through
  `f32ToF16Bits` → `f16BitsToFloat`; verify the known precision loss for a
  large value.
- `coordinates.test.ts` — `eqToSg` then `sgToEq` round-trip on a few known
  vectors; spot-check `eqCartToRaDecDist` against a hand-computed example.

Beyond unit tests, the verification gate is:

- `npm run typecheck` (both `src` and `tools` tsconfigs).
- Manual smoke-run one script per group: `npm run build-tiers`,
  `npm run build-famous`, `npm run sync-r2 -- --dry-run` (if the script
  supports it; otherwise verified by typecheck only).

## Migration order (single PR)

1. Add new `tools/utils/` files with their tests. No behaviour change yet —
   existing tools still use their local copies.
2. Delete `tools/csvToBin.ts` and the `csv-to-bin` entry in `package.json`
   (see "Dead code" section).
3. Update existing tool files to import from the new utils; delete the now-
   redundant local helpers.
4. `git mv` files into `catalog/`, `famous/`, `filaments/`, `volumes/`,
   `fonts/`, `site/`, `deploy/`, `fetch/`.
5. Fix relative imports in moved files (`./parsers/` → `../parsers/`, etc.).
6. Update `package.json` script paths.
7. `git mv tools/types tools/vendor-types`.
8. Run `npm run typecheck` and the smoke scripts; iterate until clean.
9. Commit as one PR titled along the lines of "refactor(tools): by-domain
   layout + tools/utils registry".

## Dead code

`tools/csvToBin.ts` is deleted as part of this PR, along with its
`csv-to-bin` entry in `package.json`. Audit findings:

- Only live reference is the npm script. No code, CI, or README points
  at it.
- Its parsing logic was already lifted into `tools/parsers/sdssCsv.ts`;
  the script itself just imports `parseSdssCsv` and wraps it in CLI
  argument handling.
- The multi-survey loader `buildAllBins.ts` (2026-05-03 plan, Task 13)
  superseded it as the canonical SDSS → `.bin` path.
- All remaining mentions are historical: `docs/code-review-2026-05-03.md`
  and `docs/superpowers/plans/completed/2026-05-03-*.md`. Completed
  plans are append-only history and not updated.

The deletion is mentioned in the migration order as step 1.5.

## Open questions

None remaining at spec time.

## Risks

- **Reviewer churn.** Moving ~24 files in one PR makes review heavy. The
  alternative (two PRs — utils first, then moves) was rejected to keep
  blame churn contained to a single commit; the diff is mostly `git mv`
  which review tools render cleanly.
- **External callers.** Anyone with a personal alias or doc pointing at
  `tools/buildAllBins.ts` will break. Internal callers (npm scripts, CI,
  README) are updated in the same PR. README references and the
  CLAUDE.md "Where to look" tree get a single-line update each.
