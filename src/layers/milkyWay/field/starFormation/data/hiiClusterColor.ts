import type { Vec3 } from '../../../../../@types/math/Vec3';

/**
 * The embedded OB association — hotter and bluer than `ARM_COLOR_YOUNG`. NOT on
 * `hiiPalette`, deliberately: this is stellar continuum, and the sprite tier
 * colours its counterpart (`buildArmSlot`'s newborn stars) off `tempColorRamp`
 * rather than `gen.hiiCore`/`gen.hiiHalo` for the same reason.
 */
export const HII_CLUSTER_COLOR: Readonly<Vec3> = [0.62, 0.75, 1.0];
