// milkyWay/ismMap/ismMapGrid.wesl — the log-radial grid bounds one galaxy's
// ISM map was built over (galaxyIsmMapArmForcing.ts's ismMapGridRadius),
// shared verbatim by every consumer that resolves world-space points through
// that grid: the log-polar present pass, the cartesian re-bake, and the
// re-bake's cartesian-UV reader. One binding-9 struct, three call sites —
// each still owns its own @group/@binding index for this uniform.

struct IsmMapGrid {
  rMin: f32,
  rMax: f32,
}
