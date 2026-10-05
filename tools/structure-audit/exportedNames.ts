const EXPORT_DECL =
  /^export (?:const|function|async function|type|class|enum|let|abstract class) (\w+)/gm;
const EXPORT_LIST = /^export \{([^}]+)\}(?!\s*from)/gm;

/** Names a file exports by declaration, `export { a, b as c }` list, or default. Regex, not AST: no re-exports. */
export function exportedNames(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(EXPORT_DECL)) if (m[1]) names.add(m[1]);
  for (const m of source.matchAll(EXPORT_LIST))
    for (const part of (m[1] ?? '').split(',')) {
      const exported = part
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (exported) names.add(exported);
    }
  if (/^export default /m.test(source)) names.add('default');
  return [...names];
}
