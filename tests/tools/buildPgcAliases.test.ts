import { describe, it, expect } from 'vitest';
import {
  normalizeDesignation,
  sortAliasNames,
  parseDesignationsCsv,
  groupByPgc,
} from '../../tools/fetch/buildPgcAliases';

describe('normalizeDesignation', () => {
  it('NGC0253 → "NGC 253" (strips leading zeros, inserts space)', () => {
    expect(normalizeDesignation('NGC0253')).toBe('NGC 253');
  });

  it('UGCA013 → "UGCA 13" (UGCA wins over UGC even with the longer prefix)', () => {
    expect(normalizeDesignation('UGCA013')).toBe('UGCA 13');
  });

  it('MESSIER031 → "M 31" (special-case prefix swap)', () => {
    expect(normalizeDesignation('MESSIER031')).toBe('M 31');
  });

  it('PGC123 → null (self-row is filtered out of alias list)', () => {
    expect(normalizeDesignation('PGC123')).toBeNull();
  });

  it('2MASXJ12362058+2559155 → null (skipped catalog ID)', () => {
    expect(normalizeDesignation('2MASXJ12362058+2559155')).toBeNull();
  });

  it('MCG-04-03-009 → "MCG -04-03-009" (preserves sub-fields)', () => {
    expect(normalizeDesignation('MCG-04-03-009')).toBe('MCG -04-03-009');
  });

  it('empty → null', () => {
    expect(normalizeDesignation('')).toBeNull();
    expect(normalizeDesignation('   ')).toBeNull();
  });
});

describe('sortAliasNames', () => {
  it('orders NGC before IC before M before UGC', () => {
    const out = sortAliasNames(['UGC 100', 'M 31', 'IC 100', 'NGC 224']);
    expect(out).toEqual(['NGC 224', 'IC 100', 'M 31', 'UGC 100']);
  });

  it('orders within prefix by trailing number, not lexicographically', () => {
    const out = sortAliasNames(['NGC 100', 'NGC 9', 'NGC 1000', 'NGC 50']);
    expect(out).toEqual(['NGC 9', 'NGC 50', 'NGC 100', 'NGC 1000']);
  });

  it('unknown prefixes go to the end alphabetically', () => {
    const out = sortAliasNames(['NGC 5', 'XYZ 1', 'IC 7']);
    expect(out[out.length - 1]).toBe('XYZ 1');
  });
});

describe('parseDesignationsCsv', () => {
  it('skips comment lines and parses tab-separated rows', () => {
    const csv = [
      '# comment line',
      '# another comment',
      '$objname\t$b1950\tdesign\tflag\t$link[dataset]',
      'NGC0253\tB004505.7-253340\tNGC0253\t0\t1',
      'NGC0253\tB004505.7-253340\tPGC002789\t0\t88',
      'NGC0253\tB004505.7-253340\tUGCA013\t0\t4',
      '',
    ].join('\n');
    const rows = parseDesignationsCsv(csv);
    expect(rows).toEqual([
      { objname: 'NGC0253', design: 'NGC0253' },
      { objname: 'NGC0253', design: 'PGC002789' },
      { objname: 'NGC0253', design: 'UGCA013' },
    ]);
  });
});

describe('groupByPgc', () => {
  it('recovers numeric PGC from self-row and emits normalized aliases', () => {
    const rows = [
      { objname: 'NGC0253', design: 'NGC0253' },
      { objname: 'NGC0253', design: 'PGC002789' },
      { objname: 'NGC0253', design: 'UGCA013' },
    ];
    const { byPgc, droppedGroups } = groupByPgc(rows);
    expect(droppedGroups).toBe(0);
    expect(byPgc.get(2789)).toBeDefined();
    const names = byPgc.get(2789)!;
    expect(names).toContain('NGC 253');
    expect(names).toContain('UGCA 13');
    // PGC self-row is filtered out of the alias list
    expect(names.find((n) => n.startsWith('PGC '))).toBeUndefined();
  });

  it('drops groups without a PGC self-row', () => {
    const rows = [{ objname: 'NGC1234', design: 'NGC1234' }];
    const { byPgc, droppedGroups } = groupByPgc(rows);
    expect(byPgc.size).toBe(0);
    expect(droppedGroups).toBe(1);
  });

  it('uses the lowest PGC when multiple self-rows exist', () => {
    const rows = [
      { objname: 'X', design: 'PGC005' },
      { objname: 'X', design: 'PGC003' },
      { objname: 'X', design: 'NGC9' },
    ];
    const { byPgc } = groupByPgc(rows);
    expect(byPgc.get(3)).toBeDefined();
    expect(byPgc.get(5)).toBeUndefined();
  });
});
