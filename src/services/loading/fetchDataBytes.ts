import { dataUrl } from './fetchWithProgress';

/** A data file's bytes by its logical path; null on a miss or a network failure, never a throw. */
export async function fetchDataBytes(path: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(dataUrl(path));
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}
