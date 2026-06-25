/**
 * webShowcase — the "named cosmic web" hero `Tour`: strip the scene down to
 * galaxies + labelled structure rings, then fly to the Virgo Cluster and let the
 * focus isolate its members.
 *
 * Derived from the `webShowcaseDriver` recording spike (`?webshow`) — see
 * `docs/research/2026-06-19-camera-animation-spike-findings.md`. Unlike the
 * camera-only spikes (`flyout`, `flowOrbit`) and the fixed-pose `cosmicFlows`
 * clip, this one resolves its camera framing from durable structure ids at
 * playback time — the guided-tour path (`visitBeatSaga` → `flyToClip`) — so it
 * is a `Tour`, not a static `Clip`.
 *
 * ### Beats
 *
 *   1. Milky Way — the establishing wide read. Its `effects` strip the scene to
 *      the labelled web: cosmic-web volumes + filaments OFF and famous-galaxy
 *      labels OFF, leaving galaxy points + structure rings + their names. The
 *      guided-tour snapshot/restore pair winds all three back at tour end, so
 *      these are transient for the run.
 *   2. Virgo Cluster — fly in and dwell. A structure `focus` isolates the
 *      cluster automatically: members stay bright, the rest of the sky recedes
 *      (the `focusRecession` dim). This is the spike's "click a ring" beat,
 *      driven by the durable `cluster-virgo-m87` id rather than a synthesized
 *      pointer event.
 *
 * ### Divergence from the spike: the M87 dive is not here YET
 *
 * The spike's finale dived from Virgo's ring down to M87 (Virgo A) while keeping
 * Virgo focused, so M87 — a member — stayed bright against the dimmed sky. That
 * beat is intentionally omitted for now: a galaxy `SelectionRef` is POSITIONAL
 * (source + index), which drifts on a tier swap, so a tour beat cannot name M87
 * durably the way it names Virgo. Adding a stable galaxy-focus handle (and the
 * "dive to a member without dropping the structure isolation" framing) is a
 * dedicated follow-up; the M87 beat lands once that ships.
 */

import type { Tour } from '../../../@types/animation/tour/Tour';
import {
  setVolumesEnabled,
  setFilamentsEnabled,
  setGalaxyCatalogLabelEnabled,
} from '../../../state/settings/settingsSlice';

export const webShowcase: Tour = {
  id: 'webShowcase',
  label: 'Named Cosmic Web',
  beats: [
    {
      focus: { type: 'milkyWay' },
      caption: 'The named cosmic web',
      dwellSec: 4,
      // Strip to galaxies + structure rings + names. Restored at tour end by the
      // guidedTourSaga snapshot/restore pair.
      effects: [
        setVolumesEnabled(false),
        setFilamentsEnabled(false),
        setGalaxyCatalogLabelEnabled({ id: 'famousGalaxy', enabled: false }),
      ],
    },
    {
      focus: { type: 'structure', id: 'cluster-virgo-m87' },
      caption: 'The Virgo Cluster',
      dwellSec: 6,
    },
  ],
};
