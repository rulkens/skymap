/**
 * The glossary (data/glossary.ts) is a list other pages link into by anchor;
 * its page (pages/docs/reference/glossary.astro) is made from it. These hold
 * the list in order and whole. Links to its anchors are the link check's
 * (tools/site/checkSiteLinks.ts).
 */
import { describe, expect, it } from 'vitest';

import { DATA_SOURCES } from '../../../packages/website/src/data/dataSources';
import { fact } from '../../../packages/website/src/data/fact';
import { GLOSSARY } from '../../../packages/website/src/data/glossary';

const ids = GLOSSARY.map((term) => term.id);
const number = (text: string) => Number(text.replace(/,/g, ''));

describe('glossary', () => {
  it('gives every term a definition that ends a sentence, and rows that exist', () => {
    for (const term of GLOSSARY) {
      expect(term.text, term.id).toMatch(/^[A-Z0-9].{30,}\.$/);
      expect(term.facts.length, term.id).toBeGreaterThan(0);
      for (const id of term.facts) expect(() => fact(id), `${term.id}: ${id}`).not.toThrow();
    }
  });

  it('has no id twice, ids that work as anchors, and terms in the order of the alphabet', () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))).toEqual([]);
    // A single letter is the anchor of that letter's heading on the page.
    expect(ids.filter((id) => id.length === 1)).toEqual([]);
    const terms = GLOSSARY.map((term) => term.term);
    expect(terms).toEqual(
      [...terms].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
    );
  });

  it('points only at terms, catalogues and site paths that exist', () => {
    for (const term of GLOSSARY) {
      for (const other of term.see ?? []) expect(ids, `${term.id} see ${other}`).toContain(other);
      expect(term.see ?? [], term.id).not.toContain(term.id);
      if (term.source !== undefined)
        expect(
          DATA_SOURCES.map((row) => row.id),
          term.id,
        ).toContain(term.source);
      if (term.more !== undefined)
        expect(term.more.path, term.id).toMatch(/^\/[a-z/-]*\/(#[a-z-]+)?$/);
    }
  });
});

// The lengths the glossary and its table print are worked out from two exact
// definitions: the speed of light and the astronomical unit.
describe('units of distance', () => {
  const C_KM_S = 299_792.458;
  const AU_KM = 149_597_870.7;
  const LIGHT_YEAR_KM = C_KM_S * 365.25 * 86_400;
  const PARSEC_KM = (648_000 / Math.PI) * AU_KM;
  const text = fact('gloss-light-units').text;
  const stated = (pattern: RegExp) => number(text.match(pattern)![1]!);

  it('states the speed of light and the lengths that follow from it', () => {
    expect(stated(/At ([\d,.]+) kilometres a second/)).toBe(C_KM_S);
    expect(stated(/about (\d+) million kilometres in a minute/)).toBe(
      Math.round((C_KM_S * 60) / 1e6),
    );
    expect(stated(/about ([\d.]+) thousand million in a day/)).toBeCloseTo(
      (C_KM_S * 86_400) / 1e9,
      1,
    );
    expect(stated(/which is (\d+) astronomical units/)).toBe(Math.round((C_KM_S * 86_400) / AU_KM));
    expect(stated(/in (\d+) seconds/)).toBe(Math.round(AU_KM / C_KM_S));
    expect(stated(/or ([\d.]+) minutes/)).toBeCloseTo(AU_KM / C_KM_S / 60, 1);
    expect(stated(/is ([\d,]+) astronomical units, and a parsec/)).toBe(
      Math.round(LIGHT_YEAR_KM / AU_KM),
    );
    expect(stated(/a parsec is ([\d.]+) light-years/)).toBeCloseTo(PARSEC_KM / LIGHT_YEAR_KM, 2);
    expect(stated(/or ([\d,]+) astronomical units, or about/)).toBe(Math.round(PARSEC_KM / AU_KM));
    expect(stated(/or about ([\d.]+) million million kilometres/)).toBeCloseTo(PARSEC_KM / 1e12, 1);
  });

  it('agrees with the light-year row from NASA', () => {
    const nasa = number(fact('gloss-light-year').text.match(/about ([\d.]+) million million/)![1]!);
    expect(nasa).toBeCloseTo(LIGHT_YEAR_KM / 1e12, 2);
  });
});
