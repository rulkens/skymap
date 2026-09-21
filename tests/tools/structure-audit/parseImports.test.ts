import { describe, expect, it } from 'vitest';
import { parseImports } from '../../../tools/structure-audit/parseImports';

describe('parseImports', () => {
  it('reads every import form the dead-export audit depends on', () => {
    const source = [
      `import { a, b as c } from './x';`,
      `import type { T } from './t';`,
      `import Def, { type U, v } from './d';`,
      `import * as ns from './n';`,
      `export { r as s } from './re';`,
      `export * from './star';`,
      `const lazy = () => import('./dyn');`,
      `import { fromPkg } from 'react';`,
    ].join('\n');
    const byspec = Object.fromEntries(parseImports(source).map((p) => [p.spec, p]));
    expect(byspec['./x']).toEqual({ spec: './x', typeOnly: false, names: ['a', 'b'] });
    expect(byspec['./t']).toEqual({ spec: './t', typeOnly: true, names: ['T'] });
    expect(byspec['./d']?.names).toEqual(['default', 'U', 'v']);
    expect(byspec['./n']?.names).toEqual(['*']);
    expect(byspec['./re']?.names).toEqual(['r']);
    expect(byspec['./star']?.names).toEqual(['*']);
    expect(byspec['./dyn']?.names).toEqual(['*']);
    expect(byspec['react']?.names).toEqual(['fromPkg']);
  });
});
