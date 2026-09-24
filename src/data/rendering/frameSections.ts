/**
 * PRELUDE / SCENE / POST / OVERLAYS — `FRAME_ORDER`, split into the scopes
 * `renderFrame` walks (`ViewRig.program`): `once` runs against the frame's
 * main context, `perView` runs once per rig view. The per-line rationale
 * below is this file's real value, unchanged by the split — see `frameOrder.ts`.
 */

import type { FrameSection } from '../../@types/engine/frame/FrameSection';
import { COSMO, NEAR0 } from '../../services/engine/frame/slabs';

export const PRELUDE: FrameSection = {
  scope: 'once',
  steps: [
    // The section's plan rows, always first (`checkFrameOrder`'s boot rule):
    // the galaxy catalog's disk-planner walk, the flow renderer's
    // reconcile-and-vote and the star LOD fade advance, before any GPU step
    // reads what they publish (`runPlanSteps`).
    { kind: 'plan', name: 'galaxy-catalog' },
    { kind: 'plan', name: 'flow' },
    // Ahead of the sky captures below, which read the cut it sets.
    { kind: 'plan', name: 'star-catalog' },
    // The compute prelude. `flow` integrates the peculiar-velocity particles;
    // `sky-view` bakes its LUT, which folds in this frame's camera altitude + sun
    // direction and so re-bakes every frame (unlike the once-baked transmittance
    // + multi-scatter LUTs). Both sit well ahead of the `foreground:0` render so
    // the atmosphere shell samples this frame's table — WebGPU orders the compute
    // write before the later fragment read. Each step bills `<name>-compute` and
    // toggles under it (`computeTimingSlotName`); the suffix is what keeps `flow`
    // here apart from the ribbon pass of that name. `aerial-perspective` moved to
    // `SCENE` — the froxel bake is per-view now, not once here.
    { kind: 'compute', name: 'flow' },
    { kind: 'compute', name: 'sky-view' },
    // The sky captures, in the compute prelude's wake and ahead of every
    // other render step so a same-frame lensing draw can sample a cubemap this
    // frame actually wrote. The frame's face list for a key is empty most
    // frames (outside the fade band, and in-band on every frame except the one
    // that re-bakes), and then this line emits nothing at all — the lens's
    // zero-dispatch guarantee, of which this is the capture half.
    //
    // Both rows bake the same roster from the same eye, one after the other:
    // `solarSystem` is the star field a reflection probe is captured over, and
    // parallax across the solar system is sub-texel on its 256² faces.
    //
    // TWO rosters because the captured content spans both slabs: the galaxy
    // billboards and textured disks project through COSMO, the survey stars
    // through NEAR0. A render step is the unit of pass encoding, so one step per
    // slab per face is what makes both halves reachable — a NEAR0-only step
    // leaves the COSMO half permanently undrawn. COSMO before NEAR0 mirrors the
    // real `(hdr, COSMO)` → `(hdr, NEAR0)` sequence below, so the capture
    // composites in the order the live frame would. A pass joins these rosters
    // only if its draw reads `view`/`ctx`/`state` alone: a capture step hands it
    // a SYNTHETIC per-face ctx, never the frame's real camera.
    {
      kind: 'capture',
      captures: ['sgrAStar', 'solarSystem'],
      cosmoPasses: ['point-sprites', 'textured-disks'],
      near0Passes: ['star-aggregates', 'star-catalog'],
      bodyPasses: [],
    },
    // The reflection probe of this frame's one subject mesh body, after the sky
    // line so its blit samples a `solarSystem` bake this frame may have written.
    // Its roster is the sky blit plus the subject's HOST body row, and no more:
    // `mesh-bodies` is excluded because the subject would draw into its own
    // probe; `star-spheres` / `field-star-sphere` because the Sun stays analytic
    // (a sub-pixel Sun would smear through the prefilter into a false highlight);
    // `body-glints` / `orbit-trails` because neither is environment a surface
    // reflects. The NEAR0 roster is empty on purpose — the blit rides COSMO — so
    // a probe face opens two steps, not three. `atmosphere-shell` is excluded
    // because it classifies its rays by a sampled scene depth, which a capture
    // face never resolves, and its pipeline carries no depth state to draw into
    // a face's depth-attached step with: a probe reflects the body and its sky,
    // not that body's limb glow.
    {
      kind: 'capture',
      captures: ['probe'],
      cosmoPasses: ['sky-cubemap-blit'],
      near0Passes: [],
      bodyPasses: ['earth', 'surface-tiles', 'cloud-shell', 'planets', 'textured-bodies', 'rings'],
    },
  ],
};

