# MSDF Text Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a general-purpose MSDF text label system to the WebGPU renderer; ship a "YOU ARE HERE" marker on the Milky Way as the first consumer.

**Architecture:** Build-time MSDF atlas (msdf-bmfont-xml CLI → committed PNG+JSON) consumed by a new `LabelRenderer` that draws instanced glyph quads through `labels.wgsl`. A separate `MarkerLineRenderer` draws thin world-anchored screen-space lines. The engine wires both renderers in a new pass between 3D geometry and tone mapping, and a small you-are-here controller toggles the marker on close zoom.

**Tech Stack:** TypeScript, WebGPU + WGSL, Vitest, msdf-bmfont-xml (devDep), JetBrains Mono (font asset).

**Spec:** [`docs/superpowers/specs/2026-05-07-msdf-labels-design.md`](../specs/2026-05-07-msdf-labels-design.md). Read it first — this plan assumes its decisions.

**Conventions reminder:**
- Didactic comments — explain *why*, not just *what*. Match the style of `quadRenderer.ts` and `textureAtlas.ts`.
- `type` aliases not `interface` for TS shapes.
- Tests mirror `src/` tree under `tests/`.
- Dev server stays running — don't kill it.
- Visual changes need a real visual check, not just `npm test`.

---

## File structure

**New:**
```
data/raw/fonts/JetBrainsMono-Regular.ttf            font source (committed once, ~200 KB)
public/fonts/jetbrains-mono.png                     MSDF atlas (build artifact, committed)
public/fonts/jetbrains-mono.json                    glyph metrics (build artifact, committed)

tools/buildFontAtlas.ts                             Node CLI that runs msdf-bmfont-xml
src/services/gpu/fontMetrics.ts                     parser + glyph lookup helpers
src/services/gpu/labelLayout.ts                     pure helper: text → quad attribute list
src/services/gpu/youAreHereVisibility.ts            pure helper: camera distance → fade alpha
src/services/gpu/labelRenderer.ts                   atlas texture + instanced draw
src/services/gpu/markerLineRenderer.ts              screen-space-width lines
src/services/gpu/shaders/labels.wgsl                MSDF vertex+fragment
src/services/gpu/shaders/markerLines.wgsl           thick-line vertex+fragment

tests/services/gpu/fontMetrics.test.ts
tests/services/gpu/labelLayout.test.ts
tests/services/gpu/youAreHereVisibility.test.ts
tests/services/gpu/labelRenderer.test.ts            construction smoke + setLabels state
tests/services/gpu/markerLineRenderer.test.ts       construction smoke + setLines state
```

**Modified:**
```
package.json                                        add msdf-bmfont-xml devDep + build-font script
src/@types/index.ts (or relevant module)            add Label, MarkerLine, FontMetrics types
src/services/engine/engine.ts                       construct renderers, you-are-here controller, pass scheduling
```

**Decomposition rationale:** Pure logic (`fontMetrics`, `labelLayout`, `youAreHereVisibility`) is split out of the renderer files so it can be unit-tested without a GPU device — same pattern as `textureAtlas.test.ts`. The renderers themselves only get smoke tests (construction + state mutation with a `null` device, mirroring `TextureAtlas` tests).

---

## Phase 1: Build pipeline (atlas generation)

### Task 1: Add font asset and msdf-bmfont-xml dependency

**Files:**
- Create: `data/raw/fonts/JetBrainsMono-Regular.ttf`
- Modify: `package.json`
- Modify: `.gitignore` (verify `public/fonts/` is NOT ignored)

- [ ] **Step 1: Download JetBrains Mono Regular**

The font is OFL-licensed. From the GitHub release at `https://github.com/JetBrains/JetBrainsMono/releases/latest`, grab the `.zip` and extract `fonts/ttf/JetBrainsMono-Regular.ttf`. Save it to `data/raw/fonts/JetBrainsMono-Regular.ttf` (create the `fonts/` subdir).

```bash
mkdir -p data/raw/fonts
# download manually or via curl, then:
ls -la data/raw/fonts/JetBrainsMono-Regular.ttf
```

Expected: file exists, ~200 KB.

- [ ] **Step 2: Add msdf-bmfont-xml as a devDependency**

```bash
npm install --save-dev msdf-bmfont-xml@^2.7.0
```

Expected: `package.json` shows `"msdf-bmfont-xml": "^2.7.0"` under `devDependencies`. Pinned-ish; specific patch version doesn't matter for output determinism as long as it stays the same across reruns on the same machine.

- [ ] **Step 3: Add the build-font npm script**

Edit `package.json` scripts block. Add:

```json
"build-font": "tsx tools/buildFontAtlas.ts",
```

Place it alphabetically next to `build-filaments`.

- [ ] **Step 4: Verify public/fonts/ is not gitignored**

```bash
grep -E "fonts" .gitignore
```

Expected: no match, or only matches like `node_modules/.../fonts` that don't apply to `public/fonts/`. If `public/fonts/` is excluded, add an explicit allow rule.

- [ ] **Step 5: Commit**

```bash
git add data/raw/fonts/JetBrainsMono-Regular.ttf package.json package-lock.json
git commit -m "feat(labels): add JetBrains Mono font + msdf-bmfont-xml devDep"
```

---

### Task 2: Write tools/buildFontAtlas.ts

**Files:**
- Create: `tools/buildFontAtlas.ts`

- [ ] **Step 1: Write the script**

```typescript
/**
 * buildFontAtlas — generates the MSDF atlas the LabelRenderer consumes.
 *
 * Why a build step?  MSDF generation is non-trivial CPU work (msdfgen
 * does an SDF computation for every glyph at the requested distance
 * range).  Doing it once at build time and shipping the resulting PNG
 * means the browser never needs the msdfgen WASM (~300 KB) and labels
 * appear on the first frame instead of after a generate-then-upload
 * pause.  Same shape as `tools/buildAllBins.ts`: read raw input under
 * `data/raw/`, emit artefacts to `public/`, idempotent across runs.
 *
 * Output:
 *   public/fonts/jetbrains-mono.png   1024x1024 RGB MSDF atlas
 *   public/fonts/jetbrains-mono.json  glyph metrics in BMFont JSON form
 *
 * Both are committed to git (small enough, deterministic, and rarely
 * regenerated — unlike the catalog .bin files which live in R2).
 */
import generateBMFont from 'msdf-bmfont-xml';
import * as fs from 'node:fs';
import * as path from 'node:path';

const FONT_INPUT = 'data/raw/fonts/JetBrainsMono-Regular.ttf';
const OUTPUT_DIR = 'public/fonts';
const OUTPUT_BASENAME = 'jetbrains-mono';

// Printable ASCII (32..126) plus a small extended set for unit symbols
// and a couple of decorative glyphs we might want.
const CHARSET = (() => {
  const ascii = Array.from({ length: 95 }, (_, i) => String.fromCodePoint(32 + i)).join('');
  const extras = '°±µ∞★';
  return ascii + extras;
})();

const OPTIONS = {
  outputType: 'json',     // emit .fnt as JSON instead of XML
  filename: OUTPUT_BASENAME,
  charset: CHARSET,
  fontSize: 42,           // glyph em-size in atlas pixels (resolution of the SDF source)
  textureSize: [1024, 1024],
  texturePadding: 2,      // px of transparent padding between glyphs (avoids bleed)
  distanceRange: 4,       // SDF range in pixels — must match the shader's smoothing
  fieldType: 'msdf',
} as const;

function main() {
  if (!fs.existsSync(FONT_INPUT)) {
    console.error(`Font not found: ${FONT_INPUT}`);
    process.exit(1);
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  generateBMFont(FONT_INPUT, OPTIONS, (err: Error | null, textures: Array<{ filename: string; texture: Buffer }>, font: { filename: string; data: string }) => {
    if (err) {
      console.error('msdf-bmfont-xml failed:', err);
      process.exit(1);
    }
    if (textures.length !== 1) {
      console.error(`Expected exactly 1 atlas page, got ${textures.length}. Increase textureSize or shrink charset.`);
      process.exit(1);
    }
    const pngPath = path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.png`);
    const jsonPath = path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.json`);
    fs.writeFileSync(pngPath, textures[0].texture);
    fs.writeFileSync(jsonPath, font.data);
    const pngKb = (fs.statSync(pngPath).size / 1024).toFixed(1);
    const jsonKb = (fs.statSync(jsonPath).size / 1024).toFixed(1);
    console.log(`Wrote ${pngPath} (${pngKb} KB)`);
    console.log(`Wrote ${jsonPath} (${jsonKb} KB)`);
  });
}

main();
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS. If `msdf-bmfont-xml` lacks types, you may need to add `// @ts-expect-error — no upstream types` above the import, or write a tiny `tools/buildFontAtlas.d.ts` shim. Prefer the shim.

