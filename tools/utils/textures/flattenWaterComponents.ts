/**
 * flattenWaterComponents — R3's water rule, in place over a WHOLE level grid.
 *
 * Every 4-connected component of the water mask is set to the lowest
 * elevation among the land posts touching it; the component with the most
 * posts — the world ocean, by a wide margin — is set to exactly 0. That single
 * rule gives spec §4.4's outcomes with no basin list and no ocean seed: the
 * ocean sits flat at the datum, the Dead Sea keeps its own depth, the Caspian
 * keeps its own, and the Great Lakes stop being a pit.
 *
 * Whole grid, before any slicing: a component spans tiles, and labelling per
 * tile would give one lake two different levels either side of a seam.
 * Column 0 and column `nx − 1` are the SAME lattice point (lon −180 and +180),
 * so they are unioned — that is the longitude wrap, and it is why this must be
 * handed a global grid rather than a regional one.
 */
export function flattenWaterComponents(
  heightM: Float32Array,
  isWater: Uint8Array,
  nx: number,
  ny: number,
): void {
  // Two-pass scanline labelling with union-find over PROVISIONAL labels: a
  // flood fill would need a frontier queue the size of the ocean, which at z7
  // is 90M entries.
  const labels = new Int32Array(nx * ny);
  let parent = new Int32Array(1024);
  let labelCount = 0;

  const newLabel = (): number => {
    if (labelCount + 1 >= parent.length) {
      const grown = new Int32Array(parent.length * 2);
      grown.set(parent);
      parent = grown;
    }
    labelCount++;
    parent[labelCount] = labelCount;
    return labelCount;
  };
  const find = (label: number): number => {
    let root = label;
    while (parent[root] !== root) root = parent[root]!;
    let walk = label;
    while (parent[walk] !== root) {
      const next = parent[walk]!;
      parent[walk] = root;
      walk = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  for (let row = 0; row < ny; row++) {
    for (let col = 0; col < nx; col++) {
      const k = row * nx + col;
      if (isWater[k] === 0) continue;
      const west = col > 0 && isWater[k - 1] === 1 ? labels[k - 1]! : 0;
      const north = row > 0 && isWater[k - nx] === 1 ? labels[k - nx]! : 0;
      if (west === 0 && north === 0) labels[k] = newLabel();
      else if (west === 0) labels[k] = north;
      else if (north === 0) labels[k] = west;
      else {
        labels[k] = west;
        union(west, north);
      }
    }
    const last = row * nx + nx - 1;
    if (isWater[row * nx] === 1 && isWater[last] === 1) union(labels[row * nx]!, labels[last]!);
  }

  const size = new Int32Array(labelCount + 1);
  const shore = new Float32Array(labelCount + 1).fill(Number.POSITIVE_INFINITY);
  for (let k = 0; k < labels.length; k++) {
    if (isWater[k] === 0) continue;
    const root = find(labels[k]!);
    labels[k] = root;
    size[root]!++;
  }

  // The shore minimum is gathered from the LAND side: every land post offers
  // its own height to each water component it touches, so no water value ever
  // feeds back into the level a component settles at.
  for (let row = 0; row < ny; row++) {
    for (let col = 0; col < nx; col++) {
      const k = row * nx + col;
      if (isWater[k] === 1) continue;
      const height = heightM[k]!;
      const neighbours = [
        col > 0 ? k - 1 : row * nx + nx - 1,
        col < nx - 1 ? k + 1 : row * nx,
        row > 0 ? k - nx : -1,
        row < ny - 1 ? k + nx : -1,
      ];
      for (const n of neighbours) {
        if (n < 0 || isWater[n] === 0) continue;
        const root = labels[n]!;
        if (height < shore[root]!) shore[root] = height;
      }
    }
  }

  let ocean = 0;
  let oceanPosts = 0;
  for (let label = 1; label <= labelCount; label++) {
    if (size[label]! > oceanPosts) {
      oceanPosts = size[label]!;
      ocean = label;
    }
  }

  for (let k = 0; k < labels.length; k++) {
    if (isWater[k] === 0) continue;
    const root = labels[k]!;
    if (root === ocean) heightM[k] = 0;
    else if (Number.isFinite(shore[root]!)) heightM[k] = shore[root]!;
  }
}
