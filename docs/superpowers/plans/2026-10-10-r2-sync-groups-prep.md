# R2 data-family sync groups — prep P3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two hand regex lists (`allowDataFile.ts:31-56`, `shouldGzipOnWire.ts:15-17`) with one declarative table of data families, and give every sync group a `gzipOnWire` flag that both transports honour. Behaviour-neutral: every object keeps its current R2 key, `Cache-Control`, purge and `Content-Encoding`.

**Architecture:**

- `DATA_FAMILIES` lists one row per `public/data/` family: `{ label, dir, fileName, transport, gzipOnWire }`. `allowDataFile` becomes "a family row with `transport: 'wrangler'` claims this path". `shouldGzipOnWire` is deleted.
- The single `public/data` sync group (`syncR2.ts:50-58`) splits into one group per family row. Each group carries that row's `gzipOnWire`, plus today's `IMMUTABLE` and `purge: false`: every family file is content-addressed.
- `R2SyncGroup` gains `gzipOnWire: boolean`, and every other group states today's value. `uploadViaWrangler` and `localUploadHash` read the group flag instead of the path. `uploadViaRclone` gzips into a staging tree and sends `Content-Encoding: gzip` when the flag is set.
- The `stars-*` and `flowfield*` opt-outs stop being exceptions. They become `gzipOnWire: false` on their own rows.
- `npm run sync-r2 -- --dry-run` prints the per-object policy. That listing is how neutrality gets proved.

**Tech stack:** TS (tools tsconfig), Vitest, rclone 1.73 (S3 backend), wrangler.

**Spec:** [`docs/superpowers/specs/2026-10-10-chunked-star-octree-design.md`](../specs/2026-10-10-chunked-star-octree-design.md), §7 (Deploy) and §8.3 (P3).

## Global constraints

- Behaviour-neutral. The Task 1 baseline listing and the post-Task 4 listing must be byte-identical. No new data family lands in this PR. The `star-catalog/v2` rows belong to the feature.
- Own PR off `main`, landing before any feature commit (spec §8.3). Read `docs/DEPLOY.md` before starting.
- **Never run a real sync** (`npm run sync-r2`, `sync-r2-secure`) from this plan. The only write to the bucket is the Task 5 probe, and it runs only after the user says go.
- `type` aliases, never `interface`. One type per `@types/` file (`.d.ts`, filename = type), one function per `utils`-style file, no barrels.
- File moves use `npm run move-files` (manifest form, `--dry` first), never `git mv`. Deletions of a one-symbol file use `npm run refactor -- delete <file>#<symbol>` once it has no references.
- Comments explain why, never what: module header ≤ 10 lines, comment lines ≤ half the code lines. Rationale that lives in a deleted file moves to where its value now lives. Never narrate the refactor.
- Each task is its own commit. Format with `npx prettier --write <files>`, never `npm run format`. Stage by path, never `git add -A`. No `Co-Authored-By` lines.

## Review focus

1. **Encoding and ETag agree (Task 4).** `localUploadHash` and `uploadViaWrangler` must read the same group flag. If the hash flag is wrong, the file re-uploads on every run. If the upload flag is wrong, R2 holds raw bytes labelled gzip, or gzip bytes labelled raw. Both are invisible to CI.
2. **The partition drops nothing (Task 4).** Every `manifest.json` value lands in exactly one family group. A value no row claims must throw before any byte moves, never be skipped silently. Today such a value would still upload.
3. **The tracked set is unchanged (Task 3).** `allowDataFile` decides what `buildDataManifest` renames and deletes in place (`buildDataManifest.ts:91,105-117`). A broader predicate would hash-rename DisPerSE inputs such as `glade.bin`.
4. **Bulk gzip bytes and header travel together (Task 5).** The staged tree holds the gzipped bytes, `Content-Encoding: gzip` goes on the same `rclone copy`, and the staged mtimes copy the sources so rclone's next-run diff stays a no-op.

## Today's values: the neutrality table

Every row below must come out of the Task 4 dry-run listing exactly as written. `IMMUTABLE` = `public, max-age=31536000, immutable`, `DAY` = `public, max-age=86400`, `NO_CACHE` = `public, max-age=0, must-revalidate` (`syncR2.ts:39-43`). Today's gzip decision is `shouldGzipOnWire(localPath)` on the wrangler path. The bulk path never gzips (`uploadViaRclone.ts:36-53`).

