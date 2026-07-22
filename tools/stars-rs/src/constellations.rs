//! Constellation overlay build stage — turns the vendored d3-celestial
//! stick-figure lines into a true-3D artifact (`public/data/constellations.json`)
//! that the runtime layer draws as line segments between real star positions.
//!
//! ── Why resolve, and not just draw the 2D lines ────────────────────────────
//!
//! d3-celestial's `constellations.lines.json` is a flat sky map: each figure is
//! a `MultiLineString` of `[ra, dec]` vertices, drawn on the celestial sphere at
//! a nominal radius. skymap is a real 3D volume, so a flat overlay would float
//! at a wrong depth and shear as the camera leaves Earth. Instead every polyline
//! vertex is resolved to the actual heliocentric position of the star it traces,
//! so the figure sits on its real stars and only reads as "the constellation"
//! from near the Sun — which is the honest thing for a 3D map to do.
//!
//! ── The four-step resolver (build pipeline step 2) ─────────────────────────
//!
//! Per vertex, in order (first hit wins):
//!   1. Famous-star seed, by angular proximity. Famous positions are
//!      authoritative — that is exactly where the labelled body renders, whether
//!      or not the star was subtracted from the Gaia bin (the brightest stars
//!      saturate Gaia and live only in the seed + Hipparcos patch).
//!   2. Else the nearest bright star in the id-carrying population within the
//!      angular tolerance, restricted to an apparent-magnitude window so a faint
//!      field star that happens to sit near the line can't outrank the intended
//!      bright star.
//!   3. Else an explicit override (a HIP id resolved through the population's
//!      ids, or a literal position) keyed by constellation + vertex coordinate.
//!   4. Else a HARD build failure naming the constellation, the vertex, and the
//!      nearest miss in arcmin — never a silently dropped line. The failure
//!      message is the instruction for extending the override seed.
//!
//! ── Determinism ────────────────────────────────────────────────────────────
//!
//! Output order is input-file order. Nothing iterates a HashMap to build the
//! artifact, so the JSON is byte-stable across runs.

use crate::population::{
    ra_dec_dist_to_cartesian, ClampCounts, DropCounts, Population, Star, StarIds,
};
use serde::{Deserialize, Serialize};
use std::path::Path;

// ── Resolver tuning ───────────────────────────────────────────────────────

/// Starting angular tolerance for the seed / population match, in arcminutes.
/// d3-celestial vertices sit on catalog star positions, so a real star is
/// normally well under an arcminute away; 5' absorbs the epoch/proper-motion
/// drift between the line data and the Gaia/Hipparcos frames without reaching a
/// neighbouring bright star (bright stars are degrees apart on the sky).
pub const DEFAULT_TOL_ARCMIN: f64 = 5.0;

/// Apparent-magnitude ceiling for a population star to be eligible as a vertex
/// match (step 2's "sanity window"). Constellation stick figures connect naked-
/// eye stars (mag ≲ 5.5); admitting anything up to 7 keeps a safety margin while
/// still excluding the mag-10+ field stars that would otherwise win on a closer
/// angular coincidence. Also the prefilter that keeps the per-vertex brute-force
/// search over a few thousand rows instead of the whole ~tens-of-millions bin.
pub const MATCH_MAX_APP_MAG: f64 = 7.0;

/// How close an override's `(ra, dec)` must be to a vertex to claim it, in
/// arcminutes. Tight, because an override records the vertex's own catalogued
/// coordinate — this is an identity match, not a spatial search.
pub const OVERRIDE_MATCH_ARCMIN: f64 = 1.0;

// ── Parsed line data ──────────────────────────────────────────────────────

/// One polyline of one constellation figure: a named stroke of `[ra_deg, dec_deg]`
/// vertices, RA normalised to 0…360. A `MultiLineString` feature becomes several
/// of these, all carrying the same Latin `name`.
#[derive(Clone, Debug)]
pub struct ConstellationLine {
    pub name: String,
    pub vertices: Vec<[f64; 2]>,
}

