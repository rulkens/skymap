import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { readSnapshot } from '../src/readSnapshot';
import { makeRepo } from './helpers/makeRepo';

describe('readSnapshot', () => {
  it('skips a tracked file missing from disk', () => {
    const root = makeRepo({ 'a.ts': 'x', 'logo.png': 'bin' });
    const listed = [`${root}/a.ts`, `${root}/gone.ts`, `${root}/logo.png`];
    const snapshot = readSnapshot(listed);
    expect([...snapshot.texts.keys()]).toEqual([`${root}/a.ts`]);
    expect(snapshot.texts.get(`${root}/a.ts`)).toBe('x');
    expect(snapshot.fileExists(`${root}/logo.png`)).toBe(true);
    expect(snapshot.fileExists(`${root}/gone.ts`)).toBe(false);
    expect([...snapshot.listed]).toEqual(listed);
  });

  it('does not treat a directory as a file, and knows it is one', () => {
    const root = makeRepo({ 'd/a.ts': '' });
    const snapshot = readSnapshot([]);
    expect(snapshot.fileExists(`${root}/d`)).toBe(false);
    expect(snapshot.directoryExists(`${root}/d`)).toBe(true);
    expect(snapshot.directoryExists(`${root}/d/a.ts`)).toBe(false);
    expect(snapshot.directoryExists(`${root}/none`)).toBe(false);
  });

  it('keeps a file that is not UTF-8 out of the texts, so it is never rewritten', () => {
    const root = makeRepo({});
    const path = `${root}/s.css`;
    writeFileSync(path, Buffer.from([0x61, 0xe9, 0x62]));
    const snapshot = readSnapshot([path]);
    expect(snapshot.texts.has(path)).toBe(false);
    expect(snapshot.fileExists(path)).toBe(true);
  });

  it('keeps a BOM and a real replacement character', () => {
    const root = makeRepo({ 'a.ts': '﻿// �' });
    expect(readSnapshot([`${root}/a.ts`]).texts.get(`${root}/a.ts`)).toBe('﻿// �');
  });
});
