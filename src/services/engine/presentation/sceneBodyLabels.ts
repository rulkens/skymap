/**
 * sceneBodyLabels — name captions for the true-scale foreground bodies.
 *
 * The scene bodies render true-scale in the foreground/HDR passes, so at
 * almost every zoom level they are sub-pixel and impossible to locate by
 * eye. These labels anchor a name to each body's world position, giving
 * the descent toward the solar system — and the hop to the stellar
 * neighbourhood — something to aim at.
 *
 * Sourced from the full seed set (`SCENE_EARTH` + `SCENE_STARS` +
 * `SCENE_PLANETS`, 28 bodies), each tinted by its own authored colour: a
 * star's spectral-class `color`, a planet's `albedo`, and a fixed blue for
 * Earth (whose record carries a texture, not a colour). Deriving the tints
 * from the body records keeps this file free of a parallel colour table
 * that would drift from the seeds.
 *
 * ### Why the foreground projection, not the main one
 *
 * The main camera projection is pinned at near = 0.01 Mpc.  At solar-system
 * zoom the bodies sit ~1e-13 Mpc from the camera — far inside that near
 * plane — so the normal label path (which projects with `ctx.vp`) would
 * clip them away.  `foregroundLabelsLayer` instead draws these through the
 * NEAR0 slab view (`view.vp`), whose near plane is proportional to
 * `cam.distance` and so always contains the bodies.
 *
 * ### Why renderOrigin-relative positions
 *
 * The NEAR0 slab view is built relative to `renderOrigin`: every position
 * handed to it must already have the origin subtracted (the same contract
 * `composeBodyMvp` honours for the sphere MVPs).  With `RENDER_ORIGIN_MPC`
 * fixed at the Sun ([0, 0, 0]) the subtraction is numerically a no-op
 * today, but doing it here keeps the labels correct by construction if a
 * future floating origin moves.
 */

import type { Label } from '../../../@types/rendering/Label';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { SceneBody } from '../../../@types/scene/SceneBody';
import type { CaptionKind } from './captionPriority';
import { SCENE_EARTH, SCENE_STARS, SCENE_PLANETS } from '../../../data/bodies/sceneBodies';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { FAMOUS_LABEL_STYLE } from './famousLabelStyle';

/**
 * A scene-body caption always authors its tint, em height, and pixel clamps —
 * unlike the general `Label` shape, where those fields are optional and fall
 * back to renderer defaults. Narrowing the return type states that guarantee
 * once at the producer, so consumers that need the fields (the foreground
 * layer feeds them to `liftedLabelPlacement`, whose input requires plain
 * `number`s) read them directly — no per-field `?? default` at the read site
 * that would silently mask a caption built without its colour or clamps.
 *
 * `kind` classifies the caption for the foreground layer's declutter priority
 * and fade routing (`CAPTION_PRIORITY`). It is stamped HERE — where each seed
 * table's identity is structurally known — so no consumer ever re-derives a
 * body's kind by sniffing id strings.
 */
export type SceneBodyLabel = Label &
  Required<Pick<Label, 'color' | 'worldEmMpc' | 'minPixelSize' | 'maxPixelSize'>> & {
    readonly kind: CaptionKind;
  };

/**
 * Earth's caption tint. `EarthBody` carries a texture rather than a colour,
 * so this is the one hand-authored tint in the set — the same Earth blue
 * the captions have always used.
 */
const EARTH_TINT: Readonly<Vec3> = [0.5, 0.72, 1];

/**
 * Vertical stagger so captions of bodies that share a sub-pixel screen spot
 * don't overlap: the Sun's text hangs below its anchor while Earth's sits
 * above (the pair is 1 AU apart — one dot at most zooms), and the Moon's
 * hangs below so it clears Earth's caption (they sit 384,400 km apart).
 * As the camera dives in, the bodies separate on screen and the stagger
 * stops mattering. Everything else is far apart on the sky — default
 * baseline.
 */
