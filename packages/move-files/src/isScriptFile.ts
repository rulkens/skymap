/** A JS or TS file: rewritten by parse. */
export function isScriptFile(path: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(path);
}
