# Multi-σ Filament Dataset Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship multiple pre-baked DisPerSE persistence-cut datasets (σ = 2, 3, 5) simultaneously and let the viewer switch between them at runtime via a dropdown next to the existing Filaments toggle.

**Architecture:** The existing single-σ `buildFilaments.ts` pipeline grows a `--cuts` flag that runs the (cheap) `mse + skelconv` stage once per σ value, sharing the cached (slow) `.NDnet` Delaunay tessellation across all cuts; outputs are written as `filaments-sigma{N}.bin` plus a single `filaments-manifest.json` listing what is available. At runtime the engine fetches the manifest once at startup, populates a `<select>` dropdown in the SettingsPanel, and on σ change re-fetches that dataset and calls `filamentRenderer.upload(cloud)` to swap the GPU buffer. Switching is a re-upload, not a hot-swap of multiple GPU buffers — simpler bookkeeping at the cost of a brief upload (~5 MB).

**Tech Stack:** TypeScript (strict), Vitest (node env, no DOM — `react-dom/server.renderToStaticMarkup` for components), React 18, WebGPU, DisPerSE (build-time only), localStorage for σ persistence.

---

## File Structure

**Create:**
- `src/@types/FilamentManifest.d.ts` — type alias for the manifest JSON shape.
- `tests/services/engine/cloudLoaderFilaments.test.ts` — manifest + per-σ loader unit tests with mocked `fetch`.
- `tests/components/SettingsPanel/SettingsPanelFilaments.test.ts` — render-time assertions on the σ dropdown, via `renderToStaticMarkup`.

**Modify:**
- `tools/buildFilaments.ts` — add `--cuts` parser, per-σ output filename, manifest writer.
- `src/services/engine/cloudLoader.ts` — add `loadFilamentManifest()` and extend `loadFilaments(sigma?)`.
- `src/@types/EngineHandle.d.ts` — declare `setFilamentSigma`.
- `src/@types/EngineSettingsState.d.ts` — add `filamentSigma: number`.
- `src/@types/EngineGpuHandles.d.ts` — add `filamentManifest: FilamentManifest | null`.
- `src/@types/index.d.ts` — re-export `FilamentManifest`.
- `src/data/defaults.ts` — add `DEFAULT_FILAMENT_SIGMA`.
- `src/services/engine/engine.ts` — load the manifest at startup, default σ from manifest, implement `setFilamentSigma`.
- `src/components/SettingsPanel/SettingsPanel.tsx` — add the σ dropdown next to the Filaments checkbox.
- `src/App.tsx` — add `filamentSigma` state with localStorage persistence, wire the engine setter.
- `tests/@types/engineState.test.ts` — extend the type-shape smoke tests with the new fields.
- `README.md` — document the `--cuts 2,3,5` syntax + manifest path.

---

## Task 0: Pre-flight — Verify Baseline + Cached `.NDnet`

**Files:** none (read-only verification).

- [ ] **Step 1: Verify baseline tests are green**

Run:
```
npm test
```
Expected: all tests pass (590+ as of project state). If any fail, stop and resolve before starting Task 1 — this plan adds tests on top of a known-good baseline.

- [ ] **Step 2: Verify typecheck passes**

Run:
```
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Confirm DisPerSE binaries are reachable on PATH (build-side)**

Run:
```
which delaunay_3D mse skelconv
```
Expected: each prints a path. If any is missing, see `MEMORY.md` → `project_disperse_install.md`. The user must `export PATH=$PATH:~/Development/vendor/cpp/DisPerSE/bin` before any `npm run build-filaments` invocation. Without this Tasks 1–2 cannot be visually verified end-to-end, but the unit tests still run (the build pipeline is mocked / not invoked in tests).

- [ ] **Step 4: Confirm cached `.NDnet` exists for fast iteration**

Run:
```
ls -lh data/raw/galaxies_merged.tsv.NDnet 2>/dev/null || echo "no cached NDnet — first build will be slow (~14 s tessellation, then ~22 min mse)"
```
Expected: a ~1 GB file exists, OR the message "no cached NDnet". If absent, the first Task 1 visual-verify run will rebuild it. The whole point of the multi-σ feature is to amortise that build cost across multiple cuts, so this is informational, not blocking.

- [ ] **Step 5: Note the current single-σ output for diff comparison**

Run:
```
ls -lh public/data/filaments.bin 2>/dev/null && md5sum public/data/filaments.bin 2>/dev/null
```
Expected: the file may or may not exist. Record the size + checksum if present — Task 1 renames the output to `filaments-sigma3.bin`, and the byte content must be IDENTICAL to the old `filaments.bin` for the same input + cut value, since the rename is purely cosmetic.

(No commit — pre-flight is read-only.)

---

## Task 1: Add `--cuts` CLI argument + Per-σ Output Filename in `buildFilaments.ts`

**Files:**
- Modify: `tools/buildFilaments.ts` (parseArgs, main, output path logic)

The build pipeline currently writes a single `public/data/filaments.bin` from a single `--cut` value. After this task, the pipeline accepts EITHER `--cut N` (single σ, kept for backwards compatibility, writes `filaments-sigma{N}.bin`) OR `--cuts N1,N2,...` (multi-σ, runs the persistence + skelconv stage per σ value, writes one `.bin` per cut). The (slow) Delaunay-tessellation cache hit-rate stays 100% across cuts because `runDelaunay3D` already short-circuits on `existsSync(ndnetPath)`.

- [ ] **Step 1: Replace the `parseArgs` function with the new shape**

Edit `tools/buildFilaments.ts` and replace the `parseArgs` function (around lines 84–94) with:

```ts
/**
 * Tiny argv parser — extended for multi-σ runs.
 *
 * Two ways to specify the persistence cut(s):
 *
 *   --cut N         single σ value (backwards-compatible with the
 *                   pre-multi-σ pipeline; writes filaments-sigma{N}.bin)
 *   --cuts N1,N2,…  comma-separated list of σ values (writes one
 *                   filaments-sigma{N}.bin per cut, plus a single
 *                   filaments-manifest.json listing all of them)
 *
 * Both flags are mutually exclusive — passing both is treated as an
 * operator error and exits non-zero with a pointer at the README.  We
 * intentionally do NOT silently merge the two: the user almost certainly
 * meant one or the other and a silent merge would hide the typo.
 *
 * The slow Delaunay-tessellation stage (`.NDnet`) is cached on disk and
 * shared across cuts (see `runDelaunay3D` for the resume policy), so
 * iterating on σ only re-runs `mse + skelconv` (minutes, not hours).
 */
function parseArgs(): { cuts: readonly number[]; smooth: number } {
  const argv = process.argv.slice(2);
  let cuts: number[] | null = null;
  let smooth = DEFAULT_SMOOTHING_PASSES;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cut') {
      if (cuts !== null) {
        process.stderr.write(
          'error: pass either --cut or --cuts, not both. See README "Filament skeleton".\n',
        );
        process.exit(1);
      }
      cuts = [Number(argv[++i] ?? DEFAULT_PERSISTENCE_CUT)];
    } else if (a === '--cuts') {
      if (cuts !== null) {
        process.stderr.write(
          'error: pass either --cut or --cuts, not both. See README "Filament skeleton".\n',
        );
        process.exit(1);
      }
      const list = (argv[++i] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => Number(s));
      if (list.length === 0 || list.some((n) => !Number.isFinite(n))) {
        process.stderr.write(
          `error: --cuts expects a comma-separated list of numbers, got "${argv[i]}".\n`,
        );
        process.exit(1);
      }
      cuts = list;
    } else if (a === '--smooth') {
      smooth = Number(argv[++i] ?? smooth);
    }
  }
  // Default to a single 3σ run if neither flag was passed — mirrors the
  // pre-multi-σ default behaviour so a bare `npm run build-filaments`
  // still produces something useful.
  if (cuts === null) cuts = [DEFAULT_PERSISTENCE_CUT];
  return { cuts: cuts as readonly number[], smooth };
}
```

- [ ] **Step 2: Replace the `main()` function to loop over cuts and write per-σ filenames**

Replace the `main()` function (around lines 925–971) with:

```ts
async function main(): Promise<void> {
  const { cuts, smooth } = parseArgs();
  process.stderr.write(
    `buildFilaments — cuts=[${cuts.join(', ')}]σ smooth=${smooth}\n`,
  );

  checkDisperse();

  const tagged = readMergedPositions();
  process.stderr.write(`  merged ${tagged.count.toLocaleString()} galaxy positions\n`);

  // Build-time Malmquist V_max + HEALPix angular re-weight correction.
  // Computed once, shared across every σ in this run — the duplicated
  // TSV is identical between cuts, so the (expensive) Delaunay stage
  // hits its cache 100% of the time after the first σ.
  const weightedPositions = applyMalmquistDuplication(tagged);
  const weightedCount = weightedPositions.length / 3;

  const tsvPath = resolve('data/raw/galaxies_merged.tsv');
  writeTsvInput(tsvPath, weightedPositions, weightedCount);
  process.stderr.write(`  wrote ${tsvPath}\n`);

  // Three-stage DisPerSE pipeline.  The Delaunay tessellation is
  // computed once and reused across every σ — see runDelaunay3D for
  // the resume short-circuit on `existsSync(ndnetPath)`.
  const ndnetPath = runDelaunay3D(tsvPath);
  process.stderr.write(`  built Delaunay tessellation at ${ndnetPath}\n`);

  // Per-σ outputs accumulated for the manifest.  We build the manifest
  // INSIDE the loop (writing a partial manifest after each successful
  // cut) so that an interrupted multi-cut run still leaves a usable
  // viewer state — the user gets whichever cuts completed before the
  // interrupt, never a stale manifest pointing at a missing .bin.
  const manifestEntries: Array<{
    sigma: number;
    file: string;
    stripCount: number;
    vertexCount: number;
  }> = [];

  for (const cut of cuts) {
    process.stderr.write(`\n── σ = ${cut} ──────────────────────────────\n`);
    const ndsklPath = runDisperse(ndnetPath, cut, smooth);
    process.stderr.write(`  parsed skeleton at ${ndsklPath}\n`);

    const skel = parseNDskl(readFileSync(ndsklPath, 'utf8'));
    const cloud = skeletonToFilamentCloud(skel);
    process.stderr.write(
      `  ${cloud.stripCount.toLocaleString()} strips, ` +
        `${cloud.vertexCount.toLocaleString()} vertices\n`,
    );

    // Per-σ output filename — replaces the legacy single-σ
    // `filaments.bin`.  The σ value is rendered as an integer
    // (Math.trunc) because DisPerSE itself only accepts integer
    // `-nsig` values; non-integer cuts wouldn't have round-tripped
    // anyway, but Math.trunc here makes the filename deterministic
    // even if a user passes 3.0 vs 3.
    const sigmaTag = Math.trunc(cut);
    const fileName = `filaments-sigma${sigmaTag}.bin`;
    const outPath = resolve('public/data', fileName);
    const buf = encodeFilaments(cloud);
    writeFileSync(outPath, Buffer.from(buf));
    process.stderr.write(
      `  wrote ${fileName} (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB)\n`,
    );

    manifestEntries.push({
      sigma: sigmaTag,
      file: fileName,
      stripCount: cloud.stripCount,
      vertexCount: cloud.vertexCount,
    });

    // Flush the manifest after every cut.  See `writeManifest` for
    // the structure rationale — partial-write resilience matters for
    // multi-hour multi-cut runs.
    writeManifest(manifestEntries, cuts);
  }

  process.stderr.write(
    `\nfinished ${cuts.length} cut${cuts.length === 1 ? '' : 's'}.  ` +
      'Manifest at public/data/filaments-manifest.json.\n',
  );
}
```

- [ ] **Step 3: Stub the `writeManifest` function so the file compiles**

For Task 1's purposes the manifest writer doesn't need to do anything yet — Task 2 owns its real implementation. Add this stub immediately above `main()`:

```ts
/**
 * Write the multi-σ manifest JSON.  Stub — Task 2 fills in the real
 * structure (file shape, default-σ rule).  Stubbed so Task 1's main()
 * call site compiles before Task 2 lands.
 */
