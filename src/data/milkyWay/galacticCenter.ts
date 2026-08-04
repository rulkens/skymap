/**
 * galacticCenter — coordinates of the Milky Way's dynamical center.
 *
 * The catalog data origin sits at the OBSERVER (Earth/Sun), so the
 * Milky Way's center is NOT at world (0, 0, 0).  It's offset by
 * ~8 kpc in the direction of Sagittarius A\*, the supermassive black
 * hole at the galactic center.  The Milky Way point cloud places its
 * model matrix at `MILKY_WAY_CENTER_WORLD` (`milkyWayModelMatrix.ts`)
 * so the cloud renders where the galaxy actually is in space.
 *
 * ## Why a separate file (not in `namedGalaxies` or `famous_galaxies.seed.json`)
 *
 * The famous-galaxies pipeline (`tools/buildFamous.ts`,
 * `famous_galaxies.seed.json`) is for extragalactic objects with a
 * meaningful "distance from us".  The Milky Way's own center is a
 * different kind of thing: we're INSIDE the galaxy, the conventional
 * catalog distance to it is undefined (we'd need to pick a reference
 * point — bulge, Sgr A\*, mean stellar position).  Adding it to the
 * famous seed would also enroll it as a regular point in `famous.bin`
 * and double-render it next to the point cloud.
 *
 * Per-galaxy disk impostors (e.g. M31) read THEIR center from the
 * famous bin's positions array via the existing meta lookup; only the
 * Milky Way needs this special case.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { SGR_A_STAR_ANCHOR } from '../bodies/sceneSgrAStar';

/**
 * World-space position of the Milky Way's center: the SAME seed the black hole
 * and every S-star orbit hang off (`sceneSgrAStar`), not a second transcription
 * of the sky coordinates.
 *
 * This file once carried its own rounded pair — 266.4168 / −29.0078 at a
 * round-numbers 8.0 kpc — on the argument that placing a spiral impostor is a
 * 2%-tolerant use. It is, in isolation; but the impostor and the black hole are
 * BOTH on screen at the Galactic Centre, and 2% of R₀ is 178 pc of visible
 * offset between the disc's hub and the object it is the hub of. Two spellings
 * of one position is the whole bug: there is no tolerance at which they line up.
 */
export const MILKY_WAY_CENTER_WORLD: Vec3 = SGR_A_STAR_ANCHOR.positionMpc as Vec3;

/**
 * Camera distance (Mpc) used by the Milky Way focus tween to land the
 * camera at a viewpoint where the Milky Way point cloud is the dominant
 * on-screen subject.
 *
 * Picked at 0.15 Mpc (≈150 kpc) by visual calibration — at this distance
 * the spiral fills most of the FOV at the project default 60° vertical
 * FOV.  This is deep inside the disc's full-visibility regime
 * (`milkyWayFadeAlpha` returns 1.0 while the disc spans at least
 * `MILKY_WAY_FADE_FULL_PX` on screen — here it fills the view) and
 * several times the disc radius (`MILKY_WAY_DISC_RADIUS_KPC`), so the
 * whole spiral is framed from outside rather than seen edge-on from
 * within. Reached by focusing the Milky Way — the `#focus=milkyWay`
 * deep-link, or its Command Palette row. Not the Home pill or the `h`/`e`
 * keys: those dispatch `goHome`, which flies to the sunlit Earth pose.
 */
export const MILKY_WAY_VIEW_DISTANCE_MPC = 0.15;

/**
 * Physical radius (kpc) of the Milky Way's stellar disc — THE single home
 * of the number.  The rendered point cloud and the pick target size from
 * it via `MILKY_WAY_RADIUS_MPC` (`milkyWayCalibration.ts`, a pure unit
 * conversion of this constant), and the selection ring borrows it the way
 * the galaxy branch borrows a catalog `diameterKpc` — so the disc the
 * user sees, the area that takes the click, and the ring drawn around it
 * all agree on ONE physical radius.
 *
 * 17.5 kpc = a ~35 kpc stellar disk, chosen so the Sun's R₀ = 8.178 kpc
 * offset sits mid-disk at ~47% of the radius — in the arm region where
 * it belongs, not on the bulge's edge.
 */
export const MILKY_WAY_DISC_RADIUS_KPC = 17.5;
