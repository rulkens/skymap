//! The LOCKED SKST on-disk format — a port of the record/file layer of
//! `src/data/starCatalog/starCatalogFormat.ts` plus the sealed gzip codec of
//! `starBinCodec.ts`.
//!
//! Nothing here is a design decision: the browser decodes these bytes with
//! the repo's `decodeStarCatalog` + `DecompressionStream('gzip')`, so every
//! constant, bit position, and header offset is copied from the TS spec.
//! Two deliberate Rust-side choices worth documenting:
//!
//! - **Records are packed into a `u64`** (low 48 bits meaningful) instead of
//!   TS's two 24-bit halves. The halved arithmetic in TS exists only because
//!   JS bitwise ops are signed-32-bit; Rust has real 64-bit integers, so one
//!   composition is simpler and provably equivalent (the tests pin the byte
//!   layout, including the offsetZ straddle across the 24-bit boundary).
//!
//! - **Quantizers replicate JS's NaN flow-through.** `Math.floor(NaN)` is
//!   NaN, both range comparisons on NaN are false, and `NaN & 0x7f` is 0 —
//!   so a NaN input quantizes to index 0 and is NOT counted as a clamp. The
//!   Rust `f64 as i64` cast on NaN is also 0, and the comparisons mirror the
//!   TS ones exactly, so the (in-practice unreachable) NaN path agrees too.
//!
//! Gzip: Node's `CompressionStream('gzip')` is zlib at default level 6. We
//! use flate2/zlib-ng at level 6 — compressed *bytes* may differ (that is
//! explicitly allowed; only the decompressed payload and the size-vs-budget
//! decision matter), but any spec-valid gzip decodes in the runtime.

use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::Write;

pub const MAGIC: u32 = 0x5453_4b53; // "SKST" little-endian
pub const VERSION: u32 = 1;
pub const HEADER_BYTES: usize = 64;
pub const NODE_BYTES: usize = 16;
pub const RECORD_BYTES: usize = 6;

pub const STAR_ABSMAG_LEVELS: i64 = 128;
pub const STAR_ABSMAG_STEP: f64 = 0.19;
pub const STAR_ABSMAG_MIN: f64 = -6.0;
pub const STAR_COLORIDX_LEVELS: i64 = 64;
pub const STAR_COLORIDX_MIN: f64 = -0.6;
pub const STAR_COLORIDX_MAX: f64 = 4.4;
pub const STAR_COLORIDX_STEP: f64 =
    (STAR_COLORIDX_MAX - STAR_COLORIDX_MIN) / STAR_COLORIDX_LEVELS as f64;

/// Node's CompressionStream default (zlib Z_DEFAULT_COMPRESSION = 6).
pub const GZIP_LEVEL: u32 = 6;

/// Raw (un-clamped) absMag bin: `floor((absMag − MIN) / STEP)` as f64, so the
/// caller can both count clamps (TS `countClamps`) and quantize, with the
/// exact JS NaN/out-of-range semantics in one place.
#[inline]
pub fn abs_mag_bin(abs_mag: f64) -> f64 {
    ((abs_mag - STAR_ABSMAG_MIN) / STAR_ABSMAG_STEP).floor()
}

#[inline]
pub fn bp_rp_bin(bp_rp: f64) -> f64 {
    ((bp_rp - STAR_COLORIDX_MIN) / STAR_COLORIDX_STEP).floor()
}

/// Clamp a raw bin into `[0, max]`, mirroring TS `clampIndex`: NaN fails both
/// comparisons and falls through to the cast, which yields 0 — same as JS's
/// `NaN & mask`.
#[inline]
fn clamp_index(bin: f64, max: i64) -> u32 {
    if bin < 0.0 {
        0
    } else if bin > max as f64 {
        max as u32
    } else {
        bin as i64 as u32 // NaN → 0, matching `NaN & 0x7f` in the TS packer
    }
}

/// Quantize an absolute magnitude to its 7-bit LUT index (clamped 0..127).
#[inline]
pub fn abs_mag_to_lut_index(abs_mag: f64) -> u32 {
    clamp_index(abs_mag_bin(abs_mag), STAR_ABSMAG_LEVELS - 1)
}