function writeManifest(
  _entries: ReadonlyArray<{
    sigma: number;
    file: string;
    stripCount: number;
    vertexCount: number;
  }>,
  _cutsRequested: readonly number[],
): void {
  // intentionally empty — Task 2 implements
}
```

- [ ] **Step 4: Verify the file still typechecks**

Run:
```
npm run typecheck
```
Expected: zero errors. The `cuts` is `readonly number[]` and the loop iterates fine; the stub `writeManifest` matches the call signature.

- [ ] **Step 5: Verify `--cut 3` continues to write the same content as before, just under the new name**

Run (only if DisPerSE binaries are present and a cached `.NDnet` exists; otherwise skip and rely on the visual verify in Task 10):
```
npm run build-filaments -- --cut 3
ls -lh public/data/filaments-sigma3.bin
```
Expected: `filaments-sigma3.bin` exists; the byte size matches whatever the legacy `filaments.bin` was at Task 0 step 5 (same input → same output, only the filename changed).

- [ ] **Step 6: Verify multi-σ syntax accepts `--cuts 2,3,5`**

Without DisPerSE installed we can still verify the parser by adding `console.log(JSON.stringify(parseArgs()))` temporarily and running:
```
npx tsx -e 'process.argv = ["node", "x", "--cuts", "2,3,5", "--smooth", "2"]; ' --eval "import('./tools/buildFilaments.js').then(() => null)"
```

Or simpler: write a small inline verification (do NOT commit this; revert before Step 7):
```
npx tsx -e "
process.argv = ['node', 'x', '--cuts', '2,3,5'];
const mod = await import('./tools/buildFilaments.js');
"
```

For a more robust check, run typecheck only — the parser change is internally consistent and Task 8's tests will exercise it formally. Skip this step if the inline verification is awkward; it's covered in Task 8.

- [ ] **Step 7: Commit**

```
git add tools/buildFilaments.ts
git commit -m "$(cat <<'EOF'
feat(buildFilaments): add --cuts argument for multi-σ runs

Replaces the single-σ output filename with filaments-sigma{N}.bin and
loops over comma-separated --cuts values, sharing the cached .NDnet
across persistence cuts.  --cut N is preserved for backwards
compatibility (single σ, still writes the new per-σ filename).

A stub writeManifest is added so the new main() compiles; Task 2
implements the real manifest writer.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Manifest JSON Writer in `buildFilaments.ts`

**Files:**
- Modify: `tools/buildFilaments.ts` (replace `writeManifest` stub)

The manifest must capture every successfully-built σ in this multi-cut run, plus an explicit `default` σ — the renderer reads `default` to decide which dataset to load on first paint. The JSON shape is locked here and consumed unchanged in Task 3 (type alias) and Task 5 (engine startup).

- [ ] **Step 1: Replace the `writeManifest` stub with the real implementation**

Replace the `writeManifest` stub from Task 1 step 3 with:

```ts
/**
 * Write the multi-σ manifest JSON consumed by the runtime cloudLoader.
 *
 * Shape (consumed unchanged by `loadFilamentManifest()` in
 * src/services/engine/cloudLoader.ts):
 *
 *   {
 *     "available": [
 *       { "sigma": 2, "file": "filaments-sigma2.bin",
 *         "stripCount": 80123, "vertexCount": 401234 },
 *       …
 *     ],
 *     "default": 3
 *   }
 *
 * Why a JSON manifest rather than embedding metadata in each .bin?
 * Three reasons, locked early so later tasks don't have to re-litigate:
 *
 *   1. The manifest is small (~200 bytes) and lets the cloudLoader
 *      discover available datasets in one round-trip without parsing
 *      every binary header.
 *   2. The format can grow (display labels, descriptions, default-σ
 *      heuristics) without bumping the FILA binary version.
 *   3. The renderer never needs to interpret a missing-σ case — if a
 *      .bin failed to write for one cut, the entry simply isn't in
 *      the manifest, and the dropdown won't offer it.
 *
 * Default-σ rule: prefer 3σ if it's in the available list (cosmology
 * paper standard, our long-standing default).  Otherwise pick the
 * smallest cut available — denser is more visually engaging by default
 * (more filaments visible) and any user who wants the robust spine can
 * pick a higher σ from the dropdown.
 *
 * `cutsRequested` is logged but otherwise unused — kept for future
 * expansion (e.g. recording which cuts were attempted but failed).
 */
function writeManifest(
  entries: ReadonlyArray<{
    sigma: number;
    file: string;
    stripCount: number;
    vertexCount: number;
  }>,
  cutsRequested: readonly number[],
): void {
  // Sort ascending by σ so the dropdown ordering is deterministic
  // (smallest σ = densest = first option).
  const sortedEntries = [...entries].sort((a, b) => a.sigma - b.sigma);

  // Pick the default: prefer 3, else the smallest available.
  const sigmas = sortedEntries.map((e) => e.sigma);
  let defaultSigma: number;
  if (sigmas.includes(3)) {
    defaultSigma = 3;
  } else if (sigmas.length > 0) {
    defaultSigma = sigmas[0]!;
  } else {
    // Edge case: every cut failed to produce output.  Write a
    // sentinel default of 0 so the runtime can detect "manifest
    // present but empty" without a separate field.
    defaultSigma = 0;
  }

  const manifest = {
    available: sortedEntries,
    default: defaultSigma,
  };

  const path = resolve('public/data/filaments-manifest.json');
  // Pretty-print at 2 spaces — these are small files inspected by
  // humans during debugging more often than they're parsed by tools.
  // The runtime parser doesn't care about whitespace either way.
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
  process.stderr.write(
    `  manifest: ${sortedEntries.length} entries, default σ=${defaultSigma}, ` +
      `requested=[${cutsRequested.join(', ')}]\n`,
  );
}
```

- [ ] **Step 2: Verify the file typechecks**

Run:
```
npm run typecheck
```
Expected: zero errors.

- [ ] **Step 3: Hand-verify the manifest shape with a fake invocation**

Without invoking DisPerSE, write a tiny driver in `/tmp/test_manifest.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifest = {
  available: [
    { sigma: 2, file: 'filaments-sigma2.bin', stripCount: 80123, vertexCount: 401234 },
    { sigma: 3, file: 'filaments-sigma3.bin', stripCount: 51967, vertexCount: 315534 },
    { sigma: 5, file: 'filaments-sigma5.bin', stripCount: 12345, vertexCount: 67890 },
  ],
  default: 3,
};
writeFileSync('/tmp/manifest-sample.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.parse(JSON.stringify(manifest)));
```
Run:
```
npx tsx /tmp/test_manifest.ts && cat /tmp/manifest-sample.json
```
Expected: prints a manifest matching the shape locked above. This isn't an automated test — it's just a sanity-check the JSON shape is what Task 3 will type-define. Delete `/tmp/test_manifest.ts` after.

- [ ] **Step 4: Commit**

```
git add tools/buildFilaments.ts
git commit -m "$(cat <<'EOF'
feat(buildFilaments): write filaments-manifest.json after each cut

Captures every successfully-built σ with stripCount/vertexCount and
picks a default σ (prefers 3, falls back to smallest available).
Flushed after each cut so an interrupted multi-σ run still leaves a
manifest pointing at whatever completed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `FilamentManifest` Type + `loadFilamentManifest()` in cloudLoader

**Files:**
- Create: `src/@types/FilamentManifest.d.ts`
- Modify: `src/@types/index.d.ts` (re-export)
- Modify: `src/services/engine/cloudLoader.ts` (add `loadFilamentManifest`)

This task adds the type alias matching the manifest shape from Task 2 and the runtime fetcher. Both follow the existing `loadFilaments()` pattern: graceful fallback to `null` on 404 / network error / parse error, with a `console.warn` for diagnostics.

- [ ] **Step 1: Create the `FilamentManifest` type alias**

Create `src/@types/FilamentManifest.d.ts`:

```ts
/**
 * FilamentManifest — runtime mirror of the JSON written by
 * `tools/buildFilaments.ts:writeManifest`.
 *
 * The manifest enumerates which persistence-cut σ datasets are
 * available on disk under `public/data/`, plus a `default` σ the
 * renderer should pick on first paint.  Lives on the GPU bag of
 * `EngineState` (see `EngineGpuHandles.filamentManifest`) so the
 * SettingsPanel σ-dropdown can populate from it without a fresh fetch.
 *
 * ### Why a type alias not an interface
 *
 * Project convention — see CLAUDE.md.  All type shapes use
 * `export type X = { … }`.
 *
 * ### Why the runtime never extends this shape
 *
 * The build pipeline owns the on-disk format.  The renderer treats it
 * as read-only data and only ever projects subsets of it (e.g. into
 * the SettingsPanel dropdown options).  If a future field is added to
 * the JSON (e.g. a display label), the type grows here and any
 * consumer that wants the new field opts into reading it; consumers
 * that don't are unchanged.
 */
