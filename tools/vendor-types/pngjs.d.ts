/**
 * Minimal type shim for pngjs.
 *
 * `pngjs` is a transitive dep of `msdf-bmfont-xml` and ships no
 * TypeScript declarations.  Declares only what tools use: the sync
 * decoder (`buildFontAtlas.ts` validates atlas page dimensions) and
 * the constructor + sync encoder (`renderCubeMips.ts` writes MIPs;
 * `basisuEncodeLevel.ts` writes one-byte grey slices).
 */
declare module 'pngjs' {
  export type DecodedPNG = {
    readonly width: number;
    readonly height: number;
    readonly data: Buffer;
  };

  export class PNG {
    constructor(options?: { width: number; height: number });
    readonly width: number;
    readonly height: number;
    readonly data: Buffer;
    static readonly sync: {
      read(buffer: Buffer): DecodedPNG;
      write(
        png: Pick<PNG, 'width' | 'height' | 'data'>,
        options?: { readonly colorType?: 0 | 2 | 4 | 6; readonly inputColorType?: 0 | 2 | 4 | 6 },
      ): Buffer;
    };
  }
}
