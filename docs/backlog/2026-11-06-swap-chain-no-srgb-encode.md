# The swap chain gets linear values with no sRGB encode

`needs-design` — found diagnosing Earth's dark day sky (2026-11-06). The swap chain is
`bgra8unorm` on macOS (a non-sRGB format), and the compositor's tone branch
(`shaders/compositor/fragment.wesl`) writes the curve's linear output straight into it. No OETF
runs anywhere: a scene-linear 0.145 after Reinhard lands as code value 37/255, where an sRGB encode
would give about 107. The header of `shaders/lib/tonemap.wesl` says the opposite ("an 8-bit sRGB
surface").

Every look in the app was eye-tuned on this path: exposures, curve choice, star and galaxy
brightness, planet shading. Encoding properly would lift every mid-tone at once, so it is an
app-wide look change, not a bug fix. It needs its own spec: an sRGB view or format on the swap
chain (or an encode in the compositor), a re-tune of the look dials against it, and before/after
shots across the regimes (deep space, a planet from orbit, the ground by day and by night, the
extended-range HDR swap).

Measured at `#pose=k,earth,0.21859354349348772,0.9716130157244841,3.141592653589793,1.0471975511965976&t=2026-11-03T10:55:00Z`:
the screen's sky pixel matched the linear-written prediction on all three channels to within one
code value.