export type FilamentManifestEntry = {
  /** Persistence cut value in σ.  Always an integer (DisPerSE constraint). */
  sigma: number;
  /** Filename relative to `public/data/`, e.g. `filaments-sigma3.bin`. */
  file: string;
  /** Strip count from the parsed FilamentCloud — used for "51,967 strips" in the dropdown. */
  stripCount: number;
  /** Vertex count from the parsed FilamentCloud — informational only at runtime. */
  vertexCount: number;
};

export type FilamentManifest = {
  /**
   * The available σ datasets, sorted ascending by σ (so the dropdown
   * shows densest first).  Empty array means the build pipeline ran
   * but every cut failed — the renderer treats this the same as a
   * missing manifest (no Filaments dropdown rendered).
   */
  available: ReadonlyArray<FilamentManifestEntry>;
  /**
   * The σ value the renderer should load on first paint.  Must match
   * one of `available[].sigma` if `available` is non-empty.  Sentinel
   * value `0` means "no default" (the writer emits 0 when every cut
   * failed; the runtime treats it as "no datasets available").
   */
  default: number;
};
```

- [ ] **Step 2: Re-export from the barrel**

Edit `src/@types/index.d.ts` and add:

```ts
export type * from './FilamentManifest';
```

immediately after the existing `export type * from './QuadInstance';` line. Order doesn't matter for the barrel; we're picking the spot adjacent to other auxiliary types for tidiness.

- [ ] **Step 3: Write the failing test for `loadFilamentManifest`**

Create `tests/services/engine/cloudLoaderFilaments.test.ts`:

```ts
/**
 * cloudLoader filament-manifest + per-σ filament loader tests.
 *
 * Vitest's `node` environment has no DOM `fetch`, so we install a
 * `globalThis.fetch` stub for the duration of each test.  This mirrors
 * the localStorage-shim pattern used by tests/components/SettingsPanel/
 * CollapsibleSection.test.ts and keeps the loader's network surface
 * exercised without a heavier MSW dependency.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadFilamentManifest,
  loadFilaments,
} from '../../../src/services/engine/cloudLoader';
import { encodeFilaments } from '../../../src/data/filamentBinaryFormat';
import type { FilamentCloud } from '../../../src/@types/FilamentCloud';

// Build a minimal FilamentCloud and round-trip it through the encoder
// so the test doesn't depend on any pre-built `.bin` file on disk.
function makeFakeCloudBytes(): ArrayBuffer {
  const cloud: FilamentCloud = {
    stripCount: 1,
    vertexCount: 2,
    stripOffsets: new Uint32Array([0, 2]),
    // FLOATS_PER_VERTEX = 4 in filamentBinaryFormat (xyz + density).
    vertices: new Float32Array([0, 0, 0, 1, 1, 0, 0, 0.5]),
  };
  return encodeFilaments(cloud);
}

type FetchInput = string | URL | Request;

let originalFetch: typeof globalThis.fetch | undefined;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  // Restore so a stale stub never leaks into another test file.
  if (originalFetch === undefined) {
    delete (globalThis as { fetch?: typeof globalThis.fetch }).fetch;
  } else {
    globalThis.fetch = originalFetch;
  }
  vi.restoreAllMocks();
});

describe('loadFilamentManifest', () => {
  it('returns the parsed JSON when the manifest fetch succeeds', async () => {
    const manifest = {
      available: [
        { sigma: 2, file: 'filaments-sigma2.bin', stripCount: 80123, vertexCount: 401234 },
        { sigma: 3, file: 'filaments-sigma3.bin', stripCount: 51967, vertexCount: 315534 },
      ],
      default: 3,
    };
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      expect(String(input)).toBe('/data/filaments-manifest.json');
      return new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof globalThis.fetch;

    const result = await loadFilamentManifest();
    expect(result).not.toBeNull();
    expect(result!.default).toBe(3);
    expect(result!.available).toHaveLength(2);
    expect(result!.available[0]!.sigma).toBe(2);
    expect(result!.available[1]!.stripCount).toBe(51967);
  });

  it('returns null when the manifest is missing (404)', async () => {
    globalThis.fetch = vi.fn(async () => new Response('not found', { status: 404 })) as typeof globalThis.fetch;
    const result = await loadFilamentManifest();
    expect(result).toBeNull();
  });

  it('returns null when fetch throws (network error)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as typeof globalThis.fetch;
    const result = await loadFilamentManifest();
    expect(result).toBeNull();
  });

  it('returns null when the JSON body is malformed', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('{ this is not json', { status: 200 }),
    ) as typeof globalThis.fetch;
    const result = await loadFilamentManifest();
    expect(result).toBeNull();
  });
});
```

(The two `loadFilaments(sigma)` test blocks below are added in Task 4.)

- [ ] **Step 4: Run the test to verify it fails**

Run:
```
npm test -- tests/services/engine/cloudLoaderFilaments.test.ts
```
Expected: FAIL with `loadFilamentManifest is not exported from '../../../src/services/engine/cloudLoader'` (or similar — the function doesn't exist yet).

- [ ] **Step 5: Implement `loadFilamentManifest` in cloudLoader.ts**

Append to `src/services/engine/cloudLoader.ts`:

```ts
/**
 * Fetch and parse the optional `filaments-manifest.json` written by
 * `tools/buildFilaments.ts`.  Returns null on 404 / network / parse
 * error — same fail-safe contract as `loadFilaments()`.
 *
 * The manifest tells the renderer which σ datasets are pre-baked on
 * disk and which one to load by default.  When null, the SettingsPanel
 * silently omits the σ dropdown and the legacy single-`filaments.bin`
 * load path takes over (see `loadFilaments()` below).
 *
 * Why a separate function rather than baking this into `loadFilaments`?
 * The manifest is loaded ONCE at engine startup so the dropdown can
 * populate immediately; per-σ `.bin` fetches happen on demand whenever
 * the user picks a different σ.  The two have different lifetimes and
 * different cache semantics — keeping them as separate functions
 * matches that.
 */
export async function loadFilamentManifest(): Promise<FilamentManifest | null> {
  try {
    const res = await fetch('/data/filaments-manifest.json');
    if (!res.ok) return null;
    const json = (await res.json()) as FilamentManifest;
    return json;
  } catch (err) {
    console.warn('[cloudLoader] filaments-manifest.json failed:', err);
    return null;
  }
}
```

Also add the import for the new type at the top of the file (sibling of the existing `FilamentCloud` import):

```ts
import type { FilamentManifest } from '../../@types/FilamentManifest';
```

- [ ] **Step 6: Run the test to verify it passes**

Run:
```
npm test -- tests/services/engine/cloudLoaderFilaments.test.ts
```
Expected: 4 tests pass (the four `loadFilamentManifest` tests). The `loadFilaments(sigma)` block below it doesn't exist yet, so no other tests run from this file.

- [ ] **Step 7: Commit**

```
git add src/@types/FilamentManifest.d.ts src/@types/index.d.ts src/services/engine/cloudLoader.ts tests/services/engine/cloudLoaderFilaments.test.ts
git commit -m "$(cat <<'EOF'
feat(cloudLoader): add loadFilamentManifest() + FilamentManifest type

Fetches public/data/filaments-manifest.json with the same fail-safe
contract as loadFilaments() (returns null on missing/network/parse
error).  Manifest enumerates available σ datasets so the SettingsPanel
dropdown can populate immediately after engine startup.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extend `loadFilaments()` to Accept a σ Parameter

**Files:**
- Modify: `src/services/engine/cloudLoader.ts` (`loadFilaments` signature + implementation)
- Modify: `tests/services/engine/cloudLoaderFilaments.test.ts` (append per-σ tests)

