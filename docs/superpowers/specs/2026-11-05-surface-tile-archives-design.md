# Surface tile archives — design

Status: draft, 2026-11-05. Worktree `pack-surface-tiles-archives`.

## Intent

Earth (`earth-tiles/v11`, 43,344 tiles, ~576 MB) and Mars (`mars-tiles/v2`, 27,096 tiles,
~520 MB) are stored as one object per tile. Every `npm run sync-r2` lists each remote tile
and MD5s each local one (`tools/deploy/r2/uploadViaRclone.ts`, `--checksum`). The desktop
app's offline download (branch `feat/desktop-kiosk-dome-app`) hashes and downloads them
one by one. This change packs each pyramid level into a few large archive files that the
app reads with HTTP Range requests. ~70k objects become ~125.

## Goals

- The app reads every albedo and height (DEM) tile from archives. That holds in production
  (R2 behind Cloudflare), the Vite dev server, `npm run loadtime`'s local server and the
  desktop app's server.
- sync-r2 and the desktop offline inventory deal with archive files only.
- Before and after numbers from `npm run perf` and `npm run loadtime`, including time to the
  first Earth tile.

## Non-goals

- PMTiles or any third-party overlay format. Ruled 2026-11-05: an own minimal format.
  PMTiles may be the input format for third-party Web Mercator overlays if that feature is
  ever designed.
- Coalescing neighbouring tiles into one range request. One tile still costs one request,
  as it does today.
- Resuming a download in the middle of a file in the desktop downloader. A failed part of
  up to 64 MB starts again from zero.
