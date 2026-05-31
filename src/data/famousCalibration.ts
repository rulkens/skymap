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