/// Quantize a BP−RP colour to its 6-bit LUT index (clamped 0..63).
#[inline]
pub fn bp_rp_to_color_idx(bp_rp: f64) -> u32 {
    clamp_index(bp_rp_bin(bp_rp), STAR_COLORIDX_LEVELS - 1)
}

/// Dequantize a 7-bit magnitude index to its bin centre. The octree flux merge
/// seeds each leaf's flux from its *record* magnitude (this dequantized value),
/// not the raw one, so an aggregate sums exactly the flux its refined leaves
/// deposit — see `octree.rs` and the TS `buildStarOctree` leaf construction.
#[inline]
pub fn lut_index_to_abs_mag(i: u32) -> f64 {
    STAR_ABSMAG_MIN + (i as f64 + 0.5) * STAR_ABSMAG_STEP
}

/// Pack one 6-byte record into the low 48 bits of a u64.
///
/// Bit layout (LE across 48 bits): offsetX 0-9, offsetY 10-19, offsetZ 20-29,
/// absMagIdx 30-36, colorIdx 37-42, spare 43-47 (zero). Serialization writes
/// the low 6 bytes of the u64 in LE order — identical bytes to the TS packer's
/// two 24-bit halves (the tests pin this, straddle included).
#[inline]
pub fn pack_star_record(ox: u32, oy: u32, oz: u32, abs_mag_idx: u32, color_idx: u32) -> u64 {
    ((ox & 0x3ff) as u64)
        | (((oy & 0x3ff) as u64) << 10)
        | (((oz & 0x3ff) as u64) << 20)
        | (((abs_mag_idx & 0x7f) as u64) << 30)
        | (((color_idx & 0x3f) as u64) << 37)
}

/// Unpack a 6-byte record (compare tooling / tests).
pub fn unpack_star_record(rec: &[u8]) -> ([u32; 3], u32, u32) {
    let mut v: u64 = 0;
    for (i, b) in rec.iter().take(RECORD_BYTES).enumerate() {
        v |= (*b as u64) << (8 * i);
    }
    let ox = (v & 0x3ff) as u32;
    let oy = ((v >> 10) & 0x3ff) as u32;
    let oz = ((v >> 20) & 0x3ff) as u32;
    let abs_mag_idx = ((v >> 30) & 0x7f) as u32;
    let color_idx = ((v >> 37) & 0x3f) as u32;
    ([ox, oy, oz], abs_mag_idx, color_idx)
}

/// One octree node, mirroring `StarCatalogNode`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Node {
    pub morton_index: u32,
    pub level: u8,
    pub child_mask: u32, // 24-bit on disk; only the low 8 are ever set
    pub first_record: u32,
    pub record_count: u32,
}

/// Everything the header carries besides counts.
#[derive(Clone, Copy, Debug)]
pub struct Grid {
    pub morton_bits_per_axis: u32,
    pub cell_edge_pc: f64, // f64 in memory (quantization math); f32 on disk
    pub origin: [f64; 3],
}

/// A built catalog ready to serialize: nodes + the packed record blob.
pub struct Catalog {
    pub star_count: u32,
    pub grid: Grid,
    pub nodes: Vec<Node>,
    pub records: Vec<u8>,
}

impl Catalog {
    pub fn raw_bytes(&self) -> usize {
        HEADER_BYTES + self.nodes.len() * NODE_BYTES + self.records.len()
    }

