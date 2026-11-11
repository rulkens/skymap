# Moon tiles: polar cast shadows

The LROC WAC morphologic mosaic is shot at 55–75° incidence, so above about 65° latitude its craters
carry hard black cast shadows. De-lighting cannot recover them (no surface detail inside), and the
subsolar photo-Sun model sinks to ~5° there, so the high latitudes read mottled
(`moonAlbedoRecipe.ts`). Accepted for the first Moon tiles PR.

Options: fade the |lat| > ~65° rows toward a lower-incidence source (LROC's polar mosaics, or the
Solar System Scope base the globe already draws), or leave the poles to the base globe by clipping
the bake band. Judge against an eye check at ~70° first.
