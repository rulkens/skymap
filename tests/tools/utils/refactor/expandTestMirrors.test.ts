import { describe, it, expect } from 'vitest';
import { expandTestMirrors } from '../../../../tools/utils/refactor/expandTestMirrors';

// fileExists is injected; back it with a Set of "existing" test files so each
// case controls exactly which mirrors are present.
const existsFrom = (present: readonly string[]) => (p: string) => present.includes(p);

describe('expandTestMirrors', () => {
  it('appends the src mirror move when the test file exists', () => {
    const moves = [{ from: 'src/utils/math/foo.ts', to: 'src/helpers/foo.ts' }];
    const result = expandTestMirrors(moves, existsFrom(['tests/utils/math/foo.test.ts']));
    expect(result).toEqual([
      ...moves,
      { from: 'tests/utils/math/foo.test.ts', to: 'tests/helpers/foo.test.ts' },
    ]);
  });

  it('leaves the moves untouched when no mirror test file exists', () => {
    const moves = [{ from: 'src/utils/math/foo.ts', to: 'src/helpers/foo.ts' }];
    const result = expandTestMirrors(moves, existsFrom([]));
    expect(result).toEqual(moves);
  });

  it('maps a tools/ move to the tests/tools/ mirror', () => {
    const moves = [{ from: 'tools/utils/io/bar.ts', to: 'tools/lib/bar.ts' }];
    const result = expandTestMirrors(moves, existsFrom(['tests/tools/utils/io/bar.test.ts']));
    expect(result).toContainEqual({
      from: 'tests/tools/utils/io/bar.test.ts',
      to: 'tests/tools/lib/bar.test.ts',
    });
  });

  it('picks the .test.tsx suffix when that is the file that exists', () => {
    const moves = [{ from: 'src/components/detailCardTable.ts', to: 'src/ui/detailCardTable.ts' }];
    const result = expandTestMirrors(
      moves,
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
    const result = expandTestMirrors(moves, () => true);
    expect(result).toEqual(moves);
  });
});
