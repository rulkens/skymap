/**
 * Test-only ambient module shims for packages that the production
 * tools/ tree imports without ambient types.
 *
 * Why does the test tree need its own shim copies of declarations
 * that already exist under `tools/types/`?  The two tsconfigs have
 * disjoint `include` sets — `tsconfig.json` includes `["src", "tests"]`
 * while `tsconfig.tools.json` includes `["tools", "src"]`.  When a
 * test under `tests/tools/*.test.ts` imports from `../../tools/*.ts`,
 * TypeScript follows the import to type-check the tools file but
 * cannot see the shims under `tools/types/` — those only apply to the
 * tools tsconfig.  Re-declaring the same ambient modules here gives
 * the root pass the types it needs.
 *
 * Keep these in sync with `tools/types/*.d.ts`.
 */

declare module 'msdf-bmfont-xml' {
  type GenerateOptions = {
    readonly outputType?: string;
    readonly filename?: string;
    readonly charset?: string;
    readonly fontSize?: number;
    readonly textureSize?: readonly [number, number];
    readonly texturePadding?: number;
    readonly distanceRange?: number;
    readonly fieldType?: string;
  };
  type TexturePage = { filename: string; texture: Buffer };
  type FontData = { filename: string; data: string };
  type GenerateCallback = (
    err: Error | null,
    textures: TexturePage[],
    font: FontData,
  ) => void;
  function generateBMFont(
    input: string | Buffer,
    options: GenerateOptions,
    callback: GenerateCallback,
  ): void;
  export default generateBMFont;
}

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
