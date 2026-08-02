# Dust (2026-08-01)

Design record: `docs/grill-sessions/analytic-dust-lane-2026-08-01.md` (two sessions — the
global lane, then the filament/bubble network). What belongs here is the measured ground and
the decisions a future reader would otherwise re-derive.

**LITERATURE, verified 2026-08-01 (external-galaxy dust discs).** Radiative-transfer fits of
edge-on spirals agree: dust scale height ≈ 0.5× stellar (range 0.25–0.75), dust scale length
≈ 1.4–1.75× stellar, central face-on τ_V ≈ 0.5–1 (Xilouris et al. 1999; Bianchi 2007 A&A;
De Geyter et al. 2014 MNRAS 441, 869 — CALIFA mean 0.76 ± 0.6). The Milky Way's own layer is
thinner: h_z ≈ 100–134 pc against the ~314 pc stellar σ (Drimmel & Spergel 2001 — dust disc
h_R 2.26 kpc + an arm dust component; Misiriotis et al. 2006 — h_R 5 kpc, h_z 100 pc). These
became `GalaxyDustParams` defaults (ratios), with the MW preset pinning tau 0.5 (floor of the
measured range — the user's build-up-slowly instruction is the calibration principle),
heightRatio 0.35.

**INFERRED (derivation checked, not yet visually verified).** The compositing mechanism: dust
is a small Gaussian mixture whose per-ray column is the same erfc integral as emission; each
PRIMARY emission splat splits its ray at the dust's column-weighted depth centroid t_d —
E_out = E(0→t_d) + T·E(t_d→∞), T = exp(−τ·[0.88, 1.0, 1.25]) (CCM89 Table 3 interpolated to
the sRGB primaries). With t_d clamped ≥ 0 the split factor is non-negative by construction.
The key property vs a single multiplicative screen: a behind-the-plane bulge dims while the
near disc face does not — the differential that makes an edge-on rift read as a lane.

**LITERATURE (prior art, fetch-verified).** "Don't Splat your Gaussians" (Condor et al., ACM
TOG 2024, arXiv:2405.15425) uses the same erf-based closed-form optical depth through Gaussian
mixtures and confirms END-TO-END transmittance is order-independent (Beer–Lambert exponents
sum). Depth-resolved interleaving of emission with absorption is what reintroduces ordering —
EVER (arXiv:2410.01804) pays for it with hardware ray tracing; moment-based OIT for Gaussians
(arXiv:2512.11800) is the sort-free alternative and the named escalation path if our single
split-point approximation visibly fails. OpenSpace ships a ray-marched RGBA volume with two
global multipliers (the "worst case that ships"); SpaceEngine's sharp lanes come from hybrid
textured/procedural detail over a smooth base — independent support for the two-tier
architecture below.

**Network architecture (decided, not yet built).** A screen-space dust-column map: dust
components splatted into a full-res offscreen target accumulating (τ_V, τ·t̄); emission
fragments sample it once. Because the map is rasterized, detail splats are NOT limited to
Gaussians — they evaluate arbitrary 2.5D density at the ray's disc-plane crossing
(super-Gaussian lane edges, fractal along-lane modulation, negative bubble splats with swept
rims), so frequency content is bounded by pixels, not component count. The known thin-layer
limitation (industry 2.5D media): degrades at grazing incidence — division of labour is
explicit: the smooth analytic lane owns edge-on, the detail tier owns face-on/inclined and
fades by incidence. LOD: zero-mean detail tiers (each class a fluctuation around the tier
below) make sub-pixel instance culling unbiased — the far view converges exactly to the
analytic lane; width-clamped splats conserve column via the star renderer's clampFluxScale
identity. Builders stay pure (params, geometry, seed) → flat data — destined for a Worker or
compute pass (user constraint: real-time generation while navigating).

**LITERATURE, verified (network anchors — full table in the grill transcript).** Spurs: 83%
incidence GIVEN a well-defined primary dust lane vs 20% overall (La Vigne, Vogel & Ostriker
2006, ApJ 650, 818) — spur generation gates on lane strength, not Hubble type; spacing
300–800 pc (SECONDARY; theory 0.5–1 kpc). Bubbles: 1694 in NGC 628, radii 6–552 pc, size
power law −2.2 ± 0.1, 31% nested, radii grow downstream of the arm (Watkins et al. 2023,
ApJL 944, L24); HI holes 100 pc–2 kpc at slope ≈ −2.9 (Bagetakos et al. 2011, AJ 141, 23).
GMC knots: ~40–100 pc, central A_V ~ 10 (SECONDARY) — bead cores are genuinely opaque; arm
clouds 2.5× interarm mass (Rosolowsky et al. 2021). **GAP, flagged:** no primary-verified
dust-lane WIDTH exists in what we could fetch; lane-to-tracer offsets ~150–315 pc are
secondary-only. `laneWidth`'s default is an eyeball-vs-M74 call and says so.

## The beaded-lane debugging chain (2026-08-01) — read before touching map resolutions

**MEASURED, four probes.** The first arm dust lanes rendered as beaded dashes instead of
continuous ridges. Three model-based fixes (per-segment taper removal, joint s-bounding,
sub-pixel width clamps — first depth-based, then fwidth-based) were each individually CORRECT
and each left the beads untouched. The probe chain that found the truth: (1) flat tau per quad
→ continuous, so geometry/records/indexing fine; (2) profile alone → beads; (3) pass muted →
beads gone, so this pass owns them; (4) camera zoomed 2x → perfect continuous crinkly lanes
WITH the same shaders. Zoom-dependence + immunity-to-shader-math meant the defect was
downstream of shading: **dustMapTex was full-canvas resolution while its only consumers
(splat.wesl's attenuation read and dustPresent's JWST view) run at fieldTex's REDUCED
`fieldDivisor` resolution** — nearest-point reads decimated a ~1.5 px lane into beads, and the
attenuation read was silently misregistered (reduced-res coords indexing a full-res texture
unscaled).

**The standing rule this leaves:** a map rendered at higher resolution than its consumer is not
extra quality — it is a decimation trap. Size shared offscreen maps to their CONSUMER's rate
(the engine now rebuilds dustMapTex alongside fieldTex on every divisor change), and 1:1
`textureLoad(pos.xy)` reads are only valid under an explicitly-documented equal-extent
contract (now stated in io.wesl). The three earlier fixes were kept: they were real defects the
probes exposed on the way (dashed tapering, joint double-counting, and the missing
column-conserving AA floor — `fwidth(n)`-based, since a depth-only pixel size cannot see disc
foreshortening under an inclined camera).