const BODY_ALIGN_Y: Readonly<Record<string, Label['alignY']>> = {
  sun: 'top',
  earth: 'bottom',
  moon: 'top',
};

/**
 * The one place the scene-body caption id format lives. `bodyLabel` (which
 * stamps each caption) and the exported star-id set below derive from it, so a
 * consumer that must recognise a caption by body id — the foreground layer's
 * per-star fade + declutter, and its tests — never re-hardcodes the
 * `sceneBody-` prefix.
 */
export function sceneBodyLabelId(bodyId: string): string {
  return `sceneBody-${bodyId}`;
}

/**
 * The caption ids of the local star map (the Sun included). The foreground
 * layer reads this to fade + declutter the dense star captions WITHOUT touching
 * the Earth / planet captions, which always show at full alpha. Derived from
 * `SCENE_STARS` so it can never drift from the seeded star set.
 */
export const SCENE_STAR_LABEL_IDS: ReadonlySet<string> = new Set(
  SCENE_STARS.map((star) => sceneBodyLabelId(star.id)),
);

/**
 * The Sun's caption id. The Sun's caption is pinned to full alpha rather than
 * run through the neighbourhood distance band — it is the descent's aim
 * point, so its name holds all the way down from the foreground layer's
 * kiloparsec gate while the rest of the star map fades at the neighbourhood
 * edge.
 */
export const SUN_SCENE_LABEL_ID = sceneBodyLabelId('sun');

/**
 * Build the common label shape for one body. The colour is the caller's
 * per-type derivation (spectral colour / albedo / Earth blue), widened to
 * straight RGBA at full alpha; `kind` is the caller's structural knowledge of
 * which seed table the body came from.
 */
function bodyLabel(body: SceneBody, tint: Readonly<Vec3>, kind: CaptionKind): SceneBodyLabel {
  const o = RENDER_ORIGIN_MPC;
  const p = body.positionMpc;
  const worldPos: Vec3 = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  return {
    id: sceneBodyLabelId(body.id),
    kind,
    worldPos,
    text: body.label,
    font: 'cormorant',
    pixelSize: 0,
    color: [tint[0], tint[1], tint[2], 1],
    // Faint black drop shadow for legibility against space or a bright
    // limb. Matches the shared label convention (10%-alpha, em-frac 0.16);
    // a fully-opaque outline paints a hard black ring, not a shadow.
    outlineColor: [0, 0, 0, 0.1],
    outlineEmFrac: 0.16,
    // Em height tracks the body's true size; the pixel clamps below keep
    // it readable even though that em is microscopic at most zooms. The clamp
    // band is BORROWED from `FAMOUS_LABEL_STYLE` (not a private 13/44 pair) so
    // a scene-body caption reads at the same size as a nearby famous-galaxy
    // label — the "adopt the famous treatment" parity — and a future retune of
    // the famous band carries here automatically instead of silently drifting.
    worldEmMpc: body.radiusKm * SCALE_UNITS.KM_TO_MPC,
    minPixelSize: FAMOUS_LABEL_STYLE.minPixelSize,
    maxPixelSize: FAMOUS_LABEL_STYLE.maxPixelSize,
    alignX: 'center',
    alignY: BODY_ALIGN_Y[body.id] ?? 'baseline',
  };
}

/**
 * Build one name label per seeded scene body, positioned relative to
 * `RENDER_ORIGIN_MPC` for the foreground view-projection.  Static — the
 * bodies don't move — so the caller sets these once at construction.
 */
export function sceneBodyLabels(): SceneBodyLabel[] {
  return [
    bodyLabel(SCENE_EARTH, EARTH_TINT, 'earth'),
    // The Sun rides the star seed table but is its own caption kind — it must
    // out-rank every other caption in a declutter collision (CAPTION_PRIORITY).
    ...SCENE_STARS.map((star) => bodyLabel(star, star.color, star.id === 'sun' ? 'sun' : 'star')),
    ...SCENE_PLANETS.map((planet) => bodyLabel(planet, planet.albedo, 'planet')),
  ];
}
