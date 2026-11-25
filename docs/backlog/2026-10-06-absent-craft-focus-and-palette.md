# Should focus and palette refuse an absent craft?

**Needs a user ruling for the Voyagers.** A sampled craft is absent before launch and, once its `sampledTrack.<id>.bin` loads, waits on its launch pad (before the tracks load its snapshot state is Earth's position). `#focus=body-voyager1&t=1977-01-01` and the Voyager palette cards still fly the camera to it, so the camera frames the pad at craft-sized standoff, with no craft, label or trail.

Options: (a) leave it, the clock jump is the visitor's doing; (b) refuse or defer the focus while `bodyPresent` is false and say why; (c) on focusing an absent craft, move the clock to its launch. (c) is the least surprising but writes the clock from a focus action.

**Ruled (c) for asteroid 2026 QQ8 only** (owner, 2026-11-25), and shipped: a `SampledBody` with `focusIso` moves the clock there when a `requestFocus` lands on it while it is absent (`clockToFocusInstantSaga`). Only QQ8 sets it. A Voyager would take (c) by setting `focusIso` to its launch. The palette cards are still open.