export const SCENE: FrameSection = {
  scope: 'perView',
  steps: [
    // The section's plan row, always first (`checkFrameOrder`'s boot rule):
    // this view's markers, sized and culled from its own eye, before its
    // first GPU step opens (`runPlanSteps`).
    { kind: 'plan', name: 'structure-markers' },
    // `aerial-perspective` bakes the froxel volume its apply row (below) reads,
    // now once PER VIEW: each view is its own submit, so a view's bake always
    // lands before that view's apply and after the previous view's — no line
    // among the once-scope PRELUDE computes could give it that ordering.
    { kind: 'compute', name: 'aerial-perspective' },
    // The reduced-res cosmic-web density raymarch into its own offscreen. It is
    // merged into HDR by the `cosmic-web-density-upsample` pass inside the hdr
    // COSMO step below, never by a whole-texture composite — so there is no
    // `cosmic-web-density→hdr` line here, and this render must precede that step.
    { kind: 'render', target: 'cosmic-web-density', slab: COSMO, passes: ['cosmic-web-density'] },
    // The zone-of-avoidance band raymarch — the twin of the density render above,
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
        'cosmic-web-filaments',
        'flow',
        'cosmic-web-density-upsample',
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
    // `local-bubble` FOLLOWS `milky-way` immediately, and that is NOT a listing
    // choice: the dust multiply already ran as part of `milky-way`'s own draw
    // call, so anything accumulated into hdr AFTER it is untouched by that
    // extinction — the shell's additive Fresnel glow would otherwise darken
    // along with the cosmological background behind it.
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
        'local-bubble',
        'star-points',
        'star-catalog',
        'star-upsample',
        'constellations',
      ],
    },
    // The blackHoles Layer's lens, on its own body-slab row(s) and blended OVER
    // rather than additively — so its position IS load-bearing in both
    // directions. It draws AFTER the roster above, so captured rays occlude the
    // additive light already accumulated behind them and escaping rays sample a
    // sky-cubemap this frame wrote; and BEFORE the line below, so those stay
    // unwarped on top of it.
    // Outside the fade band the frame resolves no lensing row and this emits
    // nothing.
    { kind: 'render', target: 'hdr', slab: 'lens', passes: ['black-hole-lensing'] },
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
    // opaque and so a listing choice, with two deliberate exceptions: `rings`
    // writes no depth and blends straight-alpha OVER, so it must follow every
    // opaque sphere already stamped there — the far ring half is then occluded.
    // `cloud-shell` is the same exception placed early, immediately after the
    // `earth` surface it depth-tests against.
    //
    // `mesh-bodies` draws LAST, after the depth marker, and that is NOT the
    // depth-tested listing choice the rest of this roster is. The shells write no
    // depth, so a mesh drawn last still depth-tests correctly against every opaque
    // sphere and only the shells' own fragments are overdrawn — which is also what
    // leaves the mesh's own distance in the depth the aerial line below samples,
    // so a rover silhouetted against Mars sky is fogged at its range, not space's.
    {
      kind: 'foreground',
      target: 'foreground:0',
      near0Passes: ['star-spheres', 'field-star-sphere'],
      bodyPasses: [
        'earth',
        'surface-tiles',
        // Debug-only, and directly after the tiles on purpose: the marker writes
        // an analytic depth against the depth THEY just stamped, so where it
        // cuts the ground is the reading. Not in the probe roster above — a
        // cursor has no meaning on a capture face.
        'terrain-pick-marker',
        'cloud-shell',
        'planets',
        'textured-bodies',
        'rings',
        // Depth now holds every opaque surface of this row, which is what both
        // of these READ: the contact decals project onto it, and the atmosphere
        // shell ends each ray at it — the classification that makes terrain
        // standing above the relief floor at the limb hazy rather than bare.
        // The decals also now draw over `cloud-shell`'s colour, so a footprint
        // paints on a cloud deck in front of it. Accepted: the alternative costs
        // the shell the depth it exists to read (one marker per roster).
        { sampleDepth: ['contact-shadows', 'atmosphere-shell'] },
        'mesh-bodies',
      ],
    },
    // The aerial-perspective apply, on the enclosing body's own painter row — the
    // row that stamped the depth it samples, since `deriveSlabs`' deepest-inside
    // tie-break puts that row last in the chain. It reads a froxel volume this
    // view's own `aerial-perspective` compute (above) baked from THIS row's
    // uniform record, so the two unproject through one `slab.vp`. AFTER the
    // chain so every opaque row has stamped that depth; BEFORE the composite
    // so the fog rides one curve.
    // Never `foreground:0`'s first step: it attaches no depth yet marks the target
    // touched, which would cost the chain its colour clear.
    // `slot` keeps its timing row apart from the chain step for that same row.
    {
      kind: 'render',
      target: 'foreground:0',
      slab: 'insideAtmosphere',
      depth: { sample: 'foreground:0' },
      passes: ['aerial-perspective'],
      slot: 'AERIAL',
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
    // `depth` names the texture the trails SAMPLE — hdr is depthless, so it
    // attaches nothing — and behind it a trail hides in the terrain and meshes of
    // the last body row to clear that depth; the analytic occluder spheres still
    // cover every other sphere body — meshes rely on the depth alone.
    {
      kind: 'render',
      target: 'hdr',
      slab: NEAR0,
      depth: { sample: 'foreground:0' },
      passes: ['orbit-trails'],
      slot: 'POST_FOREGROUND',
    },
  ],
};

