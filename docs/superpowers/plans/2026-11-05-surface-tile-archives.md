# Surface tile archives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Executed under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`.

**Goal:** Earth and Mars surface tiles (albedo + DEM height) are read from per-level `.idx` + `.pack` archives with HTTP Range, so ~70k R2 objects become ~125.

**Architecture:**
- Both tile fetchers read bytes from a `SurfaceTileSource` made at engage. That is the prep commit, which ships with a loose-file source.
- The bake packs each (product, z) level into `z<z>.idx` plus `z<z>.p<k>.pack` beside the loose tiles, before the manifest write.
- An archive source replaces the loose one. sync-r2 uploads only the archives, and local servers answer Range.

**Tech Stack:** TypeScript, Vitest, Node `fs`/`http`, Playwright (loadtime), rclone (sync).

**Spec:** `docs/superpowers/specs/2026-11-05-surface-tile-archives-design.md`. Read it first. The byte tables there are the format contract.

## Global Constraints

- Never run `npm run sync-r2` or anything that writes to R2. The owner publishes.
- Moves and renames only through `npm run move-files -- <from> <to>`.
- Manifest shape unchanged. Archives live under the live prefixes `earth-tiles/v11` and `mars-tiles/v2`.
- Part cap: `64 * 1024 * 1024` = 67,108,864 B. Index header 16 B, entry 16 B, little-endian, magic `STAI`, version `1`.
- Every network read keeps the existing 10 s deadline (`FETCH_DEADLINE_MS = 10_000`).
- Conventions in CLAUDE.md:
  - one symbol per `utils/` and `@types/` file
  - `type`, never `interface`
  - a comment budget of module header ≤ 10 lines and comments ≤ half the code
  - tests mirror `src/` and `tools/` under `tests/`
- `public/data` in this worktree is a symlink to main's. Packing writes the archives into main's tree. That is intended, since it only adds files.
- One PR. Task 2 (the prep) is its own commit, before any feature commit.

## Review Focus

1. **A server that ignores Range** (200 with a full part) must give `null` plus one warning, never a 64 MB download per tile. Test in Task 6.
2. **An index fetch that fails transiently** (network error or deadline) must not blank its level for the session. The next tile retries. Test in Task 6.
3. **A re-pack of a level that shrank** must not leave an orphan `z<z>.p<k>.pack` that sync then uploads. Test in Task 4.
4. **Key width at the deepest levels:** x = 2^19 − 1 and y = 2^18 − 1 at z19 round-trip exactly, and z24 throws. Test in Task 3.
5. **A short or wrong-length 206** (a proxy truncating the body) must not reach `createImageBitmap` as a tile. Test in Task 6.

---

### Task 1: loadtime surface milestones + baseline numbers

**Files:**
- Modify: `tools/loadtime/@types/LoadMilestones.d.ts`, `tools/loadtime/measureLoad.ts`, `tools/loadtime/README.md`
- Test: none. The harness is a measuring tool, and the run below exercises it.

**Interfaces:**
- Produces: `LoadMilestones.firstSurfaceTile?: number` (ms) and `LoadMilestones.surfaceRequests?: number`. The README milestone table gains both rows.

- [ ] **Step 1: Add the two fields and record them.**
  - `firstSurfaceTile`: the first finished response whose URL matches `/-tiles\/v\d+\/albedo\/.+\.(webp|pack)$/` with status 200 or 206.
  - `surfaceRequests`: every request under `/(earth|mars)-tiles\/v\d+\//` before `loaded` or the timeout: tiles, indexes, parts and 404s.
  - Both URL shapes count, so the before and after runs compare.
- [ ] **Step 2: Pick the deep link.** It must frame Earth close enough that z ≥ 5 albedo streams, for example `#focus=body-earth` plus a camera range. Confirm with `--filmstrip`, and write the link into the README's example list.
- [ ] **Step 3: Baseline loadtime.**
  - Run: `npm run loadtime -- --rebuild --profile 3g --profile fast-4g --link '<link>'`
  - Expected: both profiles print `firstSurfaceTile` and `surfaceRequests`.
  - Save stdout to `.superpowers/sdd/2026-11-05-surface-tile-archives/baseline-loadtime.txt`.
