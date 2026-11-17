/**
 * readSnapshot: the text of every file that can hold a reference, plus existence
 * checks for everything else (assets, ignored files).
 *
 * Only extensions the core parses are read, so a repo of large binaries costs
 * nothing. A tracked file missing from disk, or not valid UTF-8, has no text: it
 * travels as an asset, because writing a decoded copy back would corrupt its bytes.
 * BOMs stay in the text so a write-back is byte-identical.
 */

import { readFileSync, statSync } from 'node:fs';
import type { ProjectSnapshot } from './@types/ProjectSnapshot';

const TEXT_FILE = /\.(?:[cm]?[jt]sx?|css|scss|less|pcss|astro|mdx|vue|svelte)$/;

export function readSnapshot(paths: readonly string[]): ProjectSnapshot {
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const texts = new Map<string, string>();
  for (const path of paths) {
    if (!TEXT_FILE.test(path)) continue;
    try {
      texts.set(path, decoder.decode(readFileSync(path)));
    } catch {
      // gone from disk, unreadable, or not UTF-8
    }
  }
  const fileExists = (path: string) => statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
  const directoryExists = (path: string) =>
    statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
  return { texts, listed: new Set(paths), fileExists, directoryExists };
}