// GeoJSON shapes for deserialising the vendored file. Only the fields the build
// consumes are named; serde ignores the rest (`properties.rank`, `type`, …).
#[derive(Deserialize)]
struct GeoJson {
    features: Vec<GeoFeature>,
}
#[derive(Deserialize)]
struct GeoFeature {
    id: String,
    geometry: GeoGeometry,
}
#[derive(Deserialize)]
struct GeoGeometry {
    /// MultiLineString: an array of polylines, each an array of `[ra, dec]`.
    coordinates: Vec<Vec<[f64; 2]>>,
}

/// Normalise a right ascension into 0…360. The vendored file stores RA in
/// −180…180; the famous seed and every downstream comparison speak 0…360.
#[inline]
fn norm_ra(ra_deg: f64) -> f64 {
    ((ra_deg % 360.0) + 360.0) % 360.0
}

/// Parse the vendored GeoJSON into one `ConstellationLine` per polyline, in file
/// order. The feature `id` (a 3-letter IAU abbreviation) is expanded to the full
/// Latin name for the artifact.
pub fn parse_lines(path: &Path) -> Vec<ConstellationLine> {
    let text = std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    parse_lines_str(&text)
}

/// Split out for testing against a literal GeoJSON string.
pub fn parse_lines_str(text: &str) -> Vec<ConstellationLine> {
    let gj: GeoJson =
        serde_json::from_str(text).expect("constellations.lines.json is not valid GeoJSON");
    let mut out = Vec::new();
    for f in gj.features {
        let name = latin_name(&f.id).to_string();
        for polyline in f.geometry.coordinates {
            let vertices = polyline.into_iter().map(|c| [norm_ra(c[0]), c[1]]).collect();
            out.push(ConstellationLine { name: name.clone(), vertices });
        }
    }
    out
}

// ── Famous-star seed ──────────────────────────────────────────────────────

/// One famous-star seed entry, as far as the resolver cares: its authoritative
/// sky position + distance (where the labelled body renders) and its V magnitude.
/// A vertex carries only `ra`/`dec`, so the match is positional — the seed's
/// `hip` is the population-dedup key (handled in population.rs) and is not read
/// here. Extra seed fields (name, spectral type, description, …) are ignored.
#[derive(Deserialize, Clone, Debug)]
pub struct FamousSeedEntry {
    pub ra: f64,
    pub dec: f64,
    #[serde(rename = "distancePc")]
    pub distance_pc: f64,
    #[serde(rename = "magV")]
    pub mag_v: f64,
}

/// The parsed famous-star seed (`data/seeds/famous_stars.seed.json`).
pub struct FamousSeed {
    pub entries: Vec<FamousSeedEntry>,
}

pub fn load_famous_seed(path: &Path) -> FamousSeed {
    let text = std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    let entries: Vec<FamousSeedEntry> =
        serde_json::from_str(&text).expect("famous_stars.seed.json parse");
    FamousSeed { entries }
}

// ── Overrides seed ────────────────────────────────────────────────────────

/// One hand-authored override for a vertex the automatic resolver can't place.
/// Keyed by `constellation` (the Latin name) + the vertex `(ra, dec)`. Provide
/// either a `hip` (resolved through the population's ids) or an explicit
/// `position_pc` + `app_mag`.
#[derive(Deserialize, Clone, Debug)]
pub struct OverrideEntry {
    pub constellation: String,
    pub ra: f64,
    pub dec: f64,
    #[serde(default)]
    pub hip: Option<u32>,
    #[serde(default, rename = "positionPc")]
    pub position_pc: Option<[f32; 3]>,
    #[serde(default, rename = "appMag")]
    pub app_mag: Option<f32>,
}

#[derive(Deserialize, Default)]
pub struct Overrides {
    #[serde(default)]
    pub overrides: Vec<OverrideEntry>,
}

pub fn load_overrides(path: &Path) -> Overrides {
    let text = std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    serde_json::from_str(&text).expect("constellation_overrides.seed.json parse")
}

// ── Resolution ────────────────────────────────────────────────────────────

