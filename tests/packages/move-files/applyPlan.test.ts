import { describe, it, expect } from 'vitest';
import { applyPlan } from '../../../packages/move-files/src/applyPlan';
import type { MoveFs } from '../../../packages/move-files/src/@types/MoveFs';
import type { MovePlan } from '../../../packages/move-files/src/@types/MovePlan';

// An in-memory disk that logs every operation, so ordering is assertable even
// where the real disk (case-sensitive on CI) would hide it.
function memoryFs(files: Record<string, string>, failWrite?: string) {
  const disk = new Map(Object.entries(files));
  const log: string[] = [];
  const fs: MoveFs = {
    readFile: (p) => Buffer.from(disk.get(p)!),
    writeFile: (p, data) => {
      if (p === failWrite) throw new Error('disk full');
      log.push(`write ${p}`);
      disk.set(p, data.toString());
    },
    mkdirp: () => {},
    remove: (p) => {
      log.push(`remove ${p}`);
      disk.delete(p);
    },
  };
  return { fs, disk, log };
}

const plan = (moves: [string, string][], edits: [string, string, string][]): MovePlan => ({
  moves: moves.map(([from, to]) => ({ from: from.slice(3), to: to.slice(3) })),
  edits: edits.map(([from, to, text]) => ({ from, to, text })),
  findings: [],
});

describe('applyPlan', () => {
  it('writes before it deletes', () => {
    const { fs, disk, log } = memoryFs({ '/r/a.ts': 'A' });
    const p = plan([['/r/a.ts', '/r/b.ts']], [['/r/a.ts', '/r/b.ts', 'A2']]);
    expect(applyPlan(p, '/r', fs)).toEqual({ failed: null });
    expect(log).toEqual(['write /r/b.ts', 'remove /r/a.ts']);
    expect([...disk]).toEqual([['/r/b.ts', 'A2']]);
  });

  it('keeps the sources and names the path when a write fails', () => {
    const { fs, disk } = memoryFs({ '/r/a.ts': 'A', '/r/c.ts': 'C' }, '/r/d.ts');
    const p = plan(
      [
        ['/r/a.ts', '/r/b.ts'],
        ['/r/c.ts', '/r/d.ts'],
      ],
      [
        ['/r/a.ts', '/r/b.ts', 'A'],
        ['/r/c.ts', '/r/d.ts', 'C'],
      ],
    );
    expect(applyPlan(p, '/r', fs).failed).toBe('/r/d.ts');
    expect(disk.get('/r/a.ts')).toBe('A');
    expect(disk.get('/r/c.ts')).toBe('C');
  });

  it('handles a swap', () => {
    const { fs, disk } = memoryFs({ '/r/a.ts': 'A', '/r/b.ts': 'B' });
    const p = plan(
      [
        ['/r/a.ts', '/r/b.ts'],
        ['/r/b.ts', '/r/a.ts'],
      ],
      [
        ['/r/a.ts', '/r/b.ts', 'A'],
        ['/r/b.ts', '/r/a.ts', 'B'],
      ],
    );
    expect(applyPlan(p, '/r', fs)).toEqual({ failed: null });
    expect(disk.get('/r/a.ts')).toBe('B');
    expect(disk.get('/r/b.ts')).toBe('A');
  });

  it('removes a case-only source before writing', () => {
    const { fs, log, disk } = memoryFs({ '/r/Foo.ts': 'F' });
    const p = plan([['/r/Foo.ts', '/r/foo.ts']], [['/r/Foo.ts', '/r/foo.ts', 'F']]);
    applyPlan(p, '/r', fs);
    expect(log).toEqual(['remove /r/Foo.ts', 'write /r/foo.ts']);
    expect([...disk.keys()]).toEqual(['/r/foo.ts']);
  });

  it('renames a file that has no edit by carrying its bytes', () => {
    const { fs, disk } = memoryFs({ '/r/logo.png': 'bytes' });
    applyPlan(plan([['/r/logo.png', '/r/img/logo.png']], []), '/r', fs);
    expect([...disk]).toEqual([['/r/img/logo.png', 'bytes']]);
  });

  it('writes an edit to a file that stays put', () => {
    const { fs, disk } = memoryFs({ '/r/u.ts': 'old' });
    applyPlan(plan([], [['/r/u.ts', '/r/u.ts', 'new']]), '/r', fs);
    expect(disk.get('/r/u.ts')).toBe('new');
  });
});
