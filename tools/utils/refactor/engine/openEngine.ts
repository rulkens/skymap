import { resolve } from 'node:path';
import { API } from 'typescript-native/unstable/sync';
import { createVirtualFileSystem } from 'typescript-native/unstable/fs';
import type { Engine } from '../../../@types/refactor/Engine';

/**
 * Starts the native TypeScript 7 process over `projects` (tsconfig paths under `root`).
 * `files` (tests only) serves the whole project from memory instead of the disk.
 */
export function openEngine(input: {
  root: string;
  projects: readonly string[];
  files?: Record<string, string>;
}): Engine {
  const overlay = new Map<string, string>();
  const virtual = input.files ? createVirtualFileSystem(input.files) : undefined;
  const api = new API({
    cwd: input.root,
    fs: {
      ...virtual,
      // undefined falls through to the disk; the overlay holds not-yet-written text.
      readFile: (name) => overlay.get(name) ?? virtual?.readFile?.(name),
    },
  });
  const snapshot = api.updateSnapshot({
    openProjects: input.projects.map((p) => resolve(input.root, p)),
  });
  return { root: input.root, overlay, handle: { api, snapshot } };
}
