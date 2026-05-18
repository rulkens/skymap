# Famous Galaxy Curator — Plan D: Integration & polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Depends on:** Plans A, B, and C all merged. This plan wires the curator into the existing build pipeline, adds one Playwright smoke test, and runs the visual styling pass.

**Goal:** Make `tools/famous/fetchFamousImages.ts` honour curator overrides at build time, add one Playwright smoke test that drives the full UI happy path, and apply a coherent visual style using the `superpowers:frontend-design` skill. By the end of this plan the curator is fully integrated end-to-end, smoke-tested, and looks pleasant — ready for the maintainer to walk through all 75 galaxies.

**Architecture:** A pure helper in `tools/famous/famousCuratedOverrides.ts` loads `data/famous_curated_overrides.json` (or returns an empty index if missing). `fetchFamousImages.ts` loads the override at startup; for each seed entry it checks the override before walking the Wikipedia/DESI chain, and if present it copies `public/images/famous-curated/<id>/atlas.webp` to `public/images/famous/<id>.webp` and logs "curated". Playwright drives a headed browser against the real curator dev server (booted with `MOCK_STARNET=1` so CI/local runs without StarNet pass). Visual styling is applied via the `superpowers:frontend-design` skill on top of the functional markup Plan C shipped — components stay structurally unchanged; only CSS is added.

**Tech Stack:** TypeScript, Vitest, @playwright/test (already in devDependencies), CSS (no new deps).

**Branch + PR strategy:** Single feature branch `feature/curator-d-integration`; commit per task. Open PR against `main` after Task 5 lands.

---

### Task 1: Pure helper to load the override index from disk

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous/famousCuratedOverrides.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous/famousCuratedOverrides.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous/famousCuratedOverrides.test.ts`:

```ts
/**
 * famousCuratedOverrides — wrapper around the curator's override JSON,
 * used by fetchFamousImages.ts to short-circuit the Wikipedia/DESI chain
 * for hand-curated galaxies.
 *
 * Returns an empty index when the file is absent, so first-time clones
 * (or contributors who never run the curator) don't fail with ENOENT.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCuratedOverrides } from '../../../tools/famous/famousCuratedOverrides';

function tmpPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'famous-cur-overrides-')), 'famous_curated_overrides.json');
}

describe('loadCuratedOverrides', () => {
  it('returns an empty index when the file does not exist', () => {
    const idx = loadCuratedOverrides(tmpPath());
    expect(idx).toEqual({ version: 1, entries: {} });
  });

  it('parses an existing index', () => {
    const path = tmpPath();
    writeFileSync(path, JSON.stringify({
      version: 1,
      entries: {
        m31: { dir: 'famous-curated/m31', sourceUrl: 'x', license: 'CC-BY', author: 'A', processedAt: 't' },
      },
    }));
    const idx = loadCuratedOverrides(path);
    expect(idx.entries.m31?.author).toBe('A');
  });

  it('throws on malformed JSON', () => {
    const path = tmpPath();
    writeFileSync(path, 'not json');
    expect(() => loadCuratedOverrides(path)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous/famousCuratedOverrides.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal code to pass**

Create `/Users/rulkens/Development/js/skymap/tools/famous/famousCuratedOverrides.ts`:

```ts
/**
 * famousCuratedOverrides — read-side wrapper around
 * data/famous_curated_overrides.json.
 *
 * Mirrors the OverrideIndex type from
 * tools/famous-curator/plugin/overrideIndex.ts but lives in the famous/
 * subtree so fetchFamousImages.ts has no import dependency on the
 * curator subtree (the curator may not be present in shallow checkouts
 * that only build the runtime).
 *
 * Returns an empty index when the file is absent — first-time clones
 * shouldn't fail with ENOENT just because nobody has curated yet.
 */
import { existsSync, readFileSync } from 'node:fs';

export type CuratedOverrideEntry = {
  dir: string;
  sourceUrl: string;
  license: string;
  author: string;
  processedAt: string;
};

export type CuratedOverrideIndex = {
  version: 1;
  entries: Record<string, CuratedOverrideEntry>;
};

