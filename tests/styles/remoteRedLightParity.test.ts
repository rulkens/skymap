import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REMOTE_DIR = 'src/components/RemotePage';
const REMOTE_CSS = 'src/styles/remote.css';
// The ground stays black in red light too, so the page keeps no red value for it.
const KEPT = new Set(['--color-bg']);

const cssFilesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? cssFilesUnder(join(dir, entry.name))
      : entry.name.endsWith('.css')
        ? [join(dir, entry.name)]
        : [],
  );

describe('remote red light', () => {
  it('redefines every colour token the remote reads', () => {
    const read = new Set<string>();
    for (const file of [...cssFilesUnder(REMOTE_DIR), REMOTE_CSS]) {
      for (const [, token] of readFileSync(file, 'utf8').matchAll(
        /var\((--(?:color|surface|border)-[\w-]+)/g,
      )) {
        read.add(token!);
      }
    }
    const block = /:root\[data-light='red'\]\s*\{([^}]*)\}/.exec(readFileSync(REMOTE_CSS, 'utf8'));
    expect(block, 'remote.css has no :root[data-light="red"] block').not.toBeNull();
    const declared = new Set([...block![1]!.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!));
    const missing = [...read].filter((token) => !KEPT.has(token) && !declared.has(token));
    expect(missing).toEqual([]);
  });
});
