/**
 * Minimal type shim for pngjs.
 *
 * `pngjs` is a transitive dep of `msdf-bmfont-xml` and ships no
 * TypeScript declarations.  We only declare the synchronous decoder
 * `PNG.sync.read`, which `tools/buildFontAtlas.ts` uses to validate
 * the emitted atlas page dimensions.
 */
declare module 'pngjs' {
  export type DecodedPNG = {
    readonly width: number;
    readonly height: number;
    readonly data: Buffer;
  };

  export const PNG: {
    readonly sync: {
      read(buffer: Buffer): DecodedPNG;
    };
  };
}
