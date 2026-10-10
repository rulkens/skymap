# Hover and selected highlight for every labelled object

## What

Structure labels now react to the pointer: a hovered structure's label blends toward white (`HOVERED_LABEL_WHITEN`), a selected one blends further (`SELECTED_LABEL_WHITEN`), and the ring brightens with it. Every other labelled object should behave the same way, so hovering or selecting anything gives one consistent cue.

## Where it applies

Label producers that do not highlight today:

- `produceStarCaptions` (named stars)
- `produceSceneBodyCaptions` (planets, moons, spacecraft, Earth)
- `produceFamousGalaxyLabels`
- `produceBlackHoleCaptions`
- `produceConstellationCaptions`
- `produceMilkyWayLabel`
- `produceLightTimeCaptions`

"Mostly all": a label whose object cannot be hovered or selected (a guide such as the light-time spheres, possibly constellation names) is left alone. Decide per producer whether its object is pickable before adding the cue.

## What already exists

- `label2DDirector`'s upload signature keys on colour, so a colour change at a fixed id reaches the GPU. This was the blocker for structures and is fixed for both directors.
- `watchSelectionWakeSaga` wakes the render loop when a _structure_ hover changes, and deliberately not for star or galaxy hovers ("InfoCard text only, must not start frames"). Extending the cue means widening that wake to every hover that now changes pixels, and checking what it costs at pointer-pick rate.
- The blend lives in `produceStructureLabels` as two sequential assignments over the label colour.

## Design questions

- **One place for the cue.** Seven producers each reading `selection.hover` and `selection.select` would be seven copies. The director already sees every label and could apply the blend from the label's pick identity, leaving producers untouched. That needs each label to carry the selection ref it stands for; structure labels carry a pick id, the caption producers may not.
- **The object's own cue.** A structure has a ring to brighten. A star, galaxy or body has a selection ring or nothing; say what, if anything, lights up besides the text.
- **Captions composed by `composeForegroundCaption`** (stars, bodies, black holes) share one colour path; the cue may belong there rather than in each producer.
- **Whiten amounts.** Structure label colours sit near full value; star and body captions use other palettes. Check that 0.6 and 0.9 read as the same strength on each.

## Size

Small if the director can apply it centrally; otherwise a mechanical pass over seven producers plus the wake predicate.
