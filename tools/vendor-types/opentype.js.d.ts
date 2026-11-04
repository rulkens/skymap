/**
 * Minimal type shim for opentype.js 1.3.4, which ships no declarations: only what
 * tools/site/utils/wordmarkSvg.ts uses to turn the wordmark's word into outlines.
 */
declare module 'opentype.js' {
  type Path = { toPathData(decimalPlaces?: number): string };
  type Font = { getPath(text: string, x: number, y: number, fontSize: number): Path };
  export function parse(buffer: ArrayBuffer): Font;
}