- Changing the bake's working tree. Loose tiles, `index.txt` and the tools that read loose
  height tiles (`readGroundHeightM.ts`, `reportSiteTerrain.ts`, the bake's own read-back)
  stay as they are. They all run where the bake ran.
- Deleting the loose tiles already on R2. They keep serving old deployed code. Cleaning
  them up is the owner's call after deploy.

## Anti-goals

- A tile that renders from the wrong bytes: a stale index paired with new parts. That is
  worse than a missing tile (see Immutability).
- Every tile fetch downloading a whole part, because a server ignored Range.

## Constraints

- Cloudflare edge (measured 2026-11-05 on `data/_probe/range-probe-64m.bin`):
  - A raw object (no `Content-Encoding`) answers Range with 206.
  - An object uploaded gzipped ignores Range and answers 200 with the full body.
  - A cold miss streams the whole object into the edge at ~65 MB/s. A 16 KB read at the
    tail of a 64 MiB object took 1.06 s cold and ~0.09 s warm.
  - The per-file cache limit is 512 MB.
- Ruled: one archive set per (body, product, level), at most 64 MiB per file, larger
  levels split into parts.
- Ruled: manifest unchanged; archives go in beside the loose tiles under the live `v11`
  and `v2` prefixes; the owner syncs before the code deploys. Old and new code then both
  work from the same manifest.
- The owner runs every R2 write. No agent runs `npm run sync-r2` or anything else that
  writes to R2.
- Ruled: everything on one PR, with the prep refactor as its own commit(s) first.

## Ground preparation

The `refactor-ground` checkpoint was shown 2026-11-05 and signed off (ask GrcC). It found
1 bolt-on among 7 touchpoints, so 1 prep commit, plus 4 contracts that change. A
greenfield check, from the requirements alone, agreed on the shape. It proposed one other
idea, rejected below.

**The bolt-on:** both fetchers build their own URL and run their own fetch:
`fetchSurfaceTileBitmap.ts:28` and `fetchHeightTile.ts:26`, each from the `prefix` string
the stream keeps at `surfaceTileStream.ts:84` and passes at :203 and :226. An archive
reader would have to be written into both.

**Prep P1 (own commit, before the feature):** a `SurfaceTileSource` is made at engage and
kept on the atlas in place of `prefix`. The two fetchers take the source and keep only
their decoding. P1 ships a loose-file source, so behaviour doesn't change. The feature
replaces it with the archive source and deletes the loose one.

```ts
// src/layers/body/surfaceTiles/stream/@types/SurfaceTileSource.d.ts
export type SurfaceTileSource = {
  /** The tile's encoded bytes, or `null` when it is absent or unreadable. Never throws. */
  readonly readTile: (tile: SurfaceTileId) => Promise<Uint8Array | null>;
};
```

```diff
-export async function fetchSurfaceTileBitmap(tile: SurfaceTileId, prefix: string)
+export async function fetchSurfaceTileBitmap(tile: SurfaceTileId, source: SurfaceTileSource)
-  readonly prefix: string;
+  readonly source: SurfaceTileSource;
```

Residency keys stay `surfaceTilePath(tile, prefix)` strings (6 uses). They are still
unique per tile, so the atlas keeps `prefix` for them beside `source`.

**Growth (plain additions):**
- the archive format module and its path helper
- the pack step in `bakeAll`
- the archive source
- `collectSurfaceTiles` reading down from the manifest
- the shared `byteRangeOf` helper in both local servers
- the loadtime milestone
- docs

**Rejected:**
- A module-level index cache in each fetcher: the lookup would be written twice.
- The index inside part 0, PMTiles-style: a cold read of part 0 would hold every first
  lookup behind a stream of up to 64 MB.
- A per-prefix `inventory.json` (from the greenfield check): `buildOfflineInventory`
  already hashes every file of a group.
- A second list file written by the bake for sync to read: one more file that must agree
  with the disk.

## The archive format

Files per level, beside the loose tiles:

```
<prefix>/<product>/z<z>.idx         index: header + one entry per tile
<prefix>/<product>/z<z>.p<k>.pack   part k: raw tile bytes, ≤ 64 MiB (67,108,864 B)
```

Names come from one helper, `surfaceTileArchivePath(prefix, product, z, part?)` in
`format/utils/surfaceTileArchivePath.ts`. With `part` it names a part; without it, the
index. It sits beside `surfaceTilePath.ts` and follows the same single-home rule.
`format/data/surfaceTileArchiveFormat.ts` owns the constants below. One encoder (tools)
and one decoder (runtime) use them.

**Index header (16 B, little-endian):**

| offset | size | field        | value                     |
| -----: | ---: | ------------ | ------------------------- |
|      0 |    4 | magic        | ASCII `STAI`              |
|      4 |    2 | version      | `1`                       |
|      6 |    2 | partCount    | number of `.pack` parts   |
|      8 |    4 | entryCount   | number of entries         |
|     12 |    4 | reserved     | `0`                       |

**Entry (16 B, little-endian), sorted by key ascending:**

| offset | size | field  | meaning                                                  |
| -----: | ---: | ------ | -------------------------------------------------------- |
|      0 |    6 | key    | Morton interleave of (x, y): bit 2i = x bit i, 2i+1 = y bit i |
|      6 |    2 | part   | which `.pack`                                            |
|      8 |    4 | offset | byte offset in that part                                 |
|     12 |    4 | length | byte length of the tile                                  |

- Key width: at z19, x < 2^19 and y < 2^18, which fits in 38 bits. 6 B covers z ≤ 23.
  The encoder throws above that.
- Morton order keeps neighbouring tiles in the same part, so a view mostly touches one
  part per level.
- The packer walks tiles in key order and opens a new part whenever the next tile would
  push the current one past 64 MiB.
- Packing is deterministic: the same tiles give the same bytes. A re-bake that changes
  nothing leaves the sync with nothing to upload.
- The decoder throws on a wrong magic or an unknown version. The source catches it and the
  level reads as empty.
- Expected splits: Earth albedo z7 (~81–94 MB) and z13 (~106–113 MB) into 2 parts each,
  z19 (~91 MB) into 2. Mars albedo z7 (156 MB) and height z7 (166 MB) into 3 each. Every
  other level fits one part.
- The largest index is a full z7 level: 8,192 entries, 128 KB.

Byte order and the 6 B key width are the parts a hand-rolled reader gets wrong, so the
round-trip tests pin them.

## The bake

`bakeAll` (`tools/textures/buildSurfaceTiles.ts`) gains one call between writing
`index.txt` (:552) and writing `manifest.json` (:558):
`packSurfaceTileLevels(outDir, sortedPaths)`, in its own `tools/textures/utils/` file. It:

- groups the indexed paths by (product, z)
- writes each level's parts, then its index, each as a temp file renamed into place
- deletes leftover parts with a higher k from an earlier, larger pack of that level

The manifest is still written last. An interrupted pack therefore leaves the previous
manifest in place, as an interrupted bake does today.

The bake skips every tile whose output already exists. Re-running
`npm run build-surface-tiles -- --body earth` (and `--body mars`) on today's v11 and v2
trees therefore only packs. That is how the live sets get their archives, with no new flag.
Task 1 of the plan confirms the re-run reads no source rasters. If it does, the plan adds a
pack-only entry point before going further.

## Immutability

A level's archive changes as a whole: one added tile shifts the offsets of every tile
after it. Archives are uploaded `immutable` (1 year), so a changed index cached beside new
parts, or the other way round, draws tiles from the wrong bytes. Loose tiles allowed one
thing that archives don't: adding a band under a published prefix, since that added new
files and touched none.

The rule: **once a prefix is published, any change to its tiles takes a new prefix.**
Enforcement: the surface tile groups set a new bulk-transport field,
`refuseOverwrite: true`, and the transport then passes rclone's `--immutable`. A sync that
would overwrite an existing remote object with different content fails and names the
file, instead of corrupting caches.

- Explicit, and on the surface tile groups only (my call). The octree chunks are also
  `IMMUTABLE`, but they are named by the hash of their raw bytes and uploaded gzipped. A
  Node or zlib upgrade that changes the gzip output would trip the flag on unchanged
  data, so keying the flag on `IMMUTABLE` would be wrong.
- Before deploy, the only readers of a new prefix are the owner and agents. A fix found
  after the owner's sync but before deploy can therefore replace the files: delete them
  on R2, re-sync, purge their URLs. It doesn't need a prefix bump. After deploy, the rule
  holds without exception.
- Price: an additive bake (a new site band) now re-uploads the whole body under a new
  prefix (~600 MB for Earth) instead of only the new tiles. Bakes come every few weeks.
- Rejected: content-hashed part names listed in the manifest. It breaks the ruled
  "manifest unchanged", and it adds a field every reader must agree on.

## The runtime: archive source

`createArchiveTileSource(prefix)` in `stream/load/` returns a `SurfaceTileSource`. Per
(product, z) it keeps one memoised promise of the decoded index.

- **Index fetch:** `dataUrl('images/' + surfaceTilePath…idx)`, with a 10 s deadline like
  the fetchers.
  - A 404 means the level is empty. That is memoised: levels 0–2 and anything outside the
    bands have no index.
  - A network error or deadline drops the memo, so the next tile of that level tries again.
    It doesn't kill the level for the session.
- **Lookup:** binary search on the key. An absent tile returns `null` **with no request**.
  Today most of the grid is a 404 per tile, because both sources are land-oriented. Those
  requests go away.
- **Tile read:** `fetch(partUrl, { headers: { Range: 'bytes=o-(o+len-1)' }, mode: 'cors' })`
  with the 10 s deadline. The bytes are used only when the response is 206 and its length
  is exactly `length`. Anything else returns `null`.
- **A 200:** a server that ignores Range sends the whole part. The source aborts the body,
  returns `null` and logs one `console.warn` per source naming the URL. That catches a
  misconfigured server (a gzip-on-wire upload, a server without Range) on the first tile
  rather than through 64 MB downloads. My call: it fails loudly, it doesn't slice the 200.
- `failedKeys` in the stream still memoises `null` per tile, unchanged.

**Fetcher changes:**
- `fetchSurfaceTileBitmap` drops its content-type check. It guarded against HTML error
  pages, and the 206 + length check now does that job. It decodes
  `new Blob([bytes], { type: 'image/webp' })`.
- `fetchHeightTile` keeps its SHGT and size checks.

CORS: `tools/deploy/r2Cors.json` allows all request headers, so `Range` passes. The source
doesn't read `Content-Range`, so no exposed headers are needed. The plan's live check
confirms a cross-origin 206 from `https://skymap-data.rulkens.com` at localhost:5173.

## Sync and offline inventory

`collectSurfaceTiles(imagesDir, manifestKey)` keeps its signature (7 calls) and reads
downward:

1. `<manifestKey>/manifest.json`. Missing means `[]`; it is written last, so an
   interrupted bake uploads nothing, as before.
2. For each product, each level between the bands' min and max, read `<product>/z<z>.idx`
   when it exists.
3. From its header's `partCount`, list its parts.
4. Return the indexes and parts as `R2Upload`s.

- A `partCount` that names a missing part throws.
- The group keeps bulk transport, `IMMUTABLE`, and `gzipOnWire: false`. The indexes are
  raw too, so they share the group.
- Content-Type: rclone maps unknown extensions to `application/octet-stream`. The plan
  confirms that from an rclone dry run. The pack files are never compressed on the wire.

The kiosk branch's `buildOfflineInventory` hashes whatever the group collects, so it picks
up the archives with no change of its own.

## Local servers answer Range

`byteRangeOf(header: string | undefined, size: number)` in
`tools/utils/serve/byteRangeOf.ts` returns:

```ts
type ByteRange = { start: number; end: number } | 'unsatisfiable' | null;
```

- `null` means "serve the whole file, 200": no header, a multi-range, or a malformed value.
- It handles `bytes=a-b`, `bytes=a-` and `bytes=-n`.
- `'unsatisfiable'` means 416, with `Content-Range: bytes */size`.

Who uses it:
- **`serveGzipped`** (loadtime and compareSite): it currently always answers 200. A Range
  request gets the raw file's slice, never gzip, with 206 and `Content-Range`. The stale
  comment at :31 ("vite preview compresses nothing") gets fixed in the same edit, since
  preview's compression gzips text and JSON.
- **Desktop `serveAppRequest`** (`packages/desktop/src/main/server/utils/serveAppRequest.ts:36`,
  kiosk branch): the same change. It lands on whichever branch merges second. If kiosk
  merges first, this branch makes the edit after rebasing. If this merges first, the kiosk
  rebase adopts it. The desktop app can't show tiles from archives until it's in.
- **Vite dev:** sirv already answers Range, so nothing changes. `.pack` and `.idx` are
  `application/octet-stream`, which `vite preview`'s compression leaves alone.

## Rollout

1. Pack in place by re-running both bakes, which writes into main's `public/data` through
   the link.
2. The owner runs `npm run sync-r2` from this branch. It uploads ~125 archive files under
   `v11` and `v2`. Manifests are unchanged.
3. Deploy the code.

v11's and v2's loose tiles are already on R2 (a tile from each returned 200 on
2026-11-05), so old deployed code keeps working through step 2.

The owner syncs once, after the format is frozen by the branch's final review. The
cross-origin Range check before then uses the probe object already on R2
(`data/_probe/range-probe-64m.bin`, raw, same CORS). The live edge measurement
(Measurement) runs after the sync, before merge.

## Measurement

- **Before:** on main at `e7f16163d`, with today's loose-tile code, against the same data.
- **After:** on the branch with archives packed.
- **`npm run perf`**: scenarios `earth-surface` and `mars-jezero-146km`, passing this
  worktree's `--url`. Expected: neutral, since decode and atlas upload are unchanged.
- **`npm run loadtime`**: a new `firstSurfaceTile` milestone, the end of the first
  successful albedo tile response (loose `.webp` or a 206 on `.pack`). A new
  `surfaceRequests` count covers tile, index and 404 requests within the timeout.
  - Run with `--rebuild`, on profiles `3g` and `fast-4g`, with a deep link that frames
    Earth close enough to stream z ≥ 5.
  - Expected: `firstSurfaceTile` pays one extra round trip, the level index.
    `surfaceRequests` drops, because the land-only 404s no longer happen.
- **Live edge, after the owner's sync** (loadtime serves locally, so it can't see this):
  - First-tile time against `skymap-data.rulkens.com`, on a cold part (a fresh query-string
    cache key) versus a warm one.
  - Also 8 concurrent cold Range reads into one part, the albedo and height streams at
    4 each, to see whether Cloudflare merges them into one origin fetch.
  - Reported beside the loadtime numbers for the owner's ruling. Smaller parts are the
    lever if a cold first tile costs too much.
- **File counts:** 70,440 tile files become the pack step's printed count (~125).
- The spec's claim is the measured numbers, whatever they turn out to be. A regression in
  `firstSurfaceTile` beyond one round trip halts landing for the owner's ruling.

## Docs

- **`docs/DATA.md`, surface tiles section:** the archive layout, the pack step, the
  immutability rule.
- **`docs/DEPLOY.md`:**
  - Archives are raw and Range-read.
  - `refuseOverwrite` (`--immutable`) on the surface tile groups.
  - Correct the stale "edge-caches nothing" note: `.bin` now comes back MISS then HIT.
    This spec's edge facts rely on that.
- **`docs/DESKTOP.md` (kiosk branch):** the server answers Range.

## Left to the builder

- Test placement and names, within testing.md. They must cover:
  - the format round trip, including a 6 B key at z19 and a part split exactly at
    64 MiB
  - the source: an absent tile makes no request, a 200 gives `null` plus one warn, an
    index 404 means an empty level, an index network error retries
  - `byteRangeOf`'s cases
  - `collectSurfaceTiles` reading from the manifest, and a missing part
- How the loadtime harness spots tile responses. It must count both the loose and the
  archive URL shapes, so the before and after runs compare.
