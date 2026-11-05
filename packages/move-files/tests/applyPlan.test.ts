import { describe, it, expect } from 'vitest';
import { applyPlan } from '../src/applyPlan';
import type { MoveFs } from '../src/@types/MoveFs';
import type { MovePlan } from '../src/@types/MovePlan';

const TMP = '.move-files-tmp';

// An in-memory disk that logs every operation and folds case like macOS, so ordering and
// case-only renames are assertable on CI's case-sensitive Linux disk too.
function memoryFs(files: Record<string, string>, failOn?: string) {
  const disk = new Map(Object.entries(files));
  const log: string[] = [];
  const onDisk = (p: string) => [...disk.keys()].find((k) => k.toLowerCase() === p.toLowerCase());
  const fail = (op: string, p: string) => {
    if (`${op} ${p}` === failOn) throw new Error('disk full');
    log.push(`${op} ${p}`);
  };
  const fs: MoveFs = {
    readFile: (p) => {
      fail('read', p);
      return Buffer.from(disk.get(onDisk(p)!)!);
    },
    writeFile: (p, data) => {
      fail('write', p);
      disk.set(onDisk(p) ?? p, data.toString());
    },
    mkdirp: () => {},
    remove: (p) => {
      fail('remove', p);
      disk.delete(onDisk(p)!);
    },
    rename: (from, to) => {
      fail('rename', from);
      const data = disk.get(onDisk(from)!)!;
      disk.delete(onDisk(from)!);
      disk.set(onDisk(to) ?? to, data);
    },
    copyMode: (from, to) => log.push(`mode ${from} ${to}`),
  };
  return { fs, disk, log };
}

const plan = (moves: [string, string][], edits: [string, string, string][]): MovePlan => ({
  moves: moves.map(([from, to]) => ({ from: from.slice(3), to: to.slice(3) })),
  edits: edits.map(([from, to, text]) => ({ from, to, text })),
  findings: [],
});

