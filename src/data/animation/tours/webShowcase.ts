/**
 * webShowcase — the "named cosmic web" hero `Tour`: strip the scene down to
 * galaxies + labelled structure rings, then fly to the Virgo Cluster and dive
 * into M87, the cluster's brightest member.
 *
 * Derived from the `webShowcaseDriver` recording spike (`?webshow`) — see
 * `docs/research/2026-06-19-camera-animation-spike-findings.md`. Unlike the
 * camera-only spikes (`flyout`, `flowOrbit`) and the fixed-pose `cosmicFlows`
 * clip, this one resolves its camera framing from durable structure and famous-
 * galaxy ids at playback time — the guided-tour path (`visitBeatSaga` →
 * `flyToClip` / `flyAndFocusOnClip`) — so it is a `Tour`, not a static `Clip`.
 *
 * ### Scene setup
 *
 * `setup.effects` strips the scene before the first beat: cosmic-web volumes,
 * filaments, and famous-galaxy labels all OFF, leaving galaxy points + structure
 * rings + their names. The guided-tour snapshot/restore pair winds all three
 * back when the tour exits, so these changes are transient.
 *
 * ### Beats
 *
 *   1. Milky Way — the establishing wide read on the named cosmic web.
 *      Camera-only (`flyToClip`): no focus change; the scene is already stripped
 *      by `setup.effects`.
 *   2. Virgo Cluster — `flyAndFocusOnClip` fires a `focus(id)` cue at beat
 *      start, then moves the camera in. The focus cue isolates the cluster:
 *      members stay bright, the rest of the sky recedes via `focusRecession`.
 *   3. M87 Galaxy — `flyToClip` moves only the camera to M87 (Virgo A, the
 *      cluster's dominant member). It does NOT dispatch a focus cue, so
 *      `selection.focus` stays on `cluster-virgo-m87` from beat 2. M87 —
 *      a cluster member — rides bright under the isolation dim while the rest
 *      of the sky remains receded. The dive is the focus composition doing its
 *      job: beat 2 owns the "what is focused", beat 3 owns "where the camera is".
 *
 * ### Why no camera tween during the dive
 *
 * The `focus()` cue in beat 2's clip fires while `camera.clip !== null`.
 * `suspendDuringClip` parks `watchFocusTweenSaga` for the duration of any
 * active clip, so the cue updates `selection.focus` without planting a
 * `camera.tween`. The tween that would normally chase a focus change is skipped
 * entirely — the clip@95 driver already owns the camera and will arrive at the
 * correct framing on its own timeline.
 */

import type { Tour } from '../../../@types/animation/tour/Tour';
import {
  setFilamentsEnabled,
  setGalaxyCatalogLabelEnabled,
  setVolumesEnabled,
} from '../../../state/settings/settingsSlice';
import { flyToClip } from '../../../state/tour/flyToClip';
import { flyAndFocusOnClip } from '../../../state/tour/flyAndFocusOnClip';
import { focusId } from '../../../utils/animation/focusId';

export const webShowcase: Tour = {
  id: 'webShowcase',
  label: 'Named Cosmic Web',
  setup: {
    effects: [
      setVolumesEnabled(false),
      setFilamentsEnabled(false),
      setGalaxyCatalogLabelEnabled({ id: 'famousGalaxy', enabled: false }),
    ],
  },
  beats: [
    {
      caption: {
        title: 'The Milky Way',
        body: "Home — a few hundred billion stars, and the one vantage point in this entire map you're looking out **from**.",
        position: 'bottom-left',
      },
      dwellSec: 4,
      clip: flyToClip(focusId('milkyWay')),
    },
    {
      caption: {
        title: 'The Virgo Cluster',
        body: 'Two thousand galaxies bound by gravity — the dense heart of the supercluster we call **home**, 54 million light-years away.',
        position: 'bottom-left',
      },
      dwellSec: 6,
      clip: flyAndFocusOnClip(focusId('cluster-virgo-m87')),
    },
    {
      caption: {
        title: 'M87',
        body: "The cluster's giant — a trillion stars around a black hole six billion times the Sun's mass, the **first ever photographed**.",
        position: 'bottom-right',
      },
      dwellSec: 6,
      clip: flyToClip(focusId('m87')),
    },
  ],
};
