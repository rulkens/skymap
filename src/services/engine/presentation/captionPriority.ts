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
 * `satisfies` over the kind union makes the table compiler-complete: adding a
 * `CaptionKind` fails the build until it gets a tier here.
 */

/**
 * The caption kinds of the seeded scene bodies. The Sun gets its own kind
 * (rather than riding `'star'`) because it is BOTH the star map's origin and
 * the descent's aim point — it must out-rank every other caption, so a
 * declutter collision essentially cannot drop it.
 */
export type CaptionKind = 'sun' | 'earth' | 'planet' | 'star';

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
  star: 10,
} as const satisfies Readonly<Record<CaptionKind, number>>;
