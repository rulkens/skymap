import { apparentFromAbsolute } from '../math/apparentFromAbsolute';

/** The raw catalog band a galaxy octree record's `absMag` came from: the emitter baked it from `magG + magOffset`. */
export function bandMagOfBakedAbsMag(absMag: number, distMpc: number, magOffset: number): number {
  return apparentFromAbsolute(absMag, distMpc) - magOffset;
}