The legacy `loadFilaments()` fetched `/data/filaments.bin` unconditionally. After this task it accepts an optional `sigma` parameter and constructs the URL from the manifest entry: `loadFilaments({ sigma: 3, manifest })` → fetches `/data/filaments-sigma3.bin`. The legacy zero-arg call still works (loads the manifest's default if available, falls back to legacy filename otherwise).

- [ ] **Step 1: Write the failing tests for the new signature**

Append to `tests/services/engine/cloudLoaderFilaments.test.ts`:

```ts
describe('loadFilaments(sigma, manifest)', () => {
  const manifest = {
    available: [
      { sigma: 2, file: 'filaments-sigma2.bin', stripCount: 80123, vertexCount: 401234 },
      { sigma: 3, file: 'filaments-sigma3.bin', stripCount: 51967, vertexCount: 315534 },
      { sigma: 5, file: 'filaments-sigma5.bin', stripCount: 12345, vertexCount: 67890 },
    ],
    default: 3,
  } as const;

  it('fetches the σ-suffixed filename when given a sigma + manifest', async () => {
    const bytes = makeFakeCloudBytes();
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      expect(String(input)).toBe('/data/filaments-sigma5.bin');
      return new Response(bytes, { status: 200 });
    }) as typeof globalThis.fetch;

    const result = await loadFilaments({ sigma: 5, manifest });
    expect(result).not.toBeNull();
    expect(result!.stripCount).toBe(1);
    expect(result!.vertexCount).toBe(2);
  });

  it('uses the manifest default when sigma is omitted', async () => {
    const bytes = makeFakeCloudBytes();
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      expect(String(input)).toBe('/data/filaments-sigma3.bin');
      return new Response(bytes, { status: 200 });
    }) as typeof globalThis.fetch;

    const result = await loadFilaments({ manifest });
    expect(result).not.toBeNull();
  });

  it('falls back to the legacy /data/filaments.bin when no manifest is provided', async () => {
    const bytes = makeFakeCloudBytes();
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      expect(String(input)).toBe('/data/filaments.bin');
      return new Response(bytes, { status: 200 });
    }) as typeof globalThis.fetch;

    const result = await loadFilaments();
    expect(result).not.toBeNull();
  });

  it('returns null when sigma is not present in the manifest', async () => {
    // Should NOT call fetch — the lookup happens before any network IO.
    const fetchSpy = vi.fn(async () => new Response('should not be called', { status: 200 }));
    globalThis.fetch = fetchSpy as typeof globalThis.fetch;

    const result = await loadFilaments({ sigma: 99, manifest });
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null on 404 for a present-in-manifest σ (binary missing)', async () => {
    globalThis.fetch = vi.fn(async () => new Response('not found', { status: 404 })) as typeof globalThis.fetch;
    const result = await loadFilaments({ sigma: 3, manifest });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```
npm test -- tests/services/engine/cloudLoaderFilaments.test.ts
```
Expected: 5 new tests fail with `loadFilaments expects 0 arguments` or `result.stripCount …` (the function still ignores its argument).

- [ ] **Step 3: Replace the existing `loadFilaments` implementation**

Replace the existing `loadFilaments` function in `src/services/engine/cloudLoader.ts` with:

```ts
/**
 * Options for selecting which σ dataset to load.  Both fields are
 * optional:
 *
 *   - With BOTH `manifest` and `sigma`: looks up `sigma` in the
 *     manifest's `available` list and fetches that file.  Returns
 *     null if the σ isn't in the manifest (no fetch attempted).
 *   - With `manifest` only: fetches the manifest's `default` σ.
 *     Returns null if `default` is the sentinel 0 (no datasets
 *     available) or doesn't appear in `available`.
 *   - With neither (zero-arg call): falls back to the legacy
 *     `/data/filaments.bin` path so callers that pre-date the manifest
 *     keep working.
 *
 * The fail-safe envelope is unchanged from the original `loadFilaments`:
 * any error path collapses to `null`.  The renderer treats null as
 * "feature disabled" and never surfaces the error to the user.
 */
export type LoadFilamentsOptions = {
  sigma?: number;
  manifest?: FilamentManifest | null;
};

export async function loadFilaments(
  options: LoadFilamentsOptions = {},
): Promise<FilamentCloud | null> {
  // Resolve the URL.  Three paths, in order of specificity:
  let url: string;
  if (options.manifest) {
    const targetSigma = options.sigma ?? options.manifest.default;
    // Sentinel 0 from the writer means "no datasets" — fail closed.
    if (targetSigma === 0) return null;
    const entry = options.manifest.available.find((e) => e.sigma === targetSigma);
    if (!entry) {
      // Caller asked for a σ that isn't in the manifest.  Don't
      // attempt the fetch — the file definitely isn't there.  This
      // happens if the dropdown is somehow out-of-sync with the
      // manifest, or the user invoked the setter from devtools with a
      // bad σ.
      return null;
    }
    url = `/data/${entry.file}`;
  } else {
    // Legacy path — pre-multi-σ callers, or callers in unit tests
    // that don't bother building a manifest.
    url = '/data/filaments.bin';
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return decodeFilaments(buf);
  } catch (err) {
    console.warn(`[cloudLoader] ${url} failed:`, err);
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify all `loadFilaments` tests pass**

Run:
```
npm test -- tests/services/engine/cloudLoaderFilaments.test.ts
```
Expected: 9 tests pass total (4 from Task 3 + 5 added here).

- [ ] **Step 5: Run the full suite to catch any callers broken by the signature change**

Run:
```
npm test
```
Expected: every test still passes. The only existing caller of `loadFilaments` is `engine.ts` line 647 (`loadFilaments().then(...)`), which still works because the new signature defaults options to `{}`.

- [ ] **Step 6: Run the typecheck**

Run:
```
npm run typecheck
```
Expected: zero errors. The default-parameter pattern means callers without options compile unchanged.

- [ ] **Step 7: Commit**

```
git add src/services/engine/cloudLoader.ts tests/services/engine/cloudLoaderFilaments.test.ts
git commit -m "$(cat <<'EOF'
feat(cloudLoader): extend loadFilaments() to accept σ + manifest

New options signature: loadFilaments({ sigma, manifest }).  Resolves to
the σ-suffixed filename via manifest lookup; falls back to the legacy
/data/filaments.bin URL for zero-arg calls so the existing engine.ts
caller is unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Engine — `setFilamentSigma`, State Plumbing, Manifest Loading at Startup

**Files:**
- Modify: `src/@types/EngineHandle.d.ts` (declare `setFilamentSigma`)
- Modify: `src/@types/EngineSettingsState.d.ts` (add `filamentSigma`)
- Modify: `src/@types/EngineGpuHandles.d.ts` (add `filamentManifest`)
- Modify: `src/data/defaults.ts` (add `DEFAULT_FILAMENT_SIGMA`)
- Modify: `src/services/engine/engine.ts` (load manifest at startup, default σ from manifest, `setFilamentSigma` setter)
- Modify: `tests/@types/engineState.test.ts` (extend with new fields)

The engine pulls the manifest once at startup. If present, the initial filament fetch uses the manifest's default σ. If absent, the legacy zero-arg `loadFilaments()` path runs (preserves current behaviour for users who haven't rebuilt with `--cuts`). The `setFilamentSigma` setter is the runtime σ-switch entry point: it re-fetches the requested dataset and re-uploads to the renderer.

- [ ] **Step 1: Write the failing test for the new state shape fields**

Edit `tests/@types/engineState.test.ts`. In the `'accepts a literal populated with realistic values'` test, change the `settings` literal to include `filamentSigma: 3`. Change the `gpu` literal in the same test to include `filamentManifest: null`. Apply the same updates to the other two tests in the file (`'builds the settings + bias + sources sub-bags directly from data/defaults.ts'` — add `filamentSigma: DEFAULT_FILAMENT_SIGMA`; and `'allows in-place mutation of every sub-bag field'` — add `filamentSigma: 0` and `filamentManifest: null`, then add a mutation `state.settings.filamentSigma = 5;` followed by `expect(state.settings.filamentSigma).toBe(5);`). Also add `DEFAULT_FILAMENT_SIGMA` to the import from `'../../src/data/defaults'`.

The exact patches:

For the first test (`accepts a literal populated with realistic values`), inside the `settings` literal between `milkyWayEnabled: true,` and `filamentsEnabled: false,`, the file currently has:
```ts
      milkyWayEnabled: true,
      filamentsEnabled: false,
```
Change to:
```ts
      milkyWayEnabled: true,
      filamentsEnabled: false,
      filamentSigma: 3,
```

In the same test, inside the `gpu` block, change:
```ts
        filamentRenderer: null,
      },
```
to:
```ts
        filamentRenderer: null,
        filamentManifest: null,
      },
```

For the second test (`builds the settings + bias + sources …`), apply the same `filamentSigma: DEFAULT_FILAMENT_SIGMA,` insertion in the settings literal (after `filamentsEnabled: DEFAULT_FILAMENTS_ENABLED,`).

For the third test (`allows in-place mutation of every sub-bag field`), apply the same `filamentSigma: 0,` insertion in settings, and `filamentManifest: null,` in gpu. Just before the existing `expect(state.settings.brightness).toBe(2.5);`, add:
```ts
    state.settings.filamentSigma = 5;
    state.gpu.filamentManifest = {
      available: [{ sigma: 5, file: 'filaments-sigma5.bin', stripCount: 1, vertexCount: 2 }],
      default: 5,
    };
```
And just before `expect(state.picking.pickInFlight).toBe(true);`, add:
```ts
    expect(state.settings.filamentSigma).toBe(5);
    expect(state.gpu.filamentManifest!.default).toBe(5);
```

Finally, update the imports at the top of the file. Change:
```ts
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_AUTO_ROTATE,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_EXPOSURE,
  DEFAULT_FILAMENTS_ENABLED,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
```
to:
```ts
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_AUTO_ROTATE,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_EXPOSURE,
  DEFAULT_FILAMENT_SIGMA,
  DEFAULT_FILAMENTS_ENABLED,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
```

- [ ] **Step 2: Run the test — expect it to fail**

Run:
```
npm test -- tests/@types/engineState.test.ts
```
Expected: FAIL — `DEFAULT_FILAMENT_SIGMA` is not exported, and `EngineSettingsState` doesn't include `filamentSigma`. Both will be fixed in the next steps.

- [ ] **Step 3: Add `DEFAULT_FILAMENT_SIGMA` to defaults.ts**

Edit `src/data/defaults.ts`. Locate `DEFAULT_FILAMENTS_ENABLED = false;` and add immediately after:

```ts
/**
 * Default σ for the cosmic-web filament-skeleton overlay.
 *
 * Used as the σ to load on first paint when the manifest
 * (`filaments-manifest.json`) is missing or its `default` is the
 * sentinel 0 (no datasets available).  When the manifest is present
 * the engine ignores this constant and uses the manifest's `default`
 * instead — that way the build pipeline picks the recommended σ for
 * each dataset, not the renderer.
 *
 * 3σ is the cosmology-paper standard (Tempel+ 2014, etc.) — a balance
 * between density (more filaments visible) and robustness (cuts off
 * the noisiest ridges).  See `tools/buildFilaments.ts` header for the
 * 2σ / 5σ comparison rationale.
 */
export const DEFAULT_FILAMENT_SIGMA = 3;
```

- [ ] **Step 4: Add `filamentSigma` to `EngineSettingsState`**

Edit `src/@types/EngineSettingsState.d.ts`. After the `filamentsEnabled: boolean;` field, add:

```ts
  /**
   * Currently-selected σ for the filament-skeleton overlay (e.g. 2,
   * 3, or 5).  Tracks the dropdown value in the SettingsPanel; mutated
   * in place by `setFilamentSigma`.  Always one of the σ values
   * present in `state.gpu.filamentManifest.available[].sigma`, OR
   * `DEFAULT_FILAMENT_SIGMA` when the manifest is absent (legacy load
   * path; the value is informational only — the loader uses
   * `/data/filaments.bin` regardless).
   */
  filamentSigma: number;
```

- [ ] **Step 5: Add `filamentManifest` to `EngineGpuHandles`**

Edit `src/@types/EngineGpuHandles.d.ts`. After the existing `filamentRenderer` field, add:

```ts
  /**
   * Cached filament-manifest JSON, fetched once at engine startup.
   *
   * Null when the manifest fetch failed (404, parse error, network) —
   * which means the user hasn't run the multi-σ build, OR they're on
   * a fresh clone.  In both cases the runtime falls back to the
   * legacy `/data/filaments.bin` single-σ load path so existing
   * deployments are unaffected by the multi-σ feature flag.
   *
   * Populated immediately by the GPU init's IIFE (parallel with the
   * filament fetch — neither blocks on the other) so the
   * SettingsPanel σ-dropdown can populate as soon as both arrive.
   * Released to null in `destroy()` for the same StrictMode-remount
   * reason as the other GPU handles.
   */
  filamentManifest: FilamentManifest | null;
```

Then add the import at the top of the file:
```ts
import type { FilamentManifest } from './FilamentManifest';
```

- [ ] **Step 6: Add `setFilamentSigma` to EngineHandle**

Edit `src/@types/EngineHandle.d.ts`. Immediately after the existing `setFilamentsEnabled?` declaration (around line 96), add:

```ts
  /**
   * Switch the active filament dataset to a different persistence-cut
   * σ value.  The renderer fetches the corresponding `.bin`,
   * re-uploads to the FilamentRenderer's instance buffer, and requests
   * a render so the change shows immediately.
   *
   * No-op (resolves quickly) when:
   *   - the manifest is null (single-σ deployment, only one dataset),
   *   - `sigma` is already the active σ,
   *   - `sigma` is not in the manifest's `available` list (the
   *     dropdown shouldn't have offered it; this is a defensive check).
   *
   * Resolves once the new dataset is uploaded and `requestRender()`
   * has fired.  Rejects only on programmer error — fetch / decode
   * failures are swallowed inside `loadFilaments()` and resolve to a
   * silent no-op (the previous σ stays on screen).
   *
   * Defaults to absent on the handle (`?:`) so older callers that
   * don't know about the multi-σ feature are unaffected.
   */
  setFilamentSigma?: (sigma: number) => Promise<void>;
```

- [ ] **Step 7: Wire the engine's startup + state + setter**

Edit `src/services/engine/engine.ts`.

(a) Update the imports near the top (look for the existing `loadFilaments` import around line 105) to include the manifest loader:
```ts
import {
  loadAllClouds,
  buildSyntheticFallback,
  loadFilaments,
  loadFilamentManifest,
  type CatalogSource,
} from './cloudLoader';
```

(b) Update the `DEFAULT_FILAMENT_SIGMA` import — add it to the `data/defaults` import block (find the line that imports `DEFAULT_FILAMENTS_ENABLED`).

(c) Update the `state.settings` initial-value block (around lines 263–276): after `filamentsEnabled: DEFAULT_FILAMENTS_ENABLED,` add:
```ts
      filamentSigma: DEFAULT_FILAMENT_SIGMA,
```

(d) Update the `state.gpu` initial-value block (around lines 322–331): after `filamentRenderer: null,` add:
```ts
      filamentManifest: null,
```

(e) Replace the existing fire-and-forget `loadFilaments().then(...)` block (around lines 647–653) with a manifest-aware version:

```ts
      // Multi-σ filament loading.  Two parallel fetches:
      //
      //   1. Manifest (filaments-manifest.json) — small, ~200 bytes.
      //      Populates the SettingsPanel σ-dropdown options.
      //   2. Initial dataset — picks the σ from manifest.default if
      //      available, or falls back to the legacy single-σ path.
      //
      // Why parallel rather than serial?  The manifest fetch latency
      // would otherwise stack on top of the (~5 MB) dataset fetch on
      // first paint.  We can fire both at once, accept the manifest
      // first (it lands earlier — much smaller), use it to pick the
      // right dataset URL, and the dataset fetch already in flight
      // either was the right one (manifest.default matched the
      // legacy path) or we kick off a second fetch.  In the steady
      // case where the manifest exists with default σ=3 and the
      // matching `.bin` exists, the second fetch lands in cache.
      //
      // Simpler: load manifest first, THEN dataset.  The manifest is
      // tiny so the cost is negligible (~50 ms RTT on a typical
      // connection).  We pick this path for clarity — the parallel
      // version's URL-mismatch dance isn't worth the milliseconds.
      loadFilamentManifest().then(async (manifest) => {
        state.gpu.filamentManifest = manifest;
        // Sync the active σ to the manifest's default if present.
        // Without this, the SettingsPanel dropdown would render
        // `DEFAULT_FILAMENT_SIGMA` selected but the engine would
        // fetch the manifest's default — silently mismatched UI.
        if (manifest && manifest.default !== 0) {
          state.settings.filamentSigma = manifest.default;
        }
        const cloud = await loadFilaments({ manifest: manifest ?? undefined });
        if (cloud) {
          filamentRenderer.upload(cloud);
          console.log(
            `[engine] filaments σ=${state.settings.filamentSigma}: ` +
              `${cloud.stripCount} strips, ${cloud.vertexCount} verts`,
          );
          state.subsystems.scheduler.requestRender();
        }
      });
```

(f) Add the `setFilamentSigma` setter to the public-handle return object. Find the existing `setFilamentsEnabled(enabled) { ... }` setter around line 1516 and add immediately after its closing brace:

```ts
    async setFilamentSigma(sigma) {
      // Switch the active filament dataset.  The renderer hot-swaps
      // its instance buffer via `upload(cloud)` — no GPU pipeline
      // rebuild, no shader recompile, just one buffer re-upload
      // (~5 MB worst case at 2σ on the merged catalogue).
      //
      // Bail-outs (in order):
      //   1. No manifest: nothing to switch to (legacy single-σ
      //      deployment).  The dropdown shouldn't have rendered
      //      either, so reaching this is a programmer error or
      //      devtools poke; treat as no-op.
      //   2. σ unchanged: skip the network round-trip.  Common during
      //      React state churn (e.g. rapid SettingsPanel rerenders).
      //   3. σ not in manifest: defensive — `loadFilaments` would
      //      return null anyway, but bailing here keeps the active
      //      dataset on screen instead of clearing it.
      const manifest = state.gpu.filamentManifest;
      if (!manifest) return;
      if (state.settings.filamentSigma === sigma) return;
      const present = manifest.available.some((e) => e.sigma === sigma);
      if (!present) return;

      // Optimistic state update — match the SettingsPanel UI immediately
      // so the dropdown doesn't appear stuck while the fetch is in
      // flight.  If the fetch fails, the previous dataset stays on
      // screen and the user can see the dropdown reflects the new σ
      // (matches the "select a missing σ" behaviour from manifest
      // mismatch — silent failure, no error toast).
      state.settings.filamentSigma = sigma;

      const cloud = await loadFilaments({ sigma, manifest });
      if (!cloud) return;
      const renderer = state.gpu.filamentRenderer;
      if (!renderer) return;
      renderer.upload(cloud);
      state.subsystems.scheduler.requestRender();
    },
```

(g) Optional cleanup: in `destroy()` (around line 1450) where `state.gpu.filamentRenderer` is released, also reset the manifest:
```ts
      state.gpu.filamentRenderer?.destroy();
      state.gpu.filamentRenderer = null;
      state.gpu.filamentManifest = null;
```

- [ ] **Step 8: Run the engineState tests — they should pass now**

Run:
```
npm test -- tests/@types/engineState.test.ts
```
Expected: all 3 tests pass.

- [ ] **Step 9: Run the full test suite**

Run:
```
npm test
```
Expected: every test passes.

- [ ] **Step 10: Run the typecheck**

Run:
```
npm run typecheck
```
Expected: zero errors.

- [ ] **Step 11: Commit**

```
git add src/@types/EngineHandle.d.ts src/@types/EngineSettingsState.d.ts src/@types/EngineGpuHandles.d.ts src/data/defaults.ts src/services/engine/engine.ts tests/@types/engineState.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): wire multi-σ filament manifest + setFilamentSigma