- [ ] **Step 3: Commit**

```bash
git add tools/buildFontAtlas.ts
git commit -m "feat(labels): add MSDF atlas build script"
```

---

### Task 3: Generate atlas, verify, commit artefact

**Files:**
- Create: `public/fonts/jetbrains-mono.png`
- Create: `public/fonts/jetbrains-mono.json`

- [ ] **Step 1: Run the build**

```bash
npm run build-font
```

Expected output:
```
Wrote public/fonts/jetbrains-mono.png (~150 KB)
Wrote public/fonts/jetbrains-mono.json (~30 KB)
```

If it fails with `Expected exactly 1 atlas page, got N`, increase `textureSize` to `[2048, 2048]` or shrink `CHARSET`. The full charset above should fit in 1024² for JetBrains Mono at fontSize 42.

- [ ] **Step 2: Eyeball the atlas**

Open `public/fonts/jetbrains-mono.png` in an image viewer. Expected: a dark image with multicoloured (red/green/blue/cyan/magenta/yellow) glyph shapes laid out in a grid. The colours look weird and that's correct — MSDF stores three independent SDFs in RGB; the colours encode glyph corners.

- [ ] **Step 3: Spot-check the JSON**

```bash
head -c 500 public/fonts/jetbrains-mono.json
```

Expected: valid JSON beginning with `{"pages":[...],"chars":[{"id":32,...}, ...`. The `chars` array should have ~100 entries.

- [ ] **Step 4: Re-run for determinism check**

```bash
md5 public/fonts/jetbrains-mono.png public/fonts/jetbrains-mono.json
npm run build-font
md5 public/fonts/jetbrains-mono.png public/fonts/jetbrains-mono.json
```

Expected: identical hashes before and after. If not, dig into msdf-bmfont-xml options — likely a non-deterministic glyph order; sort the charset.

- [ ] **Step 5: Commit**

```bash
git add public/fonts/jetbrains-mono.png public/fonts/jetbrains-mono.json
git commit -m "feat(labels): commit generated MSDF atlas"
```

---

## Phase 2: Pure logic (TDD)

### Task 4: fontMetrics.ts — types and parser

**Files:**
- Create: `src/services/gpu/fontMetrics.ts`
- Create: `tests/services/gpu/fontMetrics.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/services/gpu/fontMetrics.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseFontMetrics, lookupGlyph, type FontMetrics } from '../../../src/services/gpu/fontMetrics';

const FIXTURE = {
  pages: ['jetbrains-mono.png'],
  common: { lineHeight: 50, base: 38, scaleW: 1024, scaleH: 1024 },
  info: { face: 'JetBrains Mono', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 4 },
  chars: [
    { id: 65, x: 0, y: 0, width: 30, height: 40, xoffset: 1, yoffset: 2, xadvance: 25, page: 0, chnl: 15 },
    { id: 66, x: 32, y: 0, width: 28, height: 40, xoffset: 0, yoffset: 2, xadvance: 25, page: 0, chnl: 15 },
  ],
  kernings: [{ first: 65, second: 66, amount: -1 }],
};

describe('parseFontMetrics', () => {
  it('parses atlas dimensions and distance range', () => {
    const m = parseFontMetrics(FIXTURE);
    expect(m.atlas.width).toBe(1024);
    expect(m.atlas.height).toBe(1024);
    expect(m.atlas.distanceRange).toBe(4);
    expect(m.lineHeight).toBe(50);
    expect(m.fontSize).toBe(42);
  });

  it('indexes glyphs by codepoint', () => {
    const m = parseFontMetrics(FIXTURE);
    const a = lookupGlyph(m, 'A'.codePointAt(0)!);
    expect(a).toBeDefined();
    expect(a!.advance).toBe(25);
    expect(a!.uv.u0).toBeCloseTo(0 / 1024);
    expect(a!.uv.v0).toBeCloseTo(0 / 1024);
    expect(a!.uv.u1).toBeCloseTo(30 / 1024);
    expect(a!.uv.v1).toBeCloseTo(40 / 1024);
  });

  it('returns undefined for unknown codepoints', () => {
    const m = parseFontMetrics(FIXTURE);
    expect(lookupGlyph(m, 0x4e2d)).toBeUndefined(); // 中 — not in atlas
  });

  it('exposes kerning pairs', () => {
    const m = parseFontMetrics(FIXTURE);
    expect(m.kerning.get('65,66')).toBe(-1);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npx vitest run tests/services/gpu/fontMetrics.test.ts
```

Expected: FAIL with "Cannot find module '.../fontMetrics'".

- [ ] **Step 3: Write fontMetrics.ts**

```typescript
/**
 * fontMetrics — parses the BMFont JSON emitted by `tools/buildFontAtlas.ts`
 * into a runtime-friendly shape with O(1) glyph lookup by codepoint.
 *
 * BMFont JSON has a flat `chars` array indexed by id (codepoint); we
 * convert to a Map for fast lookup and pre-divide pixel positions by
 * atlas size so the renderer never has to do that math at draw time.
 *
 * Why a separate module instead of putting it in labelRenderer?  Pure
 * data transformation, easy to unit-test against fixtures, and the
 * label-layout helper (next task) depends on it without dragging in any
 * GPU code.
 */

export type GlyphMetrics = {
  /** UV rect in [0,1] atlas space. */
  uv: { u0: number; v0: number; u1: number; v1: number };
  /** Glyph plane size in pixels at the atlas's source font size. */
  size: { w: number; h: number };
  /** Pen offset to the glyph quad's top-left, in pixels. */
  offset: { x: number; y: number };
  /** Pen advance after this glyph, in pixels. */
  advance: number;
};

export type FontMetrics = {
  atlas: { width: number; height: number; distanceRange: number };
  fontSize: number;
  lineHeight: number;
  glyphs: Map<number, GlyphMetrics>;
  /** Key is `"${first},${second}"` (codepoints). Value is amount in pixels. */
  kerning: Map<string, number>;
};

export type RawBMFont = {
  pages: string[];
  common: { lineHeight: number; base: number; scaleW: number; scaleH: number };
  info: { face: string; size: number };
  /** Top-level (NOT inside `info`) per msdf-bmfont-xml's JSON output. */
  distanceField: { fieldType: string; distanceRange: number };
  chars: Array<{
    id: number; x: number; y: number; width: number; height: number;
    xoffset: number; yoffset: number; xadvance: number;
    page: number; chnl: number;
  }>;
  kernings?: Array<{ first: number; second: number; amount: number }>;
};

export function parseFontMetrics(raw: RawBMFont): FontMetrics {
  const w = raw.common.scaleW;
  const h = raw.common.scaleH;
  const glyphs = new Map<number, GlyphMetrics>();
  for (const c of raw.chars) {
    glyphs.set(c.id, {
      uv: {
        u0: c.x / w,
        v0: c.y / h,
        u1: (c.x + c.width) / w,
        v1: (c.y + c.height) / h,
      },
      size: { w: c.width, h: c.height },
      offset: { x: c.xoffset, y: c.yoffset },
      advance: c.xadvance,
    });
  }
  const kerning = new Map<string, number>();
  for (const k of raw.kernings ?? []) {
    kerning.set(`${k.first},${k.second}`, k.amount);
  }
  return {
    atlas: { width: w, height: h, distanceRange: raw.distanceField.distanceRange },
    fontSize: raw.info.size,
    lineHeight: raw.common.lineHeight,
    glyphs,
    kerning,
  };
}

export function lookupGlyph(m: FontMetrics, codepoint: number): GlyphMetrics | undefined {
  return m.glyphs.get(codepoint);
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npx vitest run tests/services/gpu/fontMetrics.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/fontMetrics.ts tests/services/gpu/fontMetrics.test.ts
git commit -m "feat(labels): add fontMetrics parser"
```