- [ ] **Step 4: Baseline perf.**
  - Start this worktree's dev server (`/dev`) and read its `Local:` port.
  - Run: `npm run perf -- --url http://localhost:<port> --scenario earth-surface --scenario mars-jezero-146km`. Check `tools/perf/README.md` for the exact scenario flag.
  - Save it to `baseline-perf.txt` beside the loadtime file.
- [ ] **Step 5: Commit.** `git commit -m "loadtime: first surface tile and surface request count"`

### Task 2 (PREP): tile fetchers read from a `SurfaceTileSource`

**Files:**
- Create: `src/layers/body/surfaceTiles/stream/@types/SurfaceTileSource.d.ts`
- Create: `src/layers/body/surfaceTiles/stream/load/createLooseTileSource.ts`
- Modify:
  - `stream/load/fetchSurfaceTileBitmap.ts:24-43`
  - `stream/load/fetchHeightTile.ts:22-58`
  - `stream/subsystems/surfaceTileStream.ts:84,153,203,226`
- Test: `tests/layers/body/surfaceTiles/stream/subsystems/surfaceTileStream.test.ts` is unchanged and must stay green.

**Interfaces:**
- Produces:

```ts
export type SurfaceTileSource = {
  /** The tile's encoded bytes, or `null` when absent or unreadable. Never throws. */
  readonly readTile: (tile: SurfaceTileId) => Promise<Uint8Array | null>;
};
export function createLooseTileSource(prefix: string): SurfaceTileSource;
export async function fetchSurfaceTileBitmap(tile: SurfaceTileId, source: SurfaceTileSource): Promise<ImageBitmap | null>;
export async function fetchHeightTile(tile: SurfaceTileId, source: SurfaceTileSource): Promise<HeightTileImage | null>;
```

- The atlas record gains `readonly source: SurfaceTileSource`, built in `engage` from `manifest.prefix`. It keeps `prefix`, because residency keys still use `surfaceTilePath(tile, prefix)`.

- [ ] **Step 1: Write `createLooseTileSource`.**
  - It moves the fetch out of both fetchers: the URL from `surfaceTilePath`, the deadline, `!res.ok` → `null`, and a catch → `null`.
  - The albedo fetcher's `content-type` `image/` check moves into the loose source as is. It goes away with the loose source in Task 6.
- [ ] **Step 2: Fetchers take `source` and keep only decoding.**
  - Albedo decodes `new Blob([bytes], { type: 'image/webp' })` with `premultiplyAlpha: 'none'`.
  - Height keeps its SHGT, decode and size checks.
- [ ] **Step 3: The stream builds the source at engage and passes it at :203 and :226.**
- [ ] **Step 4: Verify.** Run `npm test -- tests/layers/body/surfaceTiles && npm run typecheck:fast`. Expected: PASS.
- [ ] **Step 5: Visual sanity.** Shoot `npm run shot -- '<earth link from Task 1>' --url http://localhost:<port>`. Tiles render as before.
- [ ] **Step 6: Commit on its own.** `git commit -m "refactor(surfaceTiles): fetchers read bytes from a SurfaceTileSource"`

### Task 3: archive format: constants, path, key, encode, decode, lookup

**Files:**
- Create in `src/layers/body/surfaceTiles/format/`:
  - `data/surfaceTileArchiveFormat.ts`
  - `utils/surfaceTileArchivePath.ts`
  - `utils/surfaceTileMortonKey.ts`
  - `utils/decodeSurfaceTileArchiveIndex.ts`
  - `utils/findSurfaceTileArchiveEntry.ts`
  - `@types/SurfaceTileArchiveEntry.d.ts`
  - `@types/SurfaceTileArchiveIndex.d.ts`
- Create: `tools/textures/utils/encodeSurfaceTileArchiveIndex.ts`
- Test: `tests/layers/body/surfaceTiles/format/utils/surfaceTileArchiveIndex.test.ts` (one round-trip file covers encode, decode and lookup), `…/surfaceTileArchivePath.test.ts`

**Interfaces:**
- Produces:

