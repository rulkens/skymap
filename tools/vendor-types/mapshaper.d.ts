/**
 * Minimal type shim for mapshaper (MPL-2.0, devDependency), which ships no
 * TypeScript declarations and, being CommonJS, only a default export under
 * ESM. Declares only `applyCommands`, which the antique Earth map's polygon
 * utils (`tools/antique/earth/utils/`) call: input files by name (GeoJSON
 * objects allowed), output files by name as Buffers.
 */
declare module 'mapshaper' {
  const mapshaper: {
    applyCommands(commands: string, input: Readonly<Record<string, unknown>>): Promise<Record<string, Buffer>>;
  };
  export default mapshaper;
}
