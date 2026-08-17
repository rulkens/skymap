/**
 * Cross-language parity guard for the four tables the GPU generation shaders
 * hand-mirror from CPU-side TypeScript — two owned by `shared/`, two by `v1/`;
 * it is one seam, so it stays one file. `?static` WESL linking does pure
 * build-time linking with NO value injection, so a shader can't import a TS
 * constant — the mirror is hand-written and a test, not the compiler, is what
 * keeps the two sides from drifting. This file IS that seam: it reads the
 * `.wesl` sources as raw text (`readFileSync`) and asserts each mirror against
 * its authoritative TS export.
 *
 * Four mirrors are covered:
 *   a) the `GenUniforms` struct ↔ `GENERATION_UBO` (field order + byte total);
 *   b) the population-id `case NNu:` switch labels ↔ `POPULATION_IDS`;
 *   c) the `gen.category == Nu` literals ↔ `CATEGORY_CODE`;
 *   d) each builder's `randomLuminosity(...) * K` ↔ `SPRITE_POPULATION_BRIGHTNESS`.
 *
 * Follows the runtime's `tests/services/gpu/shaders/constants.parity.test.ts`
 * pattern (read the `.wesl` as text, regex-extract structure, assert equality)
 * and resolves paths from `process.cwd()` (the repo root under Vitest) —
 * `__dirname` would not work under the Vite/Vitest ESM runner. Every scraper
 * fails loudly if its anchor block is missing, so a refactor that moves the
 * struct/switch makes the test fail visibly rather than pass vacuously.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GENERATION_UBO } from '../../../../../src/services/engine/galaxyGenerator/shared/generationUboLayout';
import { CATEGORY_CODE } from '../../../../../src/services/engine/galaxyGenerator/v1/packGenerationUniforms';
import { POPULATION_IDS } from '../../../../../src/services/engine/galaxyGenerator/shared/populationIds';
import { SPRITE_POPULATION_BRIGHTNESS } from '../../../../../src/services/engine/galaxyGenerator/v1/spritePopulationBrightness';

const SHADERS = 'src/services/gpu/shaders/milkyWay/sprites';

function readShader(rel: string): string {
  return readFileSync(join(process.cwd(), SHADERS, rel), 'utf-8');
}

// --- (a) GenUniforms struct ↔ GENERATION_UBO --------------------------------

type WeslField = { readonly name: string; readonly bytes: number };

/**
 * Extract the `struct GenUniforms { ... }` body from generate.wesl and
 * parse each field's name + byte size, in declaration order. Field types are
 * f32/u32 (4 bytes), vec4<..> (16), or array<vec4<..>, N> (N*16). The type
 * regex tolerates the comma inside `array<vec4<f32>, 32>` that a naive
 * `[^,]+` split would choke on.
 */
function parseGenUniformsStruct(): WeslField[] {
  const text = readShader('generate.wesl');
  const block = /struct\s+GenUniforms\s*\{([\s\S]*?)\n\}/.exec(text);
  if (!block) {
    throw new Error(
      'parity: could not find the `struct GenUniforms { ... }` block in generate.wesl',
    );
  }
  const fieldRe = /(\w+)\s*:\s*(array<vec4<[uf]32>,\s*(\d+)>|vec4<[uf]32>|f32|u32)\s*,/g;
  const fields: WeslField[] = [];
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(block[1]!)) !== null) {
    const name = m[1]!;
    const type = m[2]!;
    let bytes: number;
    if (type.startsWith('array')) bytes = parseInt(m[3]!, 10) * 16;
    else if (type.startsWith('vec4')) bytes = 16;
    else bytes = 4;
    fields.push({ name, bytes });
  }
  if (fields.length === 0) {
    throw new Error('parity: `struct GenUniforms` block parsed to zero fields — regex drifted');
  }
  return fields;
}

/** The TS field inventory, ordered by word offset — the canonical declaration order. */
function tsFieldOrder(): string[] {
  const entries: Array<{ name: string; word: number }> = [];
  for (const [name, idx] of Object.entries(GENERATION_UBO.f32)) entries.push({ name, word: idx });
  for (const [name, idx] of Object.entries(GENERATION_UBO.u32)) entries.push({ name, word: idx });
  for (const [name, region] of Object.entries(GENERATION_UBO.arrays)) {
    entries.push({ name, word: region.offsetVec4 * 4 });
  }
  entries.sort((a, b) => a.word - b.word);
  return entries.map((e) => e.name);
}

describe('GenUniforms ↔ GENERATION_UBO parity', () => {
  it('field names, in declaration order (padding excluded), match the TS layout', () => {
    const weslNames = parseGenUniformsStruct()
      .map((f) => f.name)
      .filter((n) => !n.startsWith('_pad'));
    expect(weslNames).toEqual(tsFieldOrder());
  });

  it('the struct byte total equals GENERATION_UBO.byteLength', () => {
    const structBytes = parseGenUniformsStruct().reduce((sum, f) => sum + f.bytes, 0);
    expect(structBytes).toBe(GENERATION_UBO.byteLength);
  });

  it('the struct-total comment in generate.wesl agrees with the TS byteLength', () => {
    const text = readShader('generate.wesl');
    const claim = /total\s+(\d+)\s+bytes/.exec(text);
    expect(claim, 'parity: no `total N bytes` comment found in generate.wesl').not.toBeNull();
    expect(parseInt(claim![1]!, 10)).toBe(GENERATION_UBO.byteLength);
  });
});

