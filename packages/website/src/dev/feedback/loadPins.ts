import { recall } from '../overlay/recall';
import type { FeedbackPin } from './@types/FeedbackPin';
import { pinsKey } from './pinsKey';

/** This page's pins as last kept, or none when nothing (or nothing readable) is kept. */
export function loadPins(): FeedbackPin[] {
  try {
    return JSON.parse(recall(pinsKey()) ?? '[]') as FeedbackPin[];
  } catch {
    return [];
  }
}