export function loadCuratedOverrides(path: string): CuratedOverrideIndex {
  if (!existsSync(path)) {
    return { version: 1, entries: {} };
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<CuratedOverrideIndex>;
  if (raw.version !== 1 || typeof raw.entries !== 'object' || raw.entries === null) {
    throw new Error(`curated overrides at ${path}: malformed (expected version 1)`);
  }
  return { version: 1, entries: raw.entries as Record<string, CuratedOverrideEntry> };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous/famousCuratedOverrides.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/famous/famousCuratedOverrides.ts tests/tools/famous/famousCuratedOverrides.test.ts
git commit -m "$(cat <<'EOF'
feat(famous): loadCuratedOverrides helper

Read-side wrapper around data/famous_curated_overrides.json with an
empty-on-missing fallback so first-time clones don't fail with
ENOENT.  Duplicated (not imported) from the curator's overrideIndex
to keep fetchFamousImages.ts independent of the curator subtree.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Wire override-honouring into `fetchFamousImages.ts`

**Files:**
- Modify: `/Users/rulkens/Development/js/skymap/tools/famous/fetchFamousImages.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/tools/famous/fetchFamousImages.curated.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/rulkens/Development/js/skymap/tests/tools/famous/fetchFamousImages.curated.test.ts`:

```ts
/**
 * Integration test for the curated-override short-circuit.
 *
 * Drives the pure copy helper that fetchFamousImages will gain in this
 * task.  The helper takes an entry id + the override index + a repo
 * root, and (when the id has an override) copies
 * public/images/famous-curated/<id>/atlas.webp to
 * public/images/famous/<id>.webp.
 *
 * The CLI loop integration is exercised by the manual smoke step
 * below; this test pins the unit-level contract.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { copyCuratedAtlas } from '../../../tools/famous/fetchFamousImages';

function fixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'famous-curated-test-'));
  mkdirSync(resolve(root, 'public/images/famous'), { recursive: true });
  mkdirSync(resolve(root, 'public/images/famous-curated/m31'), { recursive: true });
  writeFileSync(resolve(root, 'public/images/famous-curated/m31/atlas.webp'), Buffer.from([1, 2, 3, 4]));
  return root;
}

describe('copyCuratedAtlas', () => {
  it('copies atlas.webp from famous-curated/<id>/ to famous/<id>.webp', () => {
    const repo = fixtureRepo();
    copyCuratedAtlas(repo, 'm31');
    const dest = resolve(repo, 'public/images/famous/m31.webp');
    expect(existsSync(dest)).toBe(true);
    expect(Array.from(readFileSync(dest))).toEqual([1, 2, 3, 4]);
  });

  it('overwrites an existing atlas slot', () => {
    const repo = fixtureRepo();
    const dest = resolve(repo, 'public/images/famous/m31.webp');
    writeFileSync(dest, Buffer.from([9, 9, 9, 9]));
    copyCuratedAtlas(repo, 'm31');
    expect(Array.from(readFileSync(dest))).toEqual([1, 2, 3, 4]);
  });

  it('throws when the source atlas.webp is missing', () => {
    const repo = fixtureRepo();
    expect(() => copyCuratedAtlas(repo, 'm99')).toThrow(/m99\/atlas\.webp/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/famous/fetchFamousImages.curated.test.ts`
Expected: FAIL — `copyCuratedAtlas` not exported from fetchFamousImages.

- [ ] **Step 3: Implement minimal code to pass**

Edit `/Users/rulkens/Development/js/skymap/tools/famous/fetchFamousImages.ts`. After the existing import block, add:

```ts
import { copyFileSync } from 'node:fs';
import { loadCuratedOverrides, type CuratedOverrideIndex } from './famousCuratedOverrides.js';
```

After the `chooseWikipediaImageUrl` exported function, add the new helper:

```ts
/**
 * Copy the curator's `atlas.webp` for `id` into the runtime atlas slot
 * path (`public/images/famous/<id>.webp`).  Called from `main()` when
 * an override exists for an entry; lets the maintainer's hand-curated
 * thumbnail replace whatever Wikipedia/DESI would have produced.
 *
 * Public for unit testing — see fetchFamousImages.curated.test.ts.
 *
 * Throws when the source atlas.webp is missing.  That should only
 * happen if `data/famous_curated_overrides.json` has an entry but the
 * corresponding `public/images/famous-curated/<id>/` directory was
 * deleted manually — surfacing it loud is correct.
 */
export function copyCuratedAtlas(repoRoot: string, id: string): void {
  const src = resolve(repoRoot, `public/images/famous-curated/${id}/atlas.webp`);
  const dst = resolve(repoRoot, `public/images/famous/${id}.webp`);
  if (!existsSync(src)) {
    throw new Error(`curated atlas missing: ${id}/atlas.webp (expected at ${src})`);
  }
  copyFileSync(src, dst);
}
```

In `main()`, after the `entries = parseFamousSeed(...)` line and before the worker loop, add:

```ts
  const curatedPath = resolve('data/famous_curated_overrides.json');
  const curated: CuratedOverrideIndex = loadCuratedOverrides(curatedPath);
  process.stderr.write(`curator overrides: ${Object.keys(curated.entries).length} entries\n`);
```

Then at the top of the `for (const e of entries)` loop body (immediately after the `outPath = resolve(...)` line), inject the override check:

```ts
    // Curator override short-circuit: if the maintainer has curated
    // this entry via tools/famous-curator, copy the hand-curated atlas
    // into the runtime slot and skip the Wikipedia/DESI chain entirely.
    // Honour --force by always overwriting.
    if (curated.entries[e.id] !== undefined) {
      if (existsSync(outPath) && !flags.force) {
        process.stderr.write(`  skip ${e.id} (curated, cached)\n`);
        ok++;
        continue;
      }
      try {
        copyCuratedAtlas(resolve('.'), e.id);
        const size = (await import('node:fs')).statSync(outPath).size;
        process.stderr.write(`  ok   ${e.id}  curated  ${(size / 1024).toFixed(1)} KB\n`);
        ok++;
        continue;
      } catch (err) {
        process.stderr.write(`  warn ${e.id}: curated copy failed (${(err as Error).message}); falling back\n`);
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/famous/fetchFamousImages.curated.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite to ensure no regression**

Run: `npm test`
Expected: PASS (all existing tests + new ones).

- [ ] **Step 6: Commit**

```bash
git add tools/famous/fetchFamousImages.ts tests/tools/famous/fetchFamousImages.curated.test.ts
git commit -m "$(cat <<'EOF'
feat(famous): honour curator overrides in fetchFamousImages

Load data/famous_curated_overrides.json at startup; for any seed
entry with an override, copy public/images/famous-curated/<id>/
atlas.webp into the runtime atlas slot path and skip Wikipedia/DESI.
Idempotent skip-if-cached unless --force; logs "curated" instead of
"wikipedia"/"desi".

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Playwright smoke test

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tests/playwright/famous-curator.spec.ts`
- Create: `/Users/rulkens/Development/js/skymap/playwright.config.ts` (if absent)

- [ ] **Step 1: Check whether a Playwright config exists**

Run: `ls playwright.config.ts 2>/dev/null && echo exists || echo missing`
If "missing", create one.  Read first to verify before creating.

- [ ] **Step 2: Write the failing test (and playwright config if needed)**

If `playwright.config.ts` is missing, create `/Users/rulkens/Development/js/skymap/playwright.config.ts`:

```ts
/**
 * Playwright config — currently scoped just to the famous-curator
 * smoke test.  Boots the curator dev server with MOCK_STARNET=1 so
 * the test doesn't need the real StarNet binary installed.
 *
 * Not run in CI (CI doesn't have a port-5200 reservation or a
 * headed browser); meant for local pre-PR verification of the
 * curator.  Add to CI later if the test set grows beyond a single
 * smoke check.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/playwright',
  webServer: {
    command: 'MOCK_STARNET=1 npm run curate-famous',
    url: 'http://localhost:5200',
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:5200',
    headless: true,
  },
});
```

Create `/Users/rulkens/Development/js/skymap/tests/playwright/famous-curator.spec.ts`:

```ts
/**
 * famous-curator smoke — drives the full happy path through the UI.
 *
 * 1. Load the page, wait for the galaxy list.
 * 2. Click an entry.
 * 3. Paste a real URL into the source bar, click Fetch.
 * 4. Wait for the crop overlay.
 * 5. Click Process, wait for the previews.
 * 6. Fill metadata.
 * 7. Click Export, assert the trio files appear on disk.
 *
 * Uses the same test URL as the API curl smoke in Plan B (a small
 * Wikipedia commons hosted M31 thumbnail) so the network dependency
 * is minimal and consistent.
 */
import { test, expect } from '@playwright/test';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const TEST_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/M31bobo.jpg/640px-M31bobo.jpg';
const TEST_ID = 'm31';

test('curator happy path: select → fetch → process → export', async ({ page }) => {
  // Clean any leftover artefacts from prior runs so the test sees a
  // clean baseline.
  const outDir = resolve(process.cwd(), 'public/images/famous-curated', TEST_ID);
  const overrides = resolve(process.cwd(), 'data/famous_curated_overrides.json');
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  if (existsSync(overrides)) rmSync(overrides);

  await page.goto('/');

  // Galaxy list shows up.
  await expect(page.getByRole('list').getByText('M31')).toBeVisible({ timeout: 10_000 });

  // 1. Select M31.
  await page.getByText('M31').click();

  // 2. Paste URL and fetch.
  await page.getByLabel(/source url to fetch/i).fill(TEST_URL);
  await page.getByRole('button', { name: /^fetch$/i }).click();

  // 3. Wait for the crop readout (signals source loaded + crop initialised).
  await expect(page.getByText(/of \d+ × \d+ source/)).toBeVisible({ timeout: 15_000 });

  // 4. Click Process — wait for the alpha preview img to render.
  await page.getByRole('button', { name: /^process$/i }).click();
  await expect(page.getByAltText('alpha')).toBeVisible({ timeout: 30_000 });

  // 5. Fill metadata.
  await page.getByLabel(/^source url$/i).fill(TEST_URL);
  await page.getByLabel(/license/i).fill('CC-BY-SA-4.0');
  await page.getByLabel(/author/i).fill('Test Author');

  // 6. Click Export.
  const exportBtn = page.getByRole('button', { name: /^export$/i });
  await expect(exportBtn).toBeEnabled({ timeout: 5_000 });
  await exportBtn.click();

  // 7. Assert files on disk + the list flips to curated.
  await expect.poll(() => existsSync(resolve(outDir, 'atlas.webp')), { timeout: 10_000 }).toBe(true);
  expect(existsSync(resolve(outDir, 'full.webp'))).toBe(true);
  expect(existsSync(resolve(outDir, 'source.webp'))).toBe(true);
  expect(existsSync(resolve(outDir, 'starless.webp'))).toBe(true);
  expect(existsSync(resolve(outDir, 'recipe.json'))).toBe(true);
  expect(existsSync(overrides)).toBe(true);

  // Cleanup.
  rmSync(outDir, { recursive: true, force: true });
  rmSync(overrides);
});
```

- [ ] **Step 3: Run the Playwright test**

Run: `npx playwright test famous-curator`
Expected: PASS (1 test).  This requires the curator dev server to boot — the `webServer` block handles that.

If Playwright reports missing browsers: `npx playwright install chromium`.

- [ ] **Step 4: Commit**

```bash
git add tests/playwright/famous-curator.spec.ts playwright.config.ts
git commit -m "$(cat <<'EOF'
test(curator): Playwright smoke for the full happy path

Boots the dev server with MOCK_STARNET=1 via webServer, drives
select → fetch → process → export, asserts the four-WebP trio +
recipe.json + override JSON appear on disk.  Local-only (no CI).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Visual styling pass via the frontend-design skill

**Files:**
- Create: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/styles.css`
- Modify: `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/main.tsx` (import the CSS)

> **REQUIRED:** Invoke `superpowers:frontend-design` skill for this task BEFORE writing styles.

- [ ] **Step 1: Invoke the frontend-design skill**

Call the `superpowers:frontend-design` skill with context that the curator is a local-only astronomy maintainer tool: dark-mode astro aesthetic, monospace numeric readouts, ample whitespace, clear hierarchy (left panel = list, centre = canvas, right = controls + previews).  Mention that all components are already structurally complete from Plan C and have semantic class names (`curator-galaxy-list`, `curator-crop-canvas`, `curator-crop-rect`, `curator-crop-handle--<dir>`, `curator-param-sliders`, `curator-preview-pane`, `curator-metadata-form`, `curator-source-bar`, `curator-app`) plus data attributes the stylist can hook into (`data-curated`, `data-dirty`, `aria-current`).

Have the skill produce a single CSS file (`tools/famous-curator/ui/styles.css`) that:
- Establishes a dark base palette (background `#0c0e14` / `#11141d`; text `#d8dde8`; muted `#7c8597`; accent `#5eb1ff`).
- Uses CSS Grid for the App's three-column layout (left list 240px / centre canvas flex / right column 320px).
- Styles `[data-dirty="true"]` on the Process button with an orange dot affordance (the spec says "orange dot on the Process button").
- Styles `[data-curated="true"]` rows in the galaxy list with a subtle green tick / left-border indicator.
- Styles `[aria-current="true"]` rows with a brighter background + left-border accent.
- Makes the crop handles (`.curator-crop-handle--nw` etc.) 12px squares positioned absolutely at their corners + edges, with a `cursor: nwse-resize` etc. per handle direction.
- Inline-formats the slider readouts in monospace so the numbers don't jitter as they change.
- Uses semantic spacing rather than ad-hoc px values (e.g. a `--space-2: 8px / --space-3: 12px / --space-4: 16px / --space-5: 24px` scale).
- No external font dependencies — `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` plus a monospace stack for the readouts.

The exact CSS content is left to the skill output; the constraints above are what the skill should target.

- [ ] **Step 2: Add the CSS import**

In `/Users/rulkens/Development/js/skymap/tools/famous-curator/ui/main.tsx`, add at the top of the imports:

```tsx
import './styles.css';
```

- [ ] **Step 3: Run the existing tests to ensure no regression**

Run: `npm test`
Expected: PASS — styling is CSS-only; component structure is unchanged.

- [ ] **Step 4: Manual visual check**

Run: `MOCK_STARNET=1 npm run curate-famous`

In the browser at http://localhost:5200, verify:
- Dark background, readable text.
- Three-column layout (list / canvas / right column).
- Hovering a galaxy in the left list shows a hover state; clicking gives the active accent.
- Curated entries show the green-tick / data-curated indicator.
- The crop overlay is visible against the source image (semi-transparent fill, contrasting outline).
- All eight crop handles are visible at the rect's corners + edges with appropriate `cursor:` values on hover.
- Slider readouts are monospace + don't jitter as you drag.
- Process button shows an orange dot when crop or starnet is dirty.

- [ ] **Step 5: Commit**

```bash
git add tools/famous-curator/ui/styles.css tools/famous-curator/ui/main.tsx
git commit -m "$(cat <<'EOF'
style(curator): visual polish via superpowers:frontend-design

Dark astro aesthetic, three-column grid layout, monospace numeric
readouts, [data-dirty] orange-dot affordance on Process button,
[data-curated] tick + accent on completed galaxies, [aria-current]
highlight on active galaxy.  Component markup unchanged from Plan C.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Final verification + PR

- [ ] **Step 1: Full test + typecheck + Playwright**

Run:
```bash
npm test
npm run typecheck
npx playwright test famous-curator
```
Expected: PASS on all three.

- [ ] **Step 2: End-to-end real-data smoke (manual)**

Run the curator with the real StarNet:

```bash
STARNET_WEIGHTS=/Users/rulkens/Downloads/StarNet2T_MacOS/StarNet2_weights.pt npm run curate-famous
```

Walk through 1 galaxy (e.g. M31):
- Paste a real Wikipedia hero URL.
- Set a crop, set defaults, click Process — wait 8-15 s.
- Adjust alpha sliders, see live preview.
- Fill metadata, click Export.
- Verify `public/images/famous-curated/m31/` contains all four WebPs + recipe.json.
- Verify `data/famous_curated_overrides.json` has the entry.

Then run `npm run fetch-famous-images` and confirm the log shows `ok m31  curated  ...` instead of `wikipedia`/`desi`, and that `public/images/famous/m31.webp` matches `public/images/famous-curated/m31/atlas.webp` (binary identical).

Clean up so the commit is empty of test artefacts:

```bash
rm -rf public/images/famous-curated/m31
git checkout public/images/famous/m31.webp
rm data/famous_curated_overrides.json
```

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feature/curator-d-integration
gh pr create --title "feat(curator): integration — fetchFamousImages override + Playwright + styling" --body "$(cat <<'EOF'
## Summary
- `fetchFamousImages.ts` now loads `data/famous_curated_overrides.json` at startup; for any seed entry with an override, copies `public/images/famous-curated/<id>/atlas.webp` into the runtime atlas slot and skips Wikipedia/DESI.
- Added Playwright smoke test driving the full UI happy path (boots dev server with `MOCK_STARNET=1`).
- Visual styling pass via `superpowers:frontend-design`: dark astro aesthetic, three-column grid, orange-dot dirty affordance, curated tick, active highlight.

Completes the famous-galaxy-curator feature.  Maintainer can now `npm run curate-famous`, walk the 75-entry catalogue, and the next `npm run fetch-famous-images` honours the curated picks.

## Test plan
- [x] `npm test` — all tests pass (~6 new from this plan)
- [x] `npm run typecheck` — clean
- [x] `npx playwright test famous-curator` — smoke passes
- [x] Manual end-to-end with REAL StarNet: curate 1 galaxy → export → fetch-famous-images shows "curated" + binary-identical atlas

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened; return URL.

---

## Subagent-driven-development footer

Each task above sized for one fresh implementer subagent (Task 4 dispatches the `superpowers:frontend-design` skill mid-task instead of a fresh implementer).  After landing, dispatch a `requesting-code-review` subagent against the PR before merging.

Total tasks: **5** (1 override loader, 1 fetchFamousImages wiring, 1 Playwright, 1 styling pass, 1 verify+PR).