    /// Serialize header + node table (everything except the record blob).
    /// Split from the records so gzip can stream both without ever
    /// concatenating a ~200 MB plaintext buffer per probe.
    pub fn header_and_nodes(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(HEADER_BYTES + self.nodes.len() * NODE_BYTES);
        out.extend_from_slice(&MAGIC.to_le_bytes());
        out.extend_from_slice(&VERSION.to_le_bytes());
        out.extend_from_slice(&self.star_count.to_le_bytes());
        out.extend_from_slice(&(self.nodes.len() as u32).to_le_bytes());
        out.extend_from_slice(&self.grid.morton_bits_per_axis.to_le_bytes());
        out.extend_from_slice(&(self.grid.cell_edge_pc as f32).to_le_bytes());
        out.extend_from_slice(&self.grid.origin[0].to_le_bytes());
        out.extend_from_slice(&self.grid.origin[1].to_le_bytes());
        out.extend_from_slice(&self.grid.origin[2].to_le_bytes());
        out.resize(HEADER_BYTES, 0); // reserved bytes 48..63 stay zero
        for n in &self.nodes {
            out.extend_from_slice(&n.morton_index.to_le_bytes());
            out.push(n.level);
            out.push((n.child_mask & 0xff) as u8);
            out.push(((n.child_mask >> 8) & 0xff) as u8);
            out.push(((n.child_mask >> 16) & 0xff) as u8);
            out.extend_from_slice(&n.first_record.to_le_bytes());
            out.extend_from_slice(&n.record_count.to_le_bytes());
        }
        out
    }

    /// Gzip the full serialized image into an owned buffer (final artifact).
    pub fn encode_gzip(&self) -> Vec<u8> {
        let mut enc = GzEncoder::new(
            Vec::with_capacity(self.raw_bytes() / 2),
            Compression::new(GZIP_LEVEL),
        );
        enc.write_all(&self.header_and_nodes()).expect("gzip write");
        enc.write_all(&self.records).expect("gzip write");
        enc.finish().expect("gzip finish")
    }

    /// Gzip and report only the compressed byte count — the probe path.
    /// A counting sink instead of a Vec: the binary search evaluates ~25
    /// probes per tier and only ever reads the size, so allocating (and
    /// touching) tens of MB of compressed output per probe would be pure
    /// waste.
    pub fn gzip_size(&self) -> u64 {
        let mut enc = GzEncoder::new(CountingSink::default(), Compression::new(GZIP_LEVEL));
        enc.write_all(&self.header_and_nodes()).expect("gzip write");
        enc.write_all(&self.records).expect("gzip write");
        enc.finish().expect("gzip finish").0
    }
}

/// `Write` sink that discards bytes and counts them.
#[derive(Default)]
pub struct CountingSink(pub u64);

