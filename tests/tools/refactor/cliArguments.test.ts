import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// The driver opens the real engine before it reads arguments, so these are process-level.
function refactor(...args: string[]) {
  const run = spawnSync('npx', ['tsx', 'tools/refactor/refactor.ts', ...args], {
    encoding: 'utf8',
  });
  return { code: run.status, stdout: run.stdout, stderr: run.stderr };
}

describe('refactor CLI arguments', { timeout: 60000 }, () => {
  it("names the subcommand that is missing its address, not 'refs'", () => {
    const run = refactor('inline');
    expect(run.code).toBe(1);
    expect(run.stderr).toContain('refactor inline: missing arguments');
  });

  it('reports a missing <dest.ts> before any preview', () => {
    const run = refactor('extract', 'tools/utils/refactor/parseTs.ts#parseTs');
    expect(run.code).toBe(1);
    expect(run.stderr).toContain('refactor extract: missing arguments');
    expect(run.stdout).toBe('');
  });

  it('a symbol row refuses a property address and says what it is', () => {
    const run = refactor('rename', 'src/shape.ts#Shape.radius', 'size');
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("refactor rename: 'src/shape.ts#Shape.radius' is a property");
  });

  it('refuses a file that does not exist, once', () => {
    const run = refactor('refs', 'src/does/not/exist.ts#nothing');
    expect(run.code).toBe(1);
    expect(run.stderr.match(/does not exist/g)).toHaveLength(1);
  });
});
