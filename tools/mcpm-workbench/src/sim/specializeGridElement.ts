import type { GridElement } from '../../@types/GridElement';

// Textual rewrite of the linked WGSL, applied right before createShaderModule
// (rejected: `?link` runtime conditional compilation — see wesl.toml). `enable`
// must precede every declaration or WGSL fails only at createShaderModule.
export function specializeGridElement(wgsl: string, element: GridElement): string {
  if (element === 'f32') return wgsl;
  const rewritten = wgsl.replace('alias GridElem = f32;', 'alias GridElem = f16;');
  if (rewritten === wgsl) {
    throw new Error('specializeGridElement: no `alias GridElem = f32;` found to rewrite');
  }
  return `enable f16;\n${rewritten}`;
}
