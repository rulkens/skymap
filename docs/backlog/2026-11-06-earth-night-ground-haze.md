# Earth's ground draws grey-white at night up close

`needs-debug` — found filming the grand tour's rise (2026-11-06). At 20:00 UTC on 2026-10-10 over
Søndermarken (full night, no Moon), the ground tiles around the park draw a flat grey-white haze
from the lawn up to a few kilometres; above that the night side reads dark with city lights. The
park's scan mesh keeps its daylight colours at night at the same time.

Repro: `#tour=grandTour`, beat 01, the first third of the rise. Contact sheet from the tour
branch: `data/shots/r1tour-contact.jpg` (frames 5–9, about 1 s apart).

Not diagnosed. Suspects: the aerial-perspective / in-scatter term at low altitude on the night
side, the ground tiles' night branch below the altitude where the global night texture takes over,
and the earthScenes mesh shading ignoring the Sun's altitude. Read `docs/RENDERER.md` first. Ruled
backlog, not the tour PR (2026-11-06).
