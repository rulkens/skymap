# Should focus and palette refuse an absent craft?

**Needs a user ruling.** A sampled craft is absent before launch and, once its `sampledTrack.<id>.bin` loads, waits on its launch pad (before the tracks load its snapshot state is Earth's position). `#focus=body-voyager1&t=1977-01-01` and the Voyager palette cards still fly the camera to it, so the camera frames the pad at craft-sized standoff, with no craft, label or trail.

Options: (a) leave it, the clock jump is the visitor's doing; (b) refuse or defer the focus while `bodyPresent` is false and say why; (c) on focusing an absent craft, move the clock to its launch. (c) is the least surprising but writes the clock from a focus action.

Asteroid 2026 QQ8 has the same problem outside its track (2026-02-01 to 2027-03-31): the card and ring show with no rock. Option (c) was built for it and taken out again (owner, 2026-11-25: too much code for a very special case). It cost a saga that waits for the track before judging absence, a "tracks settled" action from the loader and a date field on the row, and still missed the card's FOCUS button and the `F` key, which write the focus directly.
