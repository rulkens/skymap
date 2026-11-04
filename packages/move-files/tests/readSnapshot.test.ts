import { describe, it, expect } from 'vitest';
import { readSnapshot } from '../src/readSnapshot';
import { makeRepo } from './helpers/makeRepo';

describe('readSnapshot', () => {
  it('skips a tracked file missing from disk', () => {
    const root = makeRepo({ 'a.ts': 'x', 'logo.png': 'bin' });
    const snapshot = readSnapshot([`${root}/a.ts`, `${root}/gone.ts`, `${root}/logo.png`]);
    expect([...snapshot.texts.keys()]).toEqual([`${root}/a.ts`]);
    expect(snapshot.texts.get(`${root}/a.ts`)).toBe('x');
    expect(snapshot.fileExists(`${root}/logo.png`)).toBe(true);
    expect(snapshot.fileExists(`${root}/gone.ts`)).toBe(false);
  });

  it('does not treat a directory as a file', () => {
    const root = makeRepo({ 'd/a.ts': '' });
    expect(readSnapshot([]).fileExists(`${root}/d`)).toBe(false);
  });
});