| Group (today)                                             | R2 key                                                                                | Transport | Cache-Control | Purge | Gzip today                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------- | ------------- | ----- | ---------------------------------------------------------------------- |
| `public/data`: galaxy catalog                             | `data/<hashed rel>`                                                                   | wrangler  | IMMUTABLE     | no    | **yes**                                                                |
| `public/data`: `stars-{s,m,l}.bin` (v1)                   | `data/<hashed rel>`                                                                   | wrangler  | IMMUTABLE     | no    | **no** (opt-out)                                                       |
| `public/data`: scalar fields except flowfield             | `data/<hashed rel>`                                                                   | wrangler  | IMMUTABLE     | no    | **yes**                                                                |
| `public/data`: `flowfield.scfd`                           | `data/<hashed rel>`                                                                   | wrangler  | IMMUTABLE     | no    | **no** (opt-out)                                                       |
| `public/data`: filaments                                  | `data/<hashed rel>`                                                                   | wrangler  | IMMUTABLE     | no    | **yes**                                                                |
| `public/data`: structure catalog                          | `data/<hashed rel>`                                                                   | wrangler  | IMMUTABLE     | no    | **yes** (`.ccat`, `.json`)                                             |
| `public/data`: `local-bubble.shell`                       | `data/<hashed rel>`                                                                   | wrangler  | IMMUTABLE     | no    | **no** (`.shell` is outside the extension rule)                        |
| `public/data`: root JSON sidecars                         | `data/<hashed rel>`                                                                   | wrangler  | IMMUTABLE     | no    | **yes**                                                                |
| `public/data`: `meshes/*.mesh`                            | `data/<hashed rel>`                                                                   | wrangler  | IMMUTABLE     | no    | **yes**                                                                |
| `public/data`: `meshes/*_{albedo,mr,normal,contact}.webp` | `data/<hashed rel>`                                                                   | wrangler  | IMMUTABLE     | no    | **no**                                                                 |
| Hi-res famous-galaxy images                               | `data/images/famous-hires/<f>.webp`                                                   | wrangler  | DAY           | yes   | no                                                                     |
| Planet-surface textures                                   | `data/images/textures/<f>`                                                            | wrangler  | DAY           | yes   | no (`.jpg`/`.webp`)                                                    |
| Extra files                                               | `robots.txt`, `data/hyperleda_pa.csv.gz`, `data/raw/cf4/*.npy`, `data/raw/mcpm/*.npy` | wrangler  | DAY           | yes   | no                                                                     |
| Mesh sources                                              | `data/raw/meshes/<rel>`                                                               | wrangler  | NO_CACHE      | no    | no (today's set is `.blend`/`.glb`/`.zip`, none in the extension rule) |
| Surface tiles (`earth`, `mars`)                           | `data/images/<index line>`                                                            | bulk      | IMMUTABLE     | no    | no                                                                     |
| Surface tile manifest (`earth`, `mars`)                   | `data/images/<key>/manifest.json`                                                     | wrangler  | DAY           | yes   | **yes** (`.json`)                                                      |
| Data manifest                                             | `data/manifest.json`                                                                  | wrangler  | NO_CACHE      | yes   | **yes** (`.json`)                                                      |

The two manifest rows are the trap. They gzip today only because `.json` matched the extension rule, so their groups must state `gzipOnWire: true` explicitly.

---

### Task 1: `--dry-run` listing and the baseline

**Files:** `tools/deploy/syncR2.ts`, `tools/deploy/r2/formatDryRunListing.ts` (new)

**Contract:**

```ts
// tools/deploy/r2/formatDryRunListing.ts — one line per file, sorted by r2Key:
// `${r2Key}\t${transport.kind}\t${cacheControl}\tpurge=${purge}\tgzip=${gzip}`
export function formatDryRunListing(groups: readonly R2SyncGroup[]): string[];
```

- [x] `main()` (`syncR2.ts:129`) checks `process.argv.includes('--dry-run')` (the pattern at `tools/fetch/fetchPrebuiltData.ts:63`). When it is set, `main()` prints the listing and returns after `buildGroups()`, before the credentials preflight (`:137-142`) and before any network call.
- [x] For now the gzip column is `transport.kind === 'wrangler' && shouldGzipOnWire(localPath)`. Task 4 switches it to the group flag. The output format never changes after this task.
- [x] No test. The listing is the neutrality instrument, and the Task 4 diff exercises it.
- [x] Capture the baseline: `npm run sync-r2 -- --dry-run > <scratchpad>/r2-baseline.txt`, run in this worktree. `public/data` is linked to the main checkout's tree, and `data/raw/meshes/meshes.sha256` must exist. If the `collectDataFiles` drift guard throws, stop and report. Do not run `build-data-manifest` against a linked tree. Keep the file outside the repo, and report its line count and the per-gzip-value counts.
- [x] Commit.

### Task 2: Deploy types into `tools/deploy/@types/`

**Files:** `tools/deploy/r2/R2SyncGroup.ts`, `R2Transport.ts`, `R2Upload.ts`, `CachePurgeFile.ts` → `tools/deploy/@types/<Name>.d.ts`, plus every importer the tool rewrites

- [x] One manifest move: `npm run move-files -- --manifest <moves.json> --dry`, then without `--dry`. The manifest has four `{ from: 'tools/deploy/r2/<Name>.ts', to: 'tools/deploy/@types/<Name>.d.ts' }` entries. Then grep `tools/` and `tests/` for `r2/R2SyncGroup`, `r2/R2Transport`, `r2/R2Upload` and `r2/CachePurgeFile` to catch string-literal paths.
- [x] The inline types in `syncGroup.ts:11-27` and `rcloneEnv.ts:14-18` stay put (out of scope).
- [x] No test: a pure move.
- [x] Commit.

### Task 3: The data-family table — `review: yes`

**Files:** `tools/deploy/@types/DataFamily.d.ts` (new), `tools/deploy/r2/dataFamilies.ts` (new), `tools/deploy/r2/dataFamilyOf.ts` (new), `tools/deploy/r2/allowDataFile.ts`, `tests/tools/deploy/r2/dataFamilyOf.test.ts` (new), `tests/tools/deploy/r2/allowDataFile.test.ts` (delete)

**Contract:**

```ts
// tools/deploy/@types/DataFamily.d.ts
export type DataFamily = {
  readonly label: string;
  /** Parent folder the file must sit in, exactly or as a trailing `/<dir>`; null = any depth. */
  readonly dir: string | null;
  /** Tested against `logicalDataName(basename)`, so hashed and logical names match alike. */
  readonly fileName: RegExp;
  /** 'wrangler' rows are manifest-tracked (hashed by buildDataManifest); 'bulk' rows are self-keyed trees. */
  readonly transport: R2Transport['kind'];
  readonly gzipOnWire: boolean;
};
// tools/deploy/r2/dataFamilies.ts
export const DATA_FAMILIES: readonly DataFamily[];
// tools/deploy/r2/dataFamilyOf.ts — path relative to public/data/; first matching row wins
export function dataFamilyOf(dataRelPath: string): DataFamily | null;
// tools/deploy/r2/allowDataFile.ts — same signature, body becomes the derivation
export const allowDataFile: (path: string) => boolean; // dataFamilyOf(path)?.transport === 'wrangler'
```

The rows split today's alternatives (`allowDataFile.ts:19-20,31-56`) by gzip outcome. Every row is `transport: 'wrangler'`, and the regexes keep today's alternatives verbatim:

| `label`             | `dir`      | `fileName` covers                                                                                              | `gzipOnWire` |
| ------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- | ------------ |
| `galaxy-catalog`    | null       | `(sdss\|glade\|milliquas)-(small\|medium\|large).bin`, `2mrs.bin`, `famous.bin`, `desi-(deep\|wedge\|sgw).bin` | true         |
| `star-catalog-v1`   | null       | `stars-(small\|medium\|large).bin`                                                                             | false        |
| `scalar-field`      | null       | `(mcpm\|polyphorm-2mrs\|edenhofer-dust)-(small\|medium\|large).scfd`, `mcpm-workbench.scfd`                    | true         |
| `flowfield`         | null       | `flowfield.scfd`                                                                                               | false        |
| `filament`          | null       | `filaments.bin`, `filaments-small.bin`                                                                         | true         |
| `structure-catalog` | null       | `structures.ccat`, `structures_meta.json`                                                                      | true         |
| `local-bubble`      | null       | `local-bubble.shell`                                                                                           | false        |
| `sidecar-json`      | null       | `famous_galaxies_meta.json`, `famous_stars_meta.json`, `constellations.json`, `pgc_aliases.json`               | true         |
| `mesh-body`         | `'meshes'` | `^[a-z0-9-]+\.mesh$`                                                                                           | true         |
| `mesh-texture`      | `'meshes'` | `^[a-z0-9-]+_(?:albedo\|mr\|normal\|contact)\.webp$`                                                           | false        |

- [x] `dataFamilyOf` takes over `allowDataFile.ts:22-29`: the `images/` exclusion, the backslash normalisation, `logicalDataName`, and the dir test, which is today's `meshes` rule generalised to `row.dir`. `allowDataFile` keeps its name and its two callers (`buildDataManifest.ts:91`, `collectDataFiles.ts:41`). Its module comment shrinks to point at `DATA_FAMILIES`.
- [x] Move the measured-ratio rationale from `shouldGzipOnWire.ts:3-12` onto the rows: the yes-ratios go in the table's header comment, and the "~99% / ~90%, already packed" reasons go on the `star-catalog-v1` and `flowfield` rows. The `local-bubble` row gets one line saying `.shell` was never eligible. The DESI and `filaments-small` comments (`allowDataFile.ts:40-41,46`) move onto their rows. `shouldGzipOnWire.ts` itself is deleted in Task 4.
- [x] Add `dataFamilyOf.test.ts`. It is a fixture of `path → { label, transport, gzipOnWire } | null`, run through `it.each` in two tests:
  - `every tracked file maps to its family with today's transport and encoding`. For each row: one logical name, one hashed name (`<name>.a3f19c2e.<ext>`), and one nested epoch path (`galaxy-catalog/v9/…`, `star-catalog/v1/…`, `scalar-field/v3/…`, `meshes/whale-small.a3f19c2e.mesh`, `meshes/whale-small_albedo.a3f19c2e.webp`, `meshes/mer_contact.webp`).
  - `untracked files map to no family`: every negative from `allowDataFile.test.ts:11-66` (`glade.bin`, `sdss.bin`, `sdss.a3f19c2e.bin`, `flowfield-large.scfd`, `flowfield.bin`, the three `desi-*-large.bin`, `stars-huge.bin`, `images/famous/x.webp`, `whale.mesh`, `other/whale_albedo.webp`, `meshes/whale_thumbnail.webp`), plus `thumb.jpg` and `manifest.json`.
- [x] Prove the gzip column before deleting anything. Run the fixture's positive paths through today's `shouldGzipOnWire` once, in a scratch script, and confirm every value matches the column. Report the result.
- [x] Delete `allowDataFile.test.ts`. Every case now lives in the fixture.
- [x] Commit.

### Task 4: Group-level `gzipOnWire`, per-family groups — `review: yes`

**Files:** `tools/deploy/@types/R2SyncGroup.d.ts`, `tools/deploy/syncR2.ts`, `tools/deploy/r2/groupByDataFamily.ts` (new), `tools/deploy/r2/syncGroup.ts`, `tools/deploy/r2/uploadViaWrangler.ts`, `tools/deploy/r2/localUploadHash.ts`, `tools/deploy/r2/formatDryRunListing.ts`, `tools/utils/serve/serveGzipped.ts`, `tools/deploy/r2/shouldGzipOnWire.ts` (delete), `tests/tools/deploy/r2/shouldGzipOnWire.test.ts` (delete), `tests/tools/deploy/r2/localUploadHash.test.ts`, `docs/DEPLOY.md`

**Contract:**

```ts
// R2SyncGroup gains
readonly gzipOnWire: boolean;
// tools/deploy/r2/groupByDataFamily.ts — key `data/<rel>` → family of `<rel>`; throws on a file no row claims
export function groupByDataFamily(
  files: readonly R2Upload[],
): ReadonlyMap<DataFamily, readonly R2Upload[]>;
// signature changes
uploadViaWrangler(file: R2Upload, bucket: string, cacheControl: string, gzipOnWire: boolean): void;
localUploadHash(file: R2Upload, gzipOnWire: boolean): string;
```

- [x] `buildGroups()` (`syncR2.ts:48-127`): call `collectDataFiles(DATA_DIR)` once, then emit one group per family that holds files, in `DATA_FAMILIES` order, at the old `public/data` group's position. Each group gets `label: 'public/data: <label>'`, `transport: { kind: 'wrangler' }`, `cacheControl: IMMUTABLE`, `purge: false` and the row's `gzipOnWire`. Keep the immutable/no-purge comment (`:54-55`) above the mapping.
- [x] Every other group states `gzipOnWire` with the neutrality-table value: `false` for hi-res, textures, extra files, mesh sources and surface tiles, and `true` for each surface-tile manifest group and for the data manifest group. Give the two `true` lines one short comment: these manifests are JSON, and gzip shrinks them.
- [x] `syncGroup.ts:73` passes `group.gzipOnWire` to `uploadViaWrangler`. `syncGroup.ts:68` passes it to `localUploadHash`. Both functions stop importing `shouldGzipOnWire`, and their docblocks (`uploadViaWrangler.ts:30-34`, `localUploadHash.ts:8-14`) say "the group's flag".
- [x] `serveGzipped.ts:54`: a request under `/data/` gzips when `dataFamilyOf(<path after /data/>)?.gzipOnWire` is true. Add `.json` to `TEXT_EXTENSIONS` (`:25`), so both manifest kinds and every other JSON stay gzipped as they are today. Accepted residual: untracked `.bin`/`.scfd` files under `data/` (`glade.bin`, `sdss.bin`, `filaments-sdss.bin`, `spacecraftTracks.bin`) are now served raw. The runtime fetches none of them; confirm that with a grep of `src/` and report.
- [x] `formatDryRunListing` reads `group.gzipOnWire`.
- [x] `localUploadHash.test.ts:28-43`: the two cases pass the flag (`true` / `false`) instead of relying on the filename; rename the second to `hashes the raw bytes when the group does not gzip`. Its guard (hash the bytes R2 stores) stays the point of the test.
- [x] Delete `shouldGzipOnWire.ts` with `npm run refactor -- delete tools/deploy/r2/shouldGzipOnWire.ts#shouldGzipOnWire` once it has no references. Delete its test too: its cases already live in the Task 3 fixture.
- [x] `docs/DEPLOY.md`: in `:20`, the meshes ride their own family groups, tracked by `DATA_FAMILIES`. In "R2 sync architecture" (`:30`), add one sentence on family groups and the group-level `gzipOnWire`. In "Wire compression" (`:76`), make `DATA_FAMILIES` plus each group's `gzipOnWire` the source of truth, replacing `shouldGzipOnWire.ts`.
- [x] No new test: the partition throw is one branch that review covers, and the dry-run diff proves the rest.
- [x] **Neutrality gate:** `npm run sync-r2 -- --dry-run > <scratchpad>/r2-after.txt` and `diff` it against the Task 1 baseline. The diff must be empty. Any difference halts the plan; report it, and do not edit the baseline.
- [x] Commit.

### Task 5: The bulk transport honours `gzipOnWire` — `review: yes`

**Files:** `tools/deploy/r2/uploadViaRclone.ts`, `docs/DEPLOY.md`

**rclone and Content-Encoding (verified 2026-10-11).** rclone can set the header but never compresses. `--header-upload` sets S3 system metadata on upload. R2's PutObject accepts `Content-Encoding` (Cloudflare R2 S3-compatibility table). rclone's S3 docs list `content-encoding` as writable system metadata. The bytes must already be gzipped. The rclone R2 section warns: "Cloudflare decompresses files uploaded with Content-Encoding: gzip by default … upload the files with `--header-upload "Cache-Control: no-transform"`". Production already serves wrangler-uploaded gzip objects correctly to browsers, which send `Accept-Encoding: gzip`. So this plan does not add `no-transform` up front. The probe below decides.

- [ ] When `group.gzipOnWire` is set, `uploadViaRclone` (`:23-57`) writes `gzipSync(bytes)` for each file to `<staging>/<relative(localRoot, localPath)>` in a `mkdtemp` tree, creating parent dirs. It copies each source's atime/mtime onto the staged file with `utimesSync`. Then it runs `rclone copy <staging> …` with the same `--files-from` list and one extra `--header-upload 'Content-Encoding: gzip'`. The `finally` removes the staging tree with the list dir. When the flag is unset, behaviour stays exactly as today.
- [ ] Explain why mtimes are copied in one comment line. Fresh mtimes make rclone re-hash every object on every run and server-side-copy each one to rewrite `X-Amz-Meta-Mtime` (rclone S3 docs, "Modification times").
- [ ] No unit test: the bug class is "header and bytes disagree on the real bucket", which only the probe sees.
- [ ] **Probe. Ask the user first:** it writes one object to the production bucket and deletes it. On a go:
  - [ ] From a scratch script outside the repo, call `uploadViaRclone` for one group: `bulk`, `keyRoot: 'data/_probe'`, `cacheControl: NO_CACHE`, `purge: false`, `gzipOnWire: true`, holding one ~1 MB compressible file. Load the R2 S3 credentials the way `syncR2Secure.sh` does.
  - [ ] rclone exits 0, with no `corrupted on transfer` or `sizes differ` line.
  - [ ] `curl -sI -H 'Accept-Encoding: gzip' <VITE_DATA_BASE_URL>/data/_probe/<f>` shows `content-encoding: gzip`, and the content length is the gzipped size.
  - [ ] `curl -s --compressed <url> | cmp - <original>` reports the bytes equal.
  - [ ] A second identical call reports nothing transferred.
  - [ ] `rclone deletefile r2:skymap-data/data/_probe/<f>`.
  - [ ] If any check fails, stop and report which one. The documented candidates are `Cache-Control: no-transform` and `--s3-might-gzip`, but do not apply either without the user's ruling. If the user declines the probe, it becomes the first step of the feature PR's first sync. Note that in the report.
- [ ] `docs/DEPLOY.md`, "R2 sync architecture", bullet on `bulk` (`:36`): one sentence on gzip-on-wire by staging, with the probe outcome.
- [ ] The dry-run listing is unchanged (no bulk group sets the flag yet).
- [ ] Commit.

## Definition of Done

**Deliverables**

- `tools/deploy/@types/DataFamily.d.ts`. `R2SyncGroup`, `R2Transport`, `R2Upload` and `CachePurgeFile` live under `tools/deploy/@types/`.
- `DATA_FAMILIES` (10 rows, all `wrangler`), `dataFamilyOf`, `groupByDataFamily`, and `allowDataFile` as a one-line derivation.
- `R2SyncGroup.gzipOnWire`, stated on every group in `buildGroups()`. `uploadViaWrangler` and `localUploadHash` take the flag. `uploadViaRclone` stages gzip and sends `Content-Encoding: gzip`.
- `npm run sync-r2 -- --dry-run` and `formatDryRunListing`.
- `tests/tools/deploy/r2/dataFamilyOf.test.ts`; `localUploadHash.test.ts` passes the flag. Deleted: `shouldGzipOnWire.ts`, `shouldGzipOnWire.test.ts`, `allowDataFile.test.ts`.
- No `stars-` or `flowfield` regex remains under `tools/deploy/`. They exist only as `DATA_FAMILIES` rows.

**Observable behaviours (the smoke)**

- `diff <scratchpad>/r2-baseline.txt <(npm run sync-r2 -- --dry-run)` is empty. Every row of the neutrality table appears with its key, transport, `Cache-Control`, purge and gzip unchanged.
- `npm run build-data-manifest` on a non-linked `public/data` tree reports `0 renamed, 0 removed`.
- `npm run loadtime` still reports every catalog download at its gzipped size: the `serveGzipped` path is unchanged for fetched files.
- Probe result (Task 5): `content-encoding: gzip` on a bulk-uploaded object, bytes round-trip, the second run is a no-op. Otherwise there is a recorded user ruling deferring the probe to the feature's first sync.

**Out of scope**

- The `star-catalog/v2` rows: chunks (`dir: 'star-catalog/v2'`, `bulk`, `gzipOnWire: true`) and the index (`wrangler`). Their collector, and the bulk-family group wiring in `buildGroups()`, ordered before the data manifest (spec §7). All of this lands with the feature.
- Tightening `dir: null` rows to their epoch prefixes (`GALAXY_CATALOG_DATA_PREFIX` and kin). That would change the predicate for stray root-level files.
- Inline types in `syncGroup.ts` and `rcloneEnv.ts`. R2 pruning of superseded objects. Any `Cache-Control` change.
- A deletion audit (it runs once, at the feature's `/feature-done`).
