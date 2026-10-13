/**
 * Star records as the vertex stage reads them (`vertex.wesl`): two u32 per record,
 * the photometry re-quantised to the frozen LUT indices (the columns hold bin centres,
 * so nothing is lost). w0 = x | y << 16; w1 = z | absMagIdx << 16 | colorIdx << 23.
 */
import type { StarColumns } from '../../@types/data/starCatalog/StarColumns';
import { absMagToLutIndex, bpRpToColorIdx } from '../../data/starCatalog/starCatalogFormat';

export const GPU_RECORD_WORDS = 2;
export const GPU_ABSMAG_SHIFT = 16;
export const GPU_COLOR_SHIFT = 23;
const GPU_Y_SHIFT = 16;

export function packStarGpuRecords(records: StarColumns): Uint32Array {
  const { count, offset, absMag, colourIndex } = records;
  const out = new Uint32Array(count * GPU_RECORD_WORDS);
  for (let r = 0; r < count; r++) {
    out[r * GPU_RECORD_WORDS] = offset[3 * r]! | (offset[3 * r + 1]! << GPU_Y_SHIFT);
    out[r * GPU_RECORD_WORDS + 1] =
      offset[3 * r + 2]! |
      (absMagToLutIndex(absMag[r]!) << GPU_ABSMAG_SHIFT) |
      (bpRpToColorIdx(colourIndex[r]!) << GPU_COLOR_SHIFT);
  }
  return out;
}
