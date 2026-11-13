# Live datasets: implementation plan

Spec: [`docs/superpowers/specs/2026-11-13-live-datasets-design.md`](../specs/2026-11-13-live-datasets-design.md)

Three PRs, each its own branch off `main`:

| Phase | Branch | Tasks | Depends on |
|---|---|---|---|
| A: cloud format | `live-clouds-grey` | 1–5 | — |
| B: shared pipeline, satellites | `live-datasets-pipeline` | 6–10 | — (parallel to A) |
| C: daily clouds | `live-clouds-daily` | 11–15 | A and B merged |

Global constraints:

- Follow CLAUDE.md conventions: one symbol per file in `utils/` and `@types/`, `type` not `interface`, the comment budget, `npm run move-files` / `npm run refactor` for moves and renames.
- Never `git add -A`. Commits carry no Co-Authored-By trailer.
- Exact names below are the contract. Implementation bodies are yours.

## Phase A: clouds become one grey channel

### Task 1: `writeCloudTier` writes a grey lossy WebP

**Files:** `tools/textures/writeCloudTier.ts`, `tests/tools/textures/writeCloudTier.test.ts`

- Signature unchanged: `writeCloudTier(srcPath: string, widthPx: number, outPath: string): Promise<void>`.
- Output: one grey channel (`sharp(...).greyscale()`), resized width-only, never upscaled, written as lossy WebP at quality 80, the same quality as `tools/cloud-bake-rs` (`WEBP_QUALITY`).
- The source's grey is the coverage. Drop the alpha derivation. Rewrite the module header: the why is "one channel, shared with the daily bake's output format".
- Test (replace the RGBA assertions): `it('writes a single grey channel at the tier width')`. Read the output back with sharp and assert `width === tierPx`, `height === tierPx / 2`, and that the pixels are grey (r == g == b for every sampled pixel). A known bright source pixel stays bright and a black one stays 0, within ±3 for the lossy encode.

### Task 2: cloud filenames and the kind rule

**Files:** `src/utils/bodyTextures/bodyTextureFilename.ts`, `src/utils/bodyTextures/isAlphaTextureKind.ts` (renamed), `tests/utils/bodyTextures/bodyTextureFilename.test.ts`, and every caller the rename finds.

- Rename `isAlphaTextureKind` to `isGreyTextureKind` with `npm run refactor -- rename isAlphaTextureKind isGreyTextureKind`. Use `npm run move-files -- src/utils/bodyTextures/isAlphaTextureKind.ts src/utils/bodyTextures/isGreyTextureKind.ts` for the file. The meaning becomes "one grey channel, sampled raw".
- `bodyTextureFilename('earth', 'clouds', tier)` returns `earth-clouds-grey-<px>.webp`. The new names keep old app code and new files apart.
- Test: update the clouds expectation to `earth-clouds-grey-8192.webp`; the other kinds stay as they are.
- `git grep -n "earth-clouds-"` and update the non-import references the grep finds, such as `data/raw/textures/README.md`. Website copy that names the file, not the map, is the only kind to change.

### Task 3: one GPU format per kind; raw decode for grey

**review: yes**

**Files:** new `src/utils/bodyTextures/bodyTextureFormat.ts`, `src/layers/body/earth/render/earthRenderer.ts` (setMap, ~:269), `src/layers/body/clouds/render/cloudShellRenderer.ts` (setTexture, ~:196), `src/layers/body/textures/load/bodyTextureFetcher.ts` (~:32)

```ts
export function bodyTextureFormat(kind: TextureKind): GPUTextureFormat;
// 'clouds' -> 'r8unorm'; linear kinds -> 'rgba8unorm'; colour kinds -> 'rgba8unorm-srgb'
```

- Both renderers take their format from it. `cloudShellRenderer.setTexture` gets the kind it uploads, or calls `bodyTextureFormat('clouds')`.
- Check that every upload path still works with `r8unorm`: `copyExternalImageToTexture` into `r8unorm` copies the red channel, and `generateMipChain` already renders in `texture.format`.
- The placeholders (`earthRenderer.ts:48`, `cloudShellRenderer.ts:87-97`) stay "no cloud": a 1×1 `r8unorm` placeholder holding 0.
- Fetcher: grey kinds decode with `colorSpaceConversion: 'none'`, like linear kinds, so the bytes reach the shader untouched.
- No new test: the mapping is three lines, and a wrong format fails loudly at WebGPU validation.

### Task 4: shaders read coverage from `.r`

**review: yes**

