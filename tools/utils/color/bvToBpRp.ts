/**
 * bvToBpRp — map a Johnson B−V colour onto the Gaia DR3 G_BP − G_RP axis.
 *
 * WHY THIS EXISTS
 * The star catalog quantises each star's colour into a 6-bit index defined
 * over Gaia BP−RP. The bulk of the catalog is Gaia, which reports BP−RP
 * natively. The bright-star patch (Hipparcos-2, Hp < 4.0) instead carries
 * Johnson B−V — Gaia saturates on the brightest naked-eye stars, so those
 * rows come from Hipparcos. To live on the SAME colour axis (and quantise
 * into the same 6-bit table) a Hipparcos star's B−V must be transposed onto
 * BP−RP before quantisation. That transposition is this function.
 *
 * SOURCE (transcribed verbatim, digit-checked twice against the page)
 *   ESA Gaia DR3 Documentation, release 1.3
 *   Part II, Chapter 5 (Photometric data), §5.5.1
 *   "Photometric relationships with other photometric systems"
 *   https://gea.esac.esa.int/archive/documentation/GDR3/Data_processing/chap_cu5pho/cu5pho_sec_photSystem/cu5pho_ssec_photRelations.html
 *
 *   Table 5.9 (Johnson-Cousins), row  G_BP − G_RP = f(B−V):
 *     G_BP − G_RP = 0.06483
 *                 + 1.575  · (B−V)
 *                 − 0.7815 · (B−V)^2
 *                 + 0.5707 · (B−V)^3
 *                 − 0.176  · (B−V)^4
 *     σ (scatter of the fit) = 0.0659 mag
 *   Table 5.10 (ranges of applicability): −0.5 < B−V < 3.5.
 *
 * WHY THE DIRECT RELATION (and not a composed one)
 * The DR3 documentation publishes G_BP − G_RP = f(B−V) as a single direct
 * fit, so there is no need to compose two relations (e.g. G−V = f(B−V) with
 * a G−V = f(BP−RP) inversion); we use the direct polynomial as published.
 * (This particular row is new in DR3 — the EDR3 version of the table does
 * not contain a B−V-driven BP−RP relation.)
 *
 * VALIDITY, and a CAVEAT AT THE RED END
 * The stated validity range −0.5 < B−V < 3.5 numerically covers the whole
 * Hp < 4.0 bright set (B−V ≈ −0.3 … +1.9) and all ordinary stellar colours.
 * BUT this degree-4 fit is only MONOTONIC up to B−V ≈ 1.88: past that the
 * polynomial turns over (its maximum, BP−RP ≈ 1.857, is at B−V ≈ 1.884) and
 * then decreases — a well-known artefact of a high-order fit near the edge
 * of its colour interval, not a real colour inversion. The reddest few
 * Hp < 4.0 stars (B−V ≈ 1.85 … 1.9) therefore all saturate near BP−RP ≈
 * 1.86; after 6-bit quantisation they land in the same top colour bin, so
 * the turnover is cosmetically invisible here. We apply the polynomial
 * exactly as published (no clamping the plan did not ask for); callers that
 * care about the extreme red tail should be aware of the turnover.
 */
export function bvToBpRp(bv: number): number {
  // Horner form of 0.06483 + 1.575 x − 0.7815 x^2 + 0.5707 x^3 − 0.176 x^4.
  return 0.06483 + bv * (1.575 + bv * (-0.7815 + bv * (0.5707 + bv * -0.176)));
}
