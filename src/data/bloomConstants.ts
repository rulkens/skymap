/**
 * Bloom pyramid depth — the single home for how many mip levels the
 * screen-space bloom pass owns (`bloom0..bloom4`). Three subsystems derive
 * from it and must agree: the `renderTargets` rows allocating the mip
 * textures, the per-level texel-size uniform arrays in `bloomPyramid`, and
 * `runBloom`'s downsample/upsample pass loops.
 */
export const BLOOM_LEVELS = 5;

/**
 * Resolution divisor of bloom level `level` — level 0 at half-res, each further
 * level halving again (2/4/8/16/32). Lives beside the depth because it is the
 * other half of the same shape: the `bloomN` render-target rows, the
 * galaxy-renderer tool's own mip allocation, and the per-level texel sizes both
 * derive from it, and a tool whose mips disagree with the app's produces a
 * plausible-looking glow at the wrong width with nothing failing.
 */
export const bloomScale = (level: number): number => 2 ** (level + 1);

/**
 * Every fold kind, and the source of the `FoldKind` union; `bloomPyramid`
 * allocates one fold uniform buffer per entry.
 */
export const FOLD_KINDS = ['bloom', 'streak', 'veil'] as const;

/** Tap stride of each streak iteration, in quarter-res texels: 9 taps each compound to a long tail. */
export const STREAK_STRIDES = [1, 4, 16] as const;

/** Streak falloff at `streakLength = 1`, in quarter-res (`bloom1`) texels. */
export const STREAK_FALLOFF_TEXELS = 48;

/** Veiling-glare Gaussian sigma in `bloom4` (1/32-res) texels: 8 texels = 256 px of frame. */
export const VEIL_SIGMA_TEXELS = 8;
