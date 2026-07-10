/**
 * tmpSession — per-fetch tmpdir allocator.
 *
 * Each /api/fetch call gets a fresh tmpId + an empty directory.
 * Subsequent /api/process / /api/process/alpha-only calls reuse the
 * tmpId to find their cached starless intermediate.  /api/export reads
 * the tmpdir, writes the final trio, and (optionally) cleans up.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  createSession,
  sessionPath,
} from '../../../tools/famous-curator/plugin/tmpSession';

describe('tmpSession', () => {
  it('createSession returns a unique tmpId per call and creates the dir', () => {
    const a = createSession();
    const b = createSession();
    expect(a.tmpId).not.toBe(b.tmpId);
    expect(existsSync(a.dir)).toBe(true);
    expect(existsSync(b.dir)).toBe(true);
    expect(statSync(a.dir).isDirectory()).toBe(true);
  });

  it('sessionPath resolves under the OS tmpdir + famous-curator/', () => {
    const p = sessionPath('abc123');
    expect(p.startsWith(tmpdir())).toBe(true);
    expect(p.endsWith('/famous-curator/abc123') || p.endsWith('\\famous-curator\\abc123')).toBe(true);
  });
});