```ts
// surfaceTileArchiveFormat.ts
export const SURFACE_TILE_ARCHIVE_MAGIC = 'STAI';
export const SURFACE_TILE_ARCHIVE_VERSION = 1;
export const SURFACE_TILE_ARCHIVE_HEADER_BYTES = 16;
export const SURFACE_TILE_ARCHIVE_ENTRY_BYTES = 16;
export const SURFACE_TILE_ARCHIVE_MAX_PART_BYTES = 64 * 1024 * 1024;
export const SURFACE_TILE_ARCHIVE_MAX_LEVEL = 23; // 6 B key: 2·23 bits

export type SurfaceTileArchiveEntry = { readonly key: number; readonly part: number; readonly offset: number; readonly length: number };
export type SurfaceTileArchiveIndex = { readonly partCount: number; readonly entryCount: number; readonly view: DataView };

export function surfaceTileArchivePath(prefix: string, product: SurfaceTileProduct, z: number, part?: number): string;
// → `${prefix}/${product}/z${z}.idx`, or `${prefix}/${product}/z${z}.p${part}.pack`
export function surfaceTileMortonKey(x: number, y: number): number; // bit 2i = x bit i, 2i+1 = y bit i
export function encodeSurfaceTileArchiveIndex(entries: readonly SurfaceTileArchiveEntry[], partCount: number): Uint8Array; // entries pre-sorted by key
export function decodeSurfaceTileArchiveIndex(bytes: Uint8Array): SurfaceTileArchiveIndex; // throws on bad magic / version / size
export function findSurfaceTileArchiveEntry(index: SurfaceTileArchiveIndex, key: number): SurfaceTileArchiveEntry | null; // binary search
```

- Header and entry layout exactly as the spec's tables. The key is written as a low u32 at entry+0 and a high u16 at entry+4.

- [ ] **Step 1: Failing tests.**

```ts
it('round-trips the deepest z19 key exactly', () => {
  const key = surfaceTileMortonKey(2 ** 19 - 1, 2 ** 18 - 1);
  const index = decodeSurfaceTileArchiveIndex(encodeSurfaceTileArchiveIndex([{ key, part: 2, offset: 4_000_000_000, length: 70_000 }], 3));
  expect(findSurfaceTileArchiveEntry(index, key)).toEqual({ key, part: 2, offset: 4_000_000_000, length: 70_000 });
});
it('interleaves x into even bits and y into odd bits', () => {
  expect(surfaceTileMortonKey(1, 0)).toBe(1);
  expect(surfaceTileMortonKey(0, 1)).toBe(2);
  expect(surfaceTileMortonKey(3, 5)).toBe(0b100111);
});
it('returns null for a key between two entries', …);       // keys 4 and 9 stored, 5 looked up
it('writes STAI v1 little-endian header', …);              // bytes 0-3 'STAI', u16@4 = 1, u16@6 = partCount, u32@8 = count
it('rejects a wrong magic, an unknown version and a truncated entry table', …); // three toThrow cases
it('throws past the 6 B key width', () => expect(() => surfaceTileMortonKey(2 ** 24, 0)).toThrow());
it('names index and parts', () => {
  expect(surfaceTileArchivePath('earth-tiles/v11', 'albedo', 13)).toBe('earth-tiles/v11/albedo/z13.idx');
  expect(surfaceTileArchivePath('earth-tiles/v11', 'height', 7, 1)).toBe('earth-tiles/v11/height/z7.p1.pack');
});
```

