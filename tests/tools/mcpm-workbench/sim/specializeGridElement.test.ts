/**
 * specializeGridElement — the f16/f32 one-code-path lever. The .wesl sources
 * author `alias GridElem = f32;` so they stay valid standalone WGSL; this
 * function rewrites the linked output string for the f16 build.
 */
import { describe, expect, it } from 'vitest';
import { specializeGridElement } from '../../../../tools/mcpm-workbench/src/sim/specializeGridElement';

describe('specializeGridElement', () => {
  it('f32 specialisation returns the input unchanged', () => {
    const wgsl = 'alias GridElem = f32;\nstruct Foo { x: GridElem }\n';
    expect(specializeGridElement(wgsl, 'f32')).toBe(wgsl);
  });

  it('f16 specialisation rewrites the GridElem alias', () => {
    const wgsl = 'alias GridElem = f32;\nstruct Foo { x: GridElem }\n';
    const out = specializeGridElement(wgsl, 'f16');
    expect(out).toContain('alias GridElem = f16;');
    expect(out).not.toContain('= f32;');
  });

  it('f16 specialisation enables f16 exactly once, ahead of every declaration', () => {
    const wgsl =
      '@group(0) @binding(0) var<uniform> u: f32;\n' +
      'alias GridElem = f32;\n' +
      'struct Foo { x: GridElem }\n';
    const out = specializeGridElement(wgsl, 'f16');

    const enableMatches = out.match(/enable f16;/g) ?? [];
    expect(enableMatches).toHaveLength(1);

    const enableIndex = out.indexOf('enable f16;');
    const firstDeclIndex = Math.min(
      ...['alias', 'struct', '@group']
        .map((token) => out.indexOf(token))
        .filter((i) => i !== -1),
    );
    expect(enableIndex).toBeLessThan(firstDeclIndex);
  });

  it('f16 specialisation throws when no GridElem alias is present to rewrite', () => {
    const wgsl = 'struct Foo { x: f32 }\n';
    expect(() => specializeGridElement(wgsl, 'f16')).toThrow();
  });

  it('f32 specialisation passes a fragment without the alias through unchanged', () => {
    const wgsl = 'struct Foo { x: f32 }\n';
    expect(specializeGridElement(wgsl, 'f32')).toBe(wgsl);
  });
});
