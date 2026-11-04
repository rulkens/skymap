import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { makeRepo } from './helpers/makeRepo';

const tsx = resolve('node_modules/.bin/tsx');
const cli = resolve('packages/move-files/src/cli.ts');
const run = (cwd: string, ...args: string[]) =>
  spawnSync(tsx, [cli, ...args], { cwd, encoding: 'utf8' });

const repo = () =>
  makeRepo({
    'src/lib/a.ts': 'export const a = 1;',
    'src/use.ts': `import { a } from './lib/a';\nexport const b = a;`,
    'src/stale.ts': `export const p = 'src/lib/a.ts';`,
  });

const probe = makeRepo({ 'Probe.txt': '' });
const diskFoldsCase = existsSync(join(probe, 'probe.txt'));

// Every test spawns a tsx process (~0.5s alone); a loaded full run can pass Vitest's 5s default.
describe('cli', { timeout: 30_000 }, () => {
  it('exits 2 and writes nothing on a refusal', () => {
    const root = repo();
    const r = run(root, 'src/lib/gone.ts', 'src/x.ts');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('missing-source');
    expect(existsSync(join(root, 'src/x.ts'))).toBe(false);
  });

  it('exits 1 with findings and writes', () => {
    const root = repo();
    const r = run(root, 'src/lib/a.ts', 'src/a.ts');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('move-files: 1 move(s):');
    expect(r.stdout).toContain('src/stale.ts:1');
    expect(r.stdout).toContain('move-files: saved.');
    expect(readFileSync(join(root, 'src/use.ts'), 'utf8')).toContain(`'./a'`);
    expect(existsSync(join(root, 'src/lib/a.ts'))).toBe(false);
  });

  it('exits 0 when nothing is left stale', () => {
    const root = repo();
    writeFileSync(join(root, 'src/stale.ts'), 'export {};');
    expect(run(root, 'src/lib/a.ts', 'src/a.ts').status).toBe(0);
  });

  it('--dry writes nothing', () => {
    const root = repo();
    const r = run(root, 'src/lib/a.ts', 'src/a.ts', '--dry');
    expect(r.stdout).toContain('move-files: --dry, nothing saved.');
    expect(existsSync(join(root, 'src/lib/a.ts'))).toBe(true);
    expect(readFileSync(join(root, 'src/use.ts'), 'utf8')).toContain(`'./lib/a'`);
  });

  it('reads a manifest', () => {
    const root = repo();
    writeFileSync(join(root, 'm.json'), JSON.stringify([{ from: 'src/lib/a.ts', to: 'src/a.ts' }]));
    expect(run(root, '--manifest', 'm.json', '--dry').stdout).toContain(
      'src/lib/a.ts  ->  src/a.ts',
    );
  });

  it('exits 2 on bad arguments', () => {
    expect(run(repo(), 'only-one').status).toBe(2);
  });

  it('exits 2 from a subdirectory', () => {
    const root = repo();
    const r = run(join(root, 'src'), 'lib/a.ts', 'a.ts');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('repository root');
    expect(existsSync(join(root, 'src/lib/a.ts'))).toBe(true);
  });

  it.each([
    ['a directory', 'a.ts', 'dir'],
    ['a new folder name', 'a.ts', 'newdir/'],
    ['a path under a file', 'a.ts', 'file.txt/a.ts'],
    ['a quote', 'a.ts', `it's/a.ts`],
  ])('refuses a destination that is %s, nothing written', (_, from, to) => {
    const root = makeRepo({ 'a.ts': '', 'file.txt': '', 'dir/k.ts': '', 'u.ts': `import './a';` });
    const r = run(root, from, to);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('invalid-destination');
    expect(readFileSync(join(root, 'u.ts'), 'utf8')).toBe(`import './a';`);
    expect(existsSync(join(root, 'a.ts'))).toBe(true);
  });

  it('keeps executable bits on a renamed and on a rewritten file', () => {
    const root = makeRepo({
      'run.sh': 'echo hi\n',
      'cli.mjs': `import './lib.mjs';\n`,
      'lib.mjs': '',
    });
    chmodSync(join(root, 'run.sh'), 0o755);
    chmodSync(join(root, 'cli.mjs'), 0o775);
    writeFileSync(
      join(root, 'm.json'),
      JSON.stringify([
        { from: 'run.sh', to: 'bin/run.sh' },
        { from: 'cli.mjs', to: 'bin/cli.mjs' },
      ]),
    );
    expect(run(root, '--manifest', 'm.json').status).toBe(0);
    expect(statSync(join(root, 'bin/run.sh')).mode & 0o777).toBe(0o755);
    expect(statSync(join(root, 'bin/cli.mjs')).mode & 0o777).toBe(0o775);
    expect(readFileSync(join(root, 'bin/cli.mjs'), 'utf8')).toBe(`import '../lib.mjs';\n`);
  });

  it('moves a symlink as a symlink', () => {
    const root = makeRepo({ 'target.txt': 'x' });
    symlinkSync('target.txt', join(root, 'link.txt'));
    expect(run(root, 'link.txt', 'd/link.txt').status).toBe(0);
    expect(lstatSync(join(root, 'd/link.txt')).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(root, 'd/link.txt'))).toBe('target.txt');
  });

  it('moves a non-UTF-8 stylesheet with its bytes intact', () => {
    const root = makeRepo({});
    const bytes = Buffer.from([0x2e, 0x61, 0x7b, 0xe9, 0x7d]);
    writeFileSync(join(root, 's.css'), bytes);
    expect(run(root, 's.css', 'd/s.css').status).toBe(0);
    expect(readFileSync(join(root, 'd/s.css')).equals(bytes)).toBe(true);
  });

  it('moves an unreadable asset', () => {
    const root = makeRepo({ 'lock.png': 'x' });
    chmodSync(join(root, 'lock.png'), 0o000);
    expect(run(root, 'lock.png', 'd/lock.png').status).toBe(0);
    chmodSync(join(root, 'd/lock.png'), 0o644);
    expect(readFileSync(join(root, 'd/lock.png'), 'utf8')).toBe('x');
  });

  // Root ignores file modes, so these two cannot provoke a failure there.
  describe.skipIf(process.getuid?.() === 0)('when the disk says no', () => {
    it('exits 3 with nothing changed when staging fails', () => {
      const root = makeRepo({ 'a.ts': 'A', 'b.ts': `import './a';` });
      mkdirSync(join(root, 'ro'));
      chmodSync(join(root, 'ro'), 0o555);
      const r = run(root, 'b.ts', 'ro/b.ts');
      chmodSync(join(root, 'ro'), 0o755);
      expect(r.status).toBe(3);
      expect(r.stderr).toContain('ro/b.ts');
      expect(readFileSync(join(root, 'b.ts'), 'utf8')).toBe(`import './a';`);
      expect(readdirSync(join(root, 'ro'))).toEqual([]);
    });

    it('exits 3 and names what finished when a later write fails', () => {
      const root = makeRepo({ 'a.ts': 'A', 'u.ts': `import './a';` });
      chmodSync(join(root, 'u.ts'), 0o444);
      const r = run(root, 'a.ts', 'lib/a.ts');
      expect(r.status).toBe(3);
      expect(r.stderr).toContain('writing u.ts failed');
      expect(r.stderr).toContain('  lib/a.ts');
      expect(readFileSync(join(root, 'lib/a.ts'), 'utf8')).toBe('A');
    });
  });

  describe.runIf(diskFoldsCase)('on a case-insensitive disk', () => {
    it('a case-only rename lands under the new name, importers repointed', () => {
      const root = makeRepo({ 'Foo.ts': 'export const a = 1;', 'main.ts': `import './Foo';` });
      expect(run(root, 'Foo.ts', 'foo.ts').status).toBe(0);
      expect(readdirSync(root)).toContain('foo.ts');
      expect(readdirSync(root)).not.toContain('Foo.ts');
      expect(readFileSync(join(root, 'foo.ts'), 'utf8')).toBe('export const a = 1;');
      expect(readFileSync(join(root, 'main.ts'), 'utf8')).toBe(`import './foo';`);
    });

    it('two destinations differing by case are refused, nothing lost', () => {
      const root = makeRepo({ 'a.ts': 'A', 'b.ts': 'B' });
      writeFileSync(
        join(root, 'm.json'),
        JSON.stringify([
          { from: 'a.ts', to: 'x/foo.ts' },
          { from: 'b.ts', to: 'x/Foo.ts' },
        ]),
      );
      const r = run(root, '--manifest', 'm.json');
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('case-collision');
      expect(readFileSync(join(root, 'a.ts'), 'utf8')).toBe('A');
    });

    it('a source in the wrong case is refused, its importer untouched', () => {
      const root = makeRepo({ 'Foo.ts': '', 'main.ts': `import './Foo';` });
      const r = run(root, 'foo.ts', 'lib/x.ts');
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('missing-source');
      expect(existsSync(join(root, 'lib/x.ts'))).toBe(false);
    });
  });
});
