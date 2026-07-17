//! Raw-input parsers — ports of the CSV/`.dat` readers in
//! `tools/stars/buildStars.ts` and `tools/parsers/hipparcos2.ts`.
//!
//! The TS build streams the paged Gaia CSVs through `readline` because Node
//! cannot hold a 1.8 GB string; here each ~7 MB page is read whole and parsed
//! independently, which is what makes the parse embarrassingly parallel —
//! rayon maps over pages and the results are concatenated **in sorted page
//! order**, so the assembled row order is byte-identical to the sequential
//! TS stream regardless of thread count.
//!
//! Parsing fidelity notes (each mirrors a specific TS behaviour):
//! - A line whose first field fails to parse as an integer id is skipped —
//!   that is how the TS code skips the header (`BigInt('source_id')` throws).
//! - `numOrNull`: empty/whitespace cell → None; unparseable/non-finite →
//!   None. Missing required floats parse to NaN and flow through (never a
//!   drop) exactly as `Number.parseFloat(undefined) → NaN` does in TS.
//! - Rust's `str::parse::<f64>` and JS's `parseFloat` are both correctly
//!   rounded, so numeric cells produce bit-identical f64s. (JS's tolerance
//!   for trailing garbage is not replicated; the TAP CSVs are clean.)

use rayon::prelude::*;
use rustc_hash::FxHashMap;
use std::fs;
use std::path::Path;

/// One parsed Gaia main-catalog row (`gaia_page_*.csv` schema).
pub struct GaiaMainRow {
    pub source_id: u64,
    pub ra_deg: f64,
    pub dec_deg: f64,
    pub g_mag: f64,
    pub bp_rp: f64,
    pub r_med_geo: Option<f64>,
    pub r_med_photogeo: Option<f64>,
}

/// One parsed GCNS supplement row (`gcns_main.csv` schema).
pub struct GcnsRow {
    pub source_id: u64,
    pub ra_deg: f64,
    pub dec_deg: f64,
    /// Distance in PARSECS. The CSV's `dist_50` column (Gaia archive
    /// `external.gaiaedr3_gcns_main_1`) is in KILOparsecs — row 1 carries
    /// parallax 11.0285 mas (⇒ 90.7 pc) next to dist_50 = 0.090678625 — so
    /// the ×1000 conversion happens exactly once, here at the parse
    /// boundary, and everything downstream speaks parsecs like every other
    /// catalog. (The original TS build consumed dist_50 verbatim as pc; that
    /// bug crammed the ~217k GCNS-only supplement stars 1000× too near and
    /// showed up as the absMag clamp count ≈ the supplement population.)
    pub dist_pc: f64,
    pub g_mag: f64,
    pub bp_rp: f64,
}

/// One accepted Hipparcos-2 row (degrees + parsecs, converted at the edge).
pub struct Hip2Row {
    pub hip: u32,
    pub ra_deg: f64,
    pub dec_deg: f64,
    pub dist_pc: f64,
    pub hp_mag: f64,
    pub bv: f64, // NaN when the B−V column is blank
}

fn parse_f64(cell: &str) -> f64 {
    cell.trim().parse::<f64>().unwrap_or(f64::NAN)
}

fn num_or_null(cell: &str) -> Option<f64> {
    let t = cell.trim();
    if t.is_empty() {
        return None;
    }
    t.parse::<f64>().ok().filter(|v| v.is_finite())
}

/// Split a CSV line into at most `N` leading fields (the tail is ignored,
/// like the TS parsers which index only the columns they consume). Tolerates
/// a trailing `\r`.
fn fields<const N: usize>(line: &str) -> [&str; N] {
    let line = line.strip_suffix('\r').unwrap_or(line);
    let mut out = [""; N];
    for (i, f) in line.splitn(N + 1, ',').take(N).enumerate() {
        out[i] = f;
    }
    out
}