Engine fetches the manifest at startup and stores it on state.gpu.
setFilamentSigma swaps the active dataset by re-uploading the
FilamentRenderer's instance buffer.  When the manifest is absent the
legacy single-σ load path runs unchanged (backwards compatible).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: SettingsPanel — σ Dropdown Next to Filaments Toggle

**Files:**
- Modify: `src/components/SettingsPanel/SettingsPanel.tsx` (props + dropdown render)
- Create: `tests/components/SettingsPanel/SettingsPanelFilaments.test.ts`

The dropdown only renders when (a) the Filaments toggle is enabled (no point picking a σ for an off layer), AND (b) the manifest has more than one σ available. Per-option strip count appears in muted text after the σ label, e.g. "3σ (standard, 51,967 strips)".

- [ ] **Step 1: Write the failing test for the dropdown rendering**

Create `tests/components/SettingsPanel/SettingsPanelFilaments.test.ts`:

```ts
/**
 * SettingsPanel σ-dropdown render tests.
 *
 * Same node-only `renderToStaticMarkup` strategy as
 * `CollapsibleSection.test.ts` — we don't simulate clicks, we just
 * assert on the initial markup string.  The four assertions:
 *
 *   1. With no manifest, no σ-select renders.
 *   2. With a single-entry manifest, no σ-select renders (nothing to
 *      pick from).
 *   3. With a multi-entry manifest AND filamentsEnabled=true, the
 *      σ-select renders with one <option> per available σ, the
 *      active σ is selected, and each option label includes the
 *      formatted strip count.
 *   4. With multi-entry manifest BUT filamentsEnabled=false, the
 *      σ-select is hidden (no point picking a σ for an off layer).
 *
 * Behaviour-of-clicks (changing the σ → onChange fires) is covered by
 * the live dev-server visual check, per project convention.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SettingsPanel } from '../../../src/components/SettingsPanel/SettingsPanel';
import type { FilamentManifest } from '../../../src/@types/FilamentManifest';

// Minimal props bag — every required field is supplied with a stub.
// Only the filament-related props are interesting for these tests; the
// rest are tolerated by the panel and rendered as their respective
// rows or omitted via the optional-props guard.
function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    pointSize: 2.5,
    brightness: 1.0,
    autoRotate: false,
    onPointSizeChange: () => {},
    onBrightnessChange: () => {},
    onAutoRotateChange: () => {},
    onResetCamera: () => {},
    ...overrides,
  };
}

const triCutManifest: FilamentManifest = {
  available: [
    { sigma: 2, file: 'filaments-sigma2.bin', stripCount: 80123, vertexCount: 401234 },
    { sigma: 3, file: 'filaments-sigma3.bin', stripCount: 51967, vertexCount: 315534 },
    { sigma: 5, file: 'filaments-sigma5.bin', stripCount: 12345, vertexCount: 67890 },
  ],
  default: 3,
};

const singleCutManifest: FilamentManifest = {
  available: [
    { sigma: 3, file: 'filaments-sigma3.bin', stripCount: 51967, vertexCount: 315534 },
  ],
  default: 3,
};

describe('SettingsPanel filament σ dropdown', () => {
  it('does NOT render the σ dropdown when no manifest is provided', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsPanel, makeProps({
        filamentsEnabled: true,
        onFilamentsChange: () => {},
        // filamentManifest intentionally omitted.
      }) as never),
    );
    expect(html).not.toContain('id="filament-sigma"');
  });

  it('does NOT render the σ dropdown for a single-entry manifest', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsPanel, makeProps({
        filamentsEnabled: true,
        onFilamentsChange: () => {},
        filamentManifest: singleCutManifest,
        filamentSigma: 3,
        onFilamentSigmaChange: () => {},
      }) as never),
    );
    expect(html).not.toContain('id="filament-sigma"');
  });

  it('renders the σ dropdown with one <option> per σ when filamentsEnabled=true', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsPanel, makeProps({
        filamentsEnabled: true,
        onFilamentsChange: () => {},
        filamentManifest: triCutManifest,
        filamentSigma: 3,
        onFilamentSigmaChange: () => {},
      }) as never),
    );
    expect(html).toContain('id="filament-sigma"');
    // Each σ value appears as an option value.
    expect(html).toMatch(/<option[^>]*value="2"/);
    expect(html).toMatch(/<option[^>]*value="3"/);
    expect(html).toMatch(/<option[^>]*value="5"/);
    // Strip count formatted with locale separators (en-US → comma).
    expect(html).toContain('80,123');
    expect(html).toContain('51,967');
    expect(html).toContain('12,345');
    // The active σ is marked selected.  React's static markup uses
    // `selected=""` on the chosen option.
    expect(html).toMatch(/<option[^>]*value="3"[^>]*selected/);
  });

  it('hides the σ dropdown when filamentsEnabled=false even with a multi-entry manifest', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsPanel, makeProps({
        filamentsEnabled: false,
        onFilamentsChange: () => {},
        filamentManifest: triCutManifest,
        filamentSigma: 3,
        onFilamentSigmaChange: () => {},
      }) as never),
    );
    // The Filaments toggle row IS rendered (the user needs the affordance
    // to turn it on), but the σ select must NOT be present.
    expect(html).toContain('toggle-filaments');
    expect(html).not.toContain('id="filament-sigma"');
  });
});
```

