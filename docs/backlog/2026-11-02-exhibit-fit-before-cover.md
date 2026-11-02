# A shifted exhibit subject spills under the notes on narrow windows

**Raised:** 2026-11-02, whole-branch review of the lens shift (#997). The owner ruled to accept it for now.

Framing sizes every subject against the whole canvas, and covers only move it (lens-shift spec §6).
An exhibit's `sphereFitDistance` therefore fits the full canvas, and the shift then centres the sphere
left of the notes column. On desktop windows narrower than about 1.45× their height (e.g. 1200×900),
the fitted sphere is wider than the uncovered strip and spills under the notes. On common 16:9 windows
the fit is height-limited, so nothing spills.

## Fix shape

The fix has to keep the owner's rule that one framing gives one size regardless of timing. The likely
shape is an exhibit-only fit that reads the exhibit's known sidebar width as a layout constant, not a
measured cover, so it is the same at boot and later. Re-fitting when the cover lands was rejected: it
makes the subject zoom after load.