**Files:** `src/services/gpu/shaders/bodies/cloudShell/fragment.wesl` (:85, :96 and the header), `src/services/gpu/shaders/bodies/earth/fragment.wesl` (:131, :143 and the header lines 13, 15), `src/services/gpu/shaders/bodies/surfaceTile/fragmentEarth.wesl` (:71, :85)

- Coverage: `.a` → `.r` at the four earth and surface-tile reads.
- Shell, before and after:

  ```wgsl
  // before: return vec4<f32>(c.rgb * lit, c.a * u.cloudOpacity);
  // after:  let v = c.r; return vec4<f32>(vec3<f32>(srgbToLinear(v)) * lit, v * u.cloudOpacity);
  ```

  The RGB used to be the sRGB grey that the `-srgb` format linearised, and the coverage was the raw byte. This reproduces both exactly.
- Reuse an existing sRGB→linear function from the shader lib if there is one (grep `shaders/lib`); otherwise add one there. Read the `wesl-shaders` skill first.

### Task 5: rebuild the built-in tiers and check them

**Files:** none in git (built files in `public/data/images/textures/` are gitignored). Run this in the main checkout's data, or link the worktree's data with `/link-data`.

- `npm run build-textures` for Earth's clouds writes `earth-clouds-grey-{2048,4096,8192}.webp`. Expect the 8192 tier at about 6 MB.
- Visual check against `main`, same deep link, both builds: the cloud deck, ground shadows on a cloudy region, and night lights under cloud. Shoot them with `npm run shot` and send them to the owner as dash checks.
- `npm run perf -- --url <this worktree's server>` before and after: the cloud texture's GPU bytes drop by about 4×; no frame-time regression.
- **The owner runs `npm run sync-r2-secure` before PR A merges.** The merge auto-deploys the app (Workers Builds), and the new filenames must already be on R2.

## Phase B: the shared pipeline, satellites first

### Task 6: registry, types, paths

**Files:** new `src/@types/live/LiveDataset.d.ts`, `src/@types/live/LiveFile.d.ts`, `src/@types/live/LivePointer.d.ts`, `src/data/live/liveDatasets.ts`, `src/utils/live/livePointerPath.ts`, `src/utils/live/liveFilePath.ts`

```ts
type LiveFile = { name: string; contentType: string; gzip: boolean };
type LiveDataset = {
  id: string;                          // R2 folder; 'satellites' now, 'clouds' in phase C
  build: string;                       // npm script; writes the live layout under public/data, exits non-zero on bad data
  files: readonly LiveFile[];
  timeoutMin: number;
  caches?: readonly { paths: readonly string[]; key: string }[]; // CI caches for this leg (phase C)
  bodyTexture?: { bodyId: BodyTextureId; kind: TextureKind; fileByTierPx: Readonly<Record<number, string>> }; // phase C
};
type LivePointer = { date: string; builtAt: string; files: Readonly<Record<string, string>> }; // name -> data-relative key

livePointerPath(id: string): string;                          // 'live/v1/<id>.json'
liveFilePath(id: string, date: string, name: string): string; // 'live/v1/files/<id>/<date>/<name>'
```

- Paths are relative to `data/`, the same convention `dataUrl` takes.
- One row: `{ id: 'satellites', build: 'build-satellites', files: [{ name: 'satellites.satg', contentType: 'application/octet-stream', gzip: true }], timeoutMin: 20 }`.
- No test: these are types and string joins.

### Task 7: build writes the live layout; one pointer writer

**Files:** new `tools/utils/live/writeLivePointer.ts`, `tools/satellites/buildSatellites.ts`

```ts
export function writeLivePointer(root: string, id: string, date: string, names: readonly string[]): void;
// writes <root>/<livePointerPath(id)> = LivePointer with builtAt = now
```

- `buildSatellites` writes `public/data/<liveFilePath('satellites', date, 'satellites.satg')>`, with `date` = today UTC, then calls `writeLivePointer(join(PROJECT_ROOT, 'public/data'), 'satellites', date, ['satellites.satg'])`.
- The existing 15 000-object floor throws first, so no pointer is written.
- Test: `it('names each file under the dated folder')`. Assert the pointer's `files.satellites.satg` equals `liveFilePath('satellites', date, 'satellites.satg')` and `date` is the given date.

### Task 8: the app reads satellites through the pointer

**review: yes**

**Files:** new `src/services/loading/fetchLiveFile.ts`, `src/layers/satellites/catalog/load/satellitesSlot.ts`, `src/data/satellites/satelliteCatalogPath.ts` (deleted)

