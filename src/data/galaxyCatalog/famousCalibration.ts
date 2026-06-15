/**
 * Shared constant for famous-galaxy thumbnail calibration.
 *
 * Single source of truth for the deprojection advisory threshold so the
 * curator seed and the UI warning agree.
 */

/**
 * Advisory disk axis ratio (b/a) below which deprojection is aggressive.
 * The galaxy is more inclined than ~70°, where stretching the minor axis
 * back to face-on (a >3.3× stretch) smears the texture heavily — so the
 * curator seeds the deproject toggle off and the UI warns when the curator
 * enables it anyway.  It is NOT a pipeline hard-stop: a curator who forces
 * the toggle on gets a real deprojection.  Tunable against real images.
 */
export const DEPROJECT_MIN_AXIS_RATIO = 0.3;

/**
 * Default fractional padding around a disk when seeding the deproject crop:
 * width = 2·radiusPx·(1 + DEFAULT_DISK_MARGIN).
 *
 * 0.25 leaves a quarter-radius of sky around the disk so the deprojected
 * square isn't cropped tight to the edge — a tighter crop clips faint outer
 * spiral arms once the minor axis is stretched back to face-on.  Single
 * source of truth for the curator seed, the pipeline, and the UI slider.
 * Tunable against real images.
 */
export const DEFAULT_DISK_MARGIN = 0.25;