- [ ] **Step 2: Run it.** `npm test -- tests/layers/body/surfaceTiles/format/utils/surfaceTileArchive`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.** Morton above 32 bits uses arithmetic (`* 2 ** n`), not `<<`.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "surfaceTiles: archive index format"`

### Task 4: pack step in the bake

**Files:**
- Create: `tools/textures/utils/planSurfaceTileParts.ts`, `tools/textures/utils/packSurfaceTileLevels.ts`
- Modify: `tools/textures/buildSurfaceTiles.ts:551-558`, where the call sits between the `index.txt` write and the `manifest.json` write, plus its module header line about outputs.
- Test: `tests/tools/textures/planSurfaceTileParts.test.ts`, `tests/tools/textures/packSurfaceTileLevels.test.ts`

**Interfaces:**
- Consumes: Task 3's `surfaceTileMortonKey`, `surfaceTileArchivePath`, `encodeSurfaceTileArchiveIndex`, `SURFACE_TILE_ARCHIVE_MAX_PART_BYTES`.
- Produces:

```ts
/** Assigns part + offset in key order; a new part starts when the next tile would exceed maxPartBytes. */
export function planSurfaceTileParts(
  tiles: readonly { readonly key: number; readonly length: number }[], // sorted by key
  maxPartBytes: number,
): { readonly entries: SurfaceTileArchiveEntry[]; readonly partCount: number };
/** Writes every (product, z) level's parts + index for `sortedPaths` (index.txt lines). Returns files written. */
export function packSurfaceTileLevels(outDir: string, tilePrefix: string, sortedPaths: readonly string[]): number;
```

- [ ] **Step 1: Failing tests.**

```ts
it('fills a part to exactly maxPartBytes before opening the next', () => {
  const { entries, partCount } = planSurfaceTileParts([{ key: 0, length: 60 }, { key: 1, length: 40 }, { key: 2, length: 1 }], 100);
  expect(entries.map((e) => [e.part, e.offset])).toEqual([[0, 0], [0, 60], [1, 0]]);
  expect(partCount).toBe(2);
});
it('throws on a single tile larger than a part', …);
// packSurfaceTileLevels, on a tmp dir holding 3 loose tiles over two levels:
it('writes z<z>.idx and parts whose ranges read back each tile byte for byte', …);
it('is deterministic: a second pack produces identical bytes', …);
it('deletes a stale higher-numbered part left by an earlier, larger pack', …); // pre-seed z3.p1.pack, pack one small level, expect it gone
```

- [ ] **Step 2: Run.** `npm test -- tests/tools/textures/planSurfaceTileParts tests/tools/textures/packSurfaceTileLevels`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Parse each path as `<prefix>/<product>/<z>/<x>/<y>.webp`, sort a level by Morton key, and plan its parts.
  - Write each part and then the index as `*.tmp`, renamed into place.
  - Remove `z<z>.p<k>.pack` for k ≥ partCount.
  - Call it from `bakeAll` after the `index.txt` write. Print `  <N> archive files packed` to stderr.
- [ ] **Step 4: Run.** Expected: PASS. Then `npm test -- tests/tools/textures/buildSurfaceTiles`. Expected: PASS.
- [ ] **Step 5: Pack the live sets.**
  - Run: `npm run build-surface-tiles -- --body earth`, then `-- --body mars`.
  - First confirm from the code path, then from the run's output, that no source raster or tile fetch happens: every tile hits its `existsSync` skip.
  - If sources are read, stop and report. The spec then needs a pack-only entry point.
  - Expected: Earth and Mars print an archive count, ~125 in total. `git status` is clean, since the data is gitignored.
  - Record the counts and the largest part per body in the ledger.
- [ ] **Step 6: Commit.** `git commit -m "build-surface-tiles: pack each level into .idx + .pack"`

### Task 5: local servers answer Range

**Files:**
- Create: `tools/utils/serve/byteRangeOf.ts`, `tools/@types/serve/ByteRange.d.ts`
- Modify: `tools/utils/serve/serveGzipped.ts:26-66`. Also fix the stale "`vite preview` compresses nothing" sentence: preview gzips text and JSON. Add `.idx` and `.pack` → `application/octet-stream` only if the default doesn't already give that (it does today, so most likely no change).
- Test: `tests/tools/utils/serve/byteRangeOf.test.ts`, plus one 206 case in the existing `serveGzipped` test if one exists. Otherwise one new test file.

**Interfaces:**
- Produces:

```ts
export type ByteRange = { readonly start: number; readonly end: number } | 'unsatisfiable';
/** `null` = serve the whole file (no header, multi-range, malformed). `end` inclusive. */
export function byteRangeOf(header: string | undefined, size: number): ByteRange | null;
```

- [ ] **Step 1: Failing tests.**

```ts
it.each([
  ['bytes=0-99', 1000, { start: 0, end: 99 }],
  ['bytes=990-', 1000, { start: 990, end: 999 }],
  ['bytes=-10', 1000, { start: 990, end: 999 }],
  ['bytes=900-2000', 1000, { start: 900, end: 999 }],
  ['bytes=1000-', 1000, 'unsatisfiable'],
  ['bytes=0-1,5-9', 1000, null],
  ['items=0-1', 1000, null],
  [undefined, 1000, null],
])('%s of %i', (h, size, want) => expect(byteRangeOf(h, size)).toEqual(want));
it('serveGzipped answers a Range on a raw data file with 206 and Content-Range', …);
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `serveGzipped`, the Range branch runs only on the raw (non-gzip) path: 206, `Content-Range: bytes s-e/size`, `Content-Length`, and `createReadStream(file, { start, end })`. Unsatisfiable gives 416 with `Content-Range: bytes */size`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "serve: answer byte ranges on raw files"`

### Task 6: archive source replaces the loose source

**Files:**
- Create: `src/layers/body/surfaceTiles/stream/load/createArchiveTileSource.ts`
- Delete: `stream/load/createLooseTileSource.ts`, so no old and new source are left side by side.
- Modify: `stream/subsystems/surfaceTileStream.ts`, which calls `createArchiveTileSource(manifest.prefix)` at engage.
- Test: `tests/layers/body/surfaceTiles/stream/load/createArchiveTileSource.test.ts`, with `fetch` stubbed via `vi.stubGlobal` and the indexes built with Task 3's encoder.

**Interfaces:**
- Consumes: Task 2's `SurfaceTileSource`; Task 3's path, key, decode and find functions.
- Produces: `export function createArchiveTileSource(prefix: string): SurfaceTileSource;`

- [ ] **Step 1: Failing tests.**

```ts
it('reads a tile with one Range request after one index fetch', …);   // 2 fetch calls; 2nd has headers.Range 'bytes=100-149'
it('memoises the level index across tiles', …);                          // 3 tiles same level → 1 idx fetch
it('returns null for a tile absent from the index without requesting it', …);
it('treats an index 404 as an empty level and does not refetch it', …);
it('retries the index after a network error', …);                        // 1st idx fetch rejects, next readTile refetches
it('returns null and warns once when a part answers 200 instead of 206', …); // two tiles → console.warn called once
it('returns null when a 206 body length differs from the entry length', …);
it('returns null when the index has a bad magic', …);
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Keep one `Map<product:z, Promise<SurfaceTileArchiveIndex | null>>`. An index 404 resolves `null` (empty). A rejection deletes the map entry.
  - On a 200, call `res.body?.cancel()` before returning `null`.
  - Both requests use `mode: 'cors'` and the 10 s `AbortSignal.timeout`.
  - URLs via `dataUrl(\`images/${surfaceTileArchivePath(…)}\`)`.
