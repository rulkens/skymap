//! Morton (Z-order) encode/decode for ≤10-bit grid coordinates — a port of
//! `src/utils/math/mortonEncode3.ts` / `mortonDecode3.ts`.
//!
//! The bit-dilation ("part1by2") magic-mask sequence is copied verbatim from
//! the TS implementation rather than re-derived, because the on-disk octree's
//! node `mortonIndex` values must be bit-identical to what the TS decoder in
//! the browser reconstructs cells from. The alternative — a lookup-table or
//! PDEP-based encode — would be marginally faster but would decouple this
//! file from its spec for no measurable gain: Morton encoding is nowhere near
//! the pipeline's hot path (it runs once per star at quantization, next to
//! two `sin`/`cos` calls that dwarf it).

/// Interleave three ≤10-bit coordinates: bit i of x → code bit 3i, y → 3i+1,
/// z → 3i+2. Result is ≤30 bits, so it always fits a u32.
pub fn morton_encode3(x: u32, y: u32, z: u32) -> u32 {
    part1by2(x) | (part1by2(y) << 1) | (part1by2(z) << 2)
}

/// Recover `[x, y, z]` from a 30-bit Morton code — exact inverse of
/// `morton_encode3`.
pub fn morton_decode3(code: u32) -> [u32; 3] {
    [compact1by2(code), compact1by2(code >> 1), compact1by2(code >> 2)]
}

/// Spread the low 10 bits of `n` so bit i lands on bit 3i (two zero bits
/// between consecutive source bits). Classic log-step dilation.
fn part1by2(mut n: u32) -> u32 {
    n &= 0x3ff;
    n = (n ^ (n << 16)) & 0xff0000ff;
    n = (n ^ (n << 8)) & 0x0300f00f;
    n = (n ^ (n << 4)) & 0x030c30c3;
    n = (n ^ (n << 2)) & 0x09249249;
    n
}

/// Gather bits 0, 3, 6, … 27 of `n` back into a dense 10-bit integer —
/// inverse of `part1by2`.
fn compact1by2(mut n: u32) -> u32 {
    n &= 0x09249249;
    n = (n ^ (n >> 2)) & 0x030c30c3;
    n = (n ^ (n >> 4)) & 0x0300f00f;
    n = (n ^ (n >> 8)) & 0xff0000ff;
    n = (n ^ (n >> 16)) & 0x000003ff;
    n
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_values() {
        // Hand-computed: (1,0,0) → bit 0; (0,1,0) → bit 1; (0,0,1) → bit 2.
        assert_eq!(morton_encode3(1, 0, 0), 0b001);
        assert_eq!(morton_encode3(0, 1, 0), 0b010);
        assert_eq!(morton_encode3(0, 0, 1), 0b100);
        // (3,5,7): x=0b011→bits 0,3; y=0b101→bits 1,7; z=0b111→bits 2,5,8.
        assert_eq!(morton_encode3(3, 5, 7), 0b110101111);
        // Max 10-bit coords fill all 30 bits.
        assert_eq!(morton_encode3(1023, 1023, 1023), (1 << 30) - 1);
    }

    #[test]
    fn roundtrip_exhaustive_low_and_sampled_high() {
        for x in 0..64u32 {
            for y in [0u32, 1, 7, 33, 63] {
                for z in [0u32, 2, 31, 62] {
                    assert_eq!(morton_decode3(morton_encode3(x, y, z)), [x, y, z]);
                }
            }
        }
        for c in [0u32, 1, 511, 512, 777, 1023] {
            assert_eq!(morton_decode3(morton_encode3(c, 1023 - c, c / 2)), [c, 1023 - c, c / 2]);
        }
    }

    #[test]
    fn parent_shift_is_octant_grouping() {
        // The octree relies on parent = child_morton >> 3 grouping the 2×2×2
        // sibling block: halving each coordinate must equal the shifted code.
        let (x, y, z) = (401, 78, 933);
        let child = morton_encode3(x, y, z);
        assert_eq!(child >> 3, morton_encode3(x / 2, y / 2, z / 2));
    }
}
