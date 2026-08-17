import type { GridElement } from '../../@types/GridElement';

/**
 * Rewrites `alias GridElem = f32;` and prepends `enable f16;` for the f16
 * build. Operates on the already-linked WGSL string, immediately before
 * `createShaderModule` — the .wesl sources author `f32` so they stay valid
 * standalone WGSL for the probe/editor. Rejected: `?link` runtime
 * conditional compilation, which the root wesl.toml deliberately avoids.
 *
 * `enable` directives must precede every declaration in WGSL (fails only at
 * `createShaderModule`, not at parse time), so the enable line is prepended
 * rather than inserted next to the alias.
 */
export function specializeGridElement(wgsl: string, element: GridElement): string {
  if (element === 'f32') return wgsl;
  return `enable f16;\n${wgsl.replace('alias GridElem = f32;', 'alias GridElem = f16;')}`;
}
