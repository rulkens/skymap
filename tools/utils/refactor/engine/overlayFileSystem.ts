import { readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FileSystem, FileSystemEntries } from 'typescript-native/unstable/fs';

/**
 * The engine's view of the project: `base` (memory in tests, else the disk) with the
 * run's unwritten state on top. A moved file exists at its new path only in `overlay`
 * and its old path is in `removed`, so listings and existence checks must say so too,
 * not just `readFile`, or the engine would never see the file at its destination.
 */
export function overlayFileSystem(
  overlay: ReadonlyMap<string, string>,
  removed: ReadonlySet<string>,
  base: FileSystem | undefined,
): FileSystem {
  const underlying = (dir: string): FileSystemEntries | undefined =>
    base ? base.getAccessibleEntries?.(dir) : diskEntries(dir);

  return {
    ...base,
    readFile: (name) => (removed.has(name) ? null : (overlay.get(name) ?? base?.readFile?.(name))),
    fileExists: (name) => {
      if (removed.has(name)) return false;
      return overlay.has(name) ? true : base?.fileExists?.(name);
    },
    directoryExists: (name) =>
      [...overlay.keys()].some((file) => file.startsWith(`${name}/`))
        ? true
        : base?.directoryExists?.(name),
    getAccessibleEntries: (dir) => {
      const own = [...overlay.keys()].filter((file) => file.startsWith(`${dir}/`));
      const gone = [...removed].filter((file) => dirname(file) === dir);
      if (own.length === 0 && gone.length === 0) return base?.getAccessibleEntries?.(dir);
      const files = new Set(underlying(dir)?.files);
      const directories = new Set(underlying(dir)?.directories);
      for (const file of own) {
        const rest = file.slice(dir.length + 1);
        const slash = rest.indexOf('/');
        if (slash < 0) files.add(rest);
        else directories.add(rest.slice(0, slash));
      }
      for (const file of gone) files.delete(file.slice(dir.length + 1));
      return { files: [...files], directories: [...directories] };
    },
  };
}

function diskEntries(dir: string): FileSystemEntries | undefined {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    return {
      files: entries.filter((e) => !e.isDirectory()).map((e) => e.name),
      directories: entries.filter((e) => e.isDirectory()).map((e) => e.name),
    };
  } catch {
    return undefined;
  }
}
