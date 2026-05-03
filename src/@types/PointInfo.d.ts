/**
 * PointInfo — display-ready data for a single galaxy, computed on-demand from
 * raw cloud arrays when the user hovers or selects a point. Passed from the
 * engine to React components via the onHoverChange / onSelectChange callbacks.
 */

import type { GalaxyTypeInfo } from './GalaxyTypeInfo';

/**
 * Display data for a single galaxy point, computed on-demand from the raw
 * cloud arrays.
 *
 * All derived quantities (sexagesimal coords, lookback time, galaxy type, etc.)
 * are pre-computed here in the engine so React components receive ready-to-render
 * values and never import data or physics modules directly.  The computation is
 * on-demand (triggered by hover/select events) so it costs nothing for the 99.9%
 * of points that are never hovered.
 *
 * Fields are grouped into four logical sections below.
 */
export type PointInfo = {
  /** 0-based point index in the loaded cloud. */
  index: number;

  /**
   * SDSS 64-bit object identifier.
   *
   * Stored as `bigint` because SDSS objIDs are 18–19 digit numbers that exceed
   * the safe integer range of JS `number` (2⁵³).  Used to build the Explorer
   * and thumbnail URLs below.
   */
  objID: bigint;

  /** @group World-space position */

  /**
   * World-space X coordinate in Mpc. Same value as `cloud.positions[idx*3+0]`.
   * Carried on `PointInfo` so consumers like the camera-focus button can pivot
   * the orbit camera onto this galaxy without re-deriving xyz from RA/Dec.
   */
  x: number;
  /** World-space Y coordinate in Mpc. */
  y: number;
  /** World-space Z coordinate in Mpc. */
  z: number;

  /** @group Sky coordinates */

  /** Right Ascension in decimal degrees, [0, 360). */
  ra: number;
  /** Declination in decimal degrees, [-90, +90]. */
  dec: number;
  /** RA formatted as HHhMMmSS.sss (pre-computed via physics.formatRaSexagesimal). */
  raSexagesimal: string;
  /** Dec formatted as ±DD°MM'SS.s" (pre-computed via physics.formatDecSexagesimal). */
  decSexagesimal: string;

  /** @group Cosmology */

  /** Spectroscopic redshift z (dimensionless). */
  redshift: number;
  /** Comoving distance in Mpc, computed as √(x²+y²+z²). */
  distanceMpc: number;
  /** Recession velocity in km/s via Hubble's law: v = c·z. */
  hubbleVelocityKmS: number;
  /** Light-travel time in Gyr (how long ago the light we see left the source). */
  lookbackGyr: number;
  /** Human-readable Earth-history anchor for the lookback time, e.g. "during Earth's Mesoproterozoic". */
  earthEra: string;

  /** @group Five-band photometry */

  /** SDSS u-band apparent magnitude. */
  magU: number;
  /** SDSS g-band apparent magnitude — the primary brightness proxy shown in the UI. */
  magG: number;
  /** SDSS r-band apparent magnitude. */
  magR: number;
  /** SDSS i-band apparent magnitude. */
  magI: number;
  /** SDSS z-band apparent magnitude. */
  magZ: number;

  /** @group Derived quantities */

  /** Absolute magnitude in the g-band, corrected for distance. */
  absoluteMagG: number;
  /**
   * Coarse galaxy classification inferred from the u−r colour index.
   *
   * `category` is intended for UI tinting; `description` is the human-readable
   * string shown in the info card (e.g. "Red, quiescent galaxy").
   */
  galaxyType: GalaxyTypeInfo;
  /** IAU-style SDSS designation, e.g. "SDSS J123456.75+012345.5". */
  sdssName: string;

  /** @group External URLs */

  /**
   * SDSS DR18 Quick Look page for this object (opens in a new tab).
   *
   * For synthetic data the objID is sequential (0, 1, 2…) so the URL won't
   * resolve to a real page — but the field is always populated so the render
   * path is uniform.
   */
  explorerUrl: string;
  /**
   * SDSS image cutout URL — a 200×200 px JPEG centred on the object's sky position.
   *
   * The cutout service is coordinate-based (RA/Dec), not objID-based, so it
   * works for both real SDSS data and synthetic points whose positions have
   * plausible sky coordinates.
   */
  thumbnailUrl: string;
};