- [ ] **Step 2: Run the test — expect it to fail**

Run:
```
npm test -- tests/components/SettingsPanel/SettingsPanelFilaments.test.ts
```
Expected: FAIL — the panel doesn't accept the new props yet (`filamentManifest`, `filamentSigma`, `onFilamentSigmaChange`), and the dropdown markup doesn't exist.

- [ ] **Step 3: Add the new props to the SettingsPanel `Props` type**

Edit `src/components/SettingsPanel/SettingsPanel.tsx`. Find the existing `onFilamentsChange?: (enabled: boolean) => void;` declaration (around line 116). Immediately after it, add:

```ts
  /**
   * Manifest of available filament-skeleton σ datasets.  When present
   * AND `available.length > 1`, the panel renders a `<select>` next to
   * the Filaments toggle.  When null/undefined or single-entry, the
   * select is hidden.
   *
   * Optional — older call sites without this prop see the legacy
   * single-σ behaviour (just the on/off checkbox).
   */
  filamentManifest?: import('../../@types/FilamentManifest').FilamentManifest | null;
  /** Currently-selected σ value (must match a manifest entry when set). */
  filamentSigma?: number;
  /**
   * Fired when the user picks a different σ from the dropdown.
   * Required if `filamentManifest` is wired — without it the dropdown
   * couldn't actually do anything when changed.
   */
  onFilamentSigmaChange?: (sigma: number) => void;
```

- [ ] **Step 4: Add the props to the destructured `Props` argument list**

In the `function SettingsPanel({ ... }: Props)` destructuring (around line 296), add the three new fields just after `onFilamentsChange,`:

```ts
  filamentsEnabled,
  onFilamentsChange,
  filamentManifest,
  filamentSigma,
  onFilamentSigmaChange,
```

- [ ] **Step 5: Compute the dropdown-visibility flag and add the markup**

Just below the existing `const showFilamentsToggle = ...` line (around line 328), add:

```ts
  // σ-dropdown visibility: requires the Filaments toggle to be ON
  // (no point picking a σ for an off layer), AND the manifest must
  // exist with more than one entry (otherwise there is nothing to
  // pick).  The strict check on `filamentsEnabled === true` (not just
  // truthy) matches the prop's optional-boolean shape — `undefined`
  // means "the Filaments feature isn't wired" and definitely should
  // not show the σ select.
  //
  // We also require all three filament σ props to be wired together
  // — same opt-in idiom as the rest of the panel: half-wired props
  // are a developer error, not a silently-degraded UX.
  const showFilamentSigmaSelect =
    filamentsEnabled === true &&
    filamentManifest !== undefined &&
    filamentManifest !== null &&
    filamentManifest.available.length > 1 &&
    filamentSigma !== undefined &&
    onFilamentSigmaChange !== undefined;
```

Then in the JSX, find the existing Filaments-toggle div (around line 716–726):

```tsx
            {showFilamentsToggle && (
              <div className={styles.panelRow}>
                <label htmlFor="toggle-filaments">Filaments (cosmic web)</label>
                <input
                  id="toggle-filaments"
                  type="checkbox"
                  checked={filamentsEnabled}
                  onChange={(e) => onFilamentsChange(e.target.checked)}
                />
              </div>
            )}
```

Replace it with:

```tsx
            {showFilamentsToggle && (
              <div className={styles.panelRow}>
                <label htmlFor="toggle-filaments">Filaments (cosmic web)</label>
                <input
                  id="toggle-filaments"
                  type="checkbox"
                  checked={filamentsEnabled}
                  onChange={(e) => onFilamentsChange(e.target.checked)}
                />
              </div>
            )}
            {showFilamentSigmaSelect && (
              <div className={styles.panelRow}>
                <label htmlFor="filament-sigma">Persistence cut</label>
                <select
                  id="filament-sigma"
                  className={styles.modeSelect}
                  value={filamentSigma}
                  onChange={(e) => onFilamentSigmaChange(Number(e.target.value))}
                >
                  {filamentManifest!.available.map((entry) => {
                    // Per-σ display labels.  Two pieces:
                    //   - "Nσ" with a short qualitative tag (dense /
                    //     standard / robust spine) so a non-expert
                    //     user has a hint without reading the README.
                    //   - the formatted strip count in parentheses,
                    //     so someone comparing options can see how
                    //     much data is in each cut.
                    //
                    // The qualitative tag is hard-coded for the three
                    // canonical cuts (2/3/5) and falls through to a
                    // generic "filaments" label for any other σ a
                    // future build might emit.  No translation
                    // (project is English-only).
                    let qualitative: string;
                    if (entry.sigma === 2) qualitative = 'dense';
                    else if (entry.sigma === 3) qualitative = 'standard';
                    else if (entry.sigma === 5) qualitative = 'robust spine';
                    else qualitative = 'filaments';
                    const label =
                      `${entry.sigma}σ (${qualitative}, ` +
                      `${entry.stripCount.toLocaleString('en-US')} strips)`;
                    return (
                      <option key={entry.sigma} value={entry.sigma}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
```

- [ ] **Step 6: Run the SettingsPanel test — expect it to pass**

Run:
```
npm test -- tests/components/SettingsPanel/SettingsPanelFilaments.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 7: Run the full suite + typecheck**

Run:
```
npm test && npm run typecheck
```
Expected: every test passes; zero typecheck errors.

- [ ] **Step 8: Commit**

```
git add src/components/SettingsPanel/SettingsPanel.tsx tests/components/SettingsPanel/SettingsPanelFilaments.test.ts
git commit -m "$(cat <<'EOF'
feat(SettingsPanel): add filament σ-dropdown next to Filaments toggle

Renders <select> with one option per available σ when filamentsEnabled
+ multi-entry manifest are both present.  Each option shows the σ
value, a qualitative tag (dense / standard / robust spine), and the
formatted strip count.  Hidden cleanly for legacy single-σ deployments.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: App.tsx — Wire `filamentSigma` State + localStorage Persistence

**Files:**
- Modify: `src/App.tsx`

The App.tsx layer owns the React state for `filamentSigma`, persists it to localStorage (matching the `CollapsibleSection` pattern), and forwards changes to `engine.setFilamentSigma`. Initial value resolution: read localStorage first; if absent, fall back to `DEFAULT_FILAMENT_SIGMA`. The engine's manifest-based override (Task 5 step 7e) will sync this on first paint.

- [ ] **Step 1: Read the App.tsx structure to confirm where to insert the new state**

Run:
```
grep -n "filamentsEnabled\|setFilamentsEnabled\|DEFAULT_FILAMENT" /Users/rulkens/Development/js/skymap/src/App.tsx
```
Expected: shows the existing `filamentsEnabled` useState block around line 170 and the SettingsPanel prop wiring around line 488. We insert the new state and prop wiring directly adjacent to those.

- [ ] **Step 2: Add the localStorage helpers near the top of App.tsx**