```ts
export function fetchLiveFile(
  id: string, name: string, signal: AbortSignal, onProgress?: (p: number) => void,
): Promise<ArrayBuffer>;
// fetch dataUrl(livePointerPath(id)) with cache: 'no-cache', then dataUrl(pointer.files[name]) via fetchWithProgress
```

- `satellitesSlot` calls `fetchLiveFile('satellites', 'satellites.satg', signal, onProgress)`.
- Delete `SATELLITE_CATALOG_PATH` with `npm run refactor -- delete SATELLITE_CATALOG_PATH` after the last caller is gone.
- Tests:
  - `it('fetches the file the pointer names')`
  - `it('rejects when the pointer lacks the file')`
  - `it('rejects when the named file 404s')`

  Stub `fetch`. Each rejection is an Error naming the URL.

### Task 9: one shared workflow

**Files:** new `.github/workflows/live-datasets.yml`, `.github/workflows/live-dataset.yml`, `tools/live/printLiveMatrix.ts`, `tools/live/writePublishList.ts`, `package.json` (scripts `live-matrix`, `live-publish-list`); delete `.github/workflows/satellites.yml`

- **`live-datasets.yml`**
  - Triggers: cron `23 4 * * *` and `workflow_dispatch`.
  - `plan` job: checkout, setup-node, `npm ci`, then `npm run -s live-matrix`, which prints JSON `[{ id, build, timeoutMin, caches }]` to `$GITHUB_OUTPUT`.
  - `run` job: `strategy.matrix.dataset: ${{ fromJson(needs.plan.outputs.matrix) }}` with `fail-fast: false`; `uses: ./.github/workflows/live-dataset.yml`, `secrets: inherit`.
  - `concurrency: live-datasets`, no cancel.
- **`live-dataset.yml`** (`workflow_call`)
  - **`build` job** (no secrets): checkout, setup-node, `npm ci`, one `actions/cache` step per `caches` entry, then `npm run <build>`. Then `npm run -s live-publish-list -- <id>`, which writes `publish.json`. Upload `public/data/live/` plus `publish.json` as an artifact.
  - **`upload` job** (`needs: build`, no checkout, no npm): download the artifact. For each `publish.json` entry in order, `aws s3 cp` with its key, Content-Type and Cache-Control, gzipped first where `gzip`. Same three secrets and endpoint as `satellites.yml:77-88`.
- `writePublishList(id, root)` returns entries ordered so that every dated file comes before the pointer.
  - Dated files: `Cache-Control: public, max-age=31536000, immutable`.
  - Pointer: `no-cache`, `application/json`.
- Tests on `writePublishList`:
  - `it('puts the pointer last')`
  - `it('marks dated files immutable and the pointer no-cache')`
  - `it('fails when a file the pointer names is missing')`

### Task 10: docs and owner steps

**Files:** `docs/DEPLOY.md` (replace "Satellite catalog" with "Live datasets"), `docs/DATA.md` (:49, :289), `tools/satellites/` README if it names the old path

- DEPLOY.md: the layout, the two workflows, the secrets (unchanged), and the lifecycle command `npx wrangler r2 bucket lifecycle add skymap-data live-files-expire-30d data/live/v1/files/ --expire-days 30`. Add a note: the old `data/satellite-catalog/v1/satellites.satg` is no longer written; old tabs fade it out after 14 days; delete it after that.
- Owner steps after merge, in the PR body: apply the lifecycle rule, run the workflow once by hand and confirm the pointer and file are live, and in 14 days delete the old key.

## Phase C: daily clouds

### Task 11: `build-live-clouds`

**Files:** new `tools/clouds/buildLiveClouds.ts`, new `tools/clouds/checkCloudTier.ts`, `package.json` (script `build-live-clouds`), `src/data/live/liveDatasets.ts` (clouds row)

- Flow:
  1. Run `bake-clouds` for yesterday UTC into a temp file. A non-zero exit passes through as the script's exit code.
  2. Run `writeCloudTier` for 8192, 4096 and 2048 into `public/data/<liveFilePath('clouds', date, 'earth-clouds-grey-<px>.webp')>`.
  3. Check each tier with `checkCloudTier`.
  4. Call `writeLivePointer`.
- `checkCloudTier(path: string, tierPx: number): Promise<void>` throws unless the file is `tierPx × tierPx/2` and grey.
- The clouds row: three `files` (`image/webp`, `gzip: false`), `timeoutMin: 45`, and `bodyTexture: { bodyId: 'earth', kind: 'clouds', fileByTierPx: { 2048: …, 4096: …, 8192: … } }`.
- Its `caches`:
  - `tools/cloud-bake-rs/target` + `~/.cargo/registry`, keyed on `tools/cloud-bake-rs/Cargo.lock`;
  - `data/raw/textures`, keyed on `data/raw/textures/textures.sha256`.
