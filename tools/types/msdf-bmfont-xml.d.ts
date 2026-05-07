/**
 * Minimal type shim for msdf-bmfont-xml.
 *
 * The package ships no TypeScript declarations (it is a pure-JS tool).
 * We only declare the default export and the callback shape that
 * buildFontAtlas.ts uses — enough for the tools-tier typecheck to pass
 * without pulling in any third-party @types package that doesn't exist.
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

  type TexturePage = {
    filename: string;
    texture: Buffer;
  };

  type FontData = {
    filename: string;
    data: string;
  };

  type GenerateCallback = (
    err: Error | null,
    textures: TexturePage[],
    font: FontData,
  ) => void;

  declare function generateBMFont(
    input: string | Buffer,
    options: GenerateOptions,
    callback: GenerateCallback,
  ): void;

  export default generateBMFont;
}
