# Synchronous moons drift off their tidal lock

Surfaced while texturing Mimas, Tethys, Dione, Rhea and Iapetus (CICLOPS maps).
A tidally locked moon's facing comes from its IAU rotation row
(`rotationElements.ts`, W₀ + Ẇ·d) and its position from its JPL orbit row
(`orbitalElements.ts`), and nothing ties the two together. Where they disagree,
the textured moon turns away from its planet: its sub-planet longitude is no
longer 0, and Iapetus's dark leading hemisphere trails.

## Measured (`deriveBodyStates`, angle from local +x to the parent)

| Moon      | J2000  | J2000 + 10 yr | Reading                                  |
| --------- | ------ | ------------- | ---------------------------------------- |
| Moon      | 6.8°   | 6.9°          | control: fine                            |
| Io        | 0.6°   | 2.6°          | fine                                     |
| Ganymede  | 2.5°   | 2.5°          | fine                                     |
| Callisto  | 1.6°   | 0.5°          | fine                                     |
| Charon    | 1.4°   | 1.4°          | fine                                     |
| Europa    | 1.9°   | 120.3°        | **rate** mismatch                        |
| Enceladus | 9.4°   | 143.8°        | **rate** mismatch                        |
| Mimas     | 14.0°  | 34.4°         | dropped IAU librations (see its row)     |
| Tethys    | 59.3°  | 57.4°         | **phase** mismatch at epoch              |
| Dione     | 150.2° | 98.0°         | **phase** mismatch at epoch              |
| Rhea      | 154.6° | 160.0°        | **phase** mismatch at epoch              |
| Iapetus   | 145.1° | 144.1°        | **phase** mismatch at epoch              |

## Two separate causes

- **Rate.** Enceladus's JPL `P = 1.370218 d` equals its IAU spin period
  exactly, i.e. it behaves as a LONGITUDE period, but `moonRatesFromPeriods`
  reads every satellite `P` as the mean-anomaly period and then adds apsidal
  precession (Papsis 2.916 yr ≈ 0.34°/day) — the same double count
  `moonRatesFromSiderealPeriods` fixed for the Moon. Io reads `P` as anomalistic
  correctly, so the column's meaning is per-row, not per-table; check each row
  against its IAU Ẇ.
- **Phase.** Tethys/Dione/Rhea/Iapetus are off at J2000 itself, so their
  epoch longitude λ = Ω + ω + M (Laplace frame) and the IAU W₀ disagree on where
  the sub-Saturn meridian is. Tethys's `Papsis = 0.005 yr` on an e = 0.001 orbit
  also makes its ω/M split meaningless; only λ is well defined there.

## Shape of a fix

Either (a) fix each orbit row's epoch longitude and rate convention until the
table above reads ≲ 10° everywhere, or (b) add a `tidallyLocked` arm to
`RotationElements` that derives the facing from the orbit (+x toward the parent,
−y along the velocity), deleting the IAU W rows for every synchronous moon. (b)
is structurally right — the lock IS the physics — and loses only the small
optical librations nothing renders. A regression test should assert the table's
J2000 and +10 yr angles stay under a bound for every textured moon.
