// asteroids/lib/visibleTag.wesl — one compacted dot's catalog row and class in one word, written by
// kepler/compute.wesl and read by points/vertex.wesl. The row keeps the low 29 bits (the catalog has
// under a million rows), the class the top three.

const TAG_CLASS_SHIFT: u32 = 29u;

fn visibleTag(row: u32, cls: u32) -> u32 {
  return row | (cls << TAG_CLASS_SHIFT);
}

fn visibleTagRow(tag: u32) -> u32 {
  return tag & ((1u << TAG_CLASS_SHIFT) - 1u);
}

fn visibleTagClass(tag: u32) -> u32 {
  return tag >> TAG_CLASS_SHIFT;
}
