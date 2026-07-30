// lib/nightLights.wesl — the Earth city-lights (Black Marble) emissive term.
//
// Earth's surface fragment (Task 3) composes this on TOP of the lit PBR result
// from 'lib/pbr.wesl'. It is the one body with a night-side light source of its
// own, so unlike everything in 'pbr.wesl' this contribution is NOT reflected sun
// light — it lives here rather than inline so the terminator-fade shape has a
// single, named home the fragment cannot accidentally re-derive.
//
// ## Emissive, not lit
//
// City lights EMIT; they do not reflect the sun. So this term is ADDED to the
// surface colour after PBR shading, never multiplied through the Lambert 'NoL'
// cosine the way an albedo would be. That is the whole reason it is a separate
// function: routing the night map through 'pbrDirect' would (correctly, for a
// reflector) drive it to zero exactly where we WANT it brightest — the dark
// side. Emission is independent of the sun direction except for the terminator
// fade below, which exists only so the lights do not glow through the lit day
// hemisphere.
//
// ## The night weight — (1 - dayFactor(NoL))
//
// 'dayFactor(NoL)' is a 'smoothstep' that rises from 0 on the night side to 1
// once the fragment is a little past the terminator into daylight. The lights
// are then weighted by '(1 - dayFactor)': full strength on the dark hemisphere,
// smoothly extinguished across a narrow band around the terminator, and exactly
// zero everywhere the sun is up. A hard 'NoL > 0' cut would draw a crawling
// aliased line along the day/night boundary; the smoothstep band dissolves it.
//
// This is the SINGLE home for that fade shape. The surface fragment passes the
// raw clamped Lambert term 'NoL' (1 at the sub-solar point, 0 on the dark side)
// straight in — it must not pre-shape it, or the band would be applied twice.
//
// ## The cloud seam — cloudAlpha
//
// 'cloudAlpha' is the plan-D coupling seam, wired to its final shape NOW so plan
// D changes no code here. In THIS plan (B) no cloud texture is bound, so the
// caller passes '0.0' and '(1 - cloudAlpha)' is a no-op. When plan D binds the
// cloud map it will sample coverage at the fragment's own uv and pass it here;
// '(1 - cloudAlpha)' then dims city lights under overcast, the way clouds occlude
// them from orbit. The multiply lives here (not in the fragment) so the emissive
// term stays a single self-contained primitive.
//
// ## Not unit-testable
//
// This is GPU code with no CPU-reachable surface; its correctness is a visual
// judgement made against the Task 3 fragment (verified in Task 4), not an
// assertion. There is deliberately no runtime-type or source-grep test for it.
//
// Comments single-quoted, never backticks (the WESL parser tokenises a backtick
// even inside a comment).

// ── tunable constants ────────────────────────────────────────────────
//
// Named knobs the Task 4 visual pass tunes via HMR; they live next to the
// function that reads them so the fragment can never drift a value apart.

// Emissive scale into the HDR foreground target. The day term in that target
// peaks around 'sunIrradiance = 3.0' (bright, but well inside HDR range before
// tonemapping), so city lights need to sit well below full daylight to read
// as 'night' yet still be clearly visible against the dark hemisphere. 1.0 is
// the starting point — lights at roughly 1/3 of the day peak so they glow
// without rivalling the sunlit side; the visual pass tunes it.
const NIGHT_BRIGHTNESS: f32 = 1.0;

// The terminator 'smoothstep' band, in Lambert-cosine ('NoL') space. Lights are
// full-on across the entire dark side (NoL <= LO) and fully gone once the
// fragment is just past the terminator into daylight (NoL >= HI). The band is
// narrow and anchored at 0 so the lights vanish SHORTLY past the terminator
// rather than bleeding across the day face — a slightly-lit dawn/dusk sliver,
// not a hemisphere-wide glow. HI = 0.15 is a few degrees of solar elevation.
const NIGHT_TERMINATOR_LO: f32 = 0.0;
const NIGHT_TERMINATOR_HI: f32 = 0.15;

// ── dayFactor — the terminator fade ──────────────────────────────────
//
// Maps the Lambert term 'NoL' to a 0..1 'is it daytime here' factor across the
// named terminator band. 0 on the dark side, 1 in daylight, a smooth ramp
// between. The night weight the caller wants is '(1 - dayFactor(NoL))'. Kept as
// its own function so the fade shape is stated once and reused if another
// emissive body ever wants the same terminator behaviour.

fn dayFactor(NoL: f32) -> f32 {
  return smoothstep(NIGHT_TERMINATOR_LO, NIGHT_TERMINATOR_HI, NoL);
}

// ── nightLights — the composed emissive city-lights term ─────────────
//
// The value to ADD to the lit surface colour (never multiply through 'NoL').
//   nightColour : the Black Marble night map sample (linear rgb, decoded from an
//                 sRGB texture).
//   NoL         : the caller's clamped 'max(dot(n, l), 0)' — 1 at the sub-solar
//                 point, 0 on the dark side. Passed RAW; this function owns the
//                 terminator shaping.
//   cloudAlpha  : cloud coverage at the fragment's own uv — 0.0 in plan B, the
//                 real sample in plan D (see the header's cloud-seam note).
//
//   return nightColour * (1 - dayFactor(NoL)) * (1 - cloudAlpha) * NIGHT_BRIGHTNESS

fn nightLights(nightColour: vec3<f32>, NoL: f32, cloudAlpha: f32) -> vec3<f32> {
  let nightWeight = 1.0 - dayFactor(NoL);
  return nightColour * nightWeight * (1.0 - cloudAlpha) * NIGHT_BRIGHTNESS;
}
