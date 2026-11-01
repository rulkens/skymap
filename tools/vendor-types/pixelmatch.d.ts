/**
 * Minimal type shim for pixelmatch.
 *
 * `pixelmatch` (5.x) is a transitive dep of `msdf-bmfont-xml` (through jimp)
 * and ships no TypeScript declarations. Declares only what
 * tools/site/utils/diffScreenshots.ts calls.
 */
declare module 'pixelmatch' {
  export default function pixelmatch(
    first: Uint8Array,
    second: Uint8Array,
    output: Uint8Array | null,
    width: number,
    height: number,
    options?: { threshold?: number; includeAA?: boolean },
  ): number;
}
