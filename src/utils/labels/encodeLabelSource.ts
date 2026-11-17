/**
 * encodeLabelSource — one source's labels into `into` from record `start`: calls `items`, then
 * `describe` per item, lays out each text (memoised by `textLayoutOf`) into the glyph buffer and
 * writes the record. Returns the record count. Skipped, with the remembered count, while the
 * source's `changes` value and both start offsets are what the last encode saw: a source after
 * one whose count changed moves, and is written again. Records past `capacity` are dropped, and
 * so is a label whose glyphs do not all fit: whole, never cut off mid-word.
 */

import type { EngineState } from '../../@types/engine/state/EngineState';
import type { LabelSource } from '../../@types/engine/layer/LabelSource';
import type { LabelRecords } from '../../@types/rendering/LabelRecords';
import { LABEL_RECORD as W, LABEL_RECORD_WORDS } from '../../data/labels/labelRecordLayout';
import { LABEL_STYLES } from '../../data/labels/labelStyles';
import { FONT_IDS } from '../../data/fonts';
import { textLayoutOf } from '../../services/gpu/labelLayout/textLayoutOf';
import { writeGlyphInstances } from '../../services/gpu/labelLayout/writeGlyphInstances';
import { markRecordsDirty } from './markRecordsDirty';
import { packPickWord } from './packPickWord';
import { writeLabelRecord } from './writeLabelRecord';

export function encodeLabelSource<Item>(
  source: LabelSource<Item>,
  state: EngineState,
  into: LabelRecords,
  start: number,
): number {
  const anySource = source as LabelSource<unknown>;
  const value = source.changes?.(state);
  const before = (start - 1) * LABEL_RECORD_WORDS;
  const glyphStart =
    start === 0 ? 0 : into.u32[before + W.glyphs]! + into.u32[before + W.glyphCount]!;
  const last = into.encoded.get(anySource);
  if (
    last !== undefined &&
    Object.is(last.value, value) &&
    last.start === start &&
    last.glyphStart === glyphStart
  ) {
    return last.count;
  }

  let ordinal = into.sources.indexOf(anySource);
  if (ordinal < 0) {
    ordinal = into.sources.push(anySource) - 1;
    into.toggleAddresses.push(`label:${source.toggle}`);
  }
  const items = source.items(state);
  let at = start;
  let glyph = glyphStart;
  for (let i = 0; i < items.length && at < into.capacity; i++) {
    const description = source.describe(items[i]!, i);
    if (description === null) continue;
    const style = description.style ?? source.style;
    const row = LABEL_STYLES[style];
    const { quads, bbox } = textLayoutOf(into.metricsByFont, {
      text: description.text,
      font: row.font,
      alignX: 'center',
      // An 'above' label stands on its anchor, so the lift alone clears the subject.
      alignY: row.placement === 'above' ? 'bottom' : 'center',
    });
    if (glyph + quads.length > into.glyphCapacity) continue;
    writeGlyphInstances(quads, at, FONT_IDS.indexOf(row.font), into, glyph);
    writeLabelRecord(into, at, description, style, glyph, quads.length);

    const { position, pick } = description;
    into.source[at] = ordinal;
    into.anchorIds[at] = 'anchorId' in position ? position.anchorId : null;
    into.fadeKeys[at] = description.fadeKey ?? null;
    into.keys[at] = pick
      ? `${ordinal}:p${packPickWord(pick.code, pick.index)}`
      : `${ordinal}:i${i}`;
    into.textBox[at * 4 + 0] = bbox?.minX ?? 0;
    into.textBox[at * 4 + 1] = bbox?.minY ?? 0;
    into.textBox[at * 4 + 2] = bbox?.maxX ?? 0;
    into.textBox[at * 4 + 3] = bbox?.maxY ?? 0;
    glyph += quads.length;
    at++;
  }

  const count = at - start;
  into.encoded.set(anySource, { value, start, glyphStart, count });
  into.generation++;
  markRecordsDirty(into, start, at);
  return count;
}
