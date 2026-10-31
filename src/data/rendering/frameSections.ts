/**
 * PRELUDE / SCENE / POST / OVERLAYS — `FRAME_ORDER` split into the scopes
 * `renderFrame` walks (`ViewRig.program`): `once` runs against the frame's main
 * context, `perView` once per rig view. The per-line ordering rationale below
 * is this file's value, so it runs over the comment budget; see `frameOrder.ts`.
 */

import type { FrameSection } from '../../@types/engine/frame/FrameSection';
import { COSMO, NEAR0 } from '../../services/engine/frame/slabs';

export const PRELUDE: FrameSection = {
  scope: 'once',
  steps: [
    // Plan rows come first (`checkFrameOrder`'s boot rule), before any GPU step reads
    // what they publish (`runPlanSteps`).
    { kind: 'plan', name: 'galaxy-catalog' },
    { kind: 'plan', name: 'flow' },
    { kind: 'plan', name: 'star-catalog' },
    { kind: 'plan', name: 'milky-way' },
    { kind: 'plan', name: 'satellites' },
    // Once for every view: a dome's faces share one atlas, so one cut spans them all.
    { kind: 'plan', name: 'surface-tiles' },
    // `sky-view` re-bakes its LUT every frame (camera altitude + sun direction), unlike
    // the once-baked transmittance/multi-scatter LUTs; both computes sit ahead of
    // `foreground:0` so the atmosphere shell samples this frame's table. Each bills
    // `<name>-compute` (`computeTimingSlotName`), keeping `flow` apart from the ribbon
    // pass of that name.
    { kind: 'compute', name: 'flow' },
    { kind: 'compute', name: 'sky-view' },
    // Any line ahead of SCENE's star draws would do; inputs come from the `star-catalog` plan row.
    { kind: 'compute', name: 'star-cut' },
    // Sky captures run ahead of every other render step so a same-frame lensing draw
    // can sample a cubemap written this frame. Most frames the face list is empty and
    // this line emits nothing (the lens's zero-dispatch guarantee).
    //
    // `solarSystem` is the star field a reflection probe is captured over; parallax
    // across the solar system is sub-texel on its 256² faces.
    //
    // TWO rosters because the content spans both slabs: galaxy billboards and
    // textured disks project through COSMO, survey stars through NEAR0. A render step
    // is the unit of pass encoding, so a NEAR0-only step leaves the COSMO half
    // permanently undrawn. COSMO before NEAR0 mirrors the live `(hdr, COSMO)` →
    // `(hdr, NEAR0)` order. A pass may join only if its draw reads `view`/`ctx`/`state`
    // alone: a capture step hands it a SYNTHETIC per-face ctx, never the real camera.
    {
      kind: 'capture',
      captures: ['sgrAStar', 'solarSystem'],
      cosmoPasses: ['point-sprites', 'textured-disks'],
      near0Passes: ['star-aggregates', 'star-catalog'],
      bodyPasses: [],
    },
    // The reflection probe of the frame's one subject mesh body, after the sky line so
    // its blit samples this frame's `solarSystem` bake. Roster = sky blit plus the
    // subject's HOST body row. Excluded: the mesh passes (subject would draw into its
    // own probe); `star-spheres` / `field-star-sphere` (the Sun stays analytic, a
    // sub-pixel Sun would smear into a false highlight); glints and `orbit-trails`
    // (not environment); `atmosphere-shell` (classifies rays by a sampled scene depth a
    // capture face never resolves, and its pipeline has no depth state). NEAR0 is empty
    // because the blit rides COSMO.
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
    // Plan row first (`checkFrameOrder`'s boot rule): this view's markers, sized and
    // culled from its own eye, before its first GPU step (`runPlanSteps`).
    { kind: 'plan', name: 'structure-markers' },
    // Bakes the froxel volume its apply row (below) reads, once PER VIEW: each view is
    // its own submit, so the bake lands after the previous view's apply and before this
    // view's; no once-scope PRELUDE line could give that ordering.
    { kind: 'compute', name: 'aerial-perspective' },
    // Reduced-res density raymarch, merged into HDR by `cosmic-web-density-upsample`
    // inside the hdr COSMO step below, so this render must precede that step.
    { kind: 'render', target: 'cosmic-web-density', slab: COSMO, passes: ['cosmic-web-density'] },
    // Twin of the density render, into a 1/5-res offscreen merged by
    // `zone-of-avoidance-upsample`.
    { kind: 'render', target: 'zoa', slab: COSMO, passes: ['zone-of-avoidance'] },
    // Cosmological HDR accumulation. Additive blending commutes, so order is a listing
    // choice except that the two upsample rows must follow the offscreen renders.
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
        // After the upsample so the lettering lands on the composited band at full res:
        // MSDF text blurs on a reduced-res offscreen.
        'labels-world',
        'horizon-shell',
        'sky-grid',
        'structure-markers-cosmo',
      ],
    },
    // Survey-star AGGREGATE glows at half res (the fill-bound half of the star pass),
    // through NEAR0. Precedes the hdr NEAR0 step so `star-upsample` can composite it.
    { kind: 'render', target: 'star-aggregates', slab: NEAR0, passes: ['star-aggregates'] },
    // Milky-Way twin: additive billboards at reduced res (a summed glow field is smooth,
    // so cost drops by the divisor squared). Precedes the hdr NEAR0 step, where its
    // consumer `milky-way-upsample` and the dust that extincts it live.
    { kind: 'render', target: 'mw-aggregate', slab: NEAR0, passes: ['milky-way-aggregate'] },
    // Near-field HDR roster. NEAR0 because COSMO's 0.01 Mpc near plane would clip these
    // kpc-to-parsec anchors; it accumulates into the SAME hdr target, ahead of the one
    // tone-map.
    //
    // The Milky Way LEADS, load-bearing twice: its MULTIPLICATIVE dust darkens
    // everything accumulated before it (the cosmological group, physically right), but
    // the local starfield (`star-points` / `star-catalog`) sits between camera and disc
    // on descent and must not be darkened, so it draws after.
    //
    // `milky-way-upsample` precedes `milky-way` so the cloud's own starlight is folded
    // in before the dust multiplies; swapping them leaves the cloud's stars un-extincted.
    //
    // `local-bubble` follows `milky-way` immediately, NOT a listing choice: anything
    // accumulated after the dust multiply escapes it, and the shell's additive Fresnel
    // glow must not be darkened.
    //
    // Other additive rows are listing choices (`star-upsample` sits by `star-catalog`
    // for timing legibility). `structure-markers-near` and `exoplanet-orbits` are not:
    // they blend premultiplied-over, so what precedes them is what they cover.
    // `constellations` is the last row the lens line below samples.
    {
      kind: 'render',
      target: 'hdr',
      slab: NEAR0,
      passes: [
        'milky-way-upsample',
        'milky-way',
        'local-bubble',
        'light-time-spheres',
        'star-points',
        'star-catalog',
        'star-upsample',
        'structure-markers-near',
        'exoplanet-orbits',
        'constellations',
      ],
    },
    // The blackHoles lens blends OVER, so position matters both ways: after the roster
    // so captured rays occlude accumulated light and escaping rays sample this frame's
    // sky cubemap; before the line below so that stays unwarped on top. Outside the
    // fade band it emits nothing.
    { kind: 'render', target: 'hdr', slab: 'lens', passes: ['black-hole-lensing'] },
    // Draws unwarped ON TOP of the lens: sub-pixel bodies as additive points and the
    // black holes' far-field markers. With no lens row this merges back into the roster
    // above (`expandFrameOrder`'s merge rule).
    {
      kind: 'render',
      target: 'hdr',
      slab: NEAR0,
      passes: ['body-glints', 'mission-glints', 'earth-scene-glints', 'black-hole-marker'],
      slot: 'POST_LENSING',
    },
    // Near-field foreground bodies into their own depth-bearing target, expanded over
    // the painter-ordered chain far to near with one depth-CLEARING step per row, so a
    // nearer row's opaque pixels are never test-rejected by a farther row's depth. An
    // empty chain emits no step; the composite below no-ops on an untouched source.
    //
    // TWO rosters because the chain interleaves the NEAR0 row (star spheres, the Sun's
    // own) with body rows. Depth-tested opaque order is a listing choice, except:
    // `rings` writes no depth and blends OVER, so it follows every opaque sphere (the
    // far ring half is then occluded); `cloud-shell` is the same exception, placed
    // right after the `earth` surface it depth-tests against.
    //
    // Mesh passes draw LAST, after the depth marker. Shells write no depth, so a late
    // mesh still depth-tests correctly and leaves its own distance in the depth the
    // aerial line below samples (a rover against Mars sky is fogged at its range).
    {
      kind: 'foreground',
      target: 'foreground:0',
      near0Passes: ['star-spheres', 'field-star-sphere'],
      bodyPasses: [
        'earth',
        'surface-tiles',
        // Debug-only; right after the tiles because it writes analytic depth against
        // the depth THEY stamped. Not in the probe roster: a cursor means nothing on a
        // capture face.
        'terrain-pick-marker',
        'cloud-shell',
        'planets',
        'textured-bodies',
        'rings',
        // Depth now holds every opaque surface of this row: contact decals project
        // onto it and the atmosphere shell ends each ray at it (so terrain above the
        // relief floor at the limb is hazy, not bare). Decals also draw over
        // `cloud-shell` colour; accepted, since the alternative denies the shell its depth.
        { sampleDepth: ['contact-shadows', 'atmosphere-shell'] },
        'mission-meshes',
        'body-meshes',
        'earth-scene-meshes',
      ],
    },
    // Aerial-perspective apply, on the enclosing body's painter row (the row that
    // stamped the depth it samples: `deriveSlabs`' deepest-inside tie-break puts it
    // last). Reads the froxel volume baked from THIS row's uniform record, so both
    // unproject through one `slab.vp`. After the chain, before the composite, so fog
    // rides one curve. Never `foreground:0`'s first step: it attaches no depth yet
    // marks the target touched, costing the chain its colour clear. `slot` keeps its
    // timing row apart from the chain step.
    {
      kind: 'render',
      target: 'foreground:0',
      slab: 'insideAtmosphere',
      depth: { sample: 'foreground:0' },
      passes: ['aerial-perspective'],
      slot: 'AERIAL',
    },
    // Bodies join HDR in LINEAR space before the tone-map, so one tone curve covers
    // stars, galaxies and bodies (no seam at the Sun's limb); hence a composite, not a
    // second tone-mapped pass.
    { kind: 'composite', source: 'foreground:0', dest: 'hdr' },
    // Draws OVER the opaque bodies (a satellite's near arc in front of its host), still
    // HDR and ahead of bloom. The composite above always emits, so this never merges
    // back. `depth` is SAMPLED (hdr is depthless): a trail hides in the terrain and
    // meshes of the last body row to clear that depth; analytic occluder spheres cover
    // the other sphere bodies.
    {
      kind: 'render',
      target: 'hdr',
      slab: NEAR0,
      depth: { sample: 'foreground:0' },
      passes: ['orbit-trails', 'mission-trails', 'satellite-orbits', 'satellites'],
      slot: 'POST_FOREGROUND',
    },
  ],
};