/// A polyline vertex placed in 3D: heliocentric equatorial-J2000 parsecs plus
/// the apparent magnitude of the star it resolved to.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ResolvedVertex {
    pub pos_pc: [f32; 3],
    pub app_mag: f32,
}

/// A vertex the four-step resolver could not place. Carries everything needed to
/// author an override: which figure, which vertex, its sky coordinate, and how
/// far the nearest rejected candidate was.
#[derive(Clone, Debug, PartialEq)]
pub enum ResolveError {
    Unresolvable {
        constellation: String,
        vertex_index: usize,
        ra_deg: f64,
        dec_deg: f64,
        nearest_miss_arcmin: f64,
    },
}

/// Unit direction of a sky coordinate (distance 1), reusing the star pipeline's
/// own RA/Dec→cartesian transform so the frame matches the resolved positions
/// exactly. RA sign is irrelevant here (cos/sin wrap), so an un-normalised RA
/// would still compare correctly — normalisation is for storage, not this.
#[inline]
fn unit_dir(ra_deg: f64, dec_deg: f64) -> [f64; 3] {
    ra_dec_dist_to_cartesian(ra_deg, dec_deg, 1.0)
}

/// Great-circle separation between two unit directions, in arcminutes. The dot
/// product is the cosine of the angle; clamping guards acos against tiny
/// out-of-range drift from floating-point error.
#[inline]
fn angular_sep_arcmin(a: [f64; 3], b: [f64; 3]) -> f64 {
    let dot = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]).clamp(-1.0, 1.0);
    dot.acos().to_degrees() * 60.0
}

#[inline]
fn to_f32(p: [f64; 3]) -> [f32; 3] {
    [p[0] as f32, p[1] as f32, p[2] as f32]
}

/// Resolve one polyline vertex to a 3D star, or fail hard. See the module header
/// for the four-step order. `pop` is expected to be pre-filtered to bright stars
/// (see `bright_population`) so the per-vertex scan stays cheap; the magnitude
/// window is re-checked here so the function is correct for any population.
#[allow(clippy::too_many_arguments)]
pub fn resolve_vertex(
    constellation: &str,
    vertex_index: usize,
    ra_deg: f64,
    dec_deg: f64,
    famous: &FamousSeed,
    pop: &Population,
    overrides: &Overrides,
    tol_arcmin: f64,
) -> Result<ResolvedVertex, ResolveError> {
    let target = unit_dir(ra_deg, dec_deg);
    let mut nearest_miss = f64::INFINITY;

    // Step 1 — famous seed (authoritative). Skip the Sun / any placeholder at
    // distance 0: its seed ra/dec is (0,0), not a real sky position, and would
    // spuriously match figures near the RA=0 pole.
    let mut best_famous: Option<(f64, &FamousSeedEntry)> = None;
    for e in &famous.entries {
        if e.distance_pc <= 0.0 {
            continue;
        }
        let sep = angular_sep_arcmin(target, unit_dir(e.ra, e.dec));
        nearest_miss = nearest_miss.min(sep);
        if sep <= tol_arcmin && best_famous.is_none_or(|(b, _)| sep < b) {
            best_famous = Some((sep, e));
        }
    }
    if let Some((_, e)) = best_famous {
        return Ok(ResolvedVertex {
            pos_pc: to_f32(ra_dec_dist_to_cartesian(e.ra, e.dec, e.distance_pc)),
            app_mag: e.mag_v as f32,
        });
    }

    // Step 2 — nearest bright population star within tolerance + magnitude window.
    let mut best_pop: Option<(f64, usize)> = None;
    for (i, s) in pop.stars.iter().enumerate() {
        if s.app_mag > MATCH_MAX_APP_MAG {
            continue;
        }
        let [x, y, z] = s.position;
        let d = (x * x + y * y + z * z).sqrt();
        if d <= 0.0 {
            continue;
        }
        let sep = angular_sep_arcmin(target, [x / d, y / d, z / d]);
        nearest_miss = nearest_miss.min(sep);
        if sep <= tol_arcmin && best_pop.is_none_or(|(b, _)| sep < b) {
            best_pop = Some((sep, i));
        }
    }
    if let Some((_, i)) = best_pop {
        let s = &pop.stars[i];
        return Ok(ResolvedVertex { pos_pc: to_f32(s.position), app_mag: s.app_mag as f32 });
    }

    // Step 3 — explicit override for this constellation + vertex coordinate.
    for ov in &overrides.overrides {
        if ov.constellation != constellation {
            continue;
        }
        if angular_sep_arcmin(target, unit_dir(ov.ra, ov.dec)) > OVERRIDE_MATCH_ARCMIN {
            continue;
        }
        if let Some(hip) = ov.hip {
            if let Some(rv) = resolve_hip(hip, pop) {
                return Ok(rv);
            }
        }
        if let (Some(pos_pc), Some(app_mag)) = (ov.position_pc, ov.app_mag) {
            return Ok(ResolvedVertex { pos_pc, app_mag });
        }
        // A matched override that resolves to nothing (bad HIP, no position)
        // falls through to the hard error — the message tells the author to fix
        // the entry rather than silently dropping the line.
    }

    // Step 4 — hard failure.
    Err(ResolveError::Unresolvable {
        constellation: constellation.to_string(),
        vertex_index,
        ra_deg,
        dec_deg,
        nearest_miss_arcmin: nearest_miss,
    })
}

