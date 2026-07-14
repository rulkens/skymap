/**
 * expandTestMirrors — given a list of source-file moves, append the matching
 * moves for any mirrored test files so the `tests/` tree keeps mirroring the
 * source trees after a reorg.
 *
 * ## The mirror convention this encodes
 *
 * Tests live in a parallel tree that mirrors the source path with a `.test`
 * suffix (verified against real pairs):
 *
 *   - `src/utils/math/foo.ts`     ↔ `tests/utils/math/foo.test.ts`
 *   - `tools/utils/io/bar.ts`     ↔ `tests/tools/utils/io/bar.test.ts`
 *
 * So `src/` maps to `tests/` (the `src` segment is dropped) while `tools/`
 * maps to `tests/tools/` (the `tools` segment is kept under `tests/`). Move a
 * source file and its test must move in lockstep or the mirror rots.
 *
 * ## Why `fileExists` is injected
 *
 * A source file need not have a test, and the suffix isn't purely mechanical:
 * a `.ts` source can have a `.test.tsx` test (e.g. `detailCardTable.ts` ↔
 * `detailCardTable.test.tsx`) when the test renders JSX. Rather than stat the
 * disk from a "pure" helper — which would make it untestable and couple it to
 * a real filesystem — we take `fileExists` as a parameter and probe both
 * `.test.ts` and `.test.tsx` candidates, keeping whichever suffix actually
 * exists. The CLI passes a real `existsSync`; tests pass a Set-backed stub.
 *
 * ## What is intentionally *not* expanded
 *
 * A move whose `from` already lives under `tests/` gets no expansion — it *is*
 * a test file, moving on its own, and there's no second tree to keep in sync.
 * Same for any `from` outside the `src/` and `tools/` trees. The original
 * moves are always returned unchanged and first, with mirror moves appended.
 */

import type { MovePair } from './applyMoves';

const TEST_SUFFIXES = ['.test.ts', '.test.tsx'] as const;

// Strip a trailing `.ts` / `.tsx` and map the source path into the `tests/`
// tree. Returns null for paths that have no mirror (already a test, or not
// under a mirrored source root).
function mirrorBase(path: string): string | null {
  const withoutExt = path.replace(/\.tsx?$/, '');
  if (withoutExt === path) return null; // not a .ts/.tsx file
  if (path.startsWith('tests/')) return null; // already a test file
  if (withoutExt.startsWith('src/')) return `tests/${withoutExt.slice('src/'.length)}`;
  if (withoutExt.startsWith('tools/')) return `tests/${withoutExt}`;
  return null;
}

export function expandTestMirrors(
  moves: ReadonlyArray<MovePair>,
  fileExists: (path: string) => boolean,
): MovePair[] {
  const result: MovePair[] = [...moves];
  for (const { from, to } of moves) {
    const fromBase = mirrorBase(from);
    const toBase = mirrorBase(to);
    if (fromBase === null || toBase === null) continue;
    for (const suffix of TEST_SUFFIXES) {
      if (fileExists(fromBase + suffix)) {
        result.push({ from: fromBase + suffix, to: toBase + suffix });
      }
    }
  }
  return result;
}
