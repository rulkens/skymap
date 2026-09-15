/**
 * flattenWaterComponents — R3's water rule, in place over a WHOLE level grid.
 * Every 4-connected water component takes the lowest elevation among the land
 * posts touching it, except the largest (the world ocean), set to exactly 0 —
 * no basin list, no seed. Column 0 and `nx − 1` are the same lattice point
 * (lon ±180), so a component spanning that seam must be shored across it.
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
      // Column 0 and nx−1 are the same point (lon ±180), so "west of 0" and
      // "east of nx−1" must skip past that duplicate to nx−2 and 1 — using
      // nx−1/0 instead would have a seam-straddling land post read itself.
      const neighbours = [
        col > 0 ? k - 1 : row * nx + nx - 2,
        col < nx - 1 ? k + 1 : row * nx + 1,
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
