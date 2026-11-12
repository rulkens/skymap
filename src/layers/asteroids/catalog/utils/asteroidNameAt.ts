import type { AsteroidNames } from '../@types/AsteroidNames';

const decoder = new TextDecoder();

/** The j-th name in the file's order. */
export function asteroidNameAt(names: AsteroidNames, j: number): string {
  return decoder.decode(names.blob.subarray(names.offsets[j]!, names.offsets[j + 1]!));
}