/// Parse every `gaia_page_*.csv` under `dir`, in sorted-name page order,
/// pages in parallel. Optionally limited to the first `max_pages` pages for
/// fast subset iteration during development.
pub fn parse_gaia_pages(dir: &Path, max_pages: Option<usize>) -> Vec<GaiaMainRow> {
    let mut pages: Vec<_> = fs::read_dir(dir)
        .expect("gaia dir")
        .filter_map(|e| e.ok().map(|e| e.file_name().to_string_lossy().into_owned()))
        .filter(|n| {
            n.starts_with("gaia_page_")
                && n.ends_with(".csv")
                && n["gaia_page_".len()..n.len() - 4].bytes().all(|b| b.is_ascii_digit())
        })
        .collect();
    pages.sort();
    if let Some(m) = max_pages {
        pages.truncate(m);
    }

    let per_page: Vec<Vec<GaiaMainRow>> = pages
        .par_iter()
        .map(|name| {
            let text = fs::read_to_string(dir.join(name)).expect("read gaia page");
            let mut rows = Vec::with_capacity(70_000);
            for line in text.lines() {
                if line.is_empty() {
                    continue;
                }
                let f: [&str; 7] = fields(line);
                let Ok(source_id) = f[0].trim().parse::<u64>() else { continue };
                rows.push(GaiaMainRow {
                    source_id,
                    ra_deg: parse_f64(f[1]),
                    dec_deg: parse_f64(f[2]),
                    g_mag: parse_f64(f[3]),
                    bp_rp: num_or_null(f[4]).unwrap_or(0.0),
                    r_med_geo: num_or_null(f[5]),
                    r_med_photogeo: num_or_null(f[6]),
                });
            }
            rows
        })
        .collect();

    // Ordered concatenation — this is the determinism seam: parallel parse,
    // sequential assembly in page order.
    let total: usize = per_page.iter().map(Vec::len).sum();
    let mut rows = Vec::with_capacity(total);
    for page in per_page {
        rows.extend(page);
    }
    rows
}

/// Parse `gcns_main.csv` (single small file).
pub fn parse_gcns(path: &Path) -> Vec<GcnsRow> {
    parse_gcns_text(&fs::read_to_string(path).expect("read gcns"))
}

/// IO-free GCNS parse core (takes file content, not a path, so tests can pin
/// the kpc→pc boundary conversion on fixture rows).
fn parse_gcns_text(text: &str) -> Vec<GcnsRow> {
    let mut rows = Vec::with_capacity(340_000);
    for line in text.lines() {
        if line.is_empty() {
            continue;
        }
        let f: [&str; 8] = fields(line);
        let Ok(source_id) = f[0].trim().parse::<u64>() else { continue };
        let bp = num_or_null(f[6]);
        let rp = num_or_null(f[7]);
        rows.push(GcnsRow {
            source_id,
            ra_deg: parse_f64(f[1]),
            dec_deg: parse_f64(f[2]),
            // dist_50 is kiloparsecs in the file — see the GcnsRow docstring.
            dist_pc: parse_f64(f[4]) * 1000.0,
            g_mag: parse_f64(f[5]),
            bp_rp: match (bp, rp) {
                (Some(b), Some(r)) => b - r,
                _ => 0.0,
            },
        });
    }
    rows
}

/// Parse `hip2_best_neighbour.csv` into HIP → source_id. Later rows for the
/// same HIP overwrite earlier ones (JS `Map.set` semantics), so insertion is
/// sequential in file order.
pub fn parse_hip_xmatch(path: &Path) -> FxHashMap<u32, u64> {
    let text = fs::read_to_string(path).expect("read hip xmatch");
    let mut map = FxHashMap::default();
    for line in text.lines() {
        if line.is_empty() {
            continue;
        }
        let f: [&str; 2] = fields(line);
        let Ok(source_id) = f[0].trim().parse::<u64>() else { continue };
        if let Ok(hip) = f[1].trim().parse::<u32>() {
            map.insert(hip, source_id);
        }
    }
    map
}