// ── Label anchor + artifact assembly ──────────────────────────────────────

/// The on-disk artifact contract. Serialised to `public/data/constellations.json`
/// and read verbatim by the runtime overlay layer, so the camelCase key names
/// (via `serde(rename)`) and the `version` are load-bearing — a mismatch is a
/// silent runtime break, not a compile error.
#[derive(Serialize)]
pub struct ConstellationsArtifact {
    pub version: u32,
    pub constellations: Vec<Constellation>,
}

#[derive(Serialize)]
pub struct Constellation {
    /// Full Latin name (e.g. "Orion"), the label text.
    pub name: String,
    /// Heliocentric equatorial-J2000 parsecs — mean sky direction of the
    /// figure's vertices placed at their median distance (see
    /// `constellation_label_anchor`).
    #[serde(rename = "labelAnchorPc")]
    pub label_anchor_pc: [f32; 3],
    pub segments: Vec<Segment>,
}

#[derive(Serialize)]
pub struct Segment {
    #[serde(rename = "aPc")]
    pub a_pc: [f32; 3],
    #[serde(rename = "aAppMag")]
    pub a_app_mag: f32,
    #[serde(rename = "bPc")]
    pub b_pc: [f32; 3],
    #[serde(rename = "bAppMag")]
    pub b_app_mag: f32,
}

/// The artifact format version. Bumped when the shape below changes; the runtime
/// checks it and refuses a mismatched file loudly.
pub const ARTIFACT_VERSION: u32 = 1;

/// Where to place a constellation's label: the mean unit sky-direction of its
/// vertices, scaled to the MEDIAN of their distances. The median (not the mean)
/// distance keeps the label on the figure — one distant supergiant on a stick
/// figure of nearby stars would otherwise drag a mean-distance label far behind
/// the shape. An empty figure (never happens in practice) anchors at the origin.
pub fn constellation_label_anchor(vertices: &[ResolvedVertex]) -> [f32; 3] {
    if vertices.is_empty() {
        return [0.0; 3];
    }
    let mut dir = [0f64; 3];
    let mut dists: Vec<f64> = Vec::with_capacity(vertices.len());
    for v in vertices {
        let p = [v.pos_pc[0] as f64, v.pos_pc[1] as f64, v.pos_pc[2] as f64];
        let d = (p[0] * p[0] + p[1] * p[1] + p[2] * p[2]).sqrt();
        dists.push(d);
        if d > 0.0 {
            dir[0] += p[0] / d;
            dir[1] += p[1] / d;
            dir[2] += p[2] / d;
        }
    }
    let mag = (dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]).sqrt();
    let unit = if mag > 0.0 { [dir[0] / mag, dir[1] / mag, dir[2] / mag] } else { [0.0; 3] };

    dists.sort_by(|a, b| a.partial_cmp(b).expect("no NaN distances"));
    let n = dists.len();
    let median = if n % 2 == 1 {
        dists[n / 2]
    } else {
        (dists[n / 2 - 1] + dists[n / 2]) / 2.0
    };

    [(unit[0] * median) as f32, (unit[1] * median) as f32, (unit[2] * median) as f32]
}

