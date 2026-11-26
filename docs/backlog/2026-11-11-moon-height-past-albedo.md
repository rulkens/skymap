# Moon height detail past the albedo levels

A bake band's height rides its imagery levels (`bakeAll`), so with Moon albedo stopping at z7 the
LOLA 118 m DEM is decimated to z7's 667 m posts. Using LOLA fully needs height at z9 (167 m posts).
Albedo to z9 would oversample WAC 2.4× and cost ~16× the tiles; the cheaper shape is a height-only
band deeper than its imagery, which the bake and the runtime's height lane would both have to
support. The same lever applies to Mars (MOLA resolves z9; height stops at z7 outside the rover
sites). SLDEM2015 (59 m, ±60°) is the sharper source if this lands.
