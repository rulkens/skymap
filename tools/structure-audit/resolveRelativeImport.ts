import { dirname, relative, resolve } from 'node:path';

/**
 * Resolve a relative import specifier written in `fromAbs` to a `srcDir`-relative file in
 * `known`, trying the extension-less, `.ts`, `.tsx`, `.d.ts` and `/index.ts` forms. Vite `?suffix`
 * queries are stripped. Null for anything outside the known set (packages, shaders, assets).
 * The importer may sit outside `srcDir` (tests/, tools/), which is why it is absolute.
 */
export function resolveRelativeImport(
  fromAbs: string,
  spec: string,
  srcDir: string,
  known: ReadonlySet<string>,
): string | null {
  if (!spec.startsWith('.')) return null;
  const base = relative(srcDir, resolve(dirname(fromAbs), spec.replace(/\?.*$/, '')))
    .split('\\')
    .join('/');
  if (base.startsWith('..')) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.d.ts`, `${base}/index.ts`]) {
    if (known.has(candidate)) return candidate;
  }
  return null;
}