export const POST: FrameSection = {
  scope: 'once',
  steps: [
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
  ],
};

// The dome rig's own two sections. `SCENE_TO_DOME_CUBE` is `SCENE` plus one
// line: copy this face's freshly-drawn `hdr` into its own `dome-cube` layer
// (`ViewSpec.output`), so the resample below reads five already-drawn faces.
// `DOME_RESAMPLE` runs once against the canvas, after every face — it
// fisheye-resamples the whole `dome-cube` row back into `hdr`, which `POST`
// then blooms and tone-maps into the canvas exactly as the mono rig does.
export const SCENE_TO_DOME_CUBE: FrameSection = {
  scope: 'perView',
  steps: [...SCENE.steps, { kind: 'copy', source: 'hdr' }],
};

export const DOME_RESAMPLE: FrameSection = {
  scope: 'once',
  steps: [{ kind: 'render', target: 'hdr', slab: COSMO, passes: ['dome-resample'] }],
};

export const OVERLAYS: FrameSection = {
  scope: 'once',
  steps: [
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
    //
    // `depth` names the texture the overlays SAMPLE — swap is depthless, so it
    // attaches nothing — and behind it a caption clips along the silhouette of
    // the last body row to clear that depth. Declared on BOTH swap lines, not
    // only the NEAR0 one that needs the verdict: the overlays share one group(1)
    // joint, so every pipeline binding it must fill its depth entries, and a
    // placeholder on one line only would be a rule with an exception.
    {
      kind: 'render',
      target: 'swap',
      slab: COSMO,
      depth: { sample: 'foreground:0' },
      passes: ['selection-ring', 'marker-lines', 'labels'],
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
      depth: { sample: 'foreground:0' },
      passes: ['near0-selection-ring', 'foreground-labels', 'clip-path-debug'],
    },
  ],
};
