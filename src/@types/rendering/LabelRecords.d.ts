import type { LabelSource } from '../engine/layer/LabelSource';
import type { LabelAddress } from '../animation/LabelAddress';
import type { LoadedFontAtlases } from './LoadedFontAtlases';

/**
 * One director's encoded labels: the GPU record words (`LABEL_RECORD`), the glyph instances
 * they index, and the CPU columns the per-frame stages read, all sized to `capacity` once.
 * Sources own contiguous record and glyph ranges, in the order they are encoded.
 */
export type LabelRecords = {
  readonly capacity: number;
  /** Records in use, from 0; the director sets it after encoding every source. */
  count: number;
  /** `LABEL_RECORD_WORDS` per record, one buffer viewed both ways. */
  readonly f32: Float32Array;
  readonly u32: Uint32Array;
  readonly glyphCapacity: number;
  /** `GLYPH_INSTANCE_BYTES / 4` words per glyph, one buffer viewed both ways. */
  readonly glyphF32: Float32Array;
  readonly glyphU32: Uint32Array;
  /** Text is laid out at encode time, so records exist only once the font atlases have loaded. */
  readonly metricsByFont: LoadedFontAtlases['metricsByFont'];
  /** Per record: its source's ordinal in the director's `sources`. */
  readonly source: Uint16Array;
  /** Per record: the body id `resolveAnchors` places it at each frame, or null for a fixed position. */
  readonly anchorIds: (string | null)[];
  /** Per record: the item of the toggle's per-item fade it reads, or null. */
  readonly fadeKeys: (string | null)[];
  /** Per record: source ordinal plus pick word or item index; fade state follows it across a re-encode. */
  readonly keys: string[];
  /** Per record: the text's ink box in atlas px (minX, minY, maxX, maxY); zeros when it has no ink. */
  readonly textBox: Float32Array;
  /** Ordinal → its source's toggle address, built once so a frame formats no strings. */
  readonly toggleAddresses: LabelAddress[];
  /** Per source: what its last encode saw, so an unchanged source is not described again. */
  readonly encoded: Map<
    LabelSource<unknown>,
    {
      readonly value: unknown;
      readonly start: number;
      readonly glyphStart: number;
      readonly count: number;
    }
  >;
  /** Bumped by every encode that writes; stages holding per-record state re-key on a change. */
  generation: number;
  /** Records [dirtyFrom, dirtyTo) changed since the last upload; from ≥ to when clean. */
  dirtyFrom: number;
  dirtyTo: number;
};
