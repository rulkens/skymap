/** foldCaptureFaceRows — display-only merge of a capture's six per-face timing
 * slots (`…@<key>:<face>`, `timingSlotForView`'s rule) into one row per name.
 * The slots stay per face because each face is its own command buffer and
 * query pair (`slabs.ts`); only the readout folds. A dome face's `@dome:front`
 * is NOT a capture and so not folded — the face digit is what marks one.
 * Sparklines are summed newest-aligned, since a face that began sampling later
 * carries a shorter window. */

const CAPTURE_FACE_SUFFIX = /@[^@]+:\d+$/;

type SlotReading = {
  readonly avgMs: number;
  readonly spark: readonly number[];
  readonly staleFrames: number;
};

type FoldedRow = {
  readonly name: string;
  readonly avgMs: number;
  readonly spark: readonly number[];
  readonly idle: boolean;
};

export function foldCaptureFaceRows(
  names: readonly string[],
  readingOf: (name: string) => SlotReading,
): readonly FoldedRow[] {
  const folded = new Map<string, { avgMs: number; spark: number[]; idle: boolean }>();
  for (const name of names) {
    const reading = readingOf(name);
    const key = name.replace(CAPTURE_FACE_SUFFIX, '');
    const row = folded.get(key) ?? { avgMs: 0, spark: [], idle: true };
    row.avgMs += reading.avgMs;
    row.idle &&= reading.staleFrames > 0;
    const offset = row.spark.length - reading.spark.length;
    if (offset < 0) row.spark.unshift(...new Array<number>(-offset).fill(0));
    const start = Math.max(offset, 0);
    reading.spark.forEach((ms, i) => {
      row.spark[start + i]! += ms;
    });
    folded.set(key, row);
  }
  return [...folded].map(([name, row]) => ({ name, ...row }));
}
