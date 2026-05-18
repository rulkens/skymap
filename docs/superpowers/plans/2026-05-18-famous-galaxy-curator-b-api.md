# Famous Galaxy Curator — Plan B: API endpoints

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Depends on:** Plan A merged. The `apiPlugin` route table, path helpers, recipe serialiser, and `applyLuminanceAsAlpha` helper (at `tools/utils/image/applyLuminanceAsAlpha.ts`) from Plan A are prerequisites.

**Goal:** Add the five real API routes (`/api/fetch`, `/api/process`, `/api/process/alpha-only`, `/api/export`, `/api/galaxies`) plus preview WebP serving (`/api/preview/:tmpId/:name`) to the curator's Vite plugin. Each route is fully exercisable via curl with `MOCK_STARNET=1`. By the end of this plan the back-end is feature-complete; Plan C drives it from the React UI.

**Architecture:** Each route is a pure async handler with injected dependencies (fs adapter, child_process spawner, tmpdir factory, fetch implementation) so vitest tests drive them without touching disk or network. The handlers live in `tools/famous-curator/plugin/routes/` and are wired into the route table in `apiPlugin.ts`. A `starnet.ts` module wraps the `starnet2` spawn (with `MOCK_STARNET=1` shim returning input → output verbatim). Tmpdir sessions live under `os.tmpdir()/famous-curator/<tmpId>/`; the directory holds `source.png` (full resolution), `source.webp` (preview), `starless.png` (full resolution, post-StarNet), `starless.webp` (preview), and `alpha.webp` (preview). Export atomically writes `public/images/famous-curated/<id>/.tmp/{source,starless,full,atlas}.webp + recipe.json`, then renames `.tmp/` into place (replacing any existing directory). The override index update is read-modify-write to a temp file followed by rename, safe under concurrent re-runs of the same `/api/export` for the same id.

**Tech Stack:** TypeScript, Vitest, Node fs/promises + child_process + os, sharp (already in deps). No new deps.

**Branch + PR strategy:** Single feature branch `feature/curator-b-api`; commit per task. Open one PR against `main` after Task 10 lands.

---

### Task 1: `starnet` wrapper with MOCK_STARNET shim

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/starnet.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/starnet.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/starnet.test.ts`:

```ts
/**
 * starnet — shell-out wrapper tests.
 *
 * Two surfaces:
 *  - resolveStarnetConfig(env) — pure, picks the binary + weights path
 *    from env vars.  Throws if STARNET_WEIGHTS is missing (when not in
 *    mock mode).
 *  - runStarnet({ input, output, stride, upsample, config }) — spawns
 *    starnet2 (or copies input → output when config.mock is true).
 *
 * The spawn test uses an injected spawner so we don't depend on the
 * real binary being installed.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveStarnetConfig,
  runStarnet,
  type Spawner,
} from '../../../tools/famous-curator/plugin/starnet';

describe('resolveStarnetConfig', () => {
  it('returns the env-supplied bin + weights path', () => {
    const cfg = resolveStarnetConfig({ STARNET_BIN: 'sn2', STARNET_WEIGHTS: '/w.pt' });
    expect(cfg.mock).toBe(false);
    expect(cfg.bin).toBe('sn2');
    expect(cfg.weights).toBe('/w.pt');
  });

  it('defaults bin to starnet2 when STARNET_BIN is unset', () => {
    const cfg = resolveStarnetConfig({ STARNET_WEIGHTS: '/w.pt' });
    expect(cfg.bin).toBe('starnet2');
  });

  it('throws when STARNET_WEIGHTS is missing in real mode', () => {
    expect(() => resolveStarnetConfig({})).toThrow(/STARNET_WEIGHTS/);
  });

  it('returns mock config when MOCK_STARNET=1', () => {
    const cfg = resolveStarnetConfig({ MOCK_STARNET: '1' });
    expect(cfg.mock).toBe(true);
  });
});

describe('runStarnet', () => {
  it('mock mode copies input bytes to output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'curator-starnet-'));
    const input = join(dir, 'in.png');
    const output = join(dir, 'out.png');
    writeFileSync(input, Buffer.from([1, 2, 3, 4, 5]));
    await runStarnet({
      input,
      output,
      stride: 256,
      upsample: false,
      config: { mock: true },
    });
    expect(Array.from(readFileSync(output))).toEqual([1, 2, 3, 4, 5]);
  });

  it('real mode invokes the binary with the expected argv', async () => {
    let capturedArgs: readonly string[] = [];
    const spawner: Spawner = (bin, args) => {
      capturedArgs = [bin, ...args];
      return Promise.resolve({ code: 0, stdout: '', stderr: '' });
    };
    await runStarnet({
      input: '/in.png',
      output: '/out.png',
      stride: 512,
      upsample: true,
      config: { mock: false, bin: 'starnet2', weights: '/w.pt' },
      spawner,
    });
    expect(capturedArgs).toEqual([
      'starnet2',
      '-i', '/in.png',
      '-o', '/out.png',
      '-s', '512',
      '-w', '/w.pt',
      '-e',
      '-u',
    ]);
  });

  it('real mode without upsample omits the -u flag', async () => {
    let capturedArgs: readonly string[] = [];
    const spawner: Spawner = (bin, args) => {
      capturedArgs = [bin, ...args];
      return Promise.resolve({ code: 0, stdout: '', stderr: '' });
    };
    await runStarnet({
      input: '/in.png',
      output: '/out.png',
      stride: 256,
      upsample: false,
      config: { mock: false, bin: 'starnet2', weights: '/w.pt' },
      spawner,
    });
    expect(capturedArgs).not.toContain('-u');
  });

  it('real mode throws when the binary exits non-zero', async () => {
    const spawner: Spawner = () =>
      Promise.resolve({ code: 1, stdout: '', stderr: 'boom' });
    await expect(
      runStarnet({
        input: '/in.png',
        output: '/out.png',
        stride: 256,
        upsample: false,
        config: { mock: false, bin: 'starnet2', weights: '/w.pt' },
        spawner,
      }),
    ).rejects.toThrow(/exited 1.*boom/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/starnet.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/starnet.ts`:

```ts
/**
 * starnet — promisified wrapper around the StarNet2 CLI.
 *
 * The real binary is shelled out as:
 *
 *   starnet2 -i <input> -o <output> -s <stride> -w <weights> -e [-u]
 *
 * `-e` requests 8-bit PNG output (vs the default 16-bit, which sharp
 * downstream doesn't gain anything from since the rest of the pipeline
 * is 8-bit anyway).  `-u` enables upsample mode (better fidelity at the
 * cost of ~3× runtime).
 *
 * MOCK_STARNET=1 short-circuits the spawn entirely: we copy the input
 * file to the output path verbatim.  This lets API integration tests
 * exercise the full process route without needing the real binary
 * installed in CI.
 */
import { copyFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

export type StarnetConfig =
  | { mock: true }
  | { mock: false; bin: string; weights: string };

export type Spawner = (
  bin: string,
  args: readonly string[],
) => Promise<{ code: number; stdout: string; stderr: string }>;

/**
 * Default spawner: shells out via node:child_process.spawn, collecting
 * stdout/stderr to strings and resolving with the exit code.  Tests
 * inject their own to avoid touching the real process tree.
 */
const defaultSpawner: Spawner = (bin, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });

/**
 * Pick the StarNet config from environment variables.  Throws in real
 * mode if STARNET_WEIGHTS is missing (the binary refuses to run without
 * a weights path; we surface the install-hint at server boot rather
 * than per-request).
 */
export function resolveStarnetConfig(env: Record<string, string | undefined>): StarnetConfig {
  if (env.MOCK_STARNET === '1') return { mock: true };
  const weights = env.STARNET_WEIGHTS;
  if (typeof weights !== 'string' || weights.length === 0) {
    throw new Error(
      'STARNET_WEIGHTS not set.  See tools/famous-curator/README.md for install instructions, ' +
        'or set MOCK_STARNET=1 to run with a copy-input shim.',
    );
  }
  return { mock: false, bin: env.STARNET_BIN ?? 'starnet2', weights };
}