/// Copy the population down to just its bright stars (`app_mag <= MATCH_MAX_APP_MAG`),
/// so the per-vertex nearest search in `resolve_vertex` runs over a few thousand
/// rows instead of the whole ~tens-of-millions bin. Constellation vertices only
/// ever match naked-eye stars, so nothing eligible is lost. `drops`/`clamps` are
/// bookkeeping the resolver never reads, so they default.
pub fn bright_population(pop: &Population) -> Population {
    let mut stars: Vec<Star> = Vec::new();
    let mut ids: Vec<StarIds> = Vec::new();
    for (s, id) in pop.stars.iter().zip(pop.ids.iter()) {
        if s.app_mag <= MATCH_MAX_APP_MAG {
            stars.push(Star {
                position: s.position,
                abs_mag: s.abs_mag,
                bp_rp: s.bp_rp,
                app_mag: s.app_mag,
                is_supplement: s.is_supplement,
            });
            ids.push(*id);
        }
    }
    Population { stars, ids, drops: DropCounts::default(), clamps: ClampCounts::default() }
}

/// Assemble the full artifact: resolve every figure's vertices, build its
/// segments (one per consecutive vertex pair within a polyline — segments never
/// cross a polyline boundary) and its label anchor, in input-file order. Any
/// unresolvable vertex aborts the whole build with the hard error from
/// `resolve_vertex` — a missing star is a bug to fix, not a line to drop.
pub fn build_artifact(
    lines: &[ConstellationLine],
    famous: &FamousSeed,
    pop: &Population,
    overrides: &Overrides,
) -> Result<ConstellationsArtifact, ResolveError> {
    // Group polylines by Latin name, preserving first-seen order (Serpens's two
    // features share a name and merge into one constellation). The emission
    // iterates `order`, a Vec, so no HashMap iteration order reaches the JSON.
    let mut order: Vec<String> = Vec::new();
    let mut index: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut grouped: Vec<Vec<&ConstellationLine>> = Vec::new();
    for line in lines {
        let gi = *index.entry(line.name.clone()).or_insert_with(|| {
            order.push(line.name.clone());
            grouped.push(Vec::new());
            order.len() - 1
        });
        grouped[gi].push(line);
    }

    let mut constellations = Vec::with_capacity(order.len());
    for (name, polylines) in order.iter().zip(grouped.iter()) {
        let mut segments: Vec<Segment> = Vec::new();
        let mut all_resolved: Vec<ResolvedVertex> = Vec::new();
        let mut vertex_index = 0usize;
        for pl in polylines {
            let mut resolved: Vec<ResolvedVertex> = Vec::with_capacity(pl.vertices.len());
            for &[ra, dec] in &pl.vertices {
                let rv = resolve_vertex(
                    name, vertex_index, ra, dec, famous, pop, overrides, DEFAULT_TOL_ARCMIN,
                )?;
                resolved.push(rv);
                vertex_index += 1;
            }
            for w in resolved.windows(2) {
                segments.push(Segment {
                    a_pc: w[0].pos_pc,
                    a_app_mag: w[0].app_mag,
                    b_pc: w[1].pos_pc,
                    b_app_mag: w[1].app_mag,
                });
            }
            all_resolved.extend_from_slice(&resolved);
        }
        constellations.push(Constellation {
            name: name.clone(),
            label_anchor_pc: constellation_label_anchor(&all_resolved),
            segments,
        });
    }

    Ok(ConstellationsArtifact { version: ARTIFACT_VERSION, constellations })
}

