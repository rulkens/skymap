import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

describe('cli', () => {
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
});
