/**
 * staticWeslHasNoBacktick — a root shader loaded with `?static` is emitted by
 * wesl-plugin as `export const wgsl = ` + a JS TEMPLATE LITERAL holding the
 * file verbatim. A backtick anywhere in that file therefore closes the string
 * early and the following word parses as JS, which surfaces only in the
 * browser as `Uncaught SyntaxError: Unexpected identifier '<word>'`.
 *
 * Nothing else catches it: `tsc` never sees the shader, the WESL linker
 * accepts backticks inside comments, and the emitted module is only parsed
 * once a browser imports it.
 *
 * Scope is the directly-`?static`-imported file ONLY. Modules reached through
 * `package::` are registered as separately-escaped strings rather than inlined
 * here, which is why several linker-side `.wesl` files carry backticks in
 * their comments and are correct as they stand.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

/** `import x from './a/b.wesl?static'` — the specifier is what gets inlined. */
const STATIC_IMPORT = /from\s+['"]([^'"]+\.wesl)\?[^'"]*\bstatic\b[^'"]*['"]/g;

function typeScriptFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    // Directory entries are followed, but symlinked shader trees are not
    // TypeScript and would only re-walk src/ through the tool's mirror.
    if (entry.isDirectory()) typeScriptFiles(path, out);
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

function staticWeslTargets(): readonly string[] {
  const sources = [...typeScriptFiles(join(ROOT, 'src')), ...typeScriptFiles(join(ROOT, 'tools'))];
  const targets = new Set<string>();
  for (const file of sources) {
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)) {
      // Relative specifiers only; a bare/aliased one is not ours to resolve.
      if (specifier!.startsWith('.')) targets.add(resolve(dirname(file), specifier!));
    }
  }
  return [...targets];
}

describe('?static WESL roots', () => {
  it('finds the ?static shader imports it is meant to police', () => {
    // A regex that silently matches nothing would make the sweep below vacuous.
    expect(staticWeslTargets().length).toBeGreaterThan(0);
  });

  it('contain no backtick, which would truncate the emitted template literal', () => {
    const offenders = staticWeslTargets()
      .filter((file) => readFileSync(file, 'utf8').includes('`'))
      .map((file) => file.slice(ROOT.length + 1));
    expect(offenders).toEqual([]);
  });
});
