import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { listProjectFiles } from '../src/listProjectFiles';
import { makeRepo } from './helpers/makeRepo';

describe('listProjectFiles', () => {
  it('lists tracked and untracked files, skips ignored ones', () => {
    const root = makeRepo({ '.gitignore': 'secret.ts\n', 'a.ts': '', 'b.ts': '', 'secret.ts': '' });
    execFileSync('git', ['add', 'a.ts'], { cwd: root });
    const files = listProjectFiles(root);
    expect(files).toContain(`${root}/a.ts`);
    expect(files).toContain(`${root}/b.ts`);
    expect(files).not.toContain(`${root}/secret.ts`);
  });

  it('handles spaces in paths', () => {
    const root = makeRepo({ 'a b/c.ts': '' });
    expect(listProjectFiles(root)).toContain(`${root}/a b/c.ts`);
  });

  it('refuses outside a git repo', () => {
    const root = makeRepo({ 'a.ts': '' }, false);
    expect(() => listProjectFiles(root)).toThrow(/git repository/);
  });
});
