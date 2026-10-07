import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FACTS } from '../../../packages/website/src/data/facts';
import { fact } from '../../../packages/website/src/data/fact';
import { C_KM_S, PC_TO_LY } from '../../../src/utils/math/constants';
import { statedFigures } from './statedFigures';

const ROOT = resolve(import.meta.dirname, '../../..');
const SITE = join(ROOT, 'packages/website/src');

describe('website facts', () => {
  it('every row has a unique id, text, an https source with a label and an ISO check date', () => {
    const ids = new Set<string>();
    for (const row of FACTS) {
      expect(ids.has(row.id), `duplicate id ${row.id}`).toBe(false);
      ids.add(row.id);
      expect(row.text.trim(), row.id).not.toBe('');
      expect(row.sourceLabel.trim(), `${row.id} sourceLabel`).not.toBe('');
      expect(new URL(row.source).protocol, `${row.id} source`).toBe('https:');
      expect(row.checked, `${row.id} checked`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(row.checked)), `${row.id} checked is a real date`).toBe(false);
    }
  });

  it('an unknown id throws, so a page citing a missing row fails the build', () => {
    expect(() => fact('no-such-fact')).toThrow(/no-such-fact/);
  });

  // Every page and most site tests load the fact tables: an app module behind them would let an app change break the website's build.
  it('only the object catalogue page loads the app, and no fact table does', () => {
    const importers = (pattern: RegExp) =>
      readdirSync(SITE, { recursive: true, encoding: 'utf8' })
        .filter((name) => /\.(ts|astro|mdx)$/.test(name) && !name.startsWith('dev/'))
        .filter((name) => pattern.test(readFileSync(join(SITE, name), 'utf8')))
        .sort();
    // heroVideoUrl takes one function with no imports of its own: the address of the data host.
    expect(importers(/from '(\.\.\/)+src\//)).toEqual([
      // Two tables of ids, for the lists of body and site names.
      'content/docs/reference/url-parameters.mdx',
      'data/objectCatalogue.ts',
      'utils/heroVideoUrl.ts',
    ]);
    expect(importers(/from '[./]+\/(data\/objectCatalogue|utils\/objectCount)'/)).toEqual([
      'components/ObjectFinder.astro',
      'components/ObjectList.astro',
      'content/docs/reference/objects.mdx',
      'utils/objectCount.ts',
    ]);
  });

  // `npm run move-files` does not rewrite a path inside a string, so a moved file would leave a published dead link.
  it('every repository path cited as a source exists', () => {
    const cited = readdirSync(SITE, { recursive: true, encoding: 'utf8' })
      .filter((name) => /\.(ts|astro)$/.test(name))
      .flatMap((name) => [
        ...readFileSync(join(SITE, name), 'utf8').matchAll(/\$\{REPO_BLOB\}\/([^`'"#?\s]+)/g),
      ])
      .map((match) => match[1]!);
    expect(cited.length).toBeGreaterThan(50);
    expect(cited.filter((path) => !existsSync(join(ROOT, path)))).toEqual([]);
  });

  it('light-travel times follow from the distances', () => {
    const [moonKm, moonSeconds] = statedFigures(
      'moon-orbit-light',
      /([\d,]+) km, which light covers in about (\d+(?:\.\d+)?) seconds/,
    );
    expect(moonKm! / C_KM_S).toBeCloseTo(moonSeconds!, 1);
    // Nearest and farthest in km, NASA Saturn fact sheet.
    const [near, far] = statedFigures('saturn-distance', /between (\d+) and (\d+) light-minutes/);
    expect(Math.round(1_205.5e6 / C_KM_S / 60)).toBe(near);
    expect(Math.round(1_658.6e6 / C_KM_S / 60)).toBe(far);
    const [kmS, years, ly] = statedFigures(
      'voyager1-to-proxima',
      /speed of (\d+(?:\.\d+)?) km\/s .* about ([\d,]+) years to travel the (\d+(?:\.\d+)?) light-years/,
    );
    expect(Math.abs((ly! * C_KM_S) / kmS! - years!)).toBeLessThan(1000);
  });

  it('light-years follow from the parsecs or the parallax beside them', () => {
    const [sgrLy, sgrPc] = statedFigures(
      'sgr-a-distance',
      /about ([\d,]+) light-years away \(([\d,]+) parsecs\)/,
    );
    expect(Math.round((sgrPc! * PC_TO_LY) / 100) * 100).toBe(sgrLy);
    const [m31Mly, m31Kpc] = statedFigures(
      'andromeda-distance',
      /about (\d+(?:\.\d+)?) million light-years away \((\d+) kiloparsecs/,
    );
    expect(Math.round((m31Kpc! * PC_TO_LY) / 100) / 10).toBe(m31Mly);
    const [virgoMly, virgoMpc] = statedFigures(
      'virgo-distance',
      /about (\d+) million light-years away \((\d+(?:\.\d+)?) megaparsecs/,
    );
    expect(Math.round(virgoMpc! * PC_TO_LY)).toBe(virgoMly);
    const [proximaLy, mas] = statedFigures(
      'proxima-distance',
      /is (\d+(?:\.\d+)?) light-years away \(Gaia parallax (\d+(?:\.\d+)?) milliarcseconds/,
    );
    expect((1000 / mas!) * PC_TO_LY).toBeCloseTo(proximaLy!, 2);
    const [across] = statedFigures('bootes-void', /about (\d+) million light-years across/);
    const millionCubicMpcBall = 2 * Math.cbrt((3 * 1e6) / (4 * Math.PI));
    expect(Math.round((millionCubicMpcBall * PC_TO_LY) / 100) * 100).toBe(across);
  });

  it('Earth’s turn, its travel along its orbit and Io’s lap follow from the periods and speed', () => {
    const [hours, degrees] = statedFigures(
      'earth-rotation',
      /in (\d+(?:\.\d+)?) hours, which is (\d+) degrees an hour/,
    );
    expect(Math.round(360 / hours!)).toBe(degrees);
    const [kmS, km, minutes] = statedFigures(
      'earth-orbit-speed',
      /mean (\d+(?:\.\d+)?) kilometres a second, which is about ([\d,]+) km in (\d+) minutes/,
    );
    expect(Number((kmS! * minutes! * 60).toPrecision(2))).toBe(km);
    const [ioDays, hoursPerSecond, seconds] = statedFigures(
      'io-lap',
      /Jupiter in (\d+(?:\.\d+)?) days .* clock at (\d+) hours per second, one lap of Io takes about (\d+) seconds/,
    );
    expect(Math.round((ioDays! * 24) / hoursPerSecond!)).toBe(seconds);
  });
});
