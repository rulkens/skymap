# Moon orbit rate double-counts apsidal precession

Enceladus's JPL `P = 1.370218 d` equals its IAU spin period exactly, i.e. it
behaves as a LONGITUDE period. `moonRatesFromPeriods` reads every satellite `P`
as the mean-anomaly period and then adds apsidal precession (Papsis 2.916 yr ≈
0.34°/day), the same double count `moonRatesFromSiderealPeriods` fixed for the
Moon. Io reads `P` as anomalistic correctly, so the column's meaning is per-row,
not per-table; check each row against its IAU Ẇ.

Facing no longer depends on this (synchronous moons derive it from the orbit),
but the moons still ride the wrong orbital longitude: Europa and Enceladus drift
~120° per decade from where they should be.

Tethys's `Papsis = 0.005 yr` on an e = 0.001 orbit also makes its ω/M split
meaningless; only the longitude λ = Ω + ω + M is well defined there.
