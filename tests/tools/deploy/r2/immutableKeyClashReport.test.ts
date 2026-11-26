/**
 * The preflight's verdict: a key new to R2 is a normal upload, a key on R2 with
 * other bytes must stop the sync before anything moves, and so must a key R2
 * holds without an MD5 (a silent pass there leaves it to the mid-run backstop).
 */
import { describe, expect, it } from 'vitest';
import type { R2SyncGroup } from '../../../../tools/deploy/@types/R2SyncGroup';
import { immutableKeyClashReport } from '../../../../tools/deploy/r2/immutableKeyClashReport';

const group = (label: string, keys: string[], refuseOverwrite = true): R2SyncGroup => ({
  label,
  files: keys.map((r2Key) => ({ localPath: `public/${r2Key}`, r2Key })),
  transport: { kind: 'bulk', localRoot: 'public/data', keyRoot: 'data', refuseOverwrite },
  cacheControl: 'public, max-age=31536000, immutable',
  purge: false,
  gzipOnWire: false,
  offline: true,
});

const MARS = 'data/images/mars-tiles/v2';

describe('immutableKeyClashReport', () => {
  it('proceeds when every key is either new to R2 or byte-identical there', () => {
    const same = `${MARS}/horizon/z3.p0.pack`;
    const report = immutableKeyClashReport(
      [group('Surface tiles (mars)', [`${MARS}/horizon/z3.idx`, same])],
      new Map([[same, 'aa']]),
      new Map([[same, 'aa']]),
    );
    expect(report).toEqual([]);
  });

  it('names every changed key under its prefix, across groups, with the fix', () => {
    const changed = [
      `${MARS}/horizon/z4.idx`,
      `${MARS}/horizon/z3.p0.pack`,
      `${MARS}/albedo/z1.idx`,
    ];
    const same = 'data/images/earth-tiles/v11/height/z2.idx';
    const chunk = 'data/star-catalog/v2/stars/0-0.ab.bin';
    const local = new Map([...changed, same, chunk].map((k) => [k, 'new']));
    const remote = new Map([
      ...changed.map((k) => [k, 'old'] as const),
      [same, 'new'],
      [chunk, 'old'],
    ]);
    const report = immutableKeyClashReport(
      [
        group('Surface tiles (earth)', [same]),
        group('Surface tiles (mars)', [...changed, `${MARS}/height/z1.idx`]),
        group('Octree chunks', [chunk], false),
      ],
      local,
      remote,
    ).join('\n');
    expect(report).toContain(
      `  ${MARS}/albedo/\n    z1.idx\n  ${MARS}/horizon/\n    z3.p0.pack\n    z4.idx\n`,
    );
    expect(report).not.toContain('earth-tiles');
    expect(report).not.toContain('height');
    expect(report).not.toContain('star-catalog');
    expect(report).toContain('bump the prefix');
  });

  it('refuses when R2 holds a key it cannot give an MD5 for', () => {
    const key = 'data/images/earth-tiles/v11/night/z5.p0.pack';
    const report = immutableKeyClashReport(
      [group('Surface tiles (earth)', [key])],
      new Map([[key, 'aa']]),
      new Map([[key, null]]),
    ).join('\n');
    expect(report).toContain('Surface tiles (earth): 1 key(s) on R2 with no MD5');
    expect(report).not.toContain('bump the prefix');
  });
});
