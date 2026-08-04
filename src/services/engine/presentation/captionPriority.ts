/**
 * captionPriority — the declutter pecking order for the foreground scene-body
 * captions, AS DATA.
 *
 * When two captions collide on screen, the higher tier wins — full stop. The
 * table exists so that order is READABLE and TWEAKABLE in one place (the user
 * tunes it by editing four numbers) instead of being an emergent property of
 * whichever body happens to subtend more pixels: pure apparent-size priority
 * let a nearby red dwarf out-rank the Sun, which is exactly backwards for a
 * navigation aid whose whole job is keeping the descent's landmarks named.
 *
 * Within a tier, apparent size stays the tiebreaker (the nearer/bigger body's
 * caption survives) — the layer composes the two into the pure declutter's
 * single `priorityPx` score as `tier · CAPTION_TIER_SCALE + clamped size`, so
 * `declutterByScreenSeparation` keeps its one-number contract and this module
 * stays data-only. Composing in the caller (rather than teaching the helper a
 * two-field rank) was the smaller change: the helper's contract is untouched
 * and the score is trivially inspectable at the call site.
 *
 * The constellation figure names ride the LOWEST tier — below every scene body
 * — because they are a diffuse orientation overlay, not a navigation landmark:
 * in a collision a body's name (Sun, a planet, a nearby star) must always win
 * so the descent's aim points stay legible. Their anchors also carry no
 * apparent size (empty space at a figure centroid), so the within-tier size
 * tiebreak is 0 for them and a constellation-vs-constellation overlap falls to
 * the stable emission order.
 *
 * `satisfies` over the kind union makes the table compiler-complete: adding a
 * `CaptionKind` fails the build until it gets a tier here.
 */

/**
 * The caption kinds of the seeded scene bodies. The Sun gets its own kind
 * (rather than riding `'star'`) because it is BOTH the star map's origin and
 * the descent's aim point — it must out-rank every other caption, so a
 * declutter collision essentially cannot drop it.
 */
export type CaptionKind = 'sun' | 'earth' | 'planet' | 'star' | 'sgrAStar' | 'constellation';

/**
 * Tier dominance factor for the composed declutter score. Apparent size is
 * clamped below it, so a lower tier can NEVER out-score a higher one no matter
 * how large the body looms.
 */
export const CAPTION_TIER_SCALE = 10_000;

/** The pecking order. Higher wins a screen-space collision. */
export const CAPTION_PRIORITY = {
  sun: 40,
  earth: 30,
  planet: 20,
  // Above the star map, below the solar system: Sgr A* is the Galactic Centre's
  // aim point, and it draws NOTHING — losing its caption to a dot's name loses
  // the object entirely, where a decluttered star still shows as a point. Its
  // within-tier size tiebreak is a Schwarzschild radius at 8 kpc, i.e. 0, so it
  // would lose every collision on size alone.
  sgrAStar: 15,
  star: 10,
  // Below every scene body: a figure name always yields to a body caption.
  constellation: 5,
} as const satisfies Readonly<Record<CaptionKind, number>>;
