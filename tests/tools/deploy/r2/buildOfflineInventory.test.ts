import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { R2SyncGroup } from '../../../../tools/deploy/@types/R2SyncGroup';
import { buildOfflineInventory } from '../../../../tools/deploy/r2/buildOfflineInventory';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'offline-inventory-test-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function file(name: string, bytes: Uint8Array | string) {
  const localPath = join(dir, name);
  writeFileSync(localPath, bytes);
  return { localPath, r2Key: `data/${name}` };
}

function group(
  label: string,
  files: ReturnType<typeof file>[],
  offline: boolean,
  gzipOnWire = false,
): R2SyncGroup {
  return {
    label,
    files,
    transport: { kind: 'wrangler' },
    cacheControl: '',
    purge: false,
    gzipOnWire,
    offline,
  };
}

describe('buildOfflineInventory', () => {
  it('keeps only offline groups, in table order', () => {
    const inv = buildOfflineInventory([
      group('b', [file('b.json', '{}')], true),
      group('skip', [file('s.json', '{}')], false),
      group('a', [file('a.json', '{}')], true),
    ]);
    expect(inv.groups.map((g) => g.label)).toEqual(['b', 'a']);
    expect(inv.groups[0]?.files[0]?.key).toBe('data/b.json');
  });

  it('hashes raw bytes even for gzip-on-wire files', () => {
    const raw = Buffer.from('galaxy bytes '.repeat(100));
    const f = file('x.bin', raw);
    const [g] = buildOfflineInventory([group('bin', [f], true, true)]).groups;
    expect(g?.files[0]?.sha256).toBe(createHash('sha256').update(raw).digest('hex'));
    expect(g?.files[0]?.sha256).not.toBe(createHash('sha256').update(gzipSync(raw)).digest('hex'));
  });

  it('size is the on-disk byte length', () => {
    const [g] = buildOfflineInventory([
      group('g', [file('x.bin', Buffer.alloc(1234))], true),
    ]).groups;
    expect(g?.files[0]?.size).toBe(1234);
  });

  it('refuses an offline group with no files, naming its label', () => {
    expect(() => buildOfflineInventory([group('Surface tiles (mars)', [], true)])).toThrow(
      /Surface tiles \(mars\)/,
    );
  });

  it('ignores an empty group that is not offline', () => {
    expect(buildOfflineInventory([group('Mesh sources', [], false)])).toEqual({ groups: [] });
  });
});