---

### Task 5: labelLayout.ts — pure text-to-quads helper

**Files:**
- Create: `src/services/gpu/labelLayout.ts`
- Create: `tests/services/gpu/labelLayout.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { layoutLabel, type GlyphQuad } from '../../../src/services/gpu/labelLayout';
import { parseFontMetrics } from '../../../src/services/gpu/fontMetrics';

const FIXTURE = {
  pages: ['atlas.png'],
  common: { lineHeight: 50, base: 38, scaleW: 1024, scaleH: 1024 },
  info: { face: 'X', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 4 },
  chars: [
    { id: 65, x: 0,  y: 0, width: 30, height: 40, xoffset: 1, yoffset: 2, xadvance: 25, page: 0, chnl: 15 },
    { id: 66, x: 32, y: 0, width: 28, height: 40, xoffset: 0, yoffset: 2, xadvance: 26, page: 0, chnl: 15 },
  ],
  kernings: [{ first: 65, second: 66, amount: -1 }],
};

describe('layoutLabel', () => {
  const metrics = parseFontMetrics(FIXTURE);

  it('produces one quad per glyph', () => {
    const quads = layoutLabel('AB', metrics);
    expect(quads).toHaveLength(2);
  });

  it('positions glyphs sequentially with kerning', () => {
    const quads = layoutLabel('AB', metrics);
    expect(quads[0].localOffsetX).toBeCloseTo(1);                    // A xoffset
    expect(quads[1].localOffsetX).toBeCloseTo(25 + (-1) + 0);        // A.advance + kerning + B.xoffset
  });

  it('skips glyphs not in the atlas', () => {
    const quads = layoutLabel('A中B', metrics);
    expect(quads).toHaveLength(2); // 中 dropped silently
  });

  it('returns total advance width', () => {
    const quads = layoutLabel('AB', metrics);
    const last = quads[quads.length - 1];
    // Width spans from start through last glyph's right edge.
    expect(last.localOffsetX + last.localSizeW).toBeGreaterThan(48);
  });

  it('emits glyph atlas UV from metrics', () => {
    const quads = layoutLabel('A', metrics);
    expect(quads[0].uvU0).toBeCloseTo(0);
    expect(quads[0].uvV0).toBeCloseTo(0);
    expect(quads[0].uvU1).toBeCloseTo(30 / 1024);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npx vitest run tests/services/gpu/labelLayout.test.ts
```

Expected: FAIL with "Cannot find module '.../labelLayout'".

- [ ] **Step 3: Write labelLayout.ts**

```typescript
/**
 * labelLayout — converts a text string into the per-glyph attribute
 * tuples the label vertex shader expects.  Pure and synchronous: no GPU
 * device, no fetch, no allocation beyond the returned array.
 *
 * Coordinate convention: pen starts at (0, 0) which is the LEFT edge of
 * the first glyph at the BASELINE.  X advances rightward by glyph
 * advance + kerning.  Y is in pixel units of the source atlas (so a
 * glyph with `yoffset = 2` sits 2 px below the baseline anchor).  The
 * vertex shader will apply scale and world-position transforms.
 *
 * Glyphs missing from the atlas are silently dropped — the alternative
 * (rendering a tofu box) needs special atlas slots and adds complexity
 * we don't need yet.  ASCII + a few unit symbols already cover every
 * label we plan to render.
 */
import type { FontMetrics } from './fontMetrics';
import { lookupGlyph } from './fontMetrics';

export type GlyphQuad = {
  /** Pen-relative position of the glyph's top-left corner, in atlas pixels. */
  localOffsetX: number;
  localOffsetY: number;
  /** Glyph plane size in atlas pixels. */
  localSizeW: number;
  localSizeH: number;
  /** Atlas UVs in [0,1]. */
  uvU0: number;
  uvV0: number;
  uvU1: number;
  uvV1: number;
};

export function layoutLabel(text: string, metrics: FontMetrics): GlyphQuad[] {
  const quads: GlyphQuad[] = [];
  let penX = 0;
  let prevCodepoint: number | undefined;

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    const g = lookupGlyph(metrics, cp);
    if (!g) {
      prevCodepoint = undefined;
      continue;
    }
    if (prevCodepoint !== undefined) {
      const k = metrics.kerning.get(`${prevCodepoint},${cp}`);
      if (k) penX += k;
    }
    quads.push({
      localOffsetX: penX + g.offset.x,
      localOffsetY: g.offset.y,
      localSizeW: g.size.w,
      localSizeH: g.size.h,
      uvU0: g.uv.u0,
      uvV0: g.uv.v0,
      uvU1: g.uv.u1,
      uvV1: g.uv.v1,
    });
    penX += g.advance;
    prevCodepoint = cp;
  }
  return quads;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npx vitest run tests/services/gpu/labelLayout.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/labelLayout.ts tests/services/gpu/labelLayout.test.ts
git commit -m "feat(labels): add pure label-layout helper"
```

---

### Task 6: youAreHereVisibility.ts — distance-to-alpha

**Files:**
- Create: `src/services/gpu/youAreHereVisibility.ts`
- Create: `tests/services/gpu/youAreHereVisibility.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { youAreHereAlpha, YOU_ARE_HERE_NEAR_MPC, YOU_ARE_HERE_FAR_MPC } from '../../../src/services/gpu/youAreHereVisibility';

describe('youAreHereAlpha', () => {
  it('is 1.0 when camera is closer than NEAR threshold', () => {
    expect(youAreHereAlpha(0)).toBe(1);
    expect(youAreHereAlpha(YOU_ARE_HERE_NEAR_MPC * 0.5)).toBe(1);
  });

  it('is 0.0 when camera is farther than FAR threshold', () => {
    expect(youAreHereAlpha(YOU_ARE_HERE_FAR_MPC + 1)).toBe(0);
    expect(youAreHereAlpha(1000)).toBe(0);
  });

  it('smoothly fades between NEAR and FAR', () => {
    const mid = (YOU_ARE_HERE_NEAR_MPC + YOU_ARE_HERE_FAR_MPC) / 2;
    const a = youAreHereAlpha(mid);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
  });

  it('is monotonically decreasing across the band', () => {
    const samples = 10;
    const span = YOU_ARE_HERE_FAR_MPC - YOU_ARE_HERE_NEAR_MPC;
    let prev = youAreHereAlpha(YOU_ARE_HERE_NEAR_MPC);
    for (let i = 1; i <= samples; i++) {
      const a = youAreHereAlpha(YOU_ARE_HERE_NEAR_MPC + (span * i) / samples);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npx vitest run tests/services/gpu/youAreHereVisibility.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write youAreHereVisibility.ts**

```typescript
/**
 * youAreHereVisibility — alpha-from-distance for the "YOU ARE HERE"
 * marker on the Milky Way.
 *
 * Why these numbers?  At >2 Mpc the camera is looking at large-scale
 * structure (the Local Volume disappears as a single pixel cluster);
 * a label there would be visual noise.  At <0.6 Mpc the camera is
 * inside the Local Group, where the marker is genuinely useful for
 * orientation.  Values are tuneable; tweak after visual review.
 *
 * The fade band uses `smoothstep` for ease-in/ease-out so the marker
 * doesn't pop in or snap out — render-on-demand will keep the frame
 * loop awake as long as alpha is mid-transition.
 */