- Before the bake, `buildLiveClouds` runs `fetch-cloud-inputs -- --confirm` (a no-op when the cache hit).
- Tests:
  - `it('rejects a tier with the wrong dimensions')`
  - `it('rejects a colour image')`

### Task 12: the clouds leg runs on CI

**Files:** `.github/workflows/live-dataset.yml` only if the clouds leg needs something generic (for example `apt-get install nasm` as a row field). Otherwise none.

- Run the workflow by `workflow_dispatch` from the branch with the clouds row. Confirm both legs build. Upload succeeds only once the R2 token is there; it is the same token.
- Record the leg's wall time and peak memory (`/usr/bin/time -v`).
- If the leg exceeds the standard runner, stop and report. Don't add a larger runner without the owner's yes.

### Task 13: the clouds slot tries the daily map first

**review: yes**

**Files:** new `src/layers/body/textures/load/bodyTextureUrls.ts`, `src/layers/body/textures/load/bodyTextureFetcher.ts`

```ts
export function bodyTextureUrls(req: BodyTextureReq): readonly (() => Promise<string>)[];
// for a slot some LIVE_DATASETS row's bodyTexture names: [resolve live url via pointer, built-in url]; otherwise [built-in url]
```

- Split `fetchLiveFile` into "resolve the pointer to a URL" and "fetch", or add a sibling, so the fetcher can resolve without downloading twice. Pick the smaller diff.
- The fetcher tries each URL in order and keeps its existing checks (HTTP status, `image/` content type). Any failure moves to the next URL. If all fail, it throws the last error.
- Tests:
  - `it('tries the daily map before the built-in one')`
  - `it('falls back to the built-in map when the pointer 404s')`
  - `it('falls back when the daily file is not an image')`
  - `it('uses only the built-in map for slots no dataset feeds')`

### Task 14: credits, attributions, copy

**Files:** `src/data/creditGroups.ts` (Earth), `ATTRIBUTIONS.md` (:1796-1821), `docs/DATA.md`, `packages/website/src/data/scienceFacts.ts` (:182) and other copy that says the cloud map is static

- Earth credits gain `{ name: 'NASA GIBS', url: 'https://www.earthdata.nasa.gov/gibs' }` and `{ name: 'EUMETSAT', url: 'https://www.eumetsat.int' }`.
- `ATTRIBUTIONS.md` "Live cloud bake inputs": drop "nothing is shipped yet". The required line is "Contains modified EUMETSAT Meteosat data <year>". `attributionCoverage.test.ts` must stay green.
- Website copy describing the clouds: write options with the `copy` skill and put them to the owner. Don't pick yourself.

### Task 15: end-to-end check on dev

**Files:** none

- `npm run build-live-clouds` locally, then the dev server: the globe shows yesterday's clouds.
- Rename the local pointer away, reload: the built-in map loads, with no grey ball.
- Restore the pointer and make the dated file a non-image: the built-in map loads.
- Shoot each case and send it to the owner as dash checks.
- **Go-live gate:** PR C merges only after the owner confirms the Himawari terms, or the bake replaces that region with NOAA GMGSI.

## Definition of Done

- [ ] Phase A: built-in cloud tiers are one grey channel (`earth-clouds-grey-*.webp`, 8192 ≈ 6 MB), uploaded as `r8unorm`, and the deck, shadows and night lights look the same (owner check). Perf is measured before and after.
- [ ] Phase A: the owner synced the new tiers to R2 before the merge.
- [ ] Phase B: satellites publish through `live-datasets.yml`, a pointer and a dated file. `satellites.yml` is gone. The app reads satellites through the pointer.
- [ ] Phase B: the lifecycle rule is applied, and one manual run is confirmed live.
- [ ] Phase C: the clouds leg publishes yesterday's three tiers. The app shows them and falls back to the built-in map on a missing pointer, a 404 or a non-image (owner checks).
- [ ] Phase C: the credits and attributions name GIBS and EUMETSAT. The Himawari terms are confirmed or replaced.
- [ ] `npm test`, `npm run typecheck` and CI are green on each PR.
- [ ] Backlog: the two adjacent findings from the spec are filed (cloud shell sharing the globe's texture; `textures.sha256` missing three Blue Marble months).
