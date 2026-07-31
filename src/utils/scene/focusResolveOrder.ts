/**
 * focusResolveOrder — order element rows so each row's focus is already placed
 * by the time the row is reached. Anchors are the roots; every other row follows
 * its own focus, depth first.
 *
 * The alternative — one pass for heliocentric rows, then one for the rest — bets
 * that no focus chain exceeds a single hop. Depth belongs in the data, not in a
 * count of passes. The graph is authored and static, so a caller resolves the
 * order once and replays it per frame; a cycle or a dangling focus throws here,
 * rather than leaving a body silently at the origin.
 */

import type { AnchorBody } from '../../@types/scene/AnchorBody';
import type { OrbitalElements } from '../../@types/scene/OrbitalElements';

export function focusResolveOrder(
  anchors: readonly AnchorBody[],
  elements: readonly OrbitalElements[],
): readonly OrbitalElements[] {
  const anchorIds = new Set(anchors.map((anchor) => anchor.id));
  const byId = new Map(elements.map((el) => [el.id, el]));
  const order: OrbitalElements[] = [];
  const placed = new Set<string>();
  // The chain being walked right now. A row that reappears in it closes a cycle,
  // and the slice from its first occurrence names every id on that cycle.
  const chain: string[] = [];

  const place = (el: OrbitalElements): void => {
    if (placed.has(el.id)) return;
    const loopsAt = chain.indexOf(el.id);
    if (loopsAt !== -1) {
      const loop = [...chain.slice(loopsAt), el.id].join(' -> ');
      throw new Error(`focusResolveOrder: focus cycle ${loop}`);
    }
    if (!anchorIds.has(el.focusId)) {
      const focus = byId.get(el.focusId);
      if (focus === undefined) {
        throw new Error(`focusResolveOrder: '${el.id}' names unknown focus '${el.focusId}'`);
      }
      chain.push(el.id);
      place(focus);
      chain.pop();
    }
    placed.add(el.id);
    order.push(el);
  };

  // Table order drives the walk, so rows whose focus is already placed keep it —
  // the emitted order is the authored one with ancestors pulled ahead.
  for (const el of elements) place(el);
  return order;
}