export const YOU_ARE_HERE_NEAR_MPC = 0.6;
export const YOU_ARE_HERE_FAR_MPC = 2.0;

export function youAreHereAlpha(cameraDistMpc: number): number {
  if (cameraDistMpc <= YOU_ARE_HERE_NEAR_MPC) return 1;
  if (cameraDistMpc >= YOU_ARE_HERE_FAR_MPC) return 0;
  const t = (cameraDistMpc - YOU_ARE_HERE_NEAR_MPC) / (YOU_ARE_HERE_FAR_MPC - YOU_ARE_HERE_NEAR_MPC);
  // smoothstep, inverted so the result is 1 at t=0 and 0 at t=1.
  const s = t * t * (3 - 2 * t);
  return 1 - s;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npx vitest run tests/services/gpu/youAreHereVisibility.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/youAreHereVisibility.ts tests/services/gpu/youAreHereVisibility.test.ts
git commit -m "feat(labels): add you-are-here visibility math"
```

---

## Phase 3: WGSL shaders + renderer scaffolding

### Task 7: labels.wgsl shader

**Files:**
- Create: `src/services/gpu/shaders/labels.wgsl`

- [ ] **Step 1: Write the shader**

Slow down on this one — per the project's WGSL meticulousness rule, double-check struct alignment and attribute offsets before considering it done. WGSL alignment: `vec3<f32>` is treated as 16-byte aligned, so structs containing one need explicit padding.

```wgsl
// labels.wgsl — MSDF text rendering with hybrid (clamped) screen-space sizing.
//
// Per-glyph instance: one quad expanded from a unit corner attribute.
// Per-label data lives in a storage buffer indexed by `labelIndex` so
// all glyphs of one label share its world position, color, and fade.
//
// Sizing model: each label has a notional "world em size" (Mpc per em
// of the source font).  The vertex shader projects worldPos to clip
// space, computes how many screen pixels one em occupies at that depth,
// then clamps the result to [minPixelSize, maxPixelSize] before scaling
// each glyph quad accordingly.  This is the "hybrid: world-space with
// min/max pixel clamp" mode from the design spec.

struct Uniforms {
  viewProj   : mat4x4<f32>,
  // viewport pixel dimensions in xy; .zw reserved for future use.
  viewport   : vec4<f32>,
};

struct LabelData {
  // worldPos.xyz = anchor in Mpc; worldPos.w = worldEmMpc (em-size in Mpc)
  worldPos      : vec4<f32>,
  // color.rgb premultiplied; color.a = base alpha (multiplied by fadeAlpha)
  color         : vec4<f32>,
  // x = pixelSize (target em pixel height at natural viewing distance)
  // y = minPixelSize, z = maxPixelSize, w = fadeAlpha
  sizing        : vec4<f32>,
};

@group(0) @binding(0) var<uniform> u : Uniforms;
@group(0) @binding(1) var<storage, read> labels : array<LabelData>;
@group(0) @binding(2) var atlas : texture_2d<f32>;
@group(0) @binding(3) var atlasSampler : sampler;

struct VsIn {
  @location(0) corner       : vec2<f32>, // (0,0) (1,0) (0,1) (1,1)
  @location(1) localOffset  : vec2<f32>, // pen-relative top-left of glyph, atlas px
  @location(2) localSize    : vec2<f32>, // glyph w,h, atlas px
  @location(3) uvRect       : vec4<f32>, // u0 v0 u1 v1
  @location(4) labelIndex   : u32,
};

struct VsOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv        : vec2<f32>,
  @location(1) color     : vec4<f32>,
};

@vertex
fn vs(input : VsIn) -> VsOut {
  let label = labels[input.labelIndex];
  let worldPos    = label.worldPos.xyz;
  let worldEmMpc  = label.worldPos.w;
  let pixelSize   = label.sizing.x;
  let minPx       = label.sizing.y;
  let maxPx       = label.sizing.z;
  let fadeAlpha   = label.sizing.w;

  // Project anchor to clip space.
  let clip = u.viewProj * vec4<f32>(worldPos, 1.0);
  // Perspective-projected pixel height of one em at this depth:
  //   pxPerEm = (worldEmMpc / clip.w) * (viewportH / 2)
  // (clip.w = camera-space depth for a perspective projection)
  let pxPerEm = (worldEmMpc / clip.w) * (u.viewport.y * 0.5);
  let actualPx = clamp(pxPerEm, minPx, maxPx);
  // ratio relative to the target — used to scale the glyph quad.
  let pxScale = actualPx / pixelSize;

  // Glyph corner in atlas px, relative to label anchor.  Atlas Y is
  // top-down; we flip to make Y up in world space (so labels appear
  // above the anchor when localOffsetY is negative).
  let corner_atlas_px = vec2<f32>(
    input.localOffset.x + input.corner.x * input.localSize.x,
    -(input.localOffset.y + input.corner.y * input.localSize.y),
  );
  // Convert atlas px to clip space at depth clip.w:
  //   ndc_per_px = 2 / viewport.xy
  //   then scale by clip.w so the offset is in clip-space (perspective
  //   correct — vertex shader output is multiplied by 1/w during
  //   rasterization, which would otherwise shrink our offsets).
  let ndcOffset = corner_atlas_px * pxScale * (2.0 / u.viewport.xy) * clip.w;

  let outPos = vec4<f32>(clip.x + ndcOffset.x, clip.y + ndcOffset.y, clip.z, clip.w);

  let uv = vec2<f32>(
    mix(input.uvRect.x, input.uvRect.z, input.corner.x),
    mix(input.uvRect.y, input.uvRect.w, input.corner.y),
  );

  let outColor = vec4<f32>(label.color.rgb, label.color.a * fadeAlpha);
  return VsOut(outPos, uv, outColor);
}

fn median3(r : f32, g : f32, b : f32) -> f32 {
  return max(min(r, g), min(max(r, g), b));
}

@fragment
fn fs(input : VsOut) -> @location(0) vec4<f32> {
  let s = textureSample(atlas, atlasSampler, input.uv).rgb;
  let d = median3(s.r, s.g, s.b) - 0.5;
  let aa = fwidth(d);
  let alpha = smoothstep(-aa, aa, d) * input.color.a;
  // Premultiplied output (the blend state expects premultiplied).
  return vec4<f32>(input.color.rgb * alpha, alpha);
}
```

- [ ] **Step 2: Verify by typechecking the project**

```bash
npm run typecheck
```

Expected: PASS. WGSL isn't typechecked here, but if any TS imports of the file via `?raw` break, the typecheck will catch it. The shader itself isn't validated until pipeline creation in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/services/gpu/shaders/labels.wgsl
git commit -m "feat(labels): add MSDF labels WGSL shader"
```

