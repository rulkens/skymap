# Decisions log (2026-08-01)

- **Splat path is the only field renderer.** Loop deleted after the A/B: 0.3–0.4 ms vs 1 ms at
  defaults; cost tracks covered area, not pixels × components.
- **comps moved uniform → storage buffer**; background extras render analytically (per-extra
  mixtures, world-transformed CPU-side, one instanced draw). Amplitude transforms as **A/s**:
  extras scale sprite _size_ (flux ∝ s²) against the Gaussian's s³ volume.
- **Rings de-featured**: six of eight ring knobs frozen/derived (σ from spacing at 13/23 overlap;
  per-ring flux from closed-form annulus integrals of exp(−R/h) — the geometric-falloff trap died
  with its slider). Rings ride the disc's enable; they are warp plumbing, not a layer.
- **Colour architecture decided** (not yet built): colour belongs to _populations_ (SSP-grounded
  palette registry), variation belongs to _features_ (per-channel dust reddening, SFR knots), the
  smooth field stays colour-smooth — unresolved light averages, so blob-level colour jitter is a
  rendering artifact, never realism. Survey closure: the model's integrated colour must match the
  galaxy's own measured catalog colour index.
- **Survey-to-parameters map** drafted (`docs/superpowers/specs/2026-08-01-survey-to-params-map-design.md`):
  fetch-verified range table; headline pipeline find — 2MRS carries ZCAT T-types for ~21k galaxies
  that the parser currently drops; `classByte` is the documented landing slot.
