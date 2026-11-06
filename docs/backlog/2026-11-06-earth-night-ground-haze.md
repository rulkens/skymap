# Earth's ground draws grey-white at night up close

`needs-design` — found filming the grand tour's rise (2026-11-06). At 20:00 UTC on 2026-10-10 over
Søndermarken (full night, no Moon), the ground tiles around the park draw a flat grey-white haze
from the lawn up to a few kilometres; above that the night side reads dark with city lights. The
park's scan mesh keeps its daylight colours at night at the same time.

Repro: `#tour=grandTour`, beat 01, the first third of the rise. Contact sheet from the tour
branch: `data/shots/r1tour-contact.jpg` (frames 5–9, about 1 s apart). Single frame:
`#pose=k,earth,0.21859354349348772,0.9716130157244841,3.141592653589793,0.15&t=2026-09-05T20:30:00Z`
(the distant ground at the right edge and through the arch).

It starts before dark: on 2026-09-05 the tiles turn grey-white from about 4° of solar altitude,
some 30 min before sunset, in every direction (beat 00's sunset, `data/shots/b00sun/`).

## Diagnosis (2026-11-06, measured)

It is the surface tiles' night-lights emissive, not the atmosphere. At the single-frame link, one
grey pixel reads `foreground:0` = (0.56, 0.56, 0.54):

- with the `aerial-perspective` pass disabled: unchanged, so not the in-scatter;
- with `surface-tiles` disabled: 0.0011, so the tile draw;
- with the emissive zeroed in `shaders/bodies/surfaceTile/fragmentEarth.wesl`: 0.019.

The Black Marble radiance at 500 m (Copenhagen's urban glow) is added at full strength as a flat
emissive over every fragment, which from 1.7 m reads as a uniform sheet. The 4° onset is
`lib/nightLights.wesl`'s terminator fade: `NIGHT_TERMINATOR_HI = 0.15`, so the lights start fading
in once the Sun is below about 8.6° and are at half strength by about 4°.

Open design question: how city light should read at street level. Possible approaches are a fade by camera
altitude below a few km, a lower terminator, or only the lit pixels of a sharper product. The
scan mesh's day colours at night are a separate question (earthScenes mesh shading ignores the
Sun's altitude). Read `docs/RENDERER.md` first.
