/**
 * Why `compileClip` refused a clip: one per rule an author (or an editor's draft)
 * can break. The message carries the detail; the reason is what code branches on.
 */
export type ClipCompileReason =
  | 'twoWriters'
  | 'threeWriters'
  | 'blendWindow'
  | 'joinRefused'
  | 'seqOverlap'
  | 'cueOrder'
  | 'compositeClash'
  | 'flyPath';
