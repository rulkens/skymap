/**
 * fadeLayers — the fade-ownership manifest: every fadeable layer as one row, walked
 * once by `seedFades` at bootstrap. The ONE site that calls `fades.register`.
 *
 * Seeds are settings-derived, not a blanket 1.0 — a disabled layer seeded at 1
 * draws on frame 1 before its fade-out fires, and an enabled layer seeded at 0 is
 * invisible until `fadeTo(1)` finishes. Demand-loaded rows are the exception: with
 * no payload at construction they seed at 0 and fade IN on arrival, an asymmetry
 * carried per row as a `seed()` closure rather than one branch over a flag.
 */

import type { FadeLayer } from '../../../@types/animation/FadeLayer';
import type { EngineState } from '../../../@types/engine/state/EngineState';

import { STRUCTURE_IDS } from '../../../data/structure/structureIds';
import { SOURCE_ENTRIES } from '../../../data/sourceEntries';
import { fadeLayerRow } from '../../../utils/animation/fadeLayerRow';

// Narrowed to label-bearing bodies because the COMPILER insists: `item` must be a
// `LabelCategory`, so `BODY_IDS` (the settings key domain) is the wider set.
const LABEL_BEARING_BODY_IDS = SOURCE_ENTRIES.filter((e) => e.type === 'body' && e.bearsLabel).map(
  (e) => e.id,
);

export const FADE_LAYERS = [
  fadeLayerRow({
    key: 'milkyWayDisk',
    expand: () => [undefined],
    handle: () => ({ kind: 'milkyWay' }),
    seed: (s) => (s.milkyWay.enabled ? 1 : 0),
    intent: (s) => s.milkyWay.enabled,
  }),
  fadeLayerRow({
    key: 'proceduralDisks',
    expand: () => [undefined],
    handle: () => ({ kind: 'overlay', id: 'proceduralDisks' }),
    seed: () => 1,
  }),
  fadeLayerRow({
    key: 'texturedDisks',
    expand: () => [undefined],
    handle: () => ({ kind: 'overlay', id: 'texturedDisks' }),
    seed: () => 1,
  }),
  fadeLayerRow({
    key: 'milkyWayLabel',
    expand: () => [undefined],
    handle: () => ({ kind: 'labelLayer', layer: 'milkyWay' }),
    seed: (s) => (s.milkyWay.labelEnabled ? 1 : 0),
    intent: (s) => s.milkyWay.labelEnabled,
  }),
  // scene-body captions — per LABEL-BEARING BodyId, settings-derived seed
  // (bodies are seeded in code, so no demand-loaded guard). Not every body row
  // captions itself: the S-stars draw 39 dots and no names, and a handle for a
  // caption that cannot exist would be worse than the unread ones below.
  fadeLayerRow({
    key: 'bodyLabel',
    expand: () => LABEL_BEARING_BODY_IDS,
    handle: (id) => ({ kind: 'labelLayer', layer: 'body', item: id }),
    seed: (s, id) => (s.bodies.items[id].labelEnabled ? 1 : 0),
    intent: (s, id) => s.bodies.items[id].labelEnabled,
  }),
  fadeLayerRow({
    key: 'scaleBar',
    expand: () => [undefined],
    handle: () => ({ kind: 'labelLayer', layer: 'scaleBar' }),
    seed: () => 1,
  }),
  fadeLayerRow({
    key: 'structureRing',
    expand: () => STRUCTURE_IDS,
    handle: (id) => ({ kind: 'structure', id }),
    seed: (s, id) => (s.structures.items[id].enabled ? 1 : 0),
    intent: (s, id) => s.structures.items[id].enabled,
  }),
  fadeLayerRow({
    key: 'structureLabel',
    expand: () => STRUCTURE_IDS,
    handle: (id) => ({ kind: 'labelLayer', layer: 'structure', item: id }),
    seed: (s, id) => (s.structures.items[id].labelEnabled ? 1 : 0),
    intent: (s, id) => s.structures.items[id].labelEnabled,
  }),
  // The conic table is a compile-time constant with no asset slot, so no
  // demand-loaded guard and the seed follows the toggle: a default-on session must
  // not flash the trails in on frame 1.
  fadeLayerRow({
    key: 'orbitTrails',
    expand: () => [undefined],
    handle: () => ({ kind: 'orbitTrails' }),
    seed: (s) => (s.orbitTrails.enabled ? 1 : 0),
    intent: (s) => s.orbitTrails.enabled,
  }),
] satisfies readonly FadeLayer<unknown>[];

// Called once at bootstrap from `wireSlots`. `register` is idempotent, so manifest
// order is diff-stability only — no row can clobber another.
export function seedFades(state: EngineState): void {
  const { settings } = state;
  const fades = state.subsystems.fades;
  for (const row of state.fadeRows) {
    for (const item of row.expand(state)) {
      fades.register(row.handle(item), row.seed(settings, item));
    }
  }
}
