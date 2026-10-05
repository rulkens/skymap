# Weight-0 captions skip the daytime sky washout

Found during the inside-atmosphere fog work (#798) and left adjacent.

## What happens

`foreground:0`'s alpha carries the atmosphere's coverage: the shell and the
aerial apply write `1 - transmittance` there
(`shaders/atmosphere/aerialPerspective/fragment.wesl:66-71`), and the
compositor uses it to wash stars and deep space out of a daytime sky.

Caption and leader-line fragments dim by the same alpha through
`sceneTransmittance`, but only in proportion to `occludeWeight`
(`shaders/labels/fragmentOcclude.wesl:14`,
`shaders/markerLines/fragmentOcclude.wesl:13`):

```wgsl
shaded * mix(1.0, sceneTransmittance(input.pos.xy), input.occludeWeight)
```

`occludeWeight` is the CPU sphere verdict from
`produceSceneBodyCaptions.ts:128`: 1 when the subject sits behind a body,
else 0. The vertex stage folds in the terrain verdict, which can only raise
it. So a caption whose subject is in the open draws at full brightness over
a hazy daytime sky, while a neighbour whose subject happens to be behind a
body is dimmed by the haze. Two captions in the same sky, two brightnesses,
decided by something unrelated to the sky.

## Shape of a fix

The weight answers "is the subject hidden?"; the sky washout answers "how
much sky is in front of this pixel?". They are two factors, not one. The
fragment should always apply the coverage factor and use the weight only for
the hide-behind-a-body verdict. That needs the two to be separable in
`foreground:0`'s alpha, which today mixes body coverage and sky coverage in
one channel; deciding how to split them (a second channel, or judging the
body verdict entirely in the vertex stage and leaving the alpha to the sky)
is the design question.

## Where it was seen

The #798 label investigation (ledger entry I1) traced captions drawing over
terrain to this same weight-0 path; the terrain half was fixed by judging
depth in the vertex stage, the sky-washout half was not. No capture of the
washout difference exists yet; a rover caption at local noon next to a
caption whose subject is behind the horizon is the place to look.
