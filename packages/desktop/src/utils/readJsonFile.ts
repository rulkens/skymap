import { readFile } from 'node:fs/promises';

/** The parsed file, or null when it is absent or unreadable as JSON. */
export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}
