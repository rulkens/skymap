# scaleFadeBands Voyager comment

`src/services/engine/presentation/scaleFadeBands.ts` (~line 166) justifies `solarSystemSky` with "a Voyager for two centuries (170 au today, 3.6 au/yr)". Voyager 1 is now a measured track (`spacecraftTracks.bin`, 171.9 AU in Oct 2026), so the comment cites a hand-typed number the data can state exactly, and the band's reach (500-1000 AU) is not tied to anything the code reads. Either reword to the 2100 end of the track (about 190 AU) or derive the edge from the track end. Check whether the sky bake needs to hold at all with the craft present.
