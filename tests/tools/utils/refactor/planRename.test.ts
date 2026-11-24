import { afterAll, describe, expect, it } from 'vitest';
import { collectRefs } from '../../../../tools/utils/refactor/collectRefs';
import { planRename } from '../../../../tools/utils/refactor/planRename';
import type { PlanResult } from '../../../../tools/@types/refactor/PlanResult';
import { engineFixture } from '../../../helpers/refactor/engineFixture';

const FILES: Record<string, string> = {
  'src/utils/x/foo.ts': 'export const foo = 1;',
  'src/utils/x/pair.ts': 'export const one = 1;\nexport const foo2 = 2;',
  'src/app.ts': "import { foo } from './utils/x/foo';\nexport const o = { foo };",
  'src/relay.ts':
    "import { foo as bar } from './utils/x/foo';\nexport { bar as foo };\nexport const u = bar;",
  'src/alias.ts': "import { foo as local } from './utils/x/foo';\nexport const u = local;",
  'tests/utils/x/foo.test.ts':
    "import { foo } from '../../../src/utils/x/foo';\nexport const t = foo;",
};

const fixture = engineFixture(FILES);
afterAll(fixture.dispose);

function rename(file: string, symbol: string, newName: string, renameFile = true): PlanResult {
  const absolute = (f: string) => f.slice(fixture.root.length + 1);
  const address = { file, symbol };
  const read = (f: string) => FILES[absolute(f)] ?? '';
  const found = collectRefs({ address, engine: fixture.engine, read });
  if (!found.ok) return { ok: false, refusals: [found.refusal] };
  return planRename({
    address,
    found,
    newName,
    renameFile,
    root: fixture.root,
    read,
    exists: (f) => absolute(f) in FILES,
  });
}

function planOf(result: PlanResult) {
  if (!result.ok) throw new Error(result.refusals.join('; '));
  return result.plan;
}

describe('planRename', () => {
  it('renames the declaration and a use in another file, and not an alias', () => {
    const edits = planOf(rename('src/utils/x/foo.ts', 'foo', 'bar', false)).edits;
    const byFile = (suffix: string) => edits.filter((e) => e.file.endsWith(suffix));
    expect(byFile('x/foo.ts')).toHaveLength(1);
    expect(byFile('src/app.ts').map((e) => e.text)).toEqual(['bar', 'foo: bar']);
    // Only the imported name of `foo as local`; `local` and its use keep their name.
    expect(byFile('src/alias.ts').map((e) => e.text)).toEqual(['bar']);
  });

  it('carries the file move and its test mirror when the basename is the symbol', () => {
    const { moves } = planOf(rename('src/utils/x/foo.ts', 'foo', 'bar'));
    expect(moves.map((m) => [m.from, m.to])).toEqual([
      ['/fixture/src/utils/x/foo.ts', '/fixture/src/utils/x/bar.ts'],
      ['/fixture/tests/utils/x/foo.test.ts', '/fixture/tests/utils/x/bar.test.ts'],
    ]);
  });

  it('carries no move when the basename differs', () => {
    expect(planOf(rename('src/utils/x/pair.ts', 'one', 'uno')).moves).toEqual([]);
  });

  it('carries no move under renameFile false', () => {
    expect(planOf(rename('src/utils/x/foo.ts', 'foo', 'bar', false)).moves).toEqual([]);
  });

  it('refuses an invalid identifier', () => {
    expect(rename('src/utils/x/foo.ts', 'foo', 'not valid')).toMatchObject({ ok: false });
  });

  it('refuses a symbol that is not exported', () => {
    expect(rename('src/utils/x/foo.ts', 'missing', 'bar')).toMatchObject({ ok: false });
  });

  it("leaves another module's public name alone when it is spelled like the symbol", () => {
    const edits = planOf(rename('src/utils/x/foo.ts', 'foo', 'baz', false)).edits;
    const relay = edits.filter((e) => e.file.endsWith('src/relay.ts'));
    // Only the imported `foo`; `export { bar as foo }` keeps its public name.
    expect(relay).toHaveLength(1);
    expect(FILES['src/relay.ts']!.slice(relay[0]!.start, relay[0]!.end)).toBe('foo');
    expect(relay[0]!.start).toBeLessThan(FILES['src/relay.ts']!.indexOf('\n'));
  });
});
