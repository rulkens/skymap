/**
 * Dominance factor of a caption's composed declutter priority,
 * `priority * CAPTION_PRIORITY_SCALE + clamped apparent size`. The authored
 * priority dominates and apparent size only breaks ties: pure size let a nearby
 * red dwarf out-rank the Sun. Size is clamped below this scale, so a lower
 * priority can never out-score a higher one however large its body looms.
 * Composing both into one number keeps the director's one-number rank
 * contract (`Label2D.declutterPriority`).
 */
export const CAPTION_PRIORITY_SCALE = 10_000;