- [ ] **Step 4: Swap at engage, delete the loose source.** Then `grep -rn createLooseTileSource src tests` is empty.
- [ ] **Step 5: Verify.**
  - `npm test -- tests/layers/body/surfaceTiles && npm run typecheck:fast` gives PASS.
  - A dev-server shot of the Task 1 link shows tiles rendering, and the network shows `.idx` + `.pack` 206s, no `.webp`.
  - Repeat at a Mars Jezero link.
- [ ] **Step 6: Cross-origin Range against the live edge.**
  - Run the dev server as `VITE_DATA_BASE_URL=https://skymap-data.rulkens.com npm run dev`.
  - In the page console: `fetch('https://skymap-data.rulkens.com/data/_probe/range-probe-64m.bin', { headers: { Range: 'bytes=0-15' }, mode: 'cors' }).then((r) => [r.status, r.headers.get('content-length')])`
  - Expected: `[206, '16']`.
- [ ] **Step 7: Commit.** `git commit -m "surfaceTiles: read tiles from level archives with Range"`

### Task 7: sync-r2 uploads archives, refuses overwrites

**Files:**
- Modify:
  - `tools/deploy/r2/collectSurfaceTiles.ts` (body and doc comment)
  - `tools/deploy/@types/R2Transport.d.ts`, where `bulk` gains a required `readonly refuseOverwrite: boolean`
  - `tools/deploy/r2/uploadViaRclone.ts:49-65`, which pushes `'--immutable'` when it's set
  - `tools/deploy/syncR2.ts`: every bulk group states the flag, `true` only on the surface tile groups
- Test: `tests/tools/deploy/r2/collectSurfaceTiles.test.ts` (rewrite its 6 cases against the manifest + index layout), plus the uploadViaRclone test if one covers args.

**Interfaces:**
- Consumes: Task 3's `decodeSurfaceTileArchiveIndex` and `surfaceTileArchivePath`.
- Produces: `collectSurfaceTiles(imagesDir: string, manifestKey: string): R2Upload[]`. The signature is unchanged.

- [ ] **Step 1: Failing tests.**

