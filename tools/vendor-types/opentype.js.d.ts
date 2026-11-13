/**
 * Minimal type shim for opentype.js 1.3.4, which ships no declarations: only what
 * tools/site/utils/wordmarkSvg.ts and tools/antique/packOrnaments.ts use to turn
 * text into outlines.
 */
declare module 'opentype.js' {
  type Path = {
    toPathData(decimalPlaces?: number): string;
    getBoundingBox(): { x1: number; y1: number; x2: number; y2: number };
  };
  export type Font = {
    getPath(
      text: string,
      x: number,
      y: number,
      fontSize: number,
      options?: { letterSpacing?: number },
    ): Path;
  };
  export function parse(buffer: ArrayBuffer): Font;
}
