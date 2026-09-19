import type { PaletteTab } from '../../../src/@types/palette/PaletteTab';
import type { PaletteCard } from '../../../src/@types/palette/PaletteCard';
import type { PaletteCardCapture } from '../../../src/@types/palette/PaletteCardCapture';
import type { CaptureTarget } from './CaptureTarget';

// Plain-JSON structural equality (no key-order assumption): a card's
// `capture` is authored data — numbers, strings, booleans, one Vec3 — never
// a class instance, so recursing on own keys is exact for this shape.
function captureEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) =>
    captureEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
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
      if (card.action.kind === 'focus' && card.image === undefined) capturableCard.add(card.id);
    }
  }

  for (const id of force) {
    if (!knownId.has(id)) throw new Error(`--force '${id}' matches no card`);
    if (!capturableCard.has(id)) {
      throw new Error(
        `--force '${id}' is not capturable — every copy is a view card or has an image override`,
      );
    }
  }

  const targets: CaptureTarget[] = [];
  const resolved = new Set<string>();
  for (const t of tabs) {
    for (const card of t.cards) {
      if (resolved.has(card.id)) continue;
      if (!isCapturableCopy(card)) continue;
      resolved.add(card.id);
      if (existing.has(card.id) && !force.includes(card.id)) continue;
      targets.push({
        cardId: card.id,
        focusId: (card.action as { kind: 'focus'; focusId: string }).focusId,
        capture: card.capture ?? {},
      });
    }
  }
  return targets;
}

function isCapturableCopy(card: PaletteCard): boolean {
  return card.action.kind === 'focus' && card.image === undefined;
}
