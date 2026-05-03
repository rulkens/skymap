import { describe, it, expect } from 'vitest';
import { parseFamousSeed, validateFamousEntry } from '../../tools/parsers/famousSeed';

describe('parseFamousSeed', () => {
  it('parses a minimal one-entry seed', () => {
    const json = JSON.stringify([
      {
        id: 'm31',
        names: ['M31', 'Andromeda Galaxy'],
        ra: 10.68,
        dec: 41.27,
        distanceMpc: 0.778,
        diameterKpc: 67.5,
        type: 'SA(s)b',
        description: 'Andromeda.',
      },
    ]);
    const entries = parseFamousSeed(json);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe('m31');
    expect(entries[0]!.names).toContain('Andromeda Galaxy');
  });

  it('rejects entries with duplicate ids', () => {
    const dup = [
      {
        id: 'm31',
        names: ['M31'],
        ra: 10,
        dec: 41,
        distanceMpc: 0.778,
        diameterKpc: 67,
        type: 'Sb',
        description: 'a',
      },
      {
        id: 'm31',
        names: ['M31 alt'],
        ra: 11,
        dec: 42,
        distanceMpc: 0.8,
        diameterKpc: 68,
        type: 'Sb',
        description: 'b',
      },
    ];
    expect(() => parseFamousSeed(JSON.stringify(dup))).toThrow(/duplicate id/i);
  });

  it('rejects ra outside [0, 360)', () => {
    expect(() =>
      validateFamousEntry({
        id: 'x',
        names: ['x'],
        ra: 360.1,
        dec: 0,
        distanceMpc: 1,
        diameterKpc: 10,
        type: 'E',
        description: 'x',
      } as never),
    ).toThrow(/ra/);
  });

  it('rejects dec outside [-90, 90]', () => {
    expect(() =>
      validateFamousEntry({
        id: 'x',
        names: ['x'],
        ra: 0,
        dec: 90.1,
        distanceMpc: 1,
        diameterKpc: 10,
        type: 'E',
        description: 'x',
      } as never),
    ).toThrow(/dec/);
  });

  it('rejects non-positive distance or diameter', () => {
    expect(() =>
      validateFamousEntry({
        id: 'x',
        names: ['x'],
        ra: 0,
        dec: 0,
        distanceMpc: 0,
        diameterKpc: 10,
        type: 'E',
        description: 'x',
      } as never),
    ).toThrow(/distance/);
    expect(() =>
      validateFamousEntry({
        id: 'x',
        names: ['x'],
        ra: 0,
        dec: 0,
        distanceMpc: 1,
        diameterKpc: 0,
        type: 'E',
        description: 'x',
      } as never),
    ).toThrow(/diameter/);
  });

  it('rejects empty names array (a galaxy without names is unaddressable)', () => {
    expect(() =>
      validateFamousEntry({
        id: 'x',
        names: [],
        ra: 0,
        dec: 0,
        distanceMpc: 1,
        diameterKpc: 10,
        type: 'E',
        description: 'x',
      } as never),
    ).toThrow(/names/);
  });

  it('accepts entries with valid optional enrichment fields', () => {
    const entries = parseFamousSeed(
      JSON.stringify([
        {
          id: 'm31',
          names: ['M31'],
          ra: 10.68,
          dec: 41.27,
          distanceMpc: 0.778,
          diameterKpc: 67.5,
          type: 'Sb',
          description: 'A galaxy.',
          axisRatio: 0.39,
          positionAngleDeg: 35,
          magB: 4.3,
          magV: 3.4,
          magK: 0.99,
        },
      ]),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.axisRatio).toBeCloseTo(0.39);
    expect(entries[0]!.positionAngleDeg).toBe(35);
    expect(entries[0]!.magB).toBeCloseTo(4.3);
  });

  it('rejects out-of-range axisRatio', () => {
    expect(() =>
      validateFamousEntry({
        id: 'x',
        names: ['x'],
        ra: 0,
        dec: 0,
        distanceMpc: 1,
        diameterKpc: 10,
        type: 'E',
        description: 'x',
        axisRatio: 0.0,
      } as never),
    ).toThrow(/axisRatio/);
    expect(() =>
      validateFamousEntry({
        id: 'x',
        names: ['x'],
        ra: 0,
        dec: 0,
        distanceMpc: 1,
        diameterKpc: 10,
        type: 'E',
        description: 'x',
        axisRatio: 1.5,
      } as never),
    ).toThrow(/axisRatio/);
  });

  it('rejects out-of-range positionAngleDeg', () => {
    expect(() =>
      validateFamousEntry({
        id: 'x',
        names: ['x'],
        ra: 0,
        dec: 0,
        distanceMpc: 1,
        diameterKpc: 10,
        type: 'E',
        description: 'x',
        positionAngleDeg: 180,
      } as never),
    ).toThrow(/positionAngleDeg/);
  });

  it('rejects out-of-range magnitudes', () => {
    expect(() =>
      validateFamousEntry({
        id: 'x',
        names: ['x'],
        ra: 0,
        dec: 0,
        distanceMpc: 1,
        diameterKpc: 10,
        type: 'E',
        description: 'x',
        magB: 100,
      } as never),
    ).toThrow(/magB/);
  });

  it('parses the real seed file we ship', async () => {
    const fs = await import('node:fs');
    const path = '/Users/rulkens/Development/js/skymap/data/famous_galaxies.seed.json';
    const raw = fs.readFileSync(path, 'utf8');
    const entries = parseFamousSeed(raw);
    // Sanity: at least 20 Messier seeds; every entry has a name and an RA.
    expect(entries.length).toBeGreaterThanOrEqual(20);
    for (const e of entries) {
      expect(e.names.length).toBeGreaterThan(0);
      expect(Number.isFinite(e.ra)).toBe(true);
    }
  });
});
