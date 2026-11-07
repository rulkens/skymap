/**
 * easeEndSlopes — an ease's slope (d progress / d u) at u = 0 and u = 1, from a
 * one-sided difference so it reads the curve inside [0, 1] (the input clamps).
 * A matched join keeps it at the segment's other, unmatched end.
 */
import type { Ease } from '../../../@types/animation/Ease';
import { EASE } from './ease';

const H = 1e-4;

export function easeEndSlopes(ease: Ease): { readonly start: number; readonly end: number } {
  const f = EASE[ease];
  return { start: (f(H) - f(0)) / H, end: (f(1) - f(1 - H)) / H };
}
