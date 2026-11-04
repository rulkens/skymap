import { describe, it, expect } from 'vitest';
import { expandCompanions } from '../src/expandCompanions';
import config from '../../../move-files.config.json';

// fileExists is injected; back it with a Set of "existing" test files so each
// case controls exactly which mirrors are present.
const existsFrom = (present: readonly string[]) => (p: string) => present.includes(p);

const rules = config.companions;

describe('expandCompanions', () => {
  it('appends the src mirror move when the test file exists', () => {
    const moves = [{ from: 'src/utils/math/foo.ts', to: 'src/helpers/foo.ts' }];
    const result = expandCompanions(moves, rules, existsFrom(['tests/utils/math/foo.test.ts']));
    expect(result).toEqual([
      ...moves,
      { from: 'tests/utils/math/foo.test.ts', to: 'tests/helpers/foo.test.ts' },
    ]);
  });

  it('leaves the moves untouched when no mirror test file exists', () => {
    const moves = [{ from: 'src/utils/math/foo.ts', to: 'src/helpers/foo.ts' }];
    const result = expandCompanions(moves, rules, existsFrom([]));
    expect(result).toEqual(moves);
  });

  it('maps a tools/ move to the tests/tools/ mirror', () => {
    const moves = [{ from: 'tools/utils/io/bar.ts', to: 'tools/lib/bar.ts' }];
    const result = expandCompanions(moves, rules, existsFrom(['tests/tools/utils/io/bar.test.ts']));
    expect(result).toContainEqual({
      from: 'tests/tools/utils/io/bar.test.ts',
      to: 'tests/tools/lib/bar.test.ts',
    });
  });

  it('picks the .test.tsx suffix when that is the file that exists', () => {
    const moves = [{ from: 'src/components/detailCardTable.ts', to: 'src/ui/detailCardTable.ts' }];
    const result = expandCompanions(
      moves,
      rules,
      existsFrom(['tests/components/detailCardTable.test.tsx']),
    );
    expect(result).toContainEqual({
      from: 'tests/components/detailCardTable.test.tsx',
      to: 'tests/ui/detailCardTable.test.tsx',
    });
  });

  it('does not expand a move whose source is already under tests/', () => {
    const moves = [{ from: 'tests/utils/foo.test.ts', to: 'tests/helpers/foo.test.ts' }];
    // Even if a "mirror of a mirror" path were probed, it must not be added.
    const result = expandCompanions(moves, rules, () => true);
    expect(result).toEqual(moves);
  });

  it('a rule with an empty root derives a sibling', () => {
    const sibling = [{ from: '', to: '', sources: ['.tsx'], suffixes: ['.module.css'] }];
    const result = expandCompanions(
      [{ from: 'a/Foo.tsx', to: 'b/Foo.tsx' }],
      sibling,
      existsFrom(['a/Foo.module.css']),
    );
    expect(result).toContainEqual({ from: 'a/Foo.module.css', to: 'b/Foo.module.css' });
  });

  it('an explicit pair overrides a derived one', () => {
    const moves = [
      { from: 'src/a.ts', to: 'src/b.ts' },
      { from: 'tests/a.test.ts', to: 'tests/elsewhere/b.test.ts' },
    ];
    const result = expandCompanions(moves, rules, existsFrom(['tests/a.test.ts']));
    expect(result).toEqual(moves);
  });

  it("a move across rules uses the destination's rule", () => {
    const result = expandCompanions(
      [{ from: 'tools/x.ts', to: 'src/x.ts' }],
      rules,
      existsFrom(['tests/tools/x.test.ts']),
    );
    expect(result).toContainEqual({ from: 'tests/tools/x.test.ts', to: 'tests/x.test.ts' });
  });

  it('a stem rename carries to the companion', () => {
    const sibling = [{ from: '', to: '', sources: ['.tsx'], suffixes: ['.module.css'] }];
    const result = expandCompanions(
      [{ from: 'a/Foo.tsx', to: 'b/Bar.tsx' }],
      sibling,
      existsFrom(['a/Foo.module.css']),
    );
    expect(result).toContainEqual({ from: 'a/Foo.module.css', to: 'b/Bar.module.css' });
  });
});
