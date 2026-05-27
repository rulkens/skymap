import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CF4_TABLE_URL,
  CF4_README_URL,
  resumeOffsetForPath,
  sha256OfFile,
} from '../../tools/fetch/fetchCosmicflows4';

describe('Cosmicflows-4 fetcher URLs', () => {
  it('points at the gzipped CDS Vizier table for J/ApJ/944/94 (CDS serves only .gz)', () => {
    expect(CF4_TABLE_URL).toBe(
      'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/table2.dat.gz',
    );
  });

  it('points at the matching ReadMe so the parser can validate column offsets', () => {
    expect(CF4_README_URL).toBe(
      'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/ReadMe',
    );
  });
});

describe('resumeOffsetForPath', () => {
  it('returns 0 when the file does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cf4-'));
    try {
      expect(resumeOffsetForPath(join(dir, 'missing.dat'))).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns the existing file size when the file exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cf4-'));
    try {
      const path = join(dir, 'partial.dat');
      writeFileSync(path, 'x'.repeat(1024));
      expect(resumeOffsetForPath(path)).toBe(1024);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('sha256OfFile', () => {
  it('returns the hex digest of the file contents', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cf4-'));
    try {
      const path = join(dir, 'sample.txt');
      writeFileSync(path, 'hello, world');
      // Pre-computed: sha256("hello, world") =
      // 09ca7e4eaa6e8ae9c7d261167129184883644d07dfba7cbfbc4c8a2e08360d5b
      expect(await sha256OfFile(path)).toBe(
        '09ca7e4eaa6e8ae9c7d261167129184883644d07dfba7cbfbc4c8a2e08360d5b',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
