/** createLabelRecords — an empty `LabelRecords` with room for `capacity` records and `glyphCapacity` glyphs. */

import type { LabelRecords } from '../../@types/rendering/LabelRecords';
import type { LoadedFontAtlases } from '../../@types/rendering/LoadedFontAtlases';
import { LABEL_RECORD_WORDS } from '../../data/labels/labelRecordLayout';
import { GLYPH_INSTANCE_BYTES } from '../../data/labels/labelBufferStrides';

export function createLabelRecords(
  capacity: number,
  glyphCapacity: number,
  metricsByFont: LoadedFontAtlases['metricsByFont'],
): LabelRecords {
  const words = new ArrayBuffer(capacity * LABEL_RECORD_WORDS * 4);
  const glyphs = new ArrayBuffer(glyphCapacity * GLYPH_INSTANCE_BYTES);
  return {
    capacity,
    count: 0,
    f32: new Float32Array(words),
    u32: new Uint32Array(words),
    glyphCapacity,
    glyphF32: new Float32Array(glyphs),
    glyphU32: new Uint32Array(glyphs),
    metricsByFont,
    source: new Uint16Array(capacity),
    anchorIds: new Array<string | null>(capacity).fill(null),
    fadeKeys: new Array<string | null>(capacity).fill(null),
    keys: new Array<string>(capacity).fill(''),
    textBox: new Float32Array(capacity * 4),
    sources: [],
    toggleAddresses: [],
    encoded: new Map(),
    generation: 0,
    dirtyFrom: 0,
    dirtyTo: 0,
  };
}