```ts
it('returns [] when the manifest is missing', …);
it('lists each level index and every part it names, across both products', …); // keys like 'data/images/earth-tiles/v11/albedo/z3.idx', '…/z3.p0.pack'
it('skips levels inside the band range that have no index', …);
it('throws when an index names a part that is not on disk', …);
it('never lists loose tiles', …);                                              // a loose .webp beside them is absent from the result
it('passes --immutable only for a refuseOverwrite group', …);                 // uploadViaRclone args, if that file has a test seam
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** per the spec's four steps: manifest → bands' min..max per product → idx if present → parts from `partCount`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Dry run against the bucket, read-only.**
  - Run: `npx tsx tools/deploy/syncR2.ts --dry-run`, if the flag exists. Otherwise print `collectSurfaceTiles(IMAGES_DIR, key).length` for both keys.
  - Expected: Earth and Mars together ~125 files, no `.webp`.
  - If a read-only rclone listing is available, confirm rclone's content type for `.pack` is `application/octet-stream` (`rclone lsjson --metadata` on the probe object). Never write.
- [ ] **Step 6: Commit.** `git commit -m "sync-r2: upload surface tile archives; refuse overwriting them"`

### Task 8: docs

**Files:**
- Modify: `docs/DATA.md` (surface tiles section), `docs/DEPLOY.md`
- Backlog: `docs/BACKLOG.md` plus a detail file only if a follow-up is design-bearing. The adjacent findings go here:
  - stray backups in `public/data/images/earth-tiles/`: `index.pre-prune.txt`, `index.v8-backup.txt`, `manifest.v8-backup.json`, the `index-*.txt` files, `v10/`
  - deleting the loose v11/v2 tiles from R2 after deploy
  - removing the range probe object

- [ ] **Step 1: DATA.md.** The archive layout (link the spec's tables, don't copy them), the pack step, and the rule: **a published prefix is never changed; new tiles mean a new prefix**.
- [ ] **Step 2: DEPLOY.md.**
  - Archives are raw and Range-read, with `refuseOverwrite` → `--immutable`.
  - Before deploy: delete, re-sync, purge. After deploy: a new prefix.
  - Correct the stale "edge-caches nothing" note: `.bin` and `.json` come back MISS then HIT/REVALIDATED.
- [ ] **Step 3: Commit.** `git commit -m "docs: surface tile archives"`

### Task 9: after numbers + whole-branch gate

- [ ] **Step 1: Loadtime after.** The Task 1 command with `--rebuild`. Save `after-loadtime.txt`.
- [ ] **Step 2: Perf after.** The Task 1 perf command. Save `after-perf.txt`.
- [ ] **Step 3: Report the table.** Before vs after: `firstSurfaceTile`, `surfaceRequests` and `loaded` per profile; perf ms for both scenarios; file counts 70,440 → N.
  - If `firstSurfaceTile` regresses by more than one round trip (the 3g profile's RTT from `networkProfiles.ts`), or perf regresses beyond noise, **halt** for the owner's ruling.
- [ ] **Step 4: Gate.** Run `npm test`, `npm run typecheck`, `npm run format`, and `/comment-audit` on touched files. Then the whole-branch review per `sdd-execution.md`.

### Task 10 (after the owner's sync, before merge): live edge probe

Runs only once the owner reports `npm run sync-r2` done. Nothing here writes to R2.

- [ ] **Step 1: Cold vs warm.**
  - Pick the Earth albedo z5 index and its part.
  - Run `range-probe.sh` against them (the session scratchpad script, recreated if gone): a fresh `?b=<random>` cache key for the cold read, the plain key for the warm.
  - Record the TTFB of a 16 KB read at the part's start and its tail.
- [ ] **Step 2: Concurrency.** Fire 8 concurrent cold Range reads (`curl … &`, one fresh cache key) at different offsets of one part. Record the per-request TTFB and `cf-cache-status`.
- [ ] **Step 3: Report.** Add the numbers to the PR body beside Task 9's table, for the owner's ruling. Smaller parts are the lever if the cold first tile costs too much.

### Coordination: desktop branch

`packages/desktop/src/main/server/utils/serveAppRequest.ts:36` (branch `feat/desktop-kiosk-dome-app`) adopts `byteRangeOf` on whichever branch merges second:
- If kiosk merges first, this branch adds the 206/416 branch there after rebasing, with its test, and updates `docs/DESKTOP.md`.
- If this merges first, the kiosk rebase does it.

Either way, `listMirrorKeys`'s "70k" comment there is updated in the same edit.
