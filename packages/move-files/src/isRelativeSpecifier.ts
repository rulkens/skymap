/** `.`, `..`, `./x` or `../x`. TS and bundlers read `.hidden/x` as a package-style name. */
export function isRelativeSpecifier(specifier: string): boolean {
  return /^\.\.?(?:\/|$)/.test(specifier);
}
