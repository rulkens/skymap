export type ParsedImport = {
  readonly spec: string;
  readonly typeOnly: boolean;
  /** Imported names; `'*'` for namespace, dynamic and `export *` forms, `'default'` for default. */
  readonly names: readonly string[];
};

const STATIC =
  /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:(\w+)\s*,?\s*)?(?:\*\s+as\s+\w+)?\s*(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g;
const STAR = /(?:^|\n)\s*export\s+\*\s+from\s*['"]([^'"]+)['"]/g;
const DYNAMIC = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Every import/re-export in a source text, regex-parsed (no AST: fast, and enough for this repo's style). */
export function parseImports(source: string): ParsedImport[] {
  const out: ParsedImport[] = [];
  for (const m of source.matchAll(STATIC)) {
    const [, keyword, typeKw, defaultName, braces, spec] = m;
    if (!spec) continue;
    const names: string[] = [];
    if (defaultName) names.push(keyword === 'import' ? 'default' : defaultName);
    if (/\*\s+as/.test(m[0])) names.push('*');
    if (braces) {
      for (const part of braces.split(',')) {
        const local = part
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
          ?.trim();
        if (local) names.push(local);
      }
    }
    out.push({ spec, typeOnly: Boolean(typeKw), names });
  }
  for (const m of source.matchAll(STAR))
    if (m[1]) out.push({ spec: m[1], typeOnly: false, names: ['*'] });
  for (const m of source.matchAll(DYNAMIC))
    if (m[1]) out.push({ spec: m[1], typeOnly: false, names: ['*'] });
  return out;
}