// --- (b) case NNu: switch labels ↔ POPULATION_IDS ---------------------------

/** Every `case NNu:` label in a shader (the `default:` arm has no number). */
function scrapeCaseIds(rel: string): Set<number> {
  const text = readShader(rel);
  const re = /case\s+(\d+)u\s*:/g;
  const ids = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) ids.add(parseInt(m[1]!, 10));
  if (ids.size === 0) throw new Error(`parity: no \`case Nu:\` labels found in ${rel}`);
  return ids;
}

/** Star slot-owning populations. globularCluster (6) owns no slots — see populationIds.ts. */
const STAR_POP_IDS = new Set([
  POPULATION_IDS.bulge,
  POPULATION_IDS.bar,
  POPULATION_IDS.disk,
  POPULATION_IDS.spiralArms,
  POPULATION_IDS.irregularClumps,
  POPULATION_IDS.halo,
  POPULATION_IDS.globularStar,
]);

const DUST_POP_IDS = new Set([
  POPULATION_IDS.armDust,
  POPULATION_IDS.barDust,
  POPULATION_IDS.lenticularNucDust,
  POPULATION_IDS.lenticularRingDust,
  POPULATION_IDS.irregularDust,
]);

describe('population-id switch ↔ POPULATION_IDS parity', () => {
  it('generateStars.wesl cases are exactly the star slot-owning population ids', () => {
    expect(scrapeCaseIds('generateStars.wesl')).toEqual(STAR_POP_IDS);
  });

  it('generateDust.wesl cases are exactly the dust population ids', () => {
    expect(scrapeCaseIds('generateDust.wesl')).toEqual(DUST_POP_IDS);
  });
});

// --- (c) gen.category == Nu literals ↔ CATEGORY_CODE ------------------------

describe('gen.category literals ↔ CATEGORY_CODE parity', () => {
  const text = readShader('generate.wesl');
  const re = /gen\.category\s*==\s*(\d+)u/g;
  const literals: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) literals.push(parseInt(m[1]!, 10));

  it('finds the category comparison sites', () => {
    expect(literals.length).toBeGreaterThan(0);
  });

  it('every `gen.category ==` literal is a valid CATEGORY_CODE value', () => {
    const valid = new Set(Object.values(CATEGORY_CODE));
    for (const lit of literals) {
      expect(valid.has(lit), `category literal ${lit}u has no CATEGORY_CODE entry`).toBe(true);
    }
  });

  it('the semantic sites use the right category code', () => {
    // buildBulge branches on the elliptical bulge profile (`== 0u`); buildDisk
    // gates the barred centre-fade (`== 3u`). Assert those semantics, not just
    // membership, so a code swap (elliptical↔barred) is caught.
    expect(CATEGORY_CODE.elliptical).toBe(0);
    expect(CATEGORY_CODE.barred).toBe(3);
    expect(literals).toContain(CATEGORY_CODE.elliptical);
    expect(literals).toContain(CATEGORY_CODE.barred);
  });
});

// --- (d) randomLuminosity multipliers ↔ SPRITE_POPULATION_BRIGHTNESS --------

/** The builder that draws each population's stars, by the population it feeds. */
const POPULATION_BY_BUILDER: Readonly<Record<string, string>> = {
  buildBulge: 'bulge',
  buildBar: 'bar',
  buildDisk: 'disk',
  buildArmSlot: 'arm',
  buildIrregularSlot: 'irregularClump',
  buildHalo: 'halo',
};

/**
 * Every `fn build*` that draws a luminosity, keyed by the population it feeds
 * and valued at its `* K` multiplier (1 where the call carries none). A
 * builder outside `POPULATION_BY_BUILDER` keys on its own name, so a NEW
 * luminous builder fails the comparison below rather than passing unnoticed.
 */
function scrapeLuminosityMultipliers(): Record<string, number> {
  const text = readShader('generate.wesl');
  const chunks = text.split(/\nfn\s+/).slice(1);
  const out: Record<string, number> = {};
  for (const chunk of chunks) {
    const name = /^(\w+)/.exec(chunk)![1]!;
    if (!name.startsWith('build')) continue;
    const draw = /randomLuminosity\([^)]*\)(?:\s*\*\s*(\d+(?:\.\d+)?))?/.exec(chunk);
    if (!draw) continue;
    out[POPULATION_BY_BUILDER[name] ?? name] = draw[1] === undefined ? 1 : parseFloat(draw[1]);
  }
  return out;
}

describe('randomLuminosity multipliers ↔ SPRITE_POPULATION_BRIGHTNESS parity', () => {
  // The only guard on this pair: nothing links a retuned WESL constant to the
  // TS table `galaxyPopulationCountShares` divides light by, so drift here is
  // silent — the sprite bag simply stops adding up to the light split it was
  // sized from.
  it('every builder that draws a luminosity matches its TS brightness entry', () => {
    expect(scrapeLuminosityMultipliers()).toEqual({ ...SPRITE_POPULATION_BRIGHTNESS });
  });
});