/// Fixed-width slot: 1-based inclusive byte range (VizieR ReadMe convention),
/// trimmed; empty for ranges past the line end. Port of `parsers/common.ts`.
fn slot(line: &str, start: usize, end: usize) -> &str {
    let bytes = line.as_bytes();
    if start > bytes.len() {
        return "";
    }
    let hi = end.min(bytes.len());
    std::str::from_utf8(&bytes[start - 1..hi]).unwrap_or("").trim()
}

/// Parse `hip2.dat` — port of `parseHipparcos2`. Returns accepted rows plus
/// the skip count (non-positive parallax or an unparseable required field).
pub fn parse_hipparcos2(path: &Path) -> (Vec<Hip2Row>, u64) {
    const RAD_TO_DEG: f64 = 180.0 / std::f64::consts::PI;
    let text = fs::read_to_string(path).expect("read hip2.dat");
    let mut rows = Vec::with_capacity(120_000);
    let mut skipped: u64 = 0;
    for line in text.lines() {
        // nonCommentLines: strip blank, '#'- and '--'-prefixed lines.
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') || t.starts_with("--") {
            continue;
        }
        let hip = slot(line, 1, 6).parse::<i64>();
        let ra_rad = slot(line, 16, 28).parse::<f64>();
        let de_rad = slot(line, 30, 42).parse::<f64>();
        let plx_mas = slot(line, 44, 50).parse::<f64>();
        let hp_mag = slot(line, 130, 136).parse::<f64>();
        let bv_str = slot(line, 153, 158);
        let bv = if bv_str.is_empty() { f64::NAN } else { bv_str.parse::<f64>().unwrap_or(f64::NAN) };

        let (Ok(hip), Ok(ra_rad), Ok(de_rad), Ok(plx_mas), Ok(hp_mag)) =
            (hip, ra_rad, de_rad, plx_mas, hp_mag)
        else {
            skipped += 1;
            continue;
        };
        if !(ra_rad.is_finite() && de_rad.is_finite() && plx_mas.is_finite() && hp_mag.is_finite())
        {
            skipped += 1;
            continue;
        }
        if plx_mas <= 0.0 {
            skipped += 1;
            continue;
        }
        rows.push(Hip2Row {
            hip: hip as u32,
            ra_deg: ra_rad * RAD_TO_DEG,
            dec_deg: de_rad * RAD_TO_DEG,
            dist_pc: 1000.0 / plx_mas,
            hp_mag,
            bv,
        });
    }
    (rows, skipped)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gcns_dist_50_is_kiloparsecs_converted_once_at_the_boundary() {
        // Real first data row of gcns_main.csv: dist_50 = 0.090678625 kpc
        // sits beside parallax = 11.028523 mas. The two are independent
        // distance statements about the same star, so 1000/parallax
        // cross-checks the unit: 90.674 pc vs 90.679 pc (they differ by the
        // Bayesian prior, ~0.005%, not by a factor of 1000).
        let rows = parse_gcns_text(
            "source_id,ra,dec,parallax,dist_50,phot_g_mean_mag,phot_bp_mean_mag,phot_rp_mean_mag\n\
             41888816866304,45.351115801831824,0.4734134932925721,11.028523,0.090678625,16.459179,18.203323,15.207612\n",
        );
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].dist_pc, 0.090678625 * 1000.0); // exact ×1000, applied once
        let from_parallax = 1000.0 / 11.028523;
        assert!(
            (rows[0].dist_pc - from_parallax).abs() / from_parallax < 1e-3,
            "dist_pc {} should agree with 1000/parallax {} to ~0.1%",
            rows[0].dist_pc,
            from_parallax
        );
        // The rest of the row parses as before.
        assert_eq!(rows[0].source_id, 41888816866304);
        assert_eq!(rows[0].bp_rp, 18.203323 - 15.207612);
    }
}