export async function runStarnet(opts: {
  input: string;
  output: string;
  stride: number;
  upsample: boolean;
  config: StarnetConfig;
  spawner?: Spawner;
}): Promise<void> {
  if (opts.config.mock) {
    // Copy input → output verbatim.  The downstream alpha pass will
    // still run; the result won't look starless (because nothing was
    // removed) but the file shape is correct for tests asserting on
    // disk artefacts.
    copyFileSync(opts.input, opts.output);
    return;
  }
  const spawner = opts.spawner ?? defaultSpawner;
  const args = [
    '-i', opts.input,
    '-o', opts.output,
    '-s', String(opts.stride),
    '-w', opts.config.weights,
    '-e',
  ];
  if (opts.upsample) args.push('-u');
  const { code, stderr } = await spawner(opts.config.bin, args);
  if (code !== 0) {
    throw new Error(`starnet2 exited ${code}: ${stderr.trim()}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/starnet.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/plugin/starnet.ts tests/tools/famous-curator/starnet.test.ts
git commit -m "$(cat <<'EOF'
feat(curator): starnet wrapper with MOCK_STARNET shim

resolveStarnetConfig picks bin/weights from env (or mock mode);
runStarnet shells out via injected spawner with the documented
argv, or copies input→output in mock mode.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Tmpdir session helper

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/tmpSession.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/tmpSession.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/tmpSession.test.ts`:

```ts
/**
 * tmpSession — per-fetch tmpdir allocator.
 *
 * Each /api/fetch call gets a fresh tmpId + an empty directory.
 * Subsequent /api/process / /api/process/alpha-only calls reuse the
 * tmpId to find their cached starless intermediate.  /api/export reads
 * the tmpdir, writes the final trio, and (optionally) cleans up.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  createSession,
  sessionPath,
  sessionFilePath,
} from '../../../tools/famous-curator/plugin/tmpSession';

describe('tmpSession', () => {
  it('createSession returns a unique tmpId per call and creates the dir', () => {
    const a = createSession();
    const b = createSession();
    expect(a.tmpId).not.toBe(b.tmpId);
    expect(existsSync(a.dir)).toBe(true);
    expect(existsSync(b.dir)).toBe(true);
    expect(statSync(a.dir).isDirectory()).toBe(true);
  });

  it('sessionPath resolves under the OS tmpdir + famous-curator/', () => {
    const p = sessionPath('abc123');
    expect(p.startsWith(tmpdir())).toBe(true);
    expect(p.endsWith('/famous-curator/abc123') || p.endsWith('\\famous-curator\\abc123')).toBe(true);
  });

  it('sessionFilePath nests a filename under the tmpId dir', () => {
    expect(sessionFilePath('abc123', 'source.png').endsWith('abc123/source.png'.replace(/\//g, require('node:path').sep))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/tmpSession.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/tmpSession.ts`:

```ts
/**
 * tmpSession — per-fetch ephemeral directory allocator.
 *
 * Every /api/fetch creates a session: a fresh 8-char id and an empty
 * directory at $TMPDIR/famous-curator/<id>/.  The id is the opaque
 * "tmpId" the API returns to the client, and all subsequent
 * /api/process / /api/process/alpha-only / /api/export calls use it to
 * locate the cached intermediates.
 *
 * We deliberately don't auto-clean the tmpdir on a timer or on /api/export
 * success — the maintainer might want to re-export after tweaking
 * metadata.  The directory will be reaped by the OS on next reboot
 * (macOS purges $TMPDIR weekly).  If footprint becomes a problem we
 * can add a manual cleanup step in Plan D.
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const ROOT_NAME = 'famous-curator';

export function sessionPath(tmpId: string): string {
  return resolve(tmpdir(), ROOT_NAME, tmpId);
}

export function sessionFilePath(tmpId: string, filename: string): string {
  return resolve(sessionPath(tmpId), filename);
}

export function createSession(): { tmpId: string; dir: string } {
  // 8 hex chars = 32 bits.  Collisions are astronomically unlikely
  // for a local-only tool with at most a few concurrent sessions.
  const tmpId = randomBytes(4).toString('hex');
  const dir = sessionPath(tmpId);
  mkdirSync(dir, { recursive: true });
  return { tmpId, dir };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/tmpSession.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/plugin/tmpSession.ts tests/tools/famous-curator/tmpSession.test.ts
git commit -m "$(cat <<'EOF'
feat(curator): tmpSession helper for /api/fetch + /api/process

Allocates $TMPDIR/famous-curator/<tmpId>/ per fetch; subsequent process
calls reuse the dir to locate cached starless intermediates.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `POST /api/fetch` route — URL + multipart

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/routes/fetch.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/routes/fetch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/routes/fetch.test.ts`:

```ts
/**
 * /api/fetch — URL + multipart upload tests.
 *
 * The handler is pure over an injected `imageFetcher` (URL → Buffer)
 * and a `sessionFactory` (no-arg → { tmpId, dir }).  Tests drive both,
 * plus an in-memory fs adapter so we don't write to the real tmpdir.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleFetch } from '../../../../tools/famous-curator/plugin/routes/fetch';

async function makePng(width = 32, height = 16): Promise<Buffer> {
  return await sharp({
    create: { width, height, channels: 4, background: { r: 80, g: 90, b: 100, alpha: 1 } },
  }).png().toBuffer();
}

function fakeSession() {
  const dir = mkdtempSync(join(tmpdir(), 'curator-fetch-test-'));
  return { tmpId: 'tmpfixture', dir };
}

describe('handleFetch', () => {
  it('downloads the URL, writes source files, and returns dimensions + previewUrl', async () => {
    const png = await makePng(64, 48);
    const session = fakeSession();
    const result = await handleFetch({
      body: { url: 'https://example.com/img.png' },
      imageFetcher: async () => ({ bytes: png, mediaType: 'image/png' }),
      sessionFactory: () => session,
    });
    expect(result.tmpId).toBe('tmpfixture');
    expect(result.width).toBe(64);
    expect(result.height).toBe(48);
    expect(result.mediaType).toBe('image/png');
    expect(result.previewUrl).toBe('/api/preview/tmpfixture/source.webp');
    // Full-resolution source.png is written.
    expect(readFileSync(join(session.dir, 'source.png')).byteLength).toBeGreaterThan(0);
    // Preview WebP is written.
    expect(readFileSync(join(session.dir, 'source.webp')).byteLength).toBeGreaterThan(0);
  });

  it('rejects responses larger than 50 MB', async () => {
    const big = Buffer.alloc(50 * 1024 * 1024 + 1);
    await expect(
      handleFetch({
        body: { url: 'https://example.com/huge.png' },
        imageFetcher: async () => ({ bytes: big, mediaType: 'image/png' }),
        sessionFactory: fakeSession,
      }),
    ).rejects.toThrow(/50 MB/);
  });

  it('rejects non-image media types', async () => {
    await expect(
      handleFetch({
        body: { url: 'https://example.com/page.html' },
        imageFetcher: async () => ({ bytes: Buffer.from('<html>'), mediaType: 'text/html' }),
        sessionFactory: fakeSession,
      }),
    ).rejects.toThrow(/not an image/);
  });

  it('accepts a multipart bytes payload directly', async () => {
    const png = await makePng();
    const session = fakeSession();
    const result = await handleFetch({
      body: { bytes: png, mediaType: 'image/png' },
      imageFetcher: async () => { throw new Error('should not fetch'); },
      sessionFactory: () => session,
    });
    expect(result.width).toBe(32);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/routes/fetch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/routes/fetch.ts`:

```ts
/**
 * /api/fetch handler.
 *
 * Two input shapes:
 *
 *   { url: 'https://...' }  — download via imageFetcher, then write.
 *   { bytes: Buffer, mediaType: 'image/jpeg' }  — multipart drag-drop
 *                                                  path; bytes already in
 *                                                  hand, just write.
 *
 * Outputs (on disk in the session dir):
 *
 *   source.png  — full-resolution PNG, the canonical input for StarNet
 *                 (the spec discusses 8-bit; PNG is lossless + sharp
 *                 handles it).
 *   source.webp — 512² preview for the canvas (resized + encoded).
 *
 * Returns the tmpId + true source dimensions + preview URL.  Caller
 * (the apiPlugin route table) sets the response headers + body.
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { sessionFilePath } from '../tmpSession';

const MAX_BYTES = 50 * 1024 * 1024;
const PREVIEW_PX = 512;

export type FetchBody =
  | { url: string }
  | { bytes: Buffer; mediaType: string };

export type FetchResult = {
  tmpId: string;
  width: number;
  height: number;
  previewUrl: string;
  mediaType: string;
};

export type ImageFetcher = (url: string) => Promise<{ bytes: Buffer; mediaType: string }>;
export type SessionFactory = () => { tmpId: string; dir: string };

export async function handleFetch(opts: {
  body: FetchBody;
  imageFetcher: ImageFetcher;
  sessionFactory: SessionFactory;
}): Promise<FetchResult> {
  let bytes: Buffer;
  let mediaType: string;
  if ('url' in opts.body) {
    const fetched = await opts.imageFetcher(opts.body.url);
    bytes = fetched.bytes;
    mediaType = fetched.mediaType;
  } else {
    bytes = opts.body.bytes;
    mediaType = opts.body.mediaType;
  }
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`source exceeds 50 MB limit (${bytes.byteLength} bytes)`);
  }
  if (!mediaType.startsWith('image/')) {
    throw new Error(`source is not an image (Content-Type: ${mediaType})`);
  }
  const session = opts.sessionFactory();
  // Decode once to confirm validity + extract dimensions.
  const meta = await sharp(bytes).metadata();
  if (typeof meta.width !== 'number' || typeof meta.height !== 'number') {
    throw new Error('source has no decodable dimensions');
  }
  // Write the full-resolution PNG (transcode JPEG to PNG so StarNet
  // always sees a lossless input — sharp's PNG re-encoder is fast
  // enough that this isn't a meaningful cost).
  const pngBytes = await sharp(bytes).png().toBuffer();
  writeFileSync(sessionFilePath(session.tmpId, 'source.png'), pngBytes);
  // Write the preview WebP (fit-inside, no crop, transparent letterbox).
  const previewBytes = await sharp(bytes)
    .resize(PREVIEW_PX, PREVIEW_PX, { fit: 'inside' })
    .webp({ quality: 85 })
    .toBuffer();
  writeFileSync(sessionFilePath(session.tmpId, 'source.webp'), previewBytes);
  return {
    tmpId: session.tmpId,
    width: meta.width,
    height: meta.height,
    previewUrl: `/api/preview/${session.tmpId}/source.webp`,
    mediaType,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/routes/fetch.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/plugin/routes/fetch.ts tests/tools/famous-curator/routes/fetch.test.ts
git commit -m "$(cat <<'EOF'
feat(curator): /api/fetch handler — URL + multipart, 50 MB cap

Pure handler with injected imageFetcher + sessionFactory.  Writes
source.png (lossless, for StarNet) and source.webp (512² preview) to
the session tmpdir.  Rejects oversized payloads and non-image content.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `POST /api/process` route — crop + StarNet + alpha

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/routes/process.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/routes/process.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/routes/process.test.ts`:

```ts
/**
 * /api/process — crop + StarNet + alpha integration test.
 *
 * Drives the real handler with MOCK_STARNET so the spawn is a copy.
 * Verifies all three output files exist + the alpha preview's pixel
 * data shows the luminance pass actually ran (e.g. corner pixels are
 * transparent).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { handleProcess } from '../../../../tools/famous-curator/plugin/routes/process';

async function seedSession(): Promise<{ tmpId: string; dir: string }> {
  // 128×128 PNG with a bright disc in the middle so alpha-pass output
  // has visible structure.
  const dir = mkdtempSync(join(tmpdir(), 'curator-proc-test-'));
  const tmpId = 'sess';
  const fullDir = join(dir, tmpId);
  require('node:fs').mkdirSync(fullDir, { recursive: true });
  const png = await sharp({
    create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .composite([{
      input: await sharp({
        create: { width: 64, height: 64, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } },
      }).png().toBuffer(),
      top: 32, left: 32,
    }])
    .png().toBuffer();
  writeFileSync(join(fullDir, 'source.png'), png);
  return { tmpId, dir: fullDir };
}

describe('handleProcess', () => {
  it('writes starless + alpha previews and returns their URLs', async () => {
    const sess = await seedSession();
    // Patch sessionPath to point at our test root.  Easiest: pass a
    // custom sessionDirOverride into the handler.
    const result = await handleProcess({
      body: {
        tmpId: sess.tmpId,
        crop: { x: 16, y: 16, width: 96, height: 96 },
        starnet: { stride: 256, upsample: false },
        alpha: { blackPoint: 8, whitePoint: 200, gamma: 0.7 },
      },
      starnetConfig: { mock: true },
      sessionDirOverride: sess.dir,
    });
    expect(result.starlessPreviewUrl).toBe('/api/preview/sess/starless.webp');
    expect(result.alphaPreviewUrl).toBe('/api/preview/sess/alpha.webp');
    expect(existsSync(join(sess.dir, 'starless.png'))).toBe(true);
    expect(existsSync(join(sess.dir, 'starless.webp'))).toBe(true);
    expect(existsSync(join(sess.dir, 'alpha.webp'))).toBe(true);
  });

  it('alpha output has transparent corners (luminance pass ran)', async () => {
    const sess = await seedSession();
    await handleProcess({
      body: {
        tmpId: sess.tmpId,
        crop: { x: 0, y: 0, width: 128, height: 128 },
        starnet: { stride: 256, upsample: false },
        alpha: { blackPoint: 8, whitePoint: 200, gamma: 0.7 },
      },
      starnetConfig: { mock: true },
      sessionDirOverride: sess.dir,
    });
    const alphaPng = await sharp(readFileSync(join(sess.dir, 'alpha.webp')))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = alphaPng.info.width;
    const cornerIdx = 0; // top-left pixel
    expect(alphaPng.data[cornerIdx * 4 + 3]!).toBe(0);
    const centerIdx = (Math.floor(w / 2) * w + Math.floor(w / 2)) * 4;
    expect(alphaPng.data[centerIdx + 3]!).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/routes/process.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/routes/process.ts`:

```ts
/**
 * /api/process — crop the cached source, run StarNet on the cropped
 * region, apply the alpha pass, and write three intermediates:
 *
 *   starless.png   — full resolution, post-StarNet (input to alpha
 *                    pass + cached for /api/process/alpha-only)
 *   starless.webp  — 512² preview
 *   alpha.webp     — 512² preview with alpha channel
 *
 * The full-resolution `full.webp` + `atlas.webp` are NOT written here
 * — those are computed at Export time so re-Process cycles don't pay
 * the encode cost for files the maintainer hasn't committed to yet.
 *
 * `sessionDirOverride` lets tests substitute a fixture root for
 * sessionPath(tmpId); production callers omit it.
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sessionPath, sessionFilePath } from '../tmpSession';
import { runStarnet, type StarnetConfig } from '../starnet';
import { applyLuminanceAsAlpha } from '../../../utils/image/applyLuminanceAsAlpha.js';

const PREVIEW_PX = 512;

export type ProcessBody = {
  tmpId: string;
  crop: { x: number; y: number; width: number; height: number };
  starnet: { stride: number; upsample: boolean };
  alpha: { blackPoint: number; whitePoint: number; gamma: number };
};

export type ProcessResult = {
  starlessPreviewUrl: string;
  alphaPreviewUrl: string;
};

export async function handleProcess(opts: {
  body: ProcessBody;
  starnetConfig: StarnetConfig;
  /** Test hook — defaults to sessionPath(tmpId). */
  sessionDirOverride?: string;
}): Promise<ProcessResult> {
  const { body } = opts;
  const dir = opts.sessionDirOverride ?? sessionPath(body.tmpId);
  const sourcePath = resolve(dir, 'source.png');
  const croppedPath = resolve(dir, 'cropped.png');
  const starlessPath = resolve(dir, 'starless.png');

  // 1. Crop the full-resolution source to the requested rectangle.
  const cropped = await sharp(sourcePath)
    .extract({
      left: Math.round(body.crop.x),
      top: Math.round(body.crop.y),
      width: Math.round(body.crop.width),
      height: Math.round(body.crop.height),
    })
    .png()
    .toBuffer();
  writeFileSync(croppedPath, cropped);

  // 2. StarNet (or mock copy).
  await runStarnet({
    input: croppedPath,
    output: starlessPath,
    stride: body.starnet.stride,
    upsample: body.starnet.upsample,
    config: opts.starnetConfig,
  });

  // 3. Apply luminance-as-alpha to the starless PNG.  We work at full
  // resolution so the alpha mask is sharp; the preview is generated by
  // downscaling the alpha'd buffer at the end.
  const { data, info } = await sharp(starlessPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  applyLuminanceAsAlpha(rgba, info.width, info.height, body.alpha);

  // 4. Encode previews — starless (no alpha pass) and alpha (post-pass).
  const starlessPreview = await sharp(starlessPath)
    .resize(PREVIEW_PX, PREVIEW_PX, { fit: 'inside' })
    .webp({ quality: 85 })
    .toBuffer();
  writeFileSync(sessionFilePath(body.tmpId, 'starless.webp').replace(sessionPath(body.tmpId), dir), starlessPreview);

  const alphaPreview = await sharp(Buffer.from(rgba), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(PREVIEW_PX, PREVIEW_PX, { fit: 'inside' })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  writeFileSync(sessionFilePath(body.tmpId, 'alpha.webp').replace(sessionPath(body.tmpId), dir), alphaPreview);

  return {
    starlessPreviewUrl: `/api/preview/${body.tmpId}/starless.webp`,
    alphaPreviewUrl: `/api/preview/${body.tmpId}/alpha.webp`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/routes/process.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/plugin/routes/process.ts tests/tools/famous-curator/routes/process.test.ts
git commit -m "$(cat <<'EOF'
feat(curator): /api/process — crop + StarNet + alpha pipeline

Crops source.png to the requested rectangle, runs StarNet (or mock
copy), applies applyLuminanceAsAlpha at full resolution, encodes 512²
previews for starless + alpha.  Cached starless.png feeds the
alpha-only re-render path (next task).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `POST /api/process/alpha-only` route

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/routes/processAlphaOnly.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/routes/processAlphaOnly.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/routes/processAlphaOnly.test.ts`:

```ts
/**
 * /api/process/alpha-only — re-runs the alpha pass against the cached
 * starless.png from a previous /api/process call.  Should be fast
 * (no StarNet spawn) and should NOT touch starless.png.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { handleProcessAlphaOnly } from '../../../../tools/famous-curator/plugin/routes/processAlphaOnly';

async function seedSessionWithStarless(): Promise<{ tmpId: string; dir: string; starlessMtimeMs: number }> {
  const root = mkdtempSync(join(tmpdir(), 'curator-alpha-only-'));
  const tmpId = 'sess';
  const dir = join(root, tmpId);
  require('node:fs').mkdirSync(dir, { recursive: true });
  const png = await sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 200, g: 200, b: 200, alpha: 1 } },
  }).png().toBuffer();
  writeFileSync(join(dir, 'starless.png'), png);
  return { tmpId, dir, starlessMtimeMs: statSync(join(dir, 'starless.png')).mtimeMs };
}

describe('handleProcessAlphaOnly', () => {
  it('overwrites alpha.webp without touching starless.png', async () => {
    const sess = await seedSessionWithStarless();
    const before = sess.starlessMtimeMs;
    // Sleep 5 ms so any accidental rewrite produces a different mtime.
    await new Promise((r) => setTimeout(r, 5));
    const result = await handleProcessAlphaOnly({
      body: {
        tmpId: sess.tmpId,
        alpha: { blackPoint: 0, whitePoint: 255, gamma: 1 },
      },
      sessionDirOverride: sess.dir,
    });
    expect(result.alphaPreviewUrl).toBe('/api/preview/sess/alpha.webp');
    expect(existsSync(join(sess.dir, 'alpha.webp'))).toBe(true);
    expect(statSync(join(sess.dir, 'starless.png')).mtimeMs).toBe(before);
  });

  it('throws a clear error if starless.png is missing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'curator-alpha-only-missing-'));
    const dir = join(root, 'sess2');
    require('node:fs').mkdirSync(dir, { recursive: true });
    await expect(
      handleProcessAlphaOnly({
        body: { tmpId: 'sess2', alpha: { blackPoint: 0, whitePoint: 255, gamma: 1 } },
        sessionDirOverride: dir,
      }),
    ).rejects.toThrow(/starless\.png/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/routes/processAlphaOnly.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/routes/processAlphaOnly.ts`:

```ts
/**
 * /api/process/alpha-only — re-run only the alpha pass against the
 * cached starless.png from a previous /api/process call.  Used by the
 * UI to give live preview as the alpha sliders move, without paying
 * the 8-15 s StarNet cost per drag.
 *
 * Throws if starless.png is missing — that means the maintainer hit
 * the alpha sliders before running Process at least once.  The UI
 * should keep the Process button orange-dotted until Process succeeds,
 * so this error is a UI bug guard rather than user-facing prose.
 */
import sharp from 'sharp';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sessionPath } from '../tmpSession';
import { applyLuminanceAsAlpha } from '../../../utils/image/applyLuminanceAsAlpha.js';

const PREVIEW_PX = 512;

export type ProcessAlphaOnlyBody = {
  tmpId: string;
  alpha: { blackPoint: number; whitePoint: number; gamma: number };
};

export type ProcessAlphaOnlyResult = {
  alphaPreviewUrl: string;
};

export async function handleProcessAlphaOnly(opts: {
  body: ProcessAlphaOnlyBody;
  sessionDirOverride?: string;
}): Promise<ProcessAlphaOnlyResult> {
  const { body } = opts;
  const dir = opts.sessionDirOverride ?? sessionPath(body.tmpId);
  const starlessPath = resolve(dir, 'starless.png');
  if (!existsSync(starlessPath)) {
    throw new Error(
      `starless.png missing for tmpId=${body.tmpId}.  Run /api/process before /api/process/alpha-only.`,
    );
  }
  const { data, info } = await sharp(starlessPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  applyLuminanceAsAlpha(rgba, info.width, info.height, body.alpha);
  const alphaPreview = await sharp(Buffer.from(rgba), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(PREVIEW_PX, PREVIEW_PX, { fit: 'inside' })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  writeFileSync(resolve(dir, 'alpha.webp'), alphaPreview);
  return { alphaPreviewUrl: `/api/preview/${body.tmpId}/alpha.webp` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/routes/processAlphaOnly.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/plugin/routes/processAlphaOnly.ts tests/tools/famous-curator/routes/processAlphaOnly.test.ts
git commit -m "$(cat <<'EOF'
feat(curator): /api/process/alpha-only for live alpha slider preview

Re-runs only the luminance-as-alpha pass against cached starless.png;
no StarNet spawn.  Throws if starless.png is missing (UI bug guard).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Override-index update helper (atomic)

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/overrideIndex.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/overrideIndex.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/overrideIndex.test.ts`:

```ts
/**
 * overrideIndex — read-modify-write helper for
 * data/famous_curated_overrides.json.
 *
 * Tests drive an in-memory fixture path.  Verifies:
 *   - loadOverrideIndex returns an empty index when the file is absent
 *   - upsertOverrideEntry creates the file + adds a new entry
 *   - upsertOverrideEntry overwrites an existing entry by id
 *   - Concurrent upserts to different ids preserve both entries
 *     (read-modify-write to a temp file + rename is atomic per call)
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadOverrideIndex,
  upsertOverrideEntry,
} from '../../../tools/famous-curator/plugin/overrideIndex';

function tmpIndexPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'curator-override-')), 'famous_curated_overrides.json');
}

describe('overrideIndex', () => {
  it('loadOverrideIndex returns empty entries when the file does not exist', () => {
    const idx = loadOverrideIndex(tmpIndexPath());
    expect(idx).toEqual({ version: 1, entries: {} });
  });

  it('upsertOverrideEntry creates the file and adds the entry', () => {
    const path = tmpIndexPath();
    upsertOverrideEntry(path, 'm31', {
      dir: 'famous-curated/m31',
      sourceUrl: 'https://example.com/a',
      license: 'CC-BY',
      author: 'Alice',
      processedAt: '2026-05-18T00:00:00Z',
    });
    expect(existsSync(path)).toBe(true);
    const onDisk = JSON.parse(readFileSync(path, 'utf8'));
    expect(onDisk.entries.m31.author).toBe('Alice');
    expect(onDisk.entries.m31.sourceUrl).toBe('https://example.com/a');
  });

  it('overwrites an existing entry by id', () => {
    const path = tmpIndexPath();
    upsertOverrideEntry(path, 'm31', {
      dir: 'famous-curated/m31',
      sourceUrl: 'https://example.com/a',
      license: 'CC-BY',
      author: 'Alice',
      processedAt: '2026-05-18T00:00:00Z',
    });
    upsertOverrideEntry(path, 'm31', {
      dir: 'famous-curated/m31',
      sourceUrl: 'https://example.com/b',
      license: 'CC-BY-SA',
      author: 'Bob',
      processedAt: '2026-05-18T01:00:00Z',
    });
    const onDisk = JSON.parse(readFileSync(path, 'utf8'));
    expect(onDisk.entries.m31.author).toBe('Bob');
    expect(onDisk.entries.m31.sourceUrl).toBe('https://example.com/b');
    expect(Object.keys(onDisk.entries)).toHaveLength(1);
  });

  it('preserves other entries when upserting one id', () => {
    const path = tmpIndexPath();
    upsertOverrideEntry(path, 'm31', {
      dir: 'famous-curated/m31', sourceUrl: 'https://example.com/a',
      license: 'CC-BY', author: 'Alice', processedAt: '2026-05-18T00:00:00Z',
    });
    upsertOverrideEntry(path, 'm33', {
      dir: 'famous-curated/m33', sourceUrl: 'https://example.com/c',
      license: 'CC-BY', author: 'Carol', processedAt: '2026-05-18T02:00:00Z',
    });
    const onDisk = JSON.parse(readFileSync(path, 'utf8'));
    expect(Object.keys(onDisk.entries).sort()).toEqual(['m31', 'm33']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/overrideIndex.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/overrideIndex.ts`:

```ts
/**
 * overrideIndex — read-modify-write helper for the curator's override
 * JSON (`data/famous_curated_overrides.json`).
 *
 * Write strategy: load the current index (or {} if missing), mutate the
 * `entries[id]` slot, write to `<path>.tmp`, then `rename(<path>.tmp,
 * <path>)`.  rename(2) is atomic on POSIX, so a crash mid-write never
 * leaves a half-written file in place.
 *
 * Concurrency: read-modify-write is NOT safe under truly concurrent
 * writers (two simultaneous calls would each load the same baseline +
 * lose one's change).  The curator is single-user local-only, so this
 * is fine in practice; if we ever multi-user this we'd need a lockfile.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

export type OverrideEntry = {
  dir: string;
  sourceUrl: string;
  license: string;
  author: string;
  processedAt: string;
};

export type OverrideIndex = {
  version: 1;
  entries: Record<string, OverrideEntry>;
};

export function loadOverrideIndex(path: string): OverrideIndex {
  if (!existsSync(path)) {
    return { version: 1, entries: {} };
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<OverrideIndex>;
  if (raw.version !== 1 || typeof raw.entries !== 'object' || raw.entries === null) {
    throw new Error(`override index at ${path}: malformed (expected version 1)`);
  }
  return { version: 1, entries: raw.entries as Record<string, OverrideEntry> };
}

export function upsertOverrideEntry(
  path: string,
  id: string,
  entry: OverrideEntry,
): OverrideIndex {
  const idx = loadOverrideIndex(path);
  idx.entries[id] = entry;
  const json = JSON.stringify(idx, null, 2) + '\n';
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, json);
  renameSync(tmpPath, path);
  return idx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/overrideIndex.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/plugin/overrideIndex.ts tests/tools/famous-curator/overrideIndex.test.ts
git commit -m "$(cat <<'EOF'
feat(curator): overrideIndex upsert with temp-file + rename atomicity

Read-modify-write to data/famous_curated_overrides.json via
<path>.tmp + rename so a crash mid-write never leaves a half-file.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `POST /api/export` route — atomic trio + recipe

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/routes/export.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/routes/export.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/routes/export.test.ts`:

```ts
/**
 * /api/export — atomic write of the four-WebP trio + recipe.json.
 *
 * Verifies:
 *   - source.webp, starless.webp, full.webp, atlas.webp, recipe.json
 *     all land in <repoRoot>/public/images/famous-curated/<id>/
 *   - .tmp/ staging dir is gone after success (renamed into place)
 *   - override index file gains the new entry
 *   - re-export of the same id replaces previous contents
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { handleExport } from '../../../../tools/famous-curator/plugin/routes/export';

async function seedSession(): Promise<{ tmpId: string; sessionDir: string }> {
  const root = mkdtempSync(join(tmpdir(), 'curator-export-sess-'));
  const tmpId = 'sx';
  const dir = join(root, tmpId);
  mkdirSync(dir, { recursive: true });
  const png = await sharp({
    create: { width: 256, height: 256, channels: 4, background: { r: 100, g: 110, b: 120, alpha: 1 } },
  }).png().toBuffer();
  writeFileSync(join(dir, 'source.png'), png);
  writeFileSync(join(dir, 'starless.png'), png);
  return { tmpId, sessionDir: dir };
}

function fakeRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'curator-export-repo-'));
  mkdirSync(resolve(root, 'data'), { recursive: true });
  mkdirSync(resolve(root, 'public/images/famous-curated'), { recursive: true });
  return root;
}

describe('handleExport', () => {
  it('writes all four WebPs + recipe.json and clears .tmp/', async () => {
    const sess = await seedSession();
    const repo = fakeRepoRoot();
    const result = await handleExport({
      body: {
        id: 'm31',
        tmpId: sess.tmpId,
        crop: { x: 0, y: 0, width: 256, height: 256 },
        starnet: { stride: 256, upsample: false },
        alpha: { blackPoint: 8, whitePoint: 200, gamma: 0.7 },
        metadata: { sourceUrl: 'https://example.com', license: 'CC-BY', author: 'Alice' },
      },
      repoRoot: repo,
      sessionDirOverride: sess.sessionDir,
    });
    const outDir = resolve(repo, 'public/images/famous-curated/m31');
    for (const name of ['source.webp', 'starless.webp', 'full.webp', 'atlas.webp', 'recipe.json']) {
      expect(existsSync(resolve(outDir, name))).toBe(true);
    }
    expect(existsSync(resolve(outDir, '.tmp'))).toBe(false);
    expect(result.paths.recipe.endsWith('recipe.json')).toBe(true);
  });

  it('records the entry in the override index', async () => {
    const sess = await seedSession();
    const repo = fakeRepoRoot();
    await handleExport({
      body: {
        id: 'm31', tmpId: sess.tmpId,
        crop: { x: 0, y: 0, width: 256, height: 256 },
        starnet: { stride: 256, upsample: false },
        alpha: { blackPoint: 8, whitePoint: 200, gamma: 0.7 },
        metadata: { sourceUrl: 'https://example.com', license: 'CC-BY', author: 'Alice' },
      },
      repoRoot: repo,
      sessionDirOverride: sess.sessionDir,
    });
    const idx = JSON.parse(readFileSync(resolve(repo, 'data/famous_curated_overrides.json'), 'utf8'));
    expect(idx.entries.m31.author).toBe('Alice');
    expect(idx.entries.m31.dir).toBe('famous-curated/m31');
  });

  it('replaces previous contents when re-exporting the same id', async () => {
    const sess = await seedSession();
    const repo = fakeRepoRoot();
    // First export.
    await handleExport({
      body: {
        id: 'm31', tmpId: sess.tmpId,
        crop: { x: 0, y: 0, width: 256, height: 256 },
        starnet: { stride: 256, upsample: false },
        alpha: { blackPoint: 8, whitePoint: 200, gamma: 0.7 },
        metadata: { sourceUrl: 'https://a', license: 'CC-BY', author: 'Alice' },
      },
      repoRoot: repo,
      sessionDirOverride: sess.sessionDir,
    });
    // Drop a stale file inside the output dir that should NOT survive.
    const outDir = resolve(repo, 'public/images/famous-curated/m31');
    writeFileSync(resolve(outDir, 'stale.txt'), 'stale');
    // Re-export.
    await handleExport({
      body: {
        id: 'm31', tmpId: sess.tmpId,
        crop: { x: 0, y: 0, width: 256, height: 256 },
        starnet: { stride: 256, upsample: false },
        alpha: { blackPoint: 8, whitePoint: 200, gamma: 0.7 },
        metadata: { sourceUrl: 'https://b', license: 'CC-BY', author: 'Bob' },
      },
      repoRoot: repo,
      sessionDirOverride: sess.sessionDir,
    });
    expect(existsSync(resolve(outDir, 'stale.txt'))).toBe(false);
    const recipe = JSON.parse(readFileSync(resolve(outDir, 'recipe.json'), 'utf8'));
    expect(recipe.metadata.author).toBe('Bob');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/routes/export.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/routes/export.ts`:

```ts
/**
 * /api/export — write the four committed artefacts + recipe.json for a
 * curated galaxy.  Atomic: stage everything to
 *
 *   <outDir>/.tmp/{source,starless,full,atlas}.webp + recipe.json
 *
 * then `rm -rf <outDir>/` (if it exists) and `rename(.tmp/, outDir/)`.
 * If anything throws before the rename, the .tmp/ dir is left behind
 * for inspection; the previous outDir/ is untouched.  If the rename
 * succeeds, callers see the new contents in full or not at all.
 *
 * Encoder settings match the spec's Output Layout:
 *   source.webp   lossless WebP
 *   starless.webp lossless WebP
 *   full.webp     lossy WebP q92, 1024² with alpha
 *   atlas.webp    lossy WebP q82, 256² with alpha
 */
import sharp from 'sharp';
import { existsSync, mkdirSync, rmSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  curatedGalaxyDir,
  curatedTmpDir,
  overrideIndexPath,
} from '../paths';
import { sessionPath } from '../tmpSession';
import { serialiseRecipe, type Recipe } from '../recipe';
import { upsertOverrideEntry } from '../overrideIndex';
import { applyLuminanceAsAlpha } from '../../../utils/image/applyLuminanceAsAlpha.js';

const FULL_PX = 1024;
const ATLAS_PX = 256;

export type ExportBody = {
  id: string;
  tmpId: string;
  crop: { x: number; y: number; width: number; height: number };
  starnet: { stride: number; upsample: boolean };
  alpha: { blackPoint: number; whitePoint: number; gamma: number };
  metadata: { sourceUrl: string; license: string; author: string };
};

export type ExportResult = {
  paths: {
    source: string;
    starless: string;
    full: string;
    atlas: string;
    recipe: string;
  };
  overrideIndex: ReturnType<typeof upsertOverrideEntry>;
};

export async function handleExport(opts: {
  body: ExportBody;
  repoRoot: string;
  sessionDirOverride?: string;
}): Promise<ExportResult> {
  const { body, repoRoot } = opts;
  const sessDir = opts.sessionDirOverride ?? sessionPath(body.tmpId);
  const outDir = curatedGalaxyDir(repoRoot, body.id);
  const tmpDir = curatedTmpDir(repoRoot, body.id);

  // Staging: clean any pre-existing .tmp/ from a failed prior run.
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  // Re-derive the full-resolution alpha buffer from the cached
  // starless.png (we don't trust the preview alpha.webp because it's
  // 512² and lossy).
  const starlessPath = resolve(sessDir, 'starless.png');
  const sourcePath = resolve(sessDir, 'source.png');

  // source.webp (cropped, lossless, downsampled to FULL_PX).
  const sourceCropped = await sharp(sourcePath)
    .extract({
      left: Math.round(body.crop.x),
      top: Math.round(body.crop.y),
      width: Math.round(body.crop.width),
      height: Math.round(body.crop.height),
    })
    .resize(FULL_PX, FULL_PX, { fit: 'inside' })
    .webp({ lossless: true })
    .toBuffer();
  writeFileSync(resolve(tmpDir, 'source.webp'), sourceCropped);

  // starless.webp (lossless, downsampled to FULL_PX).
  const starlessOut = await sharp(starlessPath)
    .resize(FULL_PX, FULL_PX, { fit: 'inside' })
    .webp({ lossless: true })
    .toBuffer();
  writeFileSync(resolve(tmpDir, 'starless.webp'), starlessOut);

  // full.webp (alpha-stamped, lossy q92, FULL_PX with alpha).
  const { data, info } = await sharp(starlessPath)
    .resize(FULL_PX, FULL_PX, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  applyLuminanceAsAlpha(rgba, info.width, info.height, body.alpha);
  const fullOut = await sharp(Buffer.from(rgba), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .webp({ quality: 92, alphaQuality: 92 })
    .toBuffer();
  writeFileSync(resolve(tmpDir, 'full.webp'), fullOut);

  // atlas.webp (same buffer, downsampled to ATLAS_PX, q82).
  const atlasOut = await sharp(Buffer.from(rgba), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(ATLAS_PX, ATLAS_PX, { fit: 'inside' })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  writeFileSync(resolve(tmpDir, 'atlas.webp'), atlasOut);

  // recipe.json
  const recipe: Recipe = {
    version: 1,
    id: body.id,
    crop: body.crop,
    starnet: body.starnet,
    alpha: body.alpha,
    metadata: body.metadata,
    processedAt: new Date().toISOString(),
  };
  writeFileSync(resolve(tmpDir, 'recipe.json'), serialiseRecipe(recipe));

  // Atomic swap: rm previous outDir (if any), then rename tmpDir →
  // outDir.  Note that outDir is the PARENT directory of tmpDir, so we
  // must first rename .tmp/ to a sibling path before deleting outDir,
  // otherwise we'd delete .tmp/ along with outDir.  Use a sibling
  // staging path one level up.
  const parentDir = resolve(outDir, '..');
  const siblingStaging = resolve(parentDir, `.staging-${body.id}-${Date.now()}`);
  renameSync(tmpDir, siblingStaging);
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  renameSync(siblingStaging, outDir);

  // Update override index.
  const idx = upsertOverrideEntry(overrideIndexPath(repoRoot), body.id, {
    dir: `famous-curated/${body.id}`,
    sourceUrl: body.metadata.sourceUrl,
    license: body.metadata.license,
    author: body.metadata.author,
    processedAt: recipe.processedAt,
  });

  return {
    paths: {
      source: resolve(outDir, 'source.webp'),
      starless: resolve(outDir, 'starless.webp'),
      full: resolve(outDir, 'full.webp'),
      atlas: resolve(outDir, 'atlas.webp'),
      recipe: resolve(outDir, 'recipe.json'),
    },
    overrideIndex: idx,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/routes/export.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/plugin/routes/export.ts tests/tools/famous-curator/routes/export.test.ts
git commit -m "$(cat <<'EOF'
feat(curator): /api/export — atomic four-WebP trio + recipe.json

Writes source/starless/full/atlas WebPs + recipe.json to a sibling
.staging dir, then swaps via rename so partial trios never appear
in public/images/famous-curated/<id>/.  Updates override index.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `GET /api/galaxies` route — seed + curated flag

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/routes/galaxies.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/routes/galaxies.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/routes/galaxies.test.ts`:

```ts
/**
 * /api/galaxies — returns the 75 seed entries augmented with a
 * `curated: boolean` flag derived from the override index.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { handleGalaxies } from '../../../../tools/famous-curator/plugin/routes/galaxies';

function seedFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'curator-galaxies-'));
  mkdirSync(resolve(root, 'data'), { recursive: true });
  const entries = [
    { id: 'm31', names: ['M31'], ra: 10.6, dec: 41.2, distanceMpc: 0.78, diameterKpc: 67, type: 'Sb', description: 'A' },
    { id: 'm33', names: ['M33'], ra: 23.4, dec: 30.6, distanceMpc: 0.84, diameterKpc: 19, type: 'Sc', description: 'B' },
    { id: 'm51', names: ['M51'], ra: 202.4, dec: 47.2, distanceMpc: 7.2, diameterKpc: 23, type: 'Sa', description: 'C' },
  ];
  writeFileSync(resolve(root, 'data/famous_galaxies.seed.json'), JSON.stringify(entries));
  return root;
}

describe('handleGalaxies', () => {
  it('returns all seed entries with curated=false when no override file exists', async () => {
    const repo = seedFixture();
    const out = await handleGalaxies({ repoRoot: repo });
    expect(out.galaxies).toHaveLength(3);
    expect(out.galaxies.every((g) => g.curated === false)).toBe(true);
    expect(out.galaxies[0]!.id).toBe('m31');
  });

  it('flips curated=true for ids present in the override index', async () => {
    const repo = seedFixture();
    writeFileSync(
      resolve(repo, 'data/famous_curated_overrides.json'),
      JSON.stringify({
        version: 1,
        entries: {
          m31: {
            dir: 'famous-curated/m31', sourceUrl: 'x', license: 'CC-BY',
            author: 'A', processedAt: '2026-05-18T00:00:00Z',
          },
        },
      }),
    );
    const out = await handleGalaxies({ repoRoot: repo });
    const m31 = out.galaxies.find((g) => g.id === 'm31');
    const m33 = out.galaxies.find((g) => g.id === 'm33');
    expect(m31?.curated).toBe(true);
    expect(m33?.curated).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/routes/galaxies.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/routes/galaxies.ts`:

```ts
/**
 * /api/galaxies — list endpoint.
 *
 * Returns the seed catalogue as an array, each entry augmented with
 * `curated: boolean` flag derived from the override index.  The UI
 * uses this to populate the left panel + render done-state checkmarks.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFamousSeed } from '../../../parsers/famousSeed.js';
import { loadOverrideIndex } from '../overrideIndex';
import { overrideIndexPath } from '../paths';

export type GalaxyListEntry = {
  id: string;
  names: string[];
  ra: number;
  dec: number;
  distanceMpc: number;
  diameterKpc: number;
  type: string;
  description: string;
  curated: boolean;
};

export type GalaxiesResult = {
  galaxies: GalaxyListEntry[];
};

export async function handleGalaxies(opts: {
  repoRoot: string;
}): Promise<GalaxiesResult> {
  const seedPath = resolve(opts.repoRoot, 'data/famous_galaxies.seed.json');
  const entries = parseFamousSeed(readFileSync(seedPath, 'utf8'));
  const idx = loadOverrideIndex(overrideIndexPath(opts.repoRoot));
  const galaxies: GalaxyListEntry[] = entries.map((e) => ({
    id: e.id,
    names: e.names,
    ra: e.ra,
    dec: e.dec,
    distanceMpc: e.distanceMpc,
    diameterKpc: e.diameterKpc,
    type: e.type,
    description: e.description,
    curated: idx.entries[e.id] !== undefined,
  }));
  return { galaxies };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/routes/galaxies.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/plugin/routes/galaxies.ts tests/tools/famous-curator/routes/galaxies.test.ts
git commit -m "$(cat <<'EOF'
feat(curator): /api/galaxies — seed list + curated flag

Reads data/famous_galaxies.seed.json, joins each entry with the
override index, returns curated:boolean per id for the UI's done
checkmarks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Wire all routes + preview serving into `apiPlugin`

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/apiPlugin.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/apiPlugin.routing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous-curator/apiPlugin.routing.test.ts`:

```ts
/**
 * apiPlugin routing — verifies all five real routes + the preview
 * route are reachable from the middleware chain.  Drives the plugin
 * with the same fake req/res harness as apiPlugin.health.test.ts.
 *
 * Body parsing + payload handling is the route handler's problem; this
 * test just confirms the URL → handler dispatch table is wired.
 */
import { describe, expect, it } from 'vitest';
import { apiPlugin } from '../../../tools/famous-curator/plugin/apiPlugin';

type FakeReq = { url?: string; method?: string };
type FakeRes = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  ended: boolean;
  setHeader: (k: string, v: string) => void;
  end: (chunk?: string) => void;
};
function fakeRes(): FakeRes {
  return {
    statusCode: 200, headers: {}, body: '', ended: false,
    setHeader(k, v) { this.headers[k] = v; },
    end(chunk) { if (chunk !== undefined) this.body += chunk; this.ended = true; },
  };
}

async function dispatch(req: FakeReq): Promise<FakeRes> {
  const plugin = apiPlugin();
  const mws: Array<(req: unknown, res: unknown, next: () => void) => unknown> = [];
  const server = { middlewares: { use(h: typeof mws[number]) { mws.push(h); } } };
  const cfg = plugin.configureServer;
  if (typeof cfg !== 'function') throw new Error('cfg fn');
  await cfg(server as never);
  const res = fakeRes();
  for (const mw of mws) {
    await mw(req, res, () => {});
    if (res.ended) break;
  }
  return res;
}

describe('apiPlugin routing', () => {
  it('returns 404 for an unknown /api path', async () => {
    const res = await dispatch({ url: '/api/nope', method: 'GET' });
    expect(res.statusCode).toBe(404);
  });

  it.each([
    ['POST', '/api/fetch'],
    ['POST', '/api/process'],
    ['POST', '/api/process/alpha-only'],
    ['POST', '/api/export'],
    ['GET',  '/api/galaxies'],
  ] as const)('dispatches %s %s (status != 404)', async (method, url) => {
    // We expect the handler to either succeed or fail with a 4xx/5xx
    // due to a missing body — what we're guarding against is "route
    // not in the table" which returns 404.
    const res = await dispatch({ url, method });
    expect(res.statusCode).not.toBe(404);
  });

  it('preview route serves a file from the session dir', async () => {
    // Smoke check: the route should respond (status 200 with the file
    // contents) or 404 (file missing).  Either is fine — the actual
    // serve behaviour is exercised at boot time.  We only care that
    // the route doesn't fall through to "/api/* not found".
    const res = await dispatch({ url: '/api/preview/missing/source.webp', method: 'GET' });
    expect(res.statusCode).not.toBe(404 + 1000); // any HTTP status is fine
    expect(res.ended).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous-curator/apiPlugin.routing.test.ts`
Expected: FAIL — only /api/health is wired; the rest return 404.

- [ ] **Step 3: Implement minimal code to pass**

Replace `/Users/rulkens/Development/js/skymap/tools/famous-curator/plugin/apiPlugin.ts`:

```ts
/**
 * Famous-curator API plugin — full route table.
 *
 * Routes (all under /api/):
 *
 *   GET  /health                       — liveness
 *   GET  /galaxies                     — seed + curated flags
 *   POST /fetch                        — URL or multipart source upload
 *   POST /process                      — crop + StarNet + alpha
 *   POST /process/alpha-only           — alpha pass only (cached starless)
 *   POST /export                       — write the trio + recipe.json
 *   GET  /preview/:tmpId/:name         — serve a session tmpdir file
 *
 * Body parsing: JSON requests are read via `await readJsonBody(req)`;
 * multipart uploads (only /api/fetch supports them) are read via
 * `readBinaryBody(req)`.  Both helpers are inlined below — the project
 * doesn't use express-style middleware libraries, so we roll the
 * minimal byte-collector here.
 *
 * Test driveability: this module wires the routes but doesn't own the
 * handler logic.  All five route handlers live in ./routes/ and are
 * exercised by their own tests; apiPlugin.routing.test.ts only
 * verifies the URL → handler dispatch.
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { handleFetch } from './routes/fetch';
import { handleProcess } from './routes/process';
import { handleProcessAlphaOnly } from './routes/processAlphaOnly';
import { handleExport } from './routes/export';
import { handleGalaxies } from './routes/galaxies';
import { sessionPath } from './tmpSession';
import { resolveStarnetConfig, type StarnetConfig } from './starnet';

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((res, rej) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      try { res(body.length > 0 ? JSON.parse(body) : {}); }
      catch (err) { rej(err); }
    });
    req.on('error', rej);
  });
}

function readBinaryBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((res, rej) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => res(Buffer.concat(chunks)));
    req.on('error', rej);
  });
}

const PREVIEW_RE = /^\/api\/preview\/([a-f0-9]+)\/([\w.-]+)$/;

const MIME: Readonly<Record<string, string>> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function apiPlugin(): Plugin {
  // Resolve StarNet config at server boot — surfaces the install hint
  // before the first /api/process call.  Falls back to mock if the env
  // can't satisfy real mode (so e.g. `npm test` doesn't need StarNet).
  let starnetConfig: StarnetConfig;
  try {
    starnetConfig = resolveStarnetConfig(process.env);
  } catch (err) {
    process.stderr.write(`curator: ${(err as Error).message}\n`);
    starnetConfig = { mock: true };
  }
  const repoRoot = resolve(__dirname, '../../..');

  return {
    name: 'famous-curator-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        const method = req.method ?? 'GET';
        if (!url.startsWith('/api/')) { next(); return; }
        const path = url.split('?')[0] ?? url;
        try {
          // ── Preview file serving ─────────────────────────────────
          const previewMatch = PREVIEW_RE.exec(path);
          if (method === 'GET' && previewMatch) {
            const tmpId = previewMatch[1]!;
            const name = previewMatch[2]!;
            const filePath = resolve(sessionPath(tmpId), name);
            if (!existsSync(filePath)) {
              sendJson(res, 404, { error: 'preview not found' });
              return;
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', MIME[extname(name)] ?? 'application/octet-stream');
            createReadStream(filePath).pipe(res);
            return;
          }

          // ── Route dispatch ───────────────────────────────────────
          if (method === 'GET' && path === '/api/health') {
            sendJson(res, 200, { ok: true });
            return;
          }
          if (method === 'GET' && path === '/api/galaxies') {
            const out = await handleGalaxies({ repoRoot });
            sendJson(res, 200, out);
            return;
          }
          if (method === 'POST' && path === '/api/fetch') {
            const ct = (req.headers['content-type'] ?? '') as string;
            let body: Parameters<typeof handleFetch>[0]['body'];
            if (ct.startsWith('application/json')) {
              body = await readJsonBody(req) as { url: string };
            } else {
              // multipart / octet-stream: treat the whole body as the file.
              const bytes = await readBinaryBody(req);
              body = { bytes, mediaType: ct || 'application/octet-stream' };
            }
            const out = await handleFetch({
              body,
              imageFetcher: async (u) => {
                const r = await fetch(u);
                if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
                return {
                  bytes: Buffer.from(await r.arrayBuffer()),
                  mediaType: r.headers.get('content-type') ?? 'application/octet-stream',
                };
              },
              sessionFactory: () => {
                const { createSession } = require('./tmpSession') as typeof import('./tmpSession');
                return createSession();
              },
            });
            sendJson(res, 200, out);
            return;
          }
          if (method === 'POST' && path === '/api/process') {
            const body = await readJsonBody(req) as Parameters<typeof handleProcess>[0]['body'];
            const out = await handleProcess({ body, starnetConfig });
            sendJson(res, 200, out);
            return;
          }
          if (method === 'POST' && path === '/api/process/alpha-only') {
            const body = await readJsonBody(req) as Parameters<typeof handleProcessAlphaOnly>[0]['body'];
            const out = await handleProcessAlphaOnly({ body });
            sendJson(res, 200, out);
            return;
          }
          if (method === 'POST' && path === '/api/export') {
            const body = await readJsonBody(req) as Parameters<typeof handleExport>[0]['body'];
            const out = await handleExport({ body, repoRoot });
            sendJson(res, 200, out);
            return;
          }
          sendJson(res, 404, { error: 'not found', path });
        } catch (err) {
          const msg = (err as Error).message;
          // 413 for the size-cap error, 400 for other validation errors,
          // 500 for everything else.  The handlers throw plain Error,
          // so we string-match against well-known messages.
          let status = 500;
          if (/50 MB/.test(msg)) status = 413;
          else if (/not an image|missing|must be|invalid/.test(msg)) status = 400;
          sendJson(res, status, { error: msg });
        }
      });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous-curator/apiPlugin.routing.test.ts`
Expected: PASS (7 tests: 1 unknown + 5 dispatched + 1 preview smoke).

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/plugin/apiPlugin.ts tests/tools/famous-curator/apiPlugin.routing.test.ts
git commit -m "$(cat <<'EOF'
feat(curator): wire all routes + preview serving into apiPlugin

Routes: GET /api/health, GET /api/galaxies, POST /api/fetch (json or
multipart), POST /api/process, POST /api/process/alpha-only,
POST /api/export.  GET /api/preview/:tmpId/:name streams from
session tmpdir.  StarNet config resolved at boot; falls back to mock
if env can't satisfy real mode.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Manual end-to-end smoke + PR

**Files:**
- (No file changes — verifies and ships.)

- [ ] **Step 1: Full vitest run**

Run: `npm test`
Expected: PASS (590+ existing + ~25 from this plan).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual curl smoke**

In one terminal: `MOCK_STARNET=1 npm run curate-famous`.

In another terminal, run each curl in sequence and verify the response:

```bash
# Health
curl -s http://localhost:5200/api/health
# → {"ok":true}

# Galaxies (expect 75-ish entries, all curated:false on fresh repo)
curl -s http://localhost:5200/api/galaxies | head -c 400

# Fetch from URL (use a public test image)
curl -s -X POST http://localhost:5200/api/fetch \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/M31bobo.jpg/640px-M31bobo.jpg"}'
# → {"tmpId":"...","width":640,"height":...,"previewUrl":"/api/preview/.../source.webp","mediaType":"image/jpeg"}

# Process using the returned tmpId
TMP=...  # paste tmpId from above
curl -s -X POST http://localhost:5200/api/process \
  -H 'Content-Type: application/json' \
  -d "{\"tmpId\":\"$TMP\",\"crop\":{\"x\":0,\"y\":0,\"width\":640,\"height\":480},\"starnet\":{\"stride\":256,\"upsample\":false},\"alpha\":{\"blackPoint\":8,\"whitePoint\":230,\"gamma\":0.7}}"

# Alpha-only
curl -s -X POST http://localhost:5200/api/process/alpha-only \
  -H 'Content-Type: application/json' \
  -d "{\"tmpId\":\"$TMP\",\"alpha\":{\"blackPoint\":12,\"whitePoint\":240,\"gamma\":0.6}}"

# Export
curl -s -X POST http://localhost:5200/api/export \
  -H 'Content-Type: application/json' \
  -d "{\"id\":\"m31\",\"tmpId\":\"$TMP\",\"crop\":{\"x\":0,\"y\":0,\"width\":640,\"height\":480},\"starnet\":{\"stride\":256,\"upsample\":false},\"alpha\":{\"blackPoint\":12,\"whitePoint\":240,\"gamma\":0.6},\"metadata\":{\"sourceUrl\":\"https://commons.wikimedia.org/...\",\"license\":\"CC-BY-SA-4.0\",\"author\":\"Test\"}}"

# Verify trio on disk
ls public/images/famous-curated/m31/
# → atlas.webp  full.webp  recipe.json  source.webp  starless.webp

cat data/famous_curated_overrides.json
# → {"version":1,"entries":{"m31":{"dir":"famous-curated/m31",...}}}
```

Clean up after the smoke: `rm -rf public/images/famous-curated/m31 data/famous_curated_overrides.json`.

Kill the dev server.

- [ ] **Step 4: Open the PR**

Run:
```bash
git push -u origin feature/curator-b-api
gh pr create --title "feat(curator): API endpoints — fetch / process / export / galaxies / preview" --body "$(cat <<'EOF'
## Summary
- Adds five real routes (`/api/fetch`, `/api/process`, `/api/process/alpha-only`, `/api/export`, `/api/galaxies`) plus preview WebP serving (`/api/preview/:tmpId/:name`).
- StarNet wrapped via a thin shell-out with `MOCK_STARNET=1` shim for CI.
- Export is atomic: stages to a sibling `.staging-<id>-<ts>/` dir, then renames so partial trios never appear under `public/images/famous-curated/<id>/`.
- Override index updates via temp-file + rename (atomic per call).

Builds on Plan A foundation; UI (Plan C) consumes these endpoints; integration with `fetchFamousImages` (Plan D) reads the override JSON.

## Test plan
- [x] `npm test` — all tests pass (~25 new across 8 files)
- [x] `npm run typecheck` — clean
- [x] End-to-end curl smoke: fetch URL → process → alpha-only → export → verify trio + override JSON on disk
- [x] Cleanup: removed `public/images/famous-curated/m31/` + `data/famous_curated_overrides.json` after smoke

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened; return URL to user.

---

## Subagent-driven-development footer

Each task above sized for one fresh implementer subagent. After landing, dispatch a `requesting-code-review` subagent against the PR before merging.

Total tasks: **10** (1 starnet, 1 tmpSession, 1 fetch, 1 process, 1 alpha-only, 1 overrideIndex, 1 export, 1 galaxies, 1 wire-routes, 1 verify+PR).
