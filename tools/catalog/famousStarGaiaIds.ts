/**
 * famousStarGaiaIds — the curated FamousStar → Gaia DR3 `source_id` table that
 * lets the star-bin build subtract the stars the scene already draws as named
 * foreground bodies.
 *
 * The scene renders a hand-authored local star map (`SCENE_STARS` in
 * `src/data/bodies/sceneStars.ts`) as true-scale spheres/points. The Gaia
 * star bin is a separate, catalogue-wide point layer. Without a dedup key the
 * two would double-render the same photons for every nearby naked-eye star —
 * a Sirius drawn once as a scene body and again as a Gaia point. This table is
 * that key: for each `SCENE_STARS` id it names the Gaia DR3 row to drop from
 * the bin (or records that there is none to drop).
 *
 * Why a NAME-resolved table and not positional matching: the nearest stars are
 * exactly the high-proper-motion ones. Barnard's Star moves ~10.3"/yr — over
 * an arcminute since Gaia's J2016 epoch, and more against the seeds' J2000
 * RA/Dec. A position-radius cross-match would silently mis-associate or miss
 * them. So every row here was resolved by identifier through SIMBAD (the
 * `Gaia DR3 <n>` entry in the object's identifier list), never by coordinates.
 * The per-row comment records the SIMBAD identifier queried and what it found.
 *
 * `null` means "SIMBAD lists this object's identifiers but no `Gaia DR3` among
 * them" — genuine absence, not a failed lookup. It happens for two reasons the
 * comments distinguish: the Sun has no Gaia row at all, and several of the
 * visually brightest stars (Sirius, Procyon, α Cen, Altair, Vega, Fomalhaut,
 * Pollux) saturate Gaia's detectors and were "not recovered in Gaia DR3" —
 * SIMBAD states this explicitly for them. A `null` row tells the dedup there
 * is nothing to subtract; the star is drawn only as a scene body.
 *
 * `source_id`s exceed `Number.MAX_SAFE_INTEGER`, so they are `bigint` literals
 * copied digit-for-digit from the SIMBAD identifier list.
 *
 * Component choice: where a `SCENE_STARS` entry stands for a multiple system,
 * the row resolves the primary (A) component the seed's position represents —
 * α Cen A, 61 Cyg A, Struve 2398 A (GJ 725 A), Groombridge 34 A (GJ 15 A),
 * Luyten 726-8 A (BL Cet / GJ 65 A), EZ Aqr A (GJ 866 A). Each such row's
 * comment names the component actually queried.
 */

export const FAMOUS_STAR_GAIA_IDS: Readonly<Record<string, bigint | null>> = {
  // The Sun has no Gaia row (Gaia observes the sky, not the observer). Nothing to subtract.
  sun: null,
  // SIMBAD 'Proxima Centauri' → Gaia DR3 5853498713190525696.
  'proxima-centauri': 5853498713190525696n,
  // Primary of the α Cen system. SIMBAD 'alf Cen A' notes 'Not recovered in Gaia DR3' (bright-star hole); null.
  'alpha-centauri': null,
  // SIMBAD "Barnard's Star" → Gaia DR3 4472832130942575872.
  'barnards-star': 4472832130942575872n,
  // SIMBAD 'Wolf 359' → Gaia DR3 3864972938605115520.
  'wolf-359': 3864972938605115520n,
  // SIMBAD 'Lalande 21185' → Gaia DR3 762815470562110464.
  'lalande-21185': 762815470562110464n,
  // Sirius A. SIMBAD lists its identifiers but no Gaia DR3 (bright-star hole); null.
  sirius: null,
  // Primary of Luyten 726-8. SIMBAD 'BL Cet' (GJ 65 A) → Gaia DR3 5140693571158739840.
  'luyten-726-8': 5140693571158739840n,
  // SIMBAD 'Ross 154' → Gaia DR3 4075141768785646848.
  'ross-154': 4075141768785646848n,
  // SIMBAD 'Ross 248' → Gaia DR3 1926461164913660160.
  'ross-248': 1926461164913660160n,
  // SIMBAD 'eps Eri' → Gaia DR3 5164707970261890560.
  'epsilon-eridani': 5164707970261890560n,
  // SIMBAD 'Lacaille 9352' → Gaia DR3 6553614253923452800.
  'lacaille-9352': 6553614253923452800n,
  // SIMBAD 'Ross 128' → Gaia DR3 3796072592206250624.
  'ross-128': 3796072592206250624n,
  // Primary of EZ Aqr (GJ 866). SIMBAD 'GJ 866 A' (V* EZ Aqr) → Gaia DR3 2596740426913080576.
  'ez-aquarii': 2596740426913080576n,
  // Primary of 61 Cygni. SIMBAD '61 Cyg A' → Gaia DR3 1872046609345556480.
  '61-cygni': 1872046609345556480n,
  // Procyon A. SIMBAD lists 82 identifiers but no Gaia DR3 (bright-star hole); null.
  procyon: null,
  // Primary of Struve 2398. SIMBAD 'GJ 725 A' → Gaia DR3 2154880616774131840.
  'struve-2398': 2154880616774131840n,
  // Primary of Groombridge 34. SIMBAD 'GJ 15 A' → Gaia DR3 385334230892516480.
  'groombridge-34': 385334230892516480n,
  // eps Ind A. SIMBAD 'HD 209100' → Gaia DR3 6412595290592307840.
  'epsilon-indi': 6412595290592307840n,
  // SIMBAD 'tau Cet' → Gaia DR3 2452378776434477184.
  'tau-ceti': 2452378776434477184n,
  // SIMBAD "Kapteyn's Star" → Gaia DR3 4810594479418041856.
  'kapteyns-star': 4810594479418041856n,
  // SIMBAD 'Altair' notes 'Not recovered in Gaia DR3' (bright-star hole); null.
  altair: null,
  // SIMBAD 'Vega' notes 'Not recovered in Gaia DR3' (bright-star hole); null.
  vega: null,
  // SIMBAD 'Fomalhaut' notes 'Not recovered in Gaia DR3' (bright-star hole); null.
  fomalhaut: null,
  // SIMBAD 'Pollux' notes 'Not recovered in Gaia DR3' (bright-star hole); null.
  pollux: null,
};
