import type { PaletteTab } from '../../src/@types/palette/PaletteTab';
import type { PaletteCard } from '../../src/@types/palette/PaletteCard';
import type { PaletteCardCapture } from '../../src/@types/palette/PaletteCardCapture';
import type { CaptureTarget } from './@types/CaptureTarget';
import { captureEqual } from './captureEqual';
import { isCapturableCopy } from './isCapturableCopy';
import { OUTPUT_DIR, STRUCTURE_OUTPUT_DIR } from './featuredDefaults';

/** Table dispatch on the card's action: a new action kind is one arm here. */
function targetFor(
  cardId: string,
  action: PaletteCard['action'],
  capture: PaletteCardCapture,
): CaptureTarget {
  const outPath = `${OUTPUT_DIR}/${cardId}.webp`;
  if (action.kind === 'focus') {
    return { cardId, kind: 'focus', focusId: action.focusId, capture, outPath };
  }
  if (action.kind === 'exhibit') {
    return { cardId, kind: 'exhibit', exhibitId: action.exhibitId, capture, outPath };
  }
  return { cardId, kind: 'pose', capture, outPath };
}

/**
 * selectCaptureTargets — which shots `npm run capture-featured` should take:
 * one per palette card (even when its id repeats across tabs), then one per
 * cosmic-scale structure id, framed on the structure with its selection kept.
 * `existing` holds output paths, so a card and a structure sharing a stem
 * (`supercluster-coma-sc`) skip independently. Every copy of a repeated card
 * id must agree on `capture` (skipped copies included), so a curator editing
 * one copy can't silently orphan another's framing.
 */
export function selectCaptureTargets(
  tabs: readonly PaletteTab[],
  structureIds: readonly string[],
  existing: ReadonlySet<string>,
  force: readonly string[],
): CaptureTarget[] {
  const capturableCard = new Set<string>();
  const knownId = new Set<string>(structureIds);
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
    if (!knownId.has(id)) throw new Error(`--force '${id}' matches no card or structure`);
    if (!capturableCard.has(id) && !structureIds.includes(id)) {
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
      // id, and it has no registry pose the way an exhibit card does. So its
      // own `capture.pose` is the whole framing, and a tour card without one
      // is a curator error — the same call `shotPose` makes for a poseless shot.
      if (card.action.kind === 'tour' && card.capture?.pose === undefined) {
        throw new Error(`tour card '${card.id}' needs a capture.pose — it has nothing to fly to`);
      }
      resolved.add(card.id);
      const target = targetFor(card.id, card.action, card.capture ?? {});
      if (existing.has(target.outPath) && !force.includes(card.id)) continue;
      targets.push(target);
    }
  }
  for (const id of structureIds) {
    const outPath = `${STRUCTURE_OUTPUT_DIR}/${id}.webp`;
    if (existing.has(outPath) && !force.includes(id)) continue;
    targets.push({
      cardId: id,
      kind: 'focus',
      focusId: id,
      capture: { keepFocus: true },
      outPath,
    });
  }
  return targets;
}
