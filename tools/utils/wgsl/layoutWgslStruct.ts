/**
 * WGSL structure-member layout: each member starts at its own alignment, and
 * the struct's size rounds up to its largest member alignment. `resolve` maps
 * a type name to its layout, so a caller can hand back a nested struct's
 * measured layout before falling through to `wgslPrimitiveLayout`.
 *
 * The uniform address space additionally rounds nested-struct member
 * alignment up to 16; a caller whose nested struct is not already 16-aligned
 * has to apply that itself.
 */
import type { WgslStructField } from './parseWgslStructFields';
import type { WgslTypeLayout } from './wgslPrimitiveLayout';

const roundUp = (align: number, n: number): number => Math.ceil(n / align) * align;

export function layoutWgslStruct(
  fields: readonly WgslStructField[],
  resolve: (type: string) => WgslTypeLayout,
): { readonly offsets: ReadonlyMap<string, number>; readonly layout: WgslTypeLayout } {
  const offsets = new Map<string, number>();
  let offset = 0;
  let structAlign = 1;
  for (const { name, type } of fields) {
    const { size, align } = resolve(type);
    offset = roundUp(align, offset);
    offsets.set(name, offset);
    offset += size;
    structAlign = Math.max(structAlign, align);
  }
  return { offsets, layout: { size: roundUp(structAlign, offset), align: structAlign } };
}