/// Resolve a HIP number through the population's id sidecar to that star's
/// resolved vertex. Linear scan — overrides are a handful, called rarely.
fn resolve_hip(hip: u32, pop: &Population) -> Option<ResolvedVertex> {
    pop.ids.iter().position(|ids| ids.hip == Some(hip)).map(|i| {
        let s = &pop.stars[i];
        ResolvedVertex { pos_pc: to_f32(s.position), app_mag: s.app_mag as f32 }
    })
}

/// Expand a 3-letter IAU abbreviation (the d3-celestial feature `id`) to the
/// full Latin constellation name. Unknown ids fall back to the abbreviation so a
/// future upstream addition still produces a (less pretty) label rather than
/// panicking.
fn latin_name(abbr: &str) -> &'static str {
    match abbr {
        "And" => "Andromeda",
        "Ant" => "Antlia",
        "Aps" => "Apus",
        "Aqr" => "Aquarius",
        "Aql" => "Aquila",
        "Ara" => "Ara",
        "Ari" => "Aries",
        "Aur" => "Auriga",
        "Boo" => "Boötes",
        "Cae" => "Caelum",
        "Cam" => "Camelopardalis",
        "Cnc" => "Cancer",
        "CVn" => "Canes Venatici",
        "CMa" => "Canis Major",
        "CMi" => "Canis Minor",
        "Cap" => "Capricornus",
        "Car" => "Carina",
        "Cas" => "Cassiopeia",
        "Cen" => "Centaurus",
        "Cep" => "Cepheus",
        "Cet" => "Cetus",
        "Cha" => "Chamaeleon",
        "Cir" => "Circinus",
        "Col" => "Columba",
        "Com" => "Coma Berenices",
        "CrA" => "Corona Australis",
        "CrB" => "Corona Borealis",
        "Crv" => "Corvus",
        "Crt" => "Crater",
        "Cru" => "Crux",
        "Cyg" => "Cygnus",
        "Del" => "Delphinus",
        "Dor" => "Dorado",
        "Dra" => "Draco",
        "Equ" => "Equuleus",
        "Eri" => "Eridanus",
        "For" => "Fornax",
        "Gem" => "Gemini",
        "Gru" => "Grus",
        "Her" => "Hercules",
        "Hor" => "Horologium",
        "Hya" => "Hydra",
        "Hyi" => "Hydrus",
        "Ind" => "Indus",
        "Lac" => "Lacerta",
        "Leo" => "Leo",
        "LMi" => "Leo Minor",
        "Lep" => "Lepus",
        "Lib" => "Libra",
        "Lup" => "Lupus",
        "Lyn" => "Lynx",
        "Lyr" => "Lyra",
        "Men" => "Mensa",
        "Mic" => "Microscopium",
        "Mon" => "Monoceros",
        "Mus" => "Musca",
        "Nor" => "Norma",
        "Oct" => "Octans",
        "Oph" => "Ophiuchus",
        "Ori" => "Orion",
        "Pav" => "Pavo",
        "Peg" => "Pegasus",
        "Per" => "Perseus",
        "Phe" => "Phoenix",
        "Pic" => "Pictor",
        "Psc" => "Pisces",
        "PsA" => "Piscis Austrinus",
        "Pup" => "Puppis",
        "Pyx" => "Pyxis",
        "Ret" => "Reticulum",
        "Sge" => "Sagitta",
        "Sgr" => "Sagittarius",
        "Sco" => "Scorpius",
        "Scl" => "Sculptor",
        "Sct" => "Scutum",
        "Ser" => "Serpens",
        "Sex" => "Sextans",
        "Tau" => "Taurus",
        "Tel" => "Telescopium",
        "Tri" => "Triangulum",
        "TrA" => "Triangulum Australe",
        "Tuc" => "Tucana",
        "UMa" => "Ursa Major",
        "UMi" => "Ursa Minor",
        "Vel" => "Vela",
        "Vir" => "Virgo",
        "Vol" => "Volans",
        "Vul" => "Vulpecula",
        other => Box::leak(other.to_string().into_boxed_str()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::population::{DropCounts, ClampCounts, Star, StarIds};

    // Build a minimal Population from (position, app_mag, ids) triples. drops /
    // clamps are irrelevant to the resolver, so they default.
    fn pop_from(rows: Vec<(Star, StarIds)>) -> Population {
        let (stars, ids): (Vec<Star>, Vec<StarIds>) = rows.into_iter().unzip();
        Population { stars, ids, drops: DropCounts::default(), clamps: ClampCounts::default() }
    }

    fn star_at(ra: f64, dec: f64, dist_pc: f64, app_mag: f64) -> Star {
        Star {
            position: ra_dec_dist_to_cartesian(ra, dec, dist_pc),
            abs_mag: 0.0,
            bp_rp: 0.5,
            app_mag,
            is_supplement: false,
        }
    }

    fn famous(entries: Vec<FamousSeedEntry>) -> FamousSeed {
        FamousSeed { entries }
    }

    fn famous_entry(ra: f64, dec: f64, dist_pc: f64, mag_v: f64) -> FamousSeedEntry {
        FamousSeedEntry { ra, dec, distance_pc: dist_pc, mag_v }
    }

    // Orion endpoints: one resolved from the famous seed (step 1), one from the
    // bright population (step 2). app_mag identifies which source placed it; the
    // radial distance |pos| and the sign of z (from dec) confirm it is the right
    // star without recomputing the cartesian via the source's own formula.
    #[test]
    fn orion_resolves_bright_endpoints_via_seed_and_population() {
        // Betelgeuse — in the famous seed only.
        let betelgeuse = famous_entry(88.7929, 7.4071, 168.0, 0.42);
        let fam = famous(vec![betelgeuse]);
        // Rigel — a bright population star (dec < 0), absent from the seed.
        let pop = pop_from(vec![(
            star_at(78.6345, -8.2016, 264.0, 0.13),
            StarIds { gaia: Some(1), hip: Some(24436) },
        )]);
        let overrides = Overrides::default();

        let vb = resolve_vertex(
            "Orion", 0, 88.7929, 7.4071, &fam, &pop, &overrides, DEFAULT_TOL_ARCMIN,
        )
        .expect("Betelgeuse resolves from the seed");
        assert!((vb.app_mag - 0.42).abs() < 1e-4, "seed magnitude used");
        let rb = (vb.pos_pc[0].powi(2) + vb.pos_pc[1].powi(2) + vb.pos_pc[2].powi(2)).sqrt();
        assert!((rb - 168.0).abs() < 0.5, "seed distance, got {rb}");
        assert!(vb.pos_pc[2] > 0.0, "north-declination star has +z");

        let vr = resolve_vertex(
            "Orion", 1, 78.6345, -8.2016, &fam, &pop, &overrides, DEFAULT_TOL_ARCMIN,
        )
        .expect("Rigel resolves from the population");
        assert!((vr.app_mag - 0.13).abs() < 1e-4, "population magnitude used");
        let rr = (vr.pos_pc[0].powi(2) + vr.pos_pc[1].powi(2) + vr.pos_pc[2].powi(2)).sqrt();
        assert!((rr - 264.0).abs() < 0.5, "population distance, got {rr}");
        assert!(vr.pos_pc[2] < 0.0, "south-declination star has -z");
    }

    // A star prep-1 subtracted from the bin (a Big Dipper star) is absent from
    // the population but present in the seed. Even with a decoy population star
    // sitting at the same sky position (but a different distance/magnitude), the
    // seed must win — that is where the labelled body renders.
    #[test]
    fn famous_subtracted_endpoint_resolves_from_seed_not_population() {
        let dubhe = famous_entry(165.9319, 61.7510, 37.7, 1.79);
        let fam = famous(vec![dubhe]);
        // Decoy: bright, angularly on top of Dubhe, but at 500 pc / mag 2.0.
        let pop = pop_from(vec![(
            star_at(165.94, 61.75, 500.0, 2.0),
            StarIds { gaia: Some(2), hip: None },
        )]);

        let v = resolve_vertex(
            "Ursa Major", 0, 165.9319, 61.7510, &fam, &pop, &Overrides::default(),
            DEFAULT_TOL_ARCMIN,
        )
        .expect("resolves from the seed");
        assert!((v.app_mag - 1.79).abs() < 1e-4, "seed magnitude, not decoy 2.0");
        let r = (v.pos_pc[0].powi(2) + v.pos_pc[1].powi(2) + v.pos_pc[2].powi(2)).sqrt();
        assert!((r - 37.7).abs() < 0.5, "seed distance ~37.7 pc, not decoy 500, got {r}");
    }

    // A vertex with no famous / population match, but a seeded position override
    // for its constellation + coordinate, resolves via the override.
    #[test]
    fn off_star_vertex_trips_the_override_path() {
        let overrides = Overrides {
            overrides: vec![OverrideEntry {
                constellation: "Orion".into(),
                ra: 90.0,
                dec: 10.0,
                hip: None,
                position_pc: Some([1.0, 2.0, 3.0]),
                app_mag: Some(4.5),
            }],
        };
        let v = resolve_vertex(
            "Orion", 3, 90.0, 10.0, &famous(vec![]), &pop_from(vec![]), &overrides,
            DEFAULT_TOL_ARCMIN,
        )
        .expect("resolves via the override");
        assert_eq!(v.pos_pc, [1.0, 2.0, 3.0]);
        assert!((v.app_mag - 4.5).abs() < 1e-4);
    }

    // The label anchor sits at the MEDIAN vertex distance, so one far outlier
    // can't drag it off the figure. Four vertices near +x at 100 pc plus one at
    // 1000 pc: sorted distances [100,100,100,100,1000] have median 100 (the
    // mean, 280, is the wrong answer this test exists to reject).
    #[test]
    fn median_anchor_resists_one_distant_outlier() {
        let v = |ra: f64, dec: f64, dist: f64| ResolvedVertex {
            pos_pc: to_f32(ra_dec_dist_to_cartesian(ra, dec, dist)),
            app_mag: 2.0,
        };
        let verts = vec![
            v(1.0, 1.0, 100.0),
            v(-1.0, 1.0, 100.0),
            v(1.0, -1.0, 100.0),
            v(-1.0, -1.0, 100.0),
            v(0.0, 0.0, 1000.0),
        ];
        let anchor = constellation_label_anchor(&verts);
        let radial = (anchor[0].powi(2) + anchor[1].powi(2) + anchor[2].powi(2)).sqrt();
        // Median ~100, decisively not the mean ~280.
        assert!((radial - 100.0).abs() < 2.0, "radial should be the median ~100, got {radial}");
        // Direction inside the figure's span: all vertices cluster around +x.
        assert!(anchor[0] > 0.0, "anchor points toward the figure (+x)");
        let dot_x = anchor[0] as f64 / radial as f64;
        assert!(dot_x > 0.999, "anchor direction ~+x (within the vertex cone), dot {dot_x}");
    }

    // No seed, no population, no override → hard error carrying the nearest miss.
    // The only famous star sits ~100' away (1.667° in declination), so the
    // reported nearest_miss must be finite and around that.
    #[test]
    fn unresolvable_vertex_is_a_hard_error_naming_the_nearest_miss() {
        let fam = famous(vec![famous_entry(90.0, 10.0 + 100.0 / 60.0, 100.0, 3.0)]);
        let err = resolve_vertex(
            "Lyra", 7, 90.0, 10.0, &fam, &pop_from(vec![]), &Overrides::default(),
            DEFAULT_TOL_ARCMIN,
        )
        .expect_err("no candidate within tolerance");
        match err {
            ResolveError::Unresolvable {
                constellation, vertex_index, nearest_miss_arcmin, ..
            } => {
                assert_eq!(constellation, "Lyra");
                assert_eq!(vertex_index, 7);
                assert!(
                    (90.0..110.0).contains(&nearest_miss_arcmin),
                    "nearest miss ~100', got {nearest_miss_arcmin}"
                );
            }
        }
    }
}
