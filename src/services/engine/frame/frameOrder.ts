/**
 * FRAME_ORDER — the frame, hand-authored: what draws, in what order, into what.
 *
 * Order and roster are the same artifact. A line names the passes it draws, in
 * draw order, so there is no second table for it to disagree with; a name no
 * present Layer owns is dropped, and `checkFrameOrder` catches the inverse (a
 * contributed pass no line draws). The ordering rationale below is the file's
 * real value — none of it is derivable from the list, and a reader who reorders
 * without it will break something that only shows up as pixels.
 *
 * `expandFrameOrder` turns this plus the frame's own lists into the steps the
 * executor walks; see it for the expansion and step-merge rules.
 */

import type { FrameStepSpec } from '../../../@types/engine/frame/FrameStepSpec';
import { COSMO, NEAR0 } from './slabs';

export const FRAME_ORDER: readonly FrameStepSpec[] = [
  // The compute prelude. `flow` integrates the peculiar-velocity particles;
  // `atmosphereSkyView` bakes the sky-view LUT, which folds in this frame's
  // camera altitude + sun direction and so re-bakes every frame (unlike the
  // once-baked transmittance + multi-scatter LUTs). Both sit well ahead of the
  // `foreground:0` render so the atmosphere shell samples this frame's table —
  // WebGPU orders the compute write before the later fragment read. A compute
  // step contributes no timing slot.
  { kind: 'compute', name: 'flow' },
  { kind: 'compute', name: 'atmosphereSkyView' },
  // The black-hole lens's sky-cubemap bake, in the compute prelude's wake and
  // ahead of every other render step so a same-frame lensing draw can sample a
  // cubemap this frame actually wrote. The frame's face list is empty most
  // frames (outside the fade band, and in-band on every frame except the one
  // that re-bakes), and then this line emits nothing at all — the lens's
  // zero-dispatch guarantee, of which this is the capture half.
  //
  // TWO rosters because the captured content spans both slabs: the galaxy
  // billboards and textured disks project through COSMO, the survey stars
  // through NEAR0. A render step is the unit of pass encoding, so one step per
  // slab per face is what makes both halves reachable — a NEAR0-only step
  // leaves the COSMO half permanently undrawn. COSMO before NEAR0 mirrors the
  // real `(hdr, COSMO)` → `(hdr, NEAR0)` sequence below, so the capture
  // composites in the order the live frame would.
  {
    kind: 'capture',
    target: 'sky-cubemap',
    cosmoPasses: ['point-sprites', 'textured-disks'],
    near0Passes: ['star-aggregates', 'star-catalog'],
  },
  // The half-res scalar-volume raymarch into its own offscreen. It is merged
  // into HDR by the `volume-upsample` LAYER inside the hdr COSMO step below,
  // never by a whole-texture composite — so there is no `volume→hdr` line here,
  // and this render must precede that step.
  { kind: 'render', target: 'volume', slab: COSMO, passes: ['scalar-volume'] },
  // The zone-of-avoidance band raymarch — the twin of the volume render above,
  // into its own 1/5-res offscreen, merged the same way by
  // `zone-of-avoidance-upsample` inside the hdr COSMO step. That layer also
  // draws the band's full-res curved lettering straight into HDR, since MSDF
  // text can't ride a reduced-res offscreen without blurring.
  { kind: 'render', target: 'zoa', slab: COSMO, passes: ['zone-of-avoidance'] },
  // The cosmological HDR accumulation: additive rows through the COSMO slab.
  // Additive blending is commutative, so the order WITHIN this roster is a
  // listing choice — except that the two upsample rows must follow the
  // offscreen renders above that produce what they composite in.
  {
    kind: 'render',
    target: 'hdr',
    slab: COSMO,
    passes: [
      'point-sprites',
      'procedural-disks',
      'textured-disks',
      'filaments',
      'flow',
      'volume-upsample',
      'zone-of-avoidance-upsample',
      'horizon-shell',
      'structure-markers',
    ],
  },
  // The survey-star AGGREGATE stream (interior flux-mip glows) into its own
  // half-res offscreen, projected through NEAR0 — the same parsec-scale anchors
  // as the star catalog. The aggregate glow field is the fill-bound half of the
  // star pass, and half-res quarters its fragment cost. Before the hdr NEAR0
  // step so `star-upsample` inside it can composite this offscreen back in.
  { kind: 'render', target: 'star-aggregates', slab: NEAR0, passes: ['star-aggregates'] },
  // The Milky-Way twin of that offscreen: the procedural cloud's additive star
  // billboards at reduced resolution, for the same reason — a summed additive
  // glow field is low-frequency, so rendering it at 1/scale drops fragment cost
  // by the square of the divisor and costs only bilinear interpolation of
  // something already smooth. It must precede the hdr NEAR0 step below, where
  // both its consumer (`milky-way-upsample`) and the dust that extincts it live.
  { kind: 'render', target: 'mw-aggregate', slab: NEAR0, passes: ['milky-way-aggregate'] },
  // The near-field HDR roster. It projects through NEAR0 because COSMO's fixed
  // near plane (0.01 Mpc) would clip these kpc-to-parsec anchors, but it still
  // accumulates into the SAME hdr target as the cosmological rows above and
  // ahead of the one tone-map — one tone curve for stars and galaxies.
  //
  // The Milky Way LEADS, and that is load-bearing twice over. It rode the COSMO
  // group until the 10 kpc near plane clipped the disc mid-descent (the disc's
  // near edge is ~9.5 kpc from the origin), so it lives here; drawing after the
  // whole cosmological group means its MULTIPLICATIVE dust pass darkens that
  // accumulation, which is physically reasonable extinction of background
  // light. Within this roster it draws first so the local starfield below
  // (`star-points` / `star-catalog`) is never darkened by that dust — during
  // the descent those stars sit between the camera and the disc.
  //
  // `milky-way-upsample` precedes `milky-way` for the other half of the same
  // fact: the upsample folds the cloud's own starlight in, and only THEN does
  // the multiplicative dust run, so the dust extincts the cloud's stars as well
  // as the background — exactly what the single-pass version did when stars and
  // dust shared one encoder. Swapping those two leaves the cloud's stars
  // un-extincted.
  //
  // The rest is additive and so a listing choice: `star-upsample` sits beside
  // the `star-catalog` leaf draw for GPU-timing legibility, and the
  // constellation figures trail the star streams they connect. `constellations`
  // is the LAST roster row the lens line below samples.
  {
    kind: 'render',
    target: 'hdr',
    slab: NEAR0,
    passes: [
      'milky-way-upsample',
      'milky-way',
      'star-points',
      'star-catalog',
      'star-upsample',
      'constellations',
    ],
  },
  // The Sgr A* lens, on its own body-slab row(s) and blended OVER rather than
  // additively — so its position IS load-bearing in both directions. It draws
  // AFTER the roster above, so captured rays occlude the additive light already
  // accumulated behind them and escaping rays sample a sky-cubemap this frame
  // wrote; and BEFORE the line below, so those stay unwarped on top of it.
  // Outside the fade band the frame resolves no lensing row and this emits
  // nothing.
  { kind: 'lens', target: 'hdr', passes: ['sgr-a-star-lensing'] },
  // The roster slice that draws unwarped ON TOP of the lens: the sub-pixel
  // bodies (the glints branch of the body partition) as brightness-scaled
  // additive points, sibling of `star-points`. Outside the band the lens line
  // emits nothing and this merges back into the roster above — see
  // `expandFrameOrder`'s merge rule, which is what keeps the pass count
  // unchanged there.
  {
    kind: 'render',
    target: 'hdr',
    slab: NEAR0,
    passes: ['body-glints'],
    slot: 'POST_LENSING',
  },
  // The near-field foreground bodies (the zoom-to-earth fold), into their own
  // depth-bearing target. Expanded over the frame's painter-ordered chain, far
  // to near, one depth-CLEARING step per row: painter order is the occlusion
  // mechanism, so a nearer row's opaque pixels must not be test-rejected
  // against a farther row's depth. An empty chain emits no step, and the
  // composite below still runs (it no-ops on an untouched source).
  //
  // TWO rosters because the chain interleaves the NEAR0 row — the star spheres,
  // the Sun's own — with the body rows. Within each, order is depth-tested
  // opaque and so a listing choice, with two deliberate exceptions at the end:
  // `rings` and `atmosphere-shell` are the group's translucent shells. Both
  // write no depth and blend straight-alpha OVER, so they must follow every
  // opaque sphere already stamped there — the far ring half and the over-disc
  // atmosphere are then occluded, while the limb over space passes.
  // `atmosphere-shell` trails `rings` because it is the outermost of the two.
  // `cloud-shell` is the same exception placed early, immediately after the
  // `earth` surface it depth-tests against.
  {
    kind: 'foreground',
    target: 'foreground:0',
    near0Passes: ['star-spheres', 'field-star-sphere'],
    bodyPasses: ['earth', 'cloud-shell', 'planets', 'textured-bodies', 'rings', 'atmosphere-shell'],
  },
  // The bodies join the HDR accumulator in LINEAR space, before the tone-map,
  // so they ride the SAME single tone curve as the stars and galaxies — there
  // is no seam where the Sun's limb meets the cosmological scene. This is why
  // the fold is a composite and not a second tone-mapped pass.
  { kind: 'composite', source: 'foreground:0', dest: 'hdr' },
  // The roster slice that draws OVER the opaque bodies: a satellite's near arc
  // passes in front of its host. Still HDR and still ahead of bloom and the one
  // tone-map, so it rides the same curve as everything else. The composite
  // above always emits, so this line never merges back into the roster.
  {
    kind: 'render',
    target: 'hdr',
    slab: NEAR0,
    passes: ['orbit-trails'],
    slot: 'POST_FOREGROUND',
  },
  // Screen-space bloom, gated on the master toggle. ONE line, not N render
  // lines: a ping-pong mip pyramid writes the same target twice with different
  // ops (a downsample that clears, then an additive upsample that loads), which
  // the `(target, slab)` render-step model cannot express — the executor
  // re-fires every pass matching a step's group, so a reused-target upsample
  // would fire at its downsample step and read a stale, last-frame level.
  // `runBloom` opens the pyramid's ten passes in strict order instead. After
  // the body composite (the bright prefilter samples the composited scene) and
  // before the tone-map (the fold rides that one curve).
  { kind: 'bloom' },
  // The frame's ONLY tone-map: everything above accumulated in HDR, and this
  // one replace-composite compresses it to display range.
  { kind: 'tonemap', source: 'hdr', dest: 'swap' },
  // The premultiplied-OVER overlays, drawn AFTER the tone-map onto the swap
  // chain. Two reasons they are not in the HDR group: LDR-sane label colours
  // would be compressed to mid-grey by the tone curve; and on tile-based GPUs
  // an OVER blend reads `dst.color`, which goes incoherent across the pass
  // boundaries the per-layer timing strategy introduces (the additive rows
  // tolerate that invisibly, their blend not reading `dst.color` at all).
  //
  // The opaque Sun/Earth still occlude the cosmological labels behind them, but
  // that is now the COVERAGE test against the `foreground:0` depth, not draw
  // order — which is what frees these overlays to sit after the body composite.
  // `selection-ring` leads so the marker lines and labels composite over its
  // stroke.
  {
    kind: 'render',
    target: 'swap',
    slab: COSMO,
    passes: ['selection-ring', 'disk-radius-ring', 'marker-lines', 'labels'],
  },
  // The near-field overlays, last, so the scene-body captions land on top of
  // the bodies. `near0-selection-ring` is the NEAR0 sibling of the COSMO ring
  // above — same renderer and gate, projected through near0 so a picked survey
  // star, whose parsec-scale anchor COSMO's near plane would clip, rings
  // cleanly; each ring lands only in the slab whose frustum contains its
  // anchor, so the two identical gates never double-draw. `clip-path-debug` is
  // the very last thing painted in the frame, by intent.
  {
    kind: 'render',
    target: 'swap',
    slab: NEAR0,
    passes: ['near0-selection-ring', 'foreground-labels', 'clip-path-debug'],
  },
];
