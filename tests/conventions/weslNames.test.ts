/**
 * Every name a shader under `src/services/gpu/shaders/` declares (a `let`/`var`/`const`, a function
 * parameter, a `for (var …)` index) is longer than two characters: `s0`, `w2`, `mu` and `k` hide
 * what a tap or weight holds, which the film-look review (2026-11-16) kept tripping over. `SHORT_WORDS`
 * are the exceptions every reader knows. Struct members, swizzles, uses and comments don't count. `ALLOWED` is today's debt, keyed by file
 * with its offender count; counts only ever go DOWN, and a row whose file is clean (or gone) fails
 * until it is lowered or deleted.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_DIR = fileURLToPath(new URL('../../', import.meta.url));
const SHADERS = 'src/services/gpu/shaders';

const ALLOWED: Readonly<Record<string, number>> = {
};

const TOO_SHORT = /^[A-Za-z][A-Za-z0-9]?$/;
const SHORT_WORDS: ReadonlySet<string> = new Set(['uv', 'in', 'up', 'ao', 'PI']);

// Blank comments out but keep their newlines, so offender line numbers still match the file.
const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');

type Offender = { readonly line: number; readonly name: string };

function paramListAfter(src: string, open: number): string {
  let depth = 1;
  let end = open;
  while (depth > 0 && end < src.length) {
    if (src[end] === '(') depth++;
    else if (src[end] === ')') depth--;
    end++;
  }
  return src.slice(open, end - 1);
}

function offendersIn(src: string): Offender[] {
  const lineAt = (index: number): number => src.slice(0, index).split('\n').length;
  const declared = [
    ...src.matchAll(/(?<=\b(?:let|var|const)\b\s*(?:<[^>]*>\s*)?)[A-Za-z_]\w*/g),
  ].map((m) => ({ index: m.index, name: m[0] }));
  // A parameter is the identifier before a single `:` (`::` is a package path) in a fn's parens.
  const params = [...src.matchAll(/\bfn\s+\w+\s*\(/g)].flatMap((fn) => {
    const open = fn.index + fn[0].length;
    return [...paramListAfter(src, open).matchAll(/(?<![:\w])[A-Za-z_]\w*(?=\s*:(?!:))/g)].map(
      (m) => ({ index: open + m.index, name: m[0] }),
    );
  });
  return [...declared, ...params]
    .filter(({ name }) => TOO_SHORT.test(name) && !SHORT_WORDS.has(name))
    .map(({ index, name }) => ({ line: lineAt(index), name }));
}

// `Dirent.isFile()` is false for a symlink, so a linked shader is counted once, at its target.
function weslFilesUnder(dir: string): string[] {
  return readdirSync(`${REPO_DIR}${dir}`, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? weslFilesUnder(`${dir}/${e.name}`)
      : e.isFile() && e.name.endsWith('.wesl')
        ? [`${dir}/${e.name}`]
        : [],
  );
}

const offendersByFile = new Map(
  weslFilesUnder(SHADERS).map(
    (path) =>
      [path, offendersIn(stripComments(readFileSync(`${REPO_DIR}${path}`, 'utf8')))] as const,
  ),
);

it('every ALLOWED row names a .wesl file that still has too-short names', () => {
  const stale = Object.keys(ALLOWED).filter((path) => !offendersByFile.get(path)?.length);
  expect(stale, 'ALLOWED rows whose file is clean or gone: remove the row').toEqual([]);
});

describe('.wesl declarations have names longer than two characters', () => {
  expect(offendersByFile.size).toBeGreaterThan(0);

  it.each([...offendersByFile])('%s', (path, offenders) => {
    const listed = offenders.map(({ line, name }) => `${path}:${line} ${name}`);
    const allowed = ALLOWED[path] ?? 0;
    if (offenders.length < allowed) {
      expect.fail(
        `${path} got cleaner: lower its ALLOWED row to ${offenders.length} (delete it at 0)`,
      );
    }
    expect(
      listed.length,
      `${path} declares too-short names (rename them; see the wesl-shaders skill, "File layout"):\n` +
        listed.join('\n'),
    ).toBeLessThanOrEqual(allowed);
  });
});