export const POST: FrameSection = {
  scope: 'once',
  steps: [
    // ONE bloom line: a ping-pong mip pyramid writes the same target twice with
    // different ops, which the `(target, slab)` render-step model cannot express, and
    // the executor would re-fire a reused-target upsample at its downsample step against
    // a stale last-frame level. `runBloom` opens the ten passes in order. After the body
    // composite (the prefilter samples it), before the tone-map.
    { kind: 'bloom' },
    // The frame's ONLY tone-map; everything above accumulated in HDR.
    { kind: 'tonemap', source: 'hdr', dest: 'swap' },
  ],
};

// `SCENE_TO_DOME_CUBE` is `SCENE` plus a copy of each face's `hdr` into its
// `dome-cube` layer (`ViewSpec.output`); `DOME_RESAMPLE` then fisheye-resamples
// the whole row back into `hdr` for `POST`.
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
    // Premultiplied-OVER overlays after the tone-map: LDR-sane label colours would be
    // greyed by the tone curve, and on tile-based GPUs an OVER blend reads `dst.color`,
    // which goes incoherent across the per-layer timing pass boundaries (additive rows
    // never read it). The Sun/Earth still occlude cosmological labels, via the
    // COVERAGE test against `foreground:0` depth, not draw order. `selection-ring`
    // leads so lines and labels composite over its stroke.
    //
    // `depth` is SAMPLED (swap is depthless): a caption clips along the last body row's
    // silhouette. Declared on BOTH swap lines because the overlays share one group(1)
    // joint, so every pipeline binding it must fill its depth entries.
    {
      kind: 'render',
      target: 'swap',
      slab: COSMO,
      depth: { sample: 'foreground:0' },
      passes: ['selection-ring', 'marker-lines', 'labels-cosmo'],
    },
    // Near-field overlays, last, so scene-body captions land on top of the bodies.
    // `near0-selection-ring` is the NEAR0 sibling of the COSMO ring (COSMO's near plane
    // would clip a picked survey star); each ring lands only in the slab whose frustum
    // holds its anchor, so identical gates never double-draw. `clip-path-debug` is
    // painted last by intent.
    {
      kind: 'render',
      target: 'swap',
      slab: NEAR0,
      depth: { sample: 'foreground:0' },
      passes: ['near0-selection-ring', 'labels-near', 'clip-path-debug'],
    },
  ],
};
