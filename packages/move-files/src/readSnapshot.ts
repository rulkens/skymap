/**
 * readSnapshot: the text of every file that can hold a reference, plus an
 * existence check for everything else (assets, ignored files).
 *
 * Only extensions the core parses are read, so a repo of large binaries costs
 * nothing. Existence answers are cached because the resolver probes the same
 * candidate paths thousands of times. A tracked file missing from disk is
 * simply absent. BOMs stay in the text so a write-back is byte-identical.
 */

import { readFileSync, statSync } from 'node:fs';
import type { ProjectSnapshot } from './@types/ProjectSnapshot';

const TEXT_FILE = /\.(?:[cm]?[jt]sx?|css|scss|less|pcss|astro|mdx)$/;

export function readSnapshot(paths: readonly string[]): ProjectSnapshot {
  const texts = new Map<string, string>();
  for (const path of paths) {
    if (!TEXT_FILE.test(path)) continue;
    try {
      texts.set(path, readFileSync(path, 'utf8'));
    } catch {
      // listed by git but gone from disk
    }
  }
  const known = new Map<string, boolean>();
  const fileExists = (path: string) => {
    let found = known.get(path);
    if (found === undefined) {
      try {
        found = statSync(path).isFile();
      } catch {
        found = false;
      }
      known.set(path, found);
    }
    return found;
  };
  return { texts, fileExists };
}