describe('applyPlan', () => {
  it('stages a rewritten file, carries its mode, and removes the source only then', () => {
    const { fs, disk, log } = memoryFs({ '/r/a.ts': 'A' });
    const p = plan([['/r/a.ts', '/r/b.ts']], [['/r/a.ts', '/r/b.ts', 'A2']]);
    expect(applyPlan(p, '/r', fs)).toEqual({ failed: null, completed: ['/r/b.ts'] });
    expect(log).toEqual([
      'read /r/a.ts',
      `write /r/b.ts${TMP}`,
      `mode /r/a.ts /r/b.ts${TMP}`,
      'remove /r/a.ts',
      `rename /r/b.ts${TMP}`,
    ]);
    expect([...disk]).toEqual([['/r/b.ts', 'A2']]);
  });

  it('renames a moved file whose text did not change, writing nothing', () => {
    const { fs, disk, log } = memoryFs({ '/r/a.ts': 'A' });
    applyPlan(plan([['/r/a.ts', '/r/b.ts']], [['/r/a.ts', '/r/b.ts', 'A']]), '/r', fs);
    expect(log.filter((l) => l.startsWith('write'))).toEqual([]);
    expect([...disk]).toEqual([['/r/b.ts', 'A']]);
  });

  it('renames a file that has no edit without reading it', () => {
    const { fs, disk, log } = memoryFs({ '/r/logo.png': 'bytes' });
    applyPlan(plan([['/r/logo.png', '/r/img/logo.png']], []), '/r', fs);
    expect(log.filter((l) => l.startsWith('read'))).toEqual([]);
    expect([...disk]).toEqual([['/r/img/logo.png', 'bytes']]);
  });

  it('leaves the disk as it was when staging fails', () => {
    const { fs, disk } = memoryFs({ '/r/a.ts': 'A', '/r/c.ts': 'C' }, `write /r/d.ts${TMP}`);
    const p = plan(
      [
        ['/r/a.ts', '/r/b.ts'],
        ['/r/c.ts', '/r/d.ts'],
      ],
      [
        ['/r/a.ts', '/r/b.ts', 'A2'],
        ['/r/c.ts', '/r/d.ts', 'C2'],
      ],
    );
    expect(applyPlan(p, '/r', fs)).toEqual({ failed: '/r/d.ts', completed: [] });
    expect([...disk].sort()).toEqual([
      ['/r/a.ts', 'A'],
      ['/r/c.ts', 'C'],
    ]);
  });

  it('reports an unreadable source as a failure, not a crash', () => {
    const { fs, disk } = memoryFs({ '/r/a.ts': 'A' }, 'read /r/a.ts');
    const p = plan([['/r/a.ts', '/r/b.ts']], [['/r/a.ts', '/r/b.ts', 'A2']]);
    expect(applyPlan(p, '/r', fs)).toEqual({ failed: '/r/b.ts', completed: [] });
    expect([...disk]).toEqual([['/r/a.ts', 'A']]);
  });

  it('loses nothing when a commit step fails, and says what completed', () => {
    const { fs, disk } = memoryFs(
      { '/r/a.ts': 'A', '/r/b.ts': 'B', '/r/u.ts': 'U' },
      `rename /r/a.ts${TMP}`,
    );
    const p = plan(
      [
        ['/r/a.ts', '/r/b.ts'],
        ['/r/b.ts', '/r/a.ts'],
      ],
      [
        ['/r/a.ts', '/r/b.ts', 'A2'],
        ['/r/b.ts', '/r/a.ts', 'B2'],
        ['/r/u.ts', '/r/u.ts', 'U2'],
      ],
    );
    expect(applyPlan(p, '/r', fs)).toEqual({ failed: '/r/a.ts', completed: ['/r/b.ts'] });
    expect(disk.get('/r/b.ts')).toBe('A2');
    expect(disk.get(`/r/a.ts${TMP}`)).toBe('B2');
    expect(disk.get('/r/u.ts')).toBe('U');
  });

  it('handles a swap of rewritten files', () => {
    const { fs, disk } = memoryFs({ '/r/a.ts': 'A', '/r/b.ts': 'B' });
    const p = plan(
      [
        ['/r/a.ts', '/r/b.ts'],
        ['/r/b.ts', '/r/a.ts'],
      ],
      [
        ['/r/a.ts', '/r/b.ts', 'A2'],
        ['/r/b.ts', '/r/a.ts', 'B2'],
      ],
    );
    expect(applyPlan(p, '/r', fs)).toEqual({
      failed: null,
      completed: ['/r/b.ts', '/r/a.ts'],
    });
    expect([...disk].sort()).toEqual([
      ['/r/a.ts', 'B2'],
      ['/r/b.ts', 'A2'],
    ]);
  });

  it('handles a swap and a chain of files with unchanged text', () => {
    const { fs, disk } = memoryFs({ '/r/a.png': 'A', '/r/b.png': 'B', '/r/c.png': 'C' });
    const p = plan(
      [
        ['/r/a.png', '/r/b.png'],
        ['/r/b.png', '/r/a.png'],
      ],
      [],
    );
    applyPlan(p, '/r', fs);
    expect(disk.get('/r/a.png')).toBe('B');
    expect(disk.get('/r/b.png')).toBe('A');
    const chain = plan(
      [
        ['/r/a.png', '/r/b.png'],
        ['/r/b.png', '/r/c.png'],
        ['/r/c.png', '/r/d.png'],
      ],
      [],
    );
    applyPlan(chain, '/r', fs);
    expect([...disk].sort()).toEqual([
      ['/r/b.png', 'B'],
      ['/r/c.png', 'A'],
      ['/r/d.png', 'C'],
    ]);
  });

  it.each([
    ['unchanged', 'F'],
    ['rewritten', 'F2'],
  ])('a case-only rename of a %s file lands under its new name', (_, text) => {
    const { fs, disk } = memoryFs({ '/r/Foo.ts': 'F' });
    const p = plan([['/r/Foo.ts', '/r/foo.ts']], [['/r/Foo.ts', '/r/foo.ts', text]]);
    expect(applyPlan(p, '/r', fs).failed).toBeNull();
    expect([...disk]).toEqual([['/r/foo.ts', text]]);
  });

  it('writes an edit to a file that stays put, in place', () => {
    const { fs, disk, log } = memoryFs({ '/r/u.ts': 'old' });
    const result = applyPlan(plan([], [['/r/u.ts', '/r/u.ts', 'new']]), '/r', fs);
    expect(result).toEqual({ failed: null, completed: ['/r/u.ts'] });
    expect(log).toEqual(['write /r/u.ts']);
    expect(disk.get('/r/u.ts')).toBe('new');
  });
});
