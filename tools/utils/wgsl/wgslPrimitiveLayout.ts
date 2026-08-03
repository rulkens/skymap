/**
 * WGSL size/alignment for the primitive types skymap's uniform structs use.
 * `vec3<f32>` is the trap: 12 bytes of data on a 16-byte alignment, so a
 * following member does NOT start at +12. Undefined for anything else —
 * callers resolve their own named struct types before falling through here.
 */

export type WgslTypeLayout = { readonly size: number; readonly align: number };

const LAYOUT: Readonly<Record<string, WgslTypeLayout>> = {
  f32: { size: 4, align: 4 },
  u32: { size: 4, align: 4 },
  'vec2<f32>': { size: 8, align: 8 },
  'vec3<f32>': { size: 12, align: 16 },
  'vec4<f32>': { size: 16, align: 16 },
  'mat4x4<f32>': { size: 64, align: 16 },
};

export function wgslPrimitiveLayout(type: string): WgslTypeLayout | undefined {
  return LAYOUT[type];
}
