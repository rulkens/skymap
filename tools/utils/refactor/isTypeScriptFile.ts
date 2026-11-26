/** A `.ts`, `.tsx`, `.mts` or `.cts` path (declaration files included): the files the parser can read. */
export function isTypeScriptFile(file: string): boolean {
  return /\.[cm]?tsx?$/.test(file);
}