---

### Task 8: labelRenderer.ts construction + setLabels

**Files:**
- Create: `src/services/gpu/labelRenderer.ts`
- Create: `tests/services/gpu/labelRenderer.test.ts`

This task brings the renderer up to the point of accepting labels and computing the GPU-bound buffers, but does NOT yet implement the `render()` method. That's Task 9. Splitting keeps both tasks bite-sized.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { LabelRenderer } from '../../../src/services/gpu/labelRenderer';
import { parseFontMetrics } from '../../../src/services/gpu/fontMetrics';

const FIXTURE_METRICS = parseFontMetrics({
  pages: ['x.png'],
  common: { lineHeight: 50, base: 38, scaleW: 1024, scaleH: 1024 },
  info: { face: 'X', size: 42 },
  distanceField: { fieldType: 'msdf', distanceRange: 4 },
  chars: [
    { id: 65, x: 0, y: 0, width: 30, height: 40, xoffset: 0, yoffset: 0, xadvance: 25, page: 0, chnl: 15 },
  ],
});

describe('LabelRenderer (CPU state)', () => {
  // Pure-state tests — pass null device, mirrors textureAtlas.test.ts.
  // The render() method is deferred to Task 9 and tested via a different path.
  const newRenderer = () => new LabelRenderer(null as unknown as GPUDevice, 'rgba16float', FIXTURE_METRICS);

  it('starts with zero glyphs to draw', () => {
    const r = newRenderer();
    expect(r.glyphCount()).toBe(0);
  });

  it('counts glyphs across all labels after setLabels', () => {
    const r = newRenderer();
    r.setLabels([
      { id: 'a', worldPos: [0, 0, 0], text: 'AAA', pixelSize: 24 },
      { id: 'b', worldPos: [1, 0, 0], text: 'AA',  pixelSize: 24 },
    ]);
    expect(r.glyphCount()).toBe(5);
    expect(r.labelCount()).toBe(2);
  });

  it('drops glyphs not present in metrics', () => {
    const r = newRenderer();
    r.setLabels([{ id: 'x', worldPos: [0, 0, 0], text: 'A中A', pixelSize: 24 }]);
    expect(r.glyphCount()).toBe(2);
  });

  it('replaces (not appends) on subsequent setLabels', () => {
    const r = newRenderer();
    r.setLabels([{ id: 'a', worldPos: [0, 0, 0], text: 'A', pixelSize: 24 }]);
    r.setLabels([{ id: 'b', worldPos: [0, 0, 0], text: 'AAA', pixelSize: 24 }]);
    expect(r.labelCount()).toBe(1);
    expect(r.glyphCount()).toBe(3);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npx vitest run tests/services/gpu/labelRenderer.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Write labelRenderer.ts (state + buffer construction only)**

Reference `src/services/gpu/quadRenderer.ts` for the structural pattern (class with `device`, `format`, `pipeline`, `bindGroupLayout`, etc.). For this task only build the public API + CPU-side state; defer pipeline/bindGroup/render to Task 9 by guarding GPU calls behind an `if (this.device)` check (the test passes a null device).

```typescript
/**
 * LabelRenderer — instanced MSDF text label pass.
 *
 * Public API:
 *   setLabels(labels)  rebuilds the per-glyph instance buffer; called
 *                      rarely (toggle, you-are-here gate flip), not per
 *                      frame.
 *   render(...)        emits one draw covering all glyphs of all labels.
 *
 * Why one draw call?  All glyphs share the same atlas texture and
 * pipeline; differing per-label parameters (worldPos, color, fade) are
 * looked up via `labelIndex` from a storage buffer in the shader.  This
 * is the same one-draw-per-pass approach as quadRenderer and pointRenderer.
 */
import type { mat4 } from 'gl-matrix';
import type { FontMetrics } from './fontMetrics';
import { layoutLabel, type GlyphQuad } from './labelLayout';
import labelsWgsl from './shaders/labels.wgsl?raw';

export type Label = {
  id: string;
  worldPos: [number, number, number];
  text: string;
  pixelSize: number;
  color?: [number, number, number, number];
  minPixelSize?: number;
  maxPixelSize?: number;
  /** World em size in Mpc — controls the natural distance at which `pixelSize` is reached.
   *  Default 0.01 Mpc/em (so a 24px label with worldEmMpc=0.01 reads at 24px when ~0.01 Mpc deep). */
  worldEmMpc?: number;
  fadeAlpha?: number;
};

const FLOATS_PER_LABEL = 12; // 3 vec4: worldPos+em, color, sizing
const BYTES_PER_LABEL = FLOATS_PER_LABEL * 4;
const FLOATS_PER_GLYPH_INSTANCE = 9; // localOffset(2) + localSize(2) + uvRect(4) + labelIndex(1, packed as u32 in last slot)
const BYTES_PER_GLYPH_INSTANCE = FLOATS_PER_GLYPH_INSTANCE * 4;

export class LabelRenderer {
  private readonly device: GPUDevice | null;
  private readonly format: GPUTextureFormat;
  private readonly metrics: FontMetrics;

  // CPU-side state — populated by setLabels.
  private labels: Label[] = [];
  private glyphInstances: Float32Array = new Float32Array(0);
  private labelData: Float32Array = new Float32Array(0);
  private totalGlyphs = 0;

  constructor(device: GPUDevice | null, format: GPUTextureFormat, metrics: FontMetrics) {
    this.device = device;
    this.format = format;
    this.metrics = metrics;
    // GPU resource creation is deferred to Task 9.
  }

  setLabels(labels: Label[]): void {
    this.labels = labels;
    // Rebuild per-glyph instance data.
    const allQuads: Array<{ q: GlyphQuad; labelIndex: number }> = [];
    for (let i = 0; i < labels.length; i++) {
      const quads = layoutLabel(labels[i].text, this.metrics);
      for (const q of quads) allQuads.push({ q, labelIndex: i });
    }
    this.totalGlyphs = allQuads.length;
    this.glyphInstances = new Float32Array(allQuads.length * FLOATS_PER_GLYPH_INSTANCE);
    const instU32 = new Uint32Array(this.glyphInstances.buffer);
    for (let i = 0; i < allQuads.length; i++) {
      const off = i * FLOATS_PER_GLYPH_INSTANCE;
      const { q, labelIndex } = allQuads[i];
      this.glyphInstances[off + 0] = q.localOffsetX;
      this.glyphInstances[off + 1] = q.localOffsetY;
      this.glyphInstances[off + 2] = q.localSizeW;
      this.glyphInstances[off + 3] = q.localSizeH;
      this.glyphInstances[off + 4] = q.uvU0;
      this.glyphInstances[off + 5] = q.uvV0;
      this.glyphInstances[off + 6] = q.uvU1;
      this.glyphInstances[off + 7] = q.uvV1;
      // labelIndex is a u32 sharing the last slot of the float view.
      instU32[off + 8] = labelIndex;
    }

    // Rebuild per-label storage data.
    this.labelData = new Float32Array(labels.length * FLOATS_PER_LABEL);
    for (let i = 0; i < labels.length; i++) {
      const l = labels[i];
      const off = i * FLOATS_PER_LABEL;
      const color = l.color ?? [1, 1, 1, 1];
      this.labelData[off + 0] = l.worldPos[0];
      this.labelData[off + 1] = l.worldPos[1];
      this.labelData[off + 2] = l.worldPos[2];
      this.labelData[off + 3] = l.worldEmMpc ?? 0.01;
      this.labelData[off + 4] = color[0];
      this.labelData[off + 5] = color[1];
      this.labelData[off + 6] = color[2];
      this.labelData[off + 7] = color[3];
      this.labelData[off + 8] = l.pixelSize;
      this.labelData[off + 9] = l.minPixelSize ?? 12;
      this.labelData[off + 10] = l.maxPixelSize ?? 64;
      this.labelData[off + 11] = l.fadeAlpha ?? 1;
    }
    // GPU upload deferred to Task 9.
  }

  glyphCount(): number {
    return this.totalGlyphs;
  }
  labelCount(): number {
    return this.labels.length;
  }

  destroy(): void {
    // GPU resource teardown deferred to Task 9.
  }
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npx vitest run tests/services/gpu/labelRenderer.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/services/gpu/labelRenderer.ts tests/services/gpu/labelRenderer.test.ts
git commit -m "feat(labels): LabelRenderer state + setLabels"
```

---

### Task 9: labelRenderer.ts — pipeline, atlas upload, render method

**Files:**
- Modify: `src/services/gpu/labelRenderer.ts`

This task adds the GPU-side bits: pipeline creation, atlas texture upload (caller-provided ImageBitmap), uniform/storage/instance buffer creation, and the `render()` method. No new tests — the existing CPU-state tests still pass with `null` device, and full GPU testing is the visual verification step.

- [ ] **Step 1: Add a static atlas-loader helper**

Append to `labelRenderer.ts`:

```typescript
/**
 * Fetches the atlas PNG and metrics JSON, returning everything the
 * LabelRenderer constructor needs.  Engine startup calls this once.
 *
 * Why ImageBitmap?  GPUDevice.copyExternalImageToTexture wants either
 * an HTMLImageElement, ImageBitmap, or canvas.  ImageBitmap is the
 * cheapest and works across worker boundaries if we ever need it.
 */
export async function loadFontAtlas(): Promise<{ bitmap: ImageBitmap; metrics: FontMetrics }> {
  const [pngResp, jsonResp] = await Promise.all([
    fetch('/fonts/jetbrains-mono.png'),
    fetch('/fonts/jetbrains-mono.json'),
  ]);
  if (!pngResp.ok) throw new Error(`Font atlas PNG fetch failed: ${pngResp.status}`);
  if (!jsonResp.ok) throw new Error(`Font metrics JSON fetch failed: ${jsonResp.status}`);
  const blob = await pngResp.blob();
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const raw = await jsonResp.json();
  const { parseFontMetrics } = await import('./fontMetrics');
  return { bitmap, metrics: parseFontMetrics(raw) };
}
```

- [ ] **Step 2: Add GPU resources to the constructor**

Modify `LabelRenderer` to accept the atlas bitmap and create:
1. A 4-vertex `cornerBuffer` (the unit quad corners).
2. An `instanceBuffer` (resizable, holds glyph attribute data).
3. A `uniformBuffer` for `Uniforms` (viewProj 64B + viewport 16B = 80B, padded to 96).
4. A `labelStorageBuffer` (resizable, per-label data).
5. An `atlasTexture` (RGBA8 unorm) and a linear sampler.
6. A `bindGroupLayout` with: uniform (vertex), storage (vertex, read-only), texture (fragment), sampler (fragment).
7. A `pipeline` with the `labels.wgsl` module, blending enabled (premultiplied alpha), no depth write.

The constructor signature changes to:

```typescript
constructor(
  device: GPUDevice | null,
  format: GPUTextureFormat,
  metrics: FontMetrics,
  atlasBitmap?: ImageBitmap,
)
```

If `device` is null, skip all GPU resource creation (preserves test compatibility). If `device` is non-null, `atlasBitmap` is required — throw otherwise. Use `device.queue.copyExternalImageToTexture(...)` to upload the atlas in the constructor.

For the pipeline blend state (premultiplied alpha matches `labels.wgsl`'s premultiplied output):

```typescript
{
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
}
```

Pipeline `vertex.buffers` must declare TWO buffers: the corner buffer (per-vertex, vec2 at location 0) and the instance buffer (per-instance, locations 1..4). Refer to `quadRenderer.ts` lines 90-115 for the exact pattern.

For the storage-buffer binding in the bind group layout:

```typescript
{ binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }
```

- [ ] **Step 3: In setLabels, also upload to GPU buffers**

After the existing CPU-state code in `setLabels`, add (guarded by `this.device`):

```typescript
if (this.device) {
  // Grow buffers if needed (recreate when capacity is exceeded; the
  // initial allocation in the constructor sets a small starting cap).
  if (this.glyphInstances.byteLength > this.instanceBufferCapacity) {
    this.instanceBuffer.destroy();
    this.instanceBufferCapacity = nextPow2(this.glyphInstances.byteLength);
    this.instanceBuffer = this.device.createBuffer({
      label: 'label-instances',
      size: this.instanceBufferCapacity,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }
  // Same growth pattern for labelStorageBuffer.
  if (this.glyphInstances.byteLength > 0) {
    this.device.queue.writeBuffer(this.instanceBuffer, 0, this.glyphInstances);
  }
  if (this.labelData.byteLength > 0) {
    this.device.queue.writeBuffer(this.labelStorageBuffer, 0, this.labelData);
  }
  // Bind group depends on the storage buffer; if it grew, recreate.
  this.bindGroup = this.device.createBindGroup({ ... });
}
```

`nextPow2` lives in `src/utils/`; if it doesn't, write a one-liner: `const nextPow2 = (n: number) => 1 << Math.ceil(Math.log2(Math.max(1, n)));`.

- [ ] **Step 4: Implement render()**

```typescript
render(
  pass: GPURenderPassEncoder,
  viewProj: Float32Array | mat4,
  viewportSize: [number, number],
): void {
  if (!this.device || this.totalGlyphs === 0 || !this.bindGroup) return;
  // Update uniforms.
  const u = new Float32Array(24); // 96 bytes
  u.set(viewProj as Float32Array, 0);
  u[16] = viewportSize[0];
  u[17] = viewportSize[1];
  this.device.queue.writeBuffer(this.uniformBuffer, 0, u);

  pass.setPipeline(this.pipeline);
  pass.setBindGroup(0, this.bindGroup);
  pass.setVertexBuffer(0, this.cornerBuffer);
  pass.setVertexBuffer(1, this.instanceBuffer);
  pass.draw(4, this.totalGlyphs, 0, 0); // triangle-strip, 4 verts per quad
}
```

Pipeline primitive must be `{ topology: 'triangle-strip' }` for the 4-vert quad pattern. Make sure the corner buffer order matches: `(0,0), (1,0), (0,1), (1,1)`.

- [ ] **Step 5: Run all tests, verify still green**

```bash
npm test
```

Expected: all existing tests pass (the renderer's pure-state tests still work with `null` device), no new test failures from this task. If anything in the existing 590+ test suite broke, fix before continuing.

- [ ] **Step 6: Run typecheck + build**

```bash
npm run typecheck && npm run build
```

Expected: PASS. If the build fails on WGSL, the shader has a syntax error — fix and re-run.

- [ ] **Step 7: Commit**

```bash
git add src/services/gpu/labelRenderer.ts
git commit -m "feat(labels): LabelRenderer GPU pipeline + render"
```

---

### Task 10: markerLines.wgsl shader

**Files:**
- Create: `src/services/gpu/shaders/markerLines.wgsl`

- [ ] **Step 1: Write the shader**

```wgsl
// markerLines.wgsl — thin world-anchored lines with constant pixel width.
//
// Each line instance has from/to world positions and a desired pixel
// width.  The vertex shader projects both endpoints to clip, computes
// the screen-space perpendicular, and extrudes a 4-vertex quad with
// constant width regardless of camera distance.  This is the standard
// "thick line" trick — gl.LINES has a max width of 1 in core WebGPU.

struct Uniforms {
  viewProj : mat4x4<f32>,
  viewport : vec4<f32>,  // .xy = pixel size; .zw reserved
};

@group(0) @binding(0) var<uniform> u : Uniforms;

struct VsIn {
  @location(0) corner    : vec2<f32>,  // (0,0) (1,0) (0,1) (1,1) — x picks endpoint, y picks side
  @location(1) fromWorld : vec3<f32>,
  @location(2) toWorld   : vec3<f32>,
  @location(3) extras    : vec4<f32>,  // x = pixelWidth, y = fadeAlpha, zw reserved
  @location(4) color     : vec4<f32>,
};

struct VsOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) color     : vec4<f32>,
};

@vertex
fn vs(input : VsIn) -> VsOut {
  let pixelWidth = input.extras.x;
  let fadeAlpha  = input.extras.y;

  let aClip = u.viewProj * vec4<f32>(input.fromWorld, 1.0);
  let bClip = u.viewProj * vec4<f32>(input.toWorld,   1.0);

  // Pick endpoint by corner.x (0 = from, 1 = to).
  let here  = mix(aClip, bClip, input.corner.x);
  let other = mix(bClip, aClip, input.corner.x);

  // Project both endpoints to screen px to compute the perpendicular.
  let halfVp = u.viewport.xy * 0.5;
  let hereScreen  = (here.xy  / here.w)  * halfVp;
  let otherScreen = (other.xy / other.w) * halfVp;
  let dir = normalize(otherScreen - hereScreen);
  let perpScreen = vec2<f32>(-dir.y, dir.x);

  // corner.y = 0 → +perp side; corner.y = 1 → -perp side.
  let side = mix(1.0, -1.0, input.corner.y);
  let offsetScreen = perpScreen * side * (pixelWidth * 0.5);
  // Convert screen-px offset back to clip space.
  let offsetClip = (offsetScreen / halfVp) * here.w;

  let outPos = vec4<f32>(here.x + offsetClip.x, here.y + offsetClip.y, here.z, here.w);
  let outColor = vec4<f32>(input.color.rgb, input.color.a * fadeAlpha);
  return VsOut(outPos, outColor);
}

@fragment
fn fs(input : VsOut) -> @location(0) vec4<f32> {
  // Premultiplied output.
  let a = input.color.a;
  return vec4<f32>(input.color.rgb * a, a);
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/services/gpu/shaders/markerLines.wgsl
git commit -m "feat(labels): add marker-lines WGSL shader"
```

---

### Task 11: markerLineRenderer.ts

**Files:**
- Create: `src/services/gpu/markerLineRenderer.ts`
- Create: `tests/services/gpu/markerLineRenderer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { MarkerLineRenderer } from '../../../src/services/gpu/markerLineRenderer';

describe('MarkerLineRenderer (CPU state)', () => {
  const newR = () => new MarkerLineRenderer(null as unknown as GPUDevice, 'rgba16float');

  it('starts with zero lines', () => {
    expect(newR().lineCount()).toBe(0);
  });

  it('counts lines after setLines', () => {
    const r = newR();
    r.setLines([
      { id: 'a', fromWorld: [0,0,0], toWorld: [0,1,0], pixelWidth: 1.5, color: [1,1,1,1] },
      { id: 'b', fromWorld: [0,0,0], toWorld: [1,0,0], pixelWidth: 2.0, color: [1,0,0,1] },
    ]);
    expect(r.lineCount()).toBe(2);
  });

  it('replaces (not appends) on subsequent setLines', () => {
    const r = newR();
    r.setLines([{ id: 'a', fromWorld: [0,0,0], toWorld: [0,1,0], pixelWidth: 1, color: [1,1,1,1] }]);
    r.setLines([
      { id: 'b', fromWorld: [0,0,0], toWorld: [0,1,0], pixelWidth: 1, color: [1,1,1,1] },
      { id: 'c', fromWorld: [0,0,0], toWorld: [1,0,0], pixelWidth: 1, color: [1,1,1,1] },
    ]);
    expect(r.lineCount()).toBe(2);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npx vitest run tests/services/gpu/markerLineRenderer.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write markerLineRenderer.ts**

Same structural pattern as `LabelRenderer` but simpler (no atlas, no glyph layout). Per-instance attributes:
- `fromWorld` (vec3, with padding to 16B)
- `toWorld` (vec3, with padding)
- `extras` (vec4: pixelWidth, fadeAlpha, _, _)
- `color` (vec4)

Total: 64 bytes per instance (4 × vec4).

```typescript
/**
 * MarkerLineRenderer — thin world-anchored lines with constant pixel
 * width.  Used for the "you are here" marker's vertical leader and any
 * future tagged-line use (filament leaders, scale markers, etc.).
 *
 * Why a separate renderer from LabelRenderer?  Lines and text are
 * conceptually orthogonal.  Keeping them in separate passes makes each
 * one understandable on its own and allows independent toggling.
 */
import type { mat4 } from 'gl-matrix';
import markerLinesWgsl from './shaders/markerLines.wgsl?raw';

export type MarkerLine = {
  id: string;
  fromWorld: [number, number, number];
  toWorld: [number, number, number];
  pixelWidth: number;
  color: [number, number, number, number];
  fadeAlpha?: number;
};

const FLOATS_PER_INSTANCE = 16; // 4 × vec4
const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;

export class MarkerLineRenderer {
  private readonly device: GPUDevice | null;
  private readonly format: GPUTextureFormat;
  private lines: MarkerLine[] = [];
  private instanceData: Float32Array = new Float32Array(0);

  constructor(device: GPUDevice | null, format: GPUTextureFormat) {
    this.device = device;
    this.format = format;
    // GPU resource creation deferred to a follow-up step inside this task.
  }

  setLines(lines: MarkerLine[]): void {
    this.lines = lines;
    this.instanceData = new Float32Array(lines.length * FLOATS_PER_INSTANCE);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const off = i * FLOATS_PER_INSTANCE;
      this.instanceData[off + 0] = l.fromWorld[0];
      this.instanceData[off + 1] = l.fromWorld[1];
      this.instanceData[off + 2] = l.fromWorld[2];
      // off+3 padding
      this.instanceData[off + 4] = l.toWorld[0];
      this.instanceData[off + 5] = l.toWorld[1];
      this.instanceData[off + 6] = l.toWorld[2];
      // off+7 padding
      this.instanceData[off + 8] = l.pixelWidth;
      this.instanceData[off + 9] = l.fadeAlpha ?? 1;
      // off+10..11 reserved
      this.instanceData[off + 12] = l.color[0];
      this.instanceData[off + 13] = l.color[1];
      this.instanceData[off + 14] = l.color[2];
      this.instanceData[off + 15] = l.color[3];
    }
    // GPU upload — guarded.
  }

  lineCount(): number {
    return this.lines.length;
  }

  render(pass: GPURenderPassEncoder, viewProj: Float32Array | mat4, viewportSize: [number, number]): void {
    if (!this.device || this.lines.length === 0) return;
    // Same uniform/draw pattern as LabelRenderer.render — see Task 9 implementation.
  }

  destroy(): void {}
}
```

- [ ] **Step 4: Add the GPU resources + render implementation**

Same shape as Task 9: bind group layout (one uniform, no storage/texture for this renderer), pipeline with the same blend state, two vertex buffers (per-vertex corner + per-instance attribute pack), `pass.draw(4, this.lines.length, 0, 0)`. Reference Task 9's implementation.

- [ ] **Step 5: Run tests + build**

```bash
npm test && npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/markerLineRenderer.ts src/services/gpu/shaders/markerLines.wgsl tests/services/gpu/markerLineRenderer.test.ts
git commit -m "feat(labels): add MarkerLineRenderer for screen-width lines"
```

---

## Phase 4: Engine integration

### Task 12: Wire renderers + you-are-here controller into engine

**Files:**
- Modify: `src/services/engine/engine.ts`

This is engine-specific and depends on the existing structure. The plan assumes the engine has: a `start()` async setup that creates other renderers, a per-frame loop, and a `requestRender()` mechanism (it does — see CLAUDE.md and `renderScheduler.ts`).

- [ ] **Step 1: Add renderer construction in engine setup**

In the engine's async setup function, alongside other renderer creation:

```typescript
import { LabelRenderer, loadFontAtlas, type Label } from '../gpu/labelRenderer';
import { MarkerLineRenderer, type MarkerLine } from '../gpu/markerLineRenderer';
import { youAreHereAlpha } from '../gpu/youAreHereVisibility';

// During async setup, after device is ready:
const { bitmap, metrics } = await loadFontAtlas();
const labelRenderer = new LabelRenderer(device, format, metrics, bitmap);
const markerLineRenderer = new MarkerLineRenderer(device, format);
```

Store both on the engine instance so the per-frame code can call `render()`.

- [ ] **Step 2: Add the you-are-here controller**

In the per-frame logic, before the render passes execute, compute the alpha and update label/line state when it changes:

```typescript
// State held on the engine (not per-frame allocated):
//   private prevYouAreHereAlpha = -1;
//   private youAreHereLineHeight = 0.05; // Mpc

const cameraDist = vec3.length(camera.position); // distance from origin (MW)
const alpha = youAreHereAlpha(cameraDist);
if (alpha !== this.prevYouAreHereAlpha) {
  if (alpha > 0) {
    const labels: Label[] = [{
      id: 'you-are-here',
      worldPos: [0, this.youAreHereLineHeight, 0],
      text: 'YOU ARE HERE',
      pixelSize: 18,
      color: [1, 1, 1, 1],
      fadeAlpha: alpha,
      worldEmMpc: 0.005,
    }];
    const lines: MarkerLine[] = [{
      id: 'you-are-here',
      fromWorld: [0, 0, 0],
      toWorld: [0, this.youAreHereLineHeight, 0],
      pixelWidth: 1.5,
      color: [1, 1, 1, 1],
      fadeAlpha: alpha,
    }];
    this.labelRenderer.setLabels(labels);
    this.markerLineRenderer.setLines(lines);
  } else {
    this.labelRenderer.setLabels([]);
    this.markerLineRenderer.setLines([]);
  }
  this.prevYouAreHereAlpha = alpha;
  // While alpha is mid-transition, keep render-on-demand awake.
  if (alpha > 0 && alpha < 1) this.renderScheduler.requestRender();
}
```

- [ ] **Step 3: Add render passes (after 3D, before tonemap)**

Find where the existing pass order is set up. Slot the label + line passes in between the last 3D pass (filaments) and the tone-mapping pass. Both new passes can write into the same HDR target the existing 3D passes use.

```typescript
// ... existing 3D passes (points, disks, quads, filaments) ...
this.markerLineRenderer.render(pass, viewProj, [width, height]);
this.labelRenderer.render(pass, viewProj, [width, height]);
// ... tone mapping pass ...
```

If the existing passes use a single `GPURenderPassEncoder` for the HDR target, append to it. If each renderer creates its own pass encoder, follow that convention.

- [ ] **Step 4: Run typecheck + build + tests**

```bash
npm run typecheck && npm run build && npm test
```

Expected: all pass. If the engine tests break, the integration didn't preserve existing pass order or state — rework to match the surrounding structure.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/engine.ts
git commit -m "feat(labels): wire LabelRenderer + you-are-here marker into engine"
```

---

### Task 13: Visual verification

**Files:** none (manual verification + tuning)

- [ ] **Step 1: Confirm dev server is running**

```bash
# Don't start a new one — there should already be one.
ps aux | grep -i "vite" | grep -v grep
```

If not running, start it: `npm run dev` (in background per project convention).

- [ ] **Step 2: Open the app, fly toward the Milky Way**

Ask the user to:
1. Open the app in their browser (the dev server URL).
2. Fly toward the origin (Milky Way) until the camera is well within 1 Mpc.
3. Confirm: a thin white vertical line appears extending up from the Milky Way, with "YOU ARE HERE" text near its top.
4. Fly back out past 2 Mpc — the marker should fade out smoothly.
5. Zoom in extreme close — the text should stay sharp (this is the MSDF win; bitmap text would be blurry here).

Per the project's "I can't test the UI myself" rule: report what you implemented and ask the user to verify. Do NOT claim success on the visual until the user confirms.

- [ ] **Step 3: Tune if needed**

If the marker is too tall/short, adjust `youAreHereLineHeight` in `engine.ts`.
If the text is too big/small, adjust `pixelSize` in the Label construction.
If the fade band feels off, tweak `YOU_ARE_HERE_NEAR_MPC` / `YOU_ARE_HERE_FAR_MPC` in `youAreHereVisibility.ts`.

If the text colour bleeds badly into HDR (this is the pre-tonemap risk flagged in the spec), one option is to move the label/line passes to AFTER the tonemap (post-process LDR overlay). Spec section "Pass placement" discusses this — keep the change minimal: just move the two `.render(...)` calls to a different point in the engine's pass chain.

- [ ] **Step 4: Final commit (only if tuning happened)**

```bash
git add -p   # interactive — only stage tuning changes
git commit -m "feat(labels): tune you-are-here visibility band and label size"
```

---

## Self-Review

**Spec coverage:**
- MSDF atlas built at build time → Tasks 1–3 ✓
- Glyph metrics parsed and looked up → Task 4 ✓
- Text → quad layout → Task 5 ✓
- Hybrid clamped sizing in vertex shader → Task 7 (shader) + Task 8 (per-label sizing struct) ✓
- LabelRenderer public API (setLabels, render, destroy) → Tasks 8–9 ✓
- MarkerLineRenderer → Tasks 10–11 ✓
- You-are-here controller (distance gating, line + label, fade) → Tasks 6, 12 ✓
- Pass placement (after 3D, before tonemap) → Task 12 ✓
- requestRender during fade transitions → Task 12 ✓
- Tests on pure logic, smoke tests on renderers → Tasks 4–6 (TDD), 8 + 11 (smoke) ✓
- Visual verification → Task 13 ✓

**Placeholder scan:** Tasks 9 and 11 reference Task 9 implementation patterns by name rather than re-printing them. This is by design — reprinting full pipeline boilerplate (~80 lines) twice would be wasteful and the structural pattern is well-established in `quadRenderer.ts` already. The implementer is told exactly which file to mirror. Acceptable.

**Type consistency:** `Label`, `MarkerLine`, `FontMetrics`, `GlyphMetrics`, `GlyphQuad` are defined once and reused. Method names (`setLabels`, `setLines`, `glyphCount`, `lineCount`, `render`, `destroy`) are consistent across the renderer files.

**Open risk:** Storage buffer support is universal in WebGPU but the binding type `read-only-storage` requires the bind group layout to declare `type: 'read-only-storage'`. If the implementer mistakenly uses `'storage'`, the validation layer will warn but the code may still work — verify in the browser console during Task 13.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-07-msdf-labels.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration, isolates each task's context.

**2. Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints for review.

Which approach?
