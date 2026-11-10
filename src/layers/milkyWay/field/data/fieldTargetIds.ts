import type { FieldTargetId } from '../@types/FieldTargetId';

/** Every field target, in encode order: the dust map first, because the field and every HII pass read it. */
export const FIELD_TARGET_IDS: readonly FieldTargetId[] = [
  'dustMap',
  'field',
  'shells',
  'young',
  'dig',
  'extras',
];
