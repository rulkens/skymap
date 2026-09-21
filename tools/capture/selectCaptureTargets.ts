import type { PaletteTab } from '../../src/@types/palette/PaletteTab';
import type { PaletteCard } from '../../src/@types/palette/PaletteCard';
import type { PaletteCardCapture } from '../../src/@types/palette/PaletteCardCapture';
import type { CaptureTarget } from './@types/CaptureTarget';
import { captureEqual } from './captureEqual';
import { isCapturableCopy } from './isCapturableCopy';

/** Table dispatch on the card's action: a new action kind is one arm here. */
function targetFor(
  cardId: string,
  action: PaletteCard['action'],
  capture: PaletteCardCapture,
): CaptureTarget {
  if (action.kind === 'focus') return { cardId, kind: 'focus', focusId: action.focusId, capture };
  if (action.kind === 'view') return { cardId, kind: 'view', viewId: action.viewId, capture };
  return { cardId, kind: 'pose', capture };
}

/**
 * selectCaptureTargets — which cards `npm run capture-featured` should shoot,
 * one per card id even when it repeats across tabs. Every copy of a repeated
 * id must agree on `capture` (skipped copies included), so a curator editing
 * one copy can't silently orphan another's framing.
 */
export function selectCaptureTargets(
  tabs: readonly PaletteTab[],
  existing: ReadonlySet<string>,
  force: readonly string[],
): CaptureTarget[] {
  const capturableCard = new Set<string>();
  const knownId = new Set<string>();
  const captureById = new Map<string, PaletteCardCapture | undefined>();
  for (const t of tabs) {
    for (const card of t.cards) {
      knownId.add(card.id);
      if (captureById.has(card.id)) {
        if (!captureEqual(captureById.get(card.id), card.capture)) {
          throw new Error(`card '${card.id}' has conflicting capture overrides across its copies`);
        }
      } else {
        captureById.set(card.id, card.capture);
      }
      if (isCapturableCopy(card)) capturableCard.add(card.id);
    }
  }

  for (const id of force) {
    if (!knownId.has(id)) throw new Error(`--force '${id}' matches no card`);
    if (!capturableCard.has(id)) {
      throw new Error(`--force '${id}' is not capturable — every copy has an image override`);
    }
  }

  const targets: CaptureTarget[] = [];
  const resolved = new Set<string>();
  for (const t of tabs) {
    for (const card of t.cards) {
      if (resolved.has(card.id)) continue;
      if (!isCapturableCopy(card)) continue;
      // A tour card has nothing to fly to: its beats carry clips, not a focus
      // id, and it has no registry pose the way a view card does. So its own
      // `capture.pose` is the whole framing, and a tour card without one is a
      // curator error — the same call `shotPose` makes for a poseless shot.
      if (card.action.kind === 'tour' && card.capture?.pose === undefined) {
        throw new Error(`tour card '${card.id}' needs a capture.pose — it has nothing to fly to`);
      }
      resolved.add(card.id);
      if (existing.has(card.id) && !force.includes(card.id)) continue;
      targets.push(targetFor(card.id, card.action, card.capture ?? {}));
    }
  }
  return targets;
}
