/**
 * FieldTargetId — the one key set for the field's targets, divisors, target
 * rows and timing. `'extras'` is the background extras' HII target; every HII
 * segment label is `` `hii:${id}` `` for `extras` and the three tiers.
 */
import type { HiiTier } from '../starFormation/@types/HiiTier';

export type FieldTargetId = 'field' | 'dustMap' | 'extras' | HiiTier;
