/** A string as a TS source literal in Prettier's own `singleQuote` style, so a
 *  generated file survives `format:check` without a Prettier pass of its own. */
export function quote(s: string): string {
  return s.includes("'") || s.includes('\\') ? JSON.stringify(s) : `'${s}'`;
}