Edit `src/App.tsx`. Find the existing import block and verify the file imports defaults — locate the line that imports `DEFAULT_FILAMENTS_ENABLED` (it's in a multi-line import from `'./data/defaults'`). Add `DEFAULT_FILAMENT_SIGMA` to the same import.

Then, just above the `function App(): ReactNode {` (or equivalent component start), add this localStorage helper block (search for the file's existing top-level helpers — if there are none, place immediately before the component declaration):

```ts
/**
 * Persist + read the user's filament σ choice across page reloads.
 *
 * Same pattern as `CollapsibleSection`'s `readSectionOpen` /
 * `writeSectionOpen` — single localStorage key, defensive try/catch
 * around every access (Safari private mode + quota errors), SSR-safe
 * via the `typeof window` guard.  Returns null if the stored value is
 * absent, malformed, or storage is unavailable; the caller falls back
 * to its own default.
 */
const FILAMENT_SIGMA_STORAGE_KEY = 'settings.filamentSigma';

function readFilamentSigma(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(FILAMENT_SIGMA_STORAGE_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return n;
  } catch {
    return null;
  }
}

function writeFilamentSigma(sigma: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FILAMENT_SIGMA_STORAGE_KEY, String(sigma));
  } catch {
    // localStorage write failures are non-fatal — the setting works
    // for the current session, just doesn't persist across reloads.
  }
}
```

- [ ] **Step 3: Add the `filamentSigma` useState block**

Find the existing line (around 170):
```ts
const [filamentsEnabled, setFilamentsEnabled] = useState<boolean>(DEFAULT_FILAMENTS_ENABLED);
```
Add immediately after:

```ts
// Filament σ — persisted to localStorage so the user's choice
// survives reloads.  Initial value resolution:
//   1. Storage key, if present (user picked a σ in a previous session)
//   2. DEFAULT_FILAMENT_SIGMA (3, the cosmology-paper standard)
// The engine's startup IIFE may override this once the manifest
// arrives — `state.settings.filamentSigma = manifest.default` (see
// engine.ts).  In practice that's a no-op when the user's persisted
// choice matches the manifest's default; the override only kicks in
// on first visit (no persisted value) or when the manifest's default
// has changed since the last visit.
const [filamentSigma, setFilamentSigmaState] = useState<number>(
  () => readFilamentSigma() ?? DEFAULT_FILAMENT_SIGMA,
);

// Manifest is fetched by the engine and surfaced via a callback (see
// `onFilamentManifestChange` below).  We mirror it in React state so
// the SettingsPanel can render the dropdown immediately on arrival.
const [filamentManifest, setFilamentManifest] = useState<
  import('./@types/FilamentManifest').FilamentManifest | null
>(null);
```

- [ ] **Step 4: Wire the manifest callback into the engine creation**

Find the `createEngine` call site (search for `createEngine(canvasRef`). Add a callback for the manifest:

This requires a tiny addition to `EngineCallbacks`. Edit `src/@types/EngineCallbacks.d.ts` and add the optional callback:

```ts
  /**
   * Called once at engine startup when the filament manifest
   * (`filaments-manifest.json`) has been fetched and parsed.  Fires
   * with `null` when the file is missing — App.tsx should treat that
   * as "single-σ deployment, no dropdown needed".
   *
   * Optional — older callers without this prop don't get notified
   * (the engine still works; just no UI populates from the manifest).
   */
  onFilamentManifestChange?: (manifest: import('./FilamentManifest').FilamentManifest | null) => void;
```

In `engine.ts` step 7e from Task 5, augment the manifest fetch to fire the callback:
```ts
      loadFilamentManifest().then(async (manifest) => {
        state.gpu.filamentManifest = manifest;
        cb.onFilamentManifestChange?.(manifest);   // ← add this line
        if (manifest && manifest.default !== 0) {
          state.settings.filamentSigma = manifest.default;
        }
        const cloud = await loadFilaments({ manifest: manifest ?? undefined });
        // … rest unchanged
```

(If executing tasks strictly in order, this is a small addition to Task 5 — apply it now if it wasn't applied then.)

In App.tsx, at the engine-creation callback bag, add:
```ts
        onFilamentManifestChange: (manifest) => {
          setFilamentManifest(manifest);
          // If the manifest's default differs from the user's persisted
          // choice AND the persisted choice isn't in the manifest, reset
          // to the default.  This keeps the dropdown coherent: we never
          // show a σ value the user can't actually load.
          if (manifest) {
            const persistedAvailable = manifest.available.some(
              (e) => e.sigma === filamentSigma,
            );
            if (!persistedAvailable) {
              setFilamentSigmaState(manifest.default);
              writeFilamentSigma(manifest.default);
            }
          }
        },
```

- [ ] **Step 5: Wire the new props through to SettingsPanel**

Find the existing `onFilamentsChange` prop (around line 489). Add immediately after it:

```tsx
        filamentManifest={filamentManifest}
        filamentSigma={filamentSigma}
        onFilamentSigmaChange={(sigma) => {
          setFilamentSigmaState(sigma);
          writeFilamentSigma(sigma);
          // Forward to the engine.  Async but we don't await — the
          // optimistic React state update above is the source of truth
          // for the dropdown's rendered value; the engine just
          // catches up when the .bin lands.  The `?.` chain covers
          // the early-frame case before the engine handle resolves.
          handleRef.current?.setFilamentSigma?.(sigma);
        }}
```

- [ ] **Step 6: Run typecheck**

Run:
```
npm run typecheck
```
Expected: zero errors.

- [ ] **Step 7: Run the full suite**

Run:
```
npm test
```
Expected: every test passes (App.tsx itself isn't tested directly — DOM-free environment — but the engine + SettingsPanel + cloudLoader tests transitively cover the wiring).

- [ ] **Step 8: Commit**

```
git add src/App.tsx src/@types/EngineCallbacks.d.ts src/services/engine/engine.ts
git commit -m "$(cat <<'EOF'
feat(App): persist filament σ to localStorage + wire dropdown setter

App owns React state for filamentSigma (initial value from
localStorage with DEFAULT_FILAMENT_SIGMA fallback), forwards changes
to engine.setFilamentSigma, and mirrors the manifest from the engine
so the SettingsPanel dropdown can populate as soon as the manifest
arrives.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Belt-and-Braces Tests — Manifest Round-trip + Engine State Shape

**Files:**
- Create: `tests/tools/buildFilamentsManifest.test.ts`

This task adds a small round-trip test for the manifest writer logic — independent of DisPerSE, covering the default-σ rule and the JSON shape. Tasks 3, 4, 5, and 6 already added their respective unit tests; this one fills the remaining gap (the `writeManifest` function from Task 2).

- [ ] **Step 1: Refactor `writeManifest` to make it testable**

Edit `tools/buildFilaments.ts`. Currently `writeManifest` does both the computation (sort, default selection) and the disk write (`writeFileSync`). Split into a pure function and a thin wrapper so the pure piece can be tested without disk:

Replace the existing `writeManifest` with:

```ts
/**
 * Pure helper: build the manifest object from accumulated entries.
 *
 * Split out from `writeManifest` so the default-σ rule and the
 * sort can be tested without touching disk.  See `writeManifest`
 * for the full rationale on the manifest shape and default rule.
 */
export function buildManifestObject(
  entries: ReadonlyArray<{
    sigma: number;
    file: string;
    stripCount: number;
    vertexCount: number;
  }>,
): {
  available: ReadonlyArray<{
    sigma: number;
    file: string;
    stripCount: number;
    vertexCount: number;
  }>;
  default: number;
} {
  const sortedEntries = [...entries].sort((a, b) => a.sigma - b.sigma);
  const sigmas = sortedEntries.map((e) => e.sigma);
  let defaultSigma: number;
  if (sigmas.includes(3)) {
    defaultSigma = 3;
  } else if (sigmas.length > 0) {
    defaultSigma = sigmas[0]!;
  } else {
    defaultSigma = 0;
  }
  return { available: sortedEntries, default: defaultSigma };
}

function writeManifest(
  entries: ReadonlyArray<{
    sigma: number;
    file: string;
    stripCount: number;
    vertexCount: number;
  }>,
  cutsRequested: readonly number[],
): void {
  const manifest = buildManifestObject(entries);
  const path = resolve('public/data/filaments-manifest.json');
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
  process.stderr.write(
    `  manifest: ${manifest.available.length} entries, ` +
      `default σ=${manifest.default}, requested=[${cutsRequested.join(', ')}]\n`,
  );
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/tools/buildFilamentsManifest.test.ts`:

```ts
/**
 * buildFilaments — manifest-shape unit tests.
 *
 * Tests the pure `buildManifestObject` helper: sort order, default-σ
 * selection rule, edge cases (empty, single, no-3σ).  The disk-write
 * side of `writeManifest` is not tested — disk IO with a real fs is
 * out of scope for the node-only Vitest environment, and the helper
 * is the only logic worth pinning.
 */
import { describe, expect, it } from 'vitest';

import { buildManifestObject } from '../../tools/buildFilaments';

describe('buildManifestObject', () => {
  it('sorts entries ascending by σ', () => {
    const m = buildManifestObject([
      { sigma: 5, file: 'filaments-sigma5.bin', stripCount: 12345, vertexCount: 67890 },
      { sigma: 2, file: 'filaments-sigma2.bin', stripCount: 80123, vertexCount: 401234 },
      { sigma: 3, file: 'filaments-sigma3.bin', stripCount: 51967, vertexCount: 315534 },
    ]);
    expect(m.available.map((e) => e.sigma)).toEqual([2, 3, 5]);
  });

  it("picks 3 as default when 3 is in the list", () => {
    const m = buildManifestObject([
      { sigma: 2, file: 'a', stripCount: 1, vertexCount: 1 },
      { sigma: 3, file: 'b', stripCount: 1, vertexCount: 1 },
      { sigma: 5, file: 'c', stripCount: 1, vertexCount: 1 },
    ]);
    expect(m.default).toBe(3);
  });

  it('falls back to the smallest σ when 3 is absent', () => {
    const m = buildManifestObject([
      { sigma: 4, file: 'a', stripCount: 1, vertexCount: 1 },
      { sigma: 7, file: 'b', stripCount: 1, vertexCount: 1 },
    ]);
    expect(m.default).toBe(4);
  });

  it('returns sentinel default 0 for an empty entries array', () => {
    const m = buildManifestObject([]);
    expect(m.available).toEqual([]);
    expect(m.default).toBe(0);
  });

  it('handles a single-entry list (default = the only σ)', () => {
    const m = buildManifestObject([
      { sigma: 5, file: 'x', stripCount: 1, vertexCount: 1 },
    ]);
    expect(m.default).toBe(5);
    expect(m.available).toHaveLength(1);
  });

  it('round-trips through JSON.stringify / JSON.parse', () => {
    const m = buildManifestObject([
      { sigma: 2, file: 'filaments-sigma2.bin', stripCount: 80123, vertexCount: 401234 },
      { sigma: 3, file: 'filaments-sigma3.bin', stripCount: 51967, vertexCount: 315534 },
    ]);
    const round = JSON.parse(JSON.stringify(m)) as typeof m;
    expect(round.available[0]!.sigma).toBe(2);
    expect(round.available[1]!.stripCount).toBe(51967);
    expect(round.default).toBe(3);
  });
});
```

- [ ] **Step 3: Run the test**

Run:
```
npm test -- tests/tools/buildFilamentsManifest.test.ts
```
Expected: 6 tests pass.

If the test runner doesn't pick up `tests/tools/` automatically, check `vitest.config.ts` — it includes `tests/**/*.test.ts`, so the file is picked up. (The earlier listing of `tests/` shows no `tools/` subfolder yet; this task creates it.)

- [ ] **Step 4: Run the full suite + typecheck**

Run:
```
npm test && npm run typecheck
```
Expected: every test passes; zero typecheck errors.

- [ ] **Step 5: Commit**

```
git add tools/buildFilaments.ts tests/tools/buildFilamentsManifest.test.ts
git commit -m "$(cat <<'EOF'
test(buildFilaments): add buildManifestObject round-trip tests

Refactors writeManifest to delegate to a pure buildManifestObject
helper so the default-σ rule, sort order, and edge cases (empty,
single-entry, no-3σ) can be tested without disk IO.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: README — Document `--cuts` Syntax + Manifest Path

**Files:**
- Modify: `README.md`

The README has no DisPerSE / filament section yet (verified at planning time). This task adds a short section explaining the `--cuts` flag and the manifest. Brief — three or four paragraphs is the right size.

- [ ] **Step 1: Identify the right insertion point in README.md**

Run:
```
grep -n "^##\|^###" /Users/rulkens/Development/js/skymap/README.md | head -30
```
Expected: lists section headers. Pick a slot adjacent to the build-data section (look for "build-all" or similar around line 92). The new section reads naturally after the "Build the binary files" block.

- [ ] **Step 2: Insert the multi-σ filament section**

Edit `README.md`. After the section that documents `npm run build-all` (around line 118), add a new sub-section:

```markdown
### 3. (Optional) Build the cosmic-web filament skeleton

The viewer can overlay a cosmic-web filament skeleton extracted from the
2MRS + GLADE catalogue using DisPerSE (Sousbie 2011).  This step is
optional — fresh clones work fine without it; the Filaments toggle in
the SettingsPanel is a silent no-op until you build the data.

#### Single-σ build (legacy)

```bash
npm run build-filaments -- --cut 3
```

Writes `public/data/filaments-sigma3.bin` plus
`public/data/filaments-manifest.json`.  The viewer's σ dropdown is
hidden when only one σ is available (nothing to pick from).

#### Multi-σ build (recommended)

```bash
npm run build-filaments -- --cuts 2,3,5
```

Writes one `.bin` per σ value (so:
`filaments-sigma2.bin`, `filaments-sigma3.bin`,
`filaments-sigma5.bin`) plus the manifest.  After this the
SettingsPanel shows a dropdown letting the user compare:

- **2σ (dense)** — includes shot-noise ridges, visually rich for
  outreach renders.
- **3σ (standard)** — cosmology-paper default (Tempel+ 2014).
- **5σ (robust spine)** — only the most persistent ridges; the
  Sousbie 2011 original "cosmic web with its leaves stripped off".

The slow Delaunay-tessellation stage (`.NDnet`) is cached on disk and
shared across cuts — running 3 σ values is barely more expensive than
running 1 once the tessellation has been built.

#### Requirements

`delaunay_3D`, `mse`, and `skelconv` must be on `PATH`.  See the
DisPerSE README for build instructions; `delaunay_3D` requires CGAL at
build time.  Peak memory: ~16 GB during `mse`.  Wall clock for the
merged catalogue: ~6–12 hours for the first cut, minutes per
additional cut.
```

- [ ] **Step 3: Verify the markdown renders correctly**

Run:
```
grep -A 3 "Multi-σ build" /Users/rulkens/Development/js/skymap/README.md
```
Expected: shows the heading and the immediately-following content. (No automated markdown-linter is run on this project; visual confirmation suffices.)

- [ ] **Step 4: Commit**

```
git add README.md
git commit -m "$(cat <<'EOF'
docs(README): document multi-σ filament build + manifest

New section walks through `npm run build-filaments -- --cuts 2,3,5`,
the per-σ output filenames, the manifest path, and the qualitative
meaning of each canonical σ.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Visual Verification

**Files:** none (manual UI check via the live dev server).

This task confirms the feature works end-to-end in a real browser. Per project convention (CLAUDE.md), the dev server stays running for HMR — we don't restart it; we just describe what to look for, then ask the user to confirm.

- [ ] **Step 1: Build the multi-σ datasets if not already present**

If DisPerSE is installed and the user wants to verify the full pipeline:
```
export PATH=$PATH:~/Development/vendor/cpp/DisPerSE/bin
npm run build-filaments -- --cuts 2,3,5
```
Expected output (last lines):
```
finished 3 cuts.  Manifest at public/data/filaments-manifest.json.
```

If DisPerSE is not installed, skip — the feature still loads cleanly with no manifest (legacy single-σ behaviour persists).

- [ ] **Step 2: Verify the manifest exists and is well-formed**

Run:
```
cat public/data/filaments-manifest.json
```
Expected: a JSON object with `available` (3 entries: σ=2, 3, 5) and `default` (3).

- [ ] **Step 3: Verify the viewer renders the dropdown**

Open the dev server in a browser (`npm run dev` should already be running per project convention). Open the SettingsPanel (gear icon or shortcut), enable the Filaments toggle. The σ dropdown should appear immediately next to the toggle, populated with three options:

- "2σ (dense, N strips)"
- "3σ (standard, N strips)" — selected by default
- "5σ (robust spine, N strips)"

(Where N is the actual strip count from each `.bin`.)

- [ ] **Step 4: Verify σ-switching swaps the visible filament network**

Switch the dropdown to "5σ (robust spine, …)". The visible filament density should drop dramatically (only the most persistent ridges remain). Switch to "2σ (dense, …)" and the density jumps up (more, finer filaments). Switch back to "3σ" and the standard cosmology-paper view returns.

- [ ] **Step 5: Verify the localStorage persistence**

Pick "5σ" then reload the page. After reload (and after the manifest fetch resolves), the dropdown should still show "5σ" selected. Pick "2σ", reload — should still show "2σ".

- [ ] **Step 6: Verify the legacy single-σ deployment path**

In the browser devtools Network tab, force a 404 on `filaments-manifest.json` (or rename the file on disk to a backup name). Reload. The Filaments toggle should still appear, the σ dropdown should be hidden, and toggling Filaments on should still load `filaments.bin` if present (or the σ-suffixed default if `filaments.bin` is absent — either is acceptable; depends on which file the operator left in place).

- [ ] **Step 7: Confirm with the user**

Ask the user: "Does the σ dropdown appear when filaments are enabled? Do the three σ options switch the visible filament density as expected? Does the choice persist across reload?"

If yes — task complete.

(No commit — visual verification leaves no code changes.)

---

## Self-Review

**Spec coverage:**
- Build-time: --cuts argument (Task 1), per-σ filename (Task 1), manifest writer (Task 2). ✓
- Runtime: loadFilamentManifest (Task 3), loadFilaments(sigma) (Task 4), setFilamentSigma + state plumbing (Task 5), SettingsPanel dropdown (Task 6), App.tsx + localStorage (Task 7). ✓
- Tests: cloudLoader manifest + dataset (Task 3, 4), engine state shape (Task 5), SettingsPanel (Task 6), manifest round-trip (Task 8). ✓
- README docs (Task 9). ✓
- Architecture decisions 1–6 (JSON manifest, pre-baked, full re-upload on switch, manifest at startup, no auto-rebuild, default from manifest) — all reflected in the task implementations. ✓

**Placeholder scan:**
- No "TBD", "TODO", or "implement later".
- Every step has either runnable commands, exact code blocks, or explicit acceptance criteria.
- No "similar to Task N" — code is repeated where it could otherwise be.

**Type consistency:**
- `FilamentManifest` / `FilamentManifestEntry` (Task 3) used unchanged in Tasks 5, 6, 7.
- `setFilamentSigma` (signature: `(sigma: number) => Promise<void>`) declared in EngineHandle (Task 5) and consumed in App.tsx (Task 7).
- `loadFilamentManifest()` signature `() => Promise<FilamentManifest | null>` consistent across declaration (Task 3) and use (Task 5).
- `loadFilaments({ sigma, manifest })` options shape: declaration (Task 4), use (Task 5 engine.ts).
- `DEFAULT_FILAMENT_SIGMA` = 3 — defined in Task 5, consumed in Task 5 (engine.ts initial state) and Task 7 (App.tsx fallback).
- `filamentSigma: number` field name consistent across `EngineSettingsState` (Task 5), App.tsx state (Task 7), SettingsPanel prop (Task 6).
- `filamentManifest: FilamentManifest | null` consistent across `EngineGpuHandles` (Task 5), App.tsx state (Task 7), SettingsPanel prop (Task 6).

**Backwards compatibility:**
- `--cut N` (single-σ legacy) still works (Task 1 parser).
- Zero-arg `loadFilaments()` still loads `/data/filaments.bin` (Task 4).
- `EngineHandle.setFilamentSigma` is optional (`?:`) so callers without the multi-σ wiring compile unchanged.
- App.tsx wiring is purely additive (no existing prop reshaping).

Plan complete and saved to `docs/superpowers/plans/2026-05-05-multi-sigma-filament-switcher.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
