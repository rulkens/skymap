// Empty bricks written per frame, so a first fill does not write 25 MB of zeros at once (spec §6.4).
export const DETAIL_REGION_ZERO_BRICKS_PER_FRAME = 4;