impl Write for CountingSink {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0 += buf.len() as u64;
        Ok(buf.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::read::GzDecoder;
    use std::io::Read;

    /// Reference packer transliterated from the TS two-24-bit-halves code, so
    /// the u64 composition is checked against the spec's own arithmetic.
    fn ts_pack(ox: u32, oy: u32, oz: u32, abs_mag_idx: u32, color_idx: u32) -> [u8; 6] {
        let lo = (ox & 0x3ff) | ((oy & 0x3ff) << 10) | ((oz & 0xf) << 20);
        let hi = (oz >> 4) | ((abs_mag_idx & 0x7f) << 6) | ((color_idx & 0x3f) << 13);
        [
            (lo & 0xff) as u8,
            ((lo >> 8) & 0xff) as u8,
            ((lo >> 16) & 0xff) as u8,
            (hi & 0xff) as u8,
            ((hi >> 8) & 0xff) as u8,
            ((hi >> 16) & 0xff) as u8,
        ]
    }

    fn u64_to_bytes(rec: u64) -> [u8; 6] {
        let b = rec.to_le_bytes();
        [b[0], b[1], b[2], b[3], b[4], b[5]]
    }

    #[test]
    fn packing_matches_ts_halves_including_offsetz_straddle() {
        // offsetZ = 0b1010110101 splits as low nibble 0101 (low half) and
        // high six bits 101011 (high half) — the straddle the TS comment
        // calls out. Exercise it plus the extremes.
        let cases = [
            (0u32, 0u32, 0u32, 0u32, 0u32),
            (1023, 1023, 1023, 127, 63),
            (1, 2, 0b1010110101, 0x55, 0x2a),
            (512, 256, 15, 64, 32),  // oz entirely in the low half
            (0, 0, 16, 0, 0),        // oz entirely in the high half
            (770, 3, 1000, 99, 41),
        ];
        for (ox, oy, oz, a, c) in cases {
            assert_eq!(
                u64_to_bytes(pack_star_record(ox, oy, oz, a, c)),
                ts_pack(ox, oy, oz, a, c),
                "case ({ox},{oy},{oz},{a},{c})"
            );
        }
    }

    #[test]
    fn pack_unpack_roundtrip() {
        for (ox, oy, oz, a, c) in [(0, 0, 0, 0, 0), (1023, 0, 517, 127, 1), (33, 999, 21, 90, 63)]
        {
            let rec = u64_to_bytes(pack_star_record(ox, oy, oz, a, c));
            assert_eq!(unpack_star_record(&rec), ([ox, oy, oz], a, c));
        }
    }

    #[test]
    fn lut_quantization_boundaries() {
        // Exactly on a bin edge floors into the upper bin (floor semantics).
        assert_eq!(abs_mag_to_lut_index(STAR_ABSMAG_MIN), 0);
        assert_eq!(abs_mag_to_lut_index(STAR_ABSMAG_MIN + STAR_ABSMAG_STEP), 1);
        // Just below the floor clamps to 0; above the ceiling clamps to 127.
        assert_eq!(abs_mag_to_lut_index(STAR_ABSMAG_MIN - 1e-9), 0);
        assert_eq!(abs_mag_to_lut_index(100.0), 127);
        // Bin centre dequantizes to itself.
        let centre = lut_index_to_abs_mag(64);
        assert_eq!(abs_mag_to_lut_index(centre), 64);
        // Colour window: −0.6 → 0, 4.4 (the ceiling) clamps to 63.
        assert_eq!(bp_rp_to_color_idx(STAR_COLORIDX_MIN), 0);
        assert_eq!(bp_rp_to_color_idx(STAR_COLORIDX_MAX), 63);
        assert_eq!(bp_rp_to_color_idx(STAR_COLORIDX_MAX - 1e-9), 63);
        // NaN follows the JS path: quantizes to 0, and its raw bin fails both
        // clamp-count comparisons.
        assert_eq!(abs_mag_to_lut_index(f64::NAN), 0);
        let bin = abs_mag_bin(f64::NAN);
        assert!(!(bin < 0.0) && !(bin > (STAR_ABSMAG_LEVELS - 1) as f64));
    }

    #[test]
    fn gzip_is_single_member_spec_gzip_and_size_matches() {
        let cat = Catalog {
            star_count: 1,
            grid: Grid { morton_bits_per_axis: 9, cell_edge_pc: 1.5, origin: [0.0, 1.0, 2.0] },
            nodes: vec![Node { morton_index: 0, level: 0, child_mask: 0, first_record: 0, record_count: 1 }],
            records: u64_to_bytes(pack_star_record(1, 2, 3, 4, 5)).to_vec(),
        };
        let gz = cat.encode_gzip();
        // gzip magic + deflate method byte — what DecompressionStream('gzip')
        // requires of the header.
        assert_eq!(&gz[0..3], &[0x1f, 0x8b, 0x08]);
        assert_eq!(cat.gzip_size(), gz.len() as u64, "counting sink must equal real output");
        // Round-trips to the exact serialized image.
        let mut plain = Vec::new();
        GzDecoder::new(&gz[..]).read_to_end(&mut plain).unwrap();
        let mut expect = cat.header_and_nodes();
        expect.extend_from_slice(&cat.records);
        assert_eq!(plain, expect);
        // Header fields land at the spec offsets.
        assert_eq!(u32::from_le_bytes(plain[0..4].try_into().unwrap()), MAGIC);
        assert_eq!(u32::from_le_bytes(plain[4..8].try_into().unwrap()), VERSION);
        assert_eq!(u32::from_le_bytes(plain[8..12].try_into().unwrap()), 1); // starCount
        assert_eq!(u32::from_le_bytes(plain[12..16].try_into().unwrap()), 1); // nodeCount
        assert_eq!(f64::from_le_bytes(plain[32..40].try_into().unwrap()), 1.0); // originY
    }
}
