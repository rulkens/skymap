// antiqueLook/cover.wesl — how much of a texel is body, read off the look's
// `bodies` binding. Outside an atmosphere that is foreground:0's colour, and its
// alpha is the coverage. Inside one the day sky drawn into that row carries alpha
// ~1 too, so `antiqueLook.ts` binds the row's DEPTH there instead, and sets
// FLAG_DEPTH_COVER: reversed-Z, so any depth above the far clear (0) is a surface.
// Inside an atmosphere the body's row is the only one, so its depth is complete.

const FLAG_DEPTH_COVER: u32 = 8u;

fn coverOf(t: vec4<f32>, flags: u32) -> f32 {
  return select(t.a, f32(t.r > 0.0), (flags & FLAG_DEPTH_COVER) != 0u);
}
