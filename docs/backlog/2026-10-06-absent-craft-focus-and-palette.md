# Should focus and palette refuse an absent craft?

**Needs a user ruling.** A sampled craft is absent before launch (or before `spacecraftTracks.bin` loads) and its snapshot state is Earth's position. `#focus=body-voyager1&t=1977-01-01` and the Voyager palette cards still fly the camera to it, so the camera frames Earth at craft-sized standoff, with no craft, label or trail.

Options: (a) leave it, the clock jump is the visitor's doing; (b) refuse or defer the focus while `spacecraftPresent` is false and say why; (c) on focusing an absent craft, move the clock to its launch. (c) is the least surprising but writes the clock from a focus action.
