/**
 * cosmicFlows — the CF4++ peculiar-velocity showcase `Clip` (id + label +
 * serializable `ClipData`).
 *
 * Derived from the `flowShowcaseDriver` recording spike (the keeper of the
 * three throwaway `?flowshow` / `?flyout` / `?floworbit` drivers) — see
 * `docs/research/2026-06-19-camera-animation-spike-findings.md`.
 *
 * ### Why a fixed-pose (Layer 1) clip, not a live-start one
 *
 * A `start: 'live'` clip is appropriate when the beat should begin from
 * wherever the user is looking — a user-triggered "fly out", for instance.
 * `cosmicFlows` is a SCRIPTED showcase: it starts framed on the Local Group
 * (distance ~0.14 Mpc, orbit centred on the barycenter near [0, -0.01, 0])
 * to establish the Milky Way context before the flow field is revealed. That
 * moment only works from this exact vantage; a live start would rob it of
 * its structure. The baked `start` also lets `compileClip` produce a fully
 * resolved `CompiledClip` offline — no `resolveClipStart` call is needed at
 * playback time.
 *
 * ### The "load behind the mask, then reveal" idiom
 *
 * `fade(['flow'], 0, 0)` sets `clipOpacity('flow') → 0` INSTANTLY, BEFORE
 * `scene(setFlowEnabled(true))` enables the flow field. The flow
 * renderer starts loading and its `intentOpacity` begins to fade up — but
 * the clip channel's factor-0 keeps composed alpha at zero. The viewer sees
 * nothing while the GPU data arrives. The subsequent `fade(['flow'], 1, 3)`
 * lifts the clip factor over 3 seconds, smoothly revealing the now-loaded
 * field. Without the mask the intent fade would expose a half-populated
 * field mid-load.
 *
 * ### clipOpacity crossfade: galaxies stay LOADED
 *
 * `all([fade(['flow'], 1, 3), fade(['survey'], 0, 3)])` dims the galaxy
 * points and brightens the flow field using only the `clipOpacity` channel
 * — it does NOT dispatch `hide(['survey'])`. The intent store is untouched:
 * the galaxy points remain enabled, their GPU buffers remain resident, and
 * they will reappear at full opacity when the clip ends and the clip channel
 * resets to 1. This avoids a load/unload cycle mid-clip and keeps the
 * transition reversible without extra bookkeeping.
 *
 * ### Beat structure
 *
 *   I  — establish on the Milky Way; load the flow field behind the clip mask
 *   A  — crossfade: flow fades in, galaxy points fade out (both stay loaded)
 *   B  — dolly from 300 Mpc → dwell → 950 Mpc while the orbit decelerates
 *   C  — hold at the cosmic-web scale
 *   D  — fade all active layers to black on clipOpacity (transient; intent untouched)
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { Vec3 } from '../../../@types/math/Vec3';
import {
  all,
  dollyTo,
  fade,
  fork,
  hide,
  hold,
  oscillate,
  rate,
  scene,
  seq,
  wait,
} from '../../../services/engine/animation/effectHelpers';
import { setFlowEnabled } from '../../../state/settings/settingsSlice';

export const cosmicFlows: Clip = {
  id: 'cosmicFlows',
  label: 'Cosmic Flows',
  data: {
    // yaw/pitch encoded in the ecliptic default frame — same world bearing the
    // legacy Y-up pair (4.44, 0.2932) framed the Local Group with.
    start: { target: [0, -0.01, 0] as Vec3, yaw: -1.7455, pitch: -0.3589, distance: 0.14 },
    timeline: [
      wait(2), // lead-in: hold the start pose for 2 s (the forked bob still runs)
      hide(['volumesMaster', 'filaments', 'surveyLabel'], 0), // snap cosmic web off — instant intent
      fade(['flow'], 0, 0), // mask: clipOpacity(flow) → 0 before enable
      scene(setFlowEnabled(true)), // load the flow field behind the mask

      fork(oscillate('pitch', { amp: 0.09, period: 16 })), // gentle bob throughout the clip
      fork(rate('yaw', { to: 0.18, over: 1.5, ease: 'easeInCubic' })), // ease the orbit in; velocity persists

      hold(2), // I — establish on the MW

      all([fade(['flow'], 1, 3), fade(['survey'], 0, 3)]), // A — crossfade via clipOpacity only

      all([
        // B — 11 s pull-back
        seq([dollyTo(300, 4), hold(3), dollyTo(950, 4)]), //   pull → dwell → pull
        rate('yaw', { to: 0.025, over: 11, ease: 'easeInOutCubic' }), //   decelerate orbit across the whole pull
      ]),

      hold(5), // C — hold at cosmic-web scale

      fade(['flow', 'milkyWayDisk', 'structureRing', 'surveyLabel'], 0, 3), // D — fade to black
    ],
  },
};
