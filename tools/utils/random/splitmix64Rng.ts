import { splitmix64 } from './splitmix64';

/**
 * A seeded uniform [0, 1) stream: splitmix64 of a counter, top 53 bits. Counter-based, so one seed
 * gives the same sequence on every run and platform, which keeps rebuilds byte-identical.
 */
export function splitmix64Rng(seed: bigint): () => number {
  let counter = seed;
  return () => Number(splitmix64(counter++) >> 11n) / 2 ** 53;
}
