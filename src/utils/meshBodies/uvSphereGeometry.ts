import type { DecodedMeshGeometry } from '../../data/mesh/meshBinaryFormat';

/**
 * uvSphereGeometry — a sphere about the origin, poles on ±Z, as `rings` latitude bands of
 * `segments` quads. The seam column is duplicated so u runs 0..1; v = 0 at the +Z pole (the
 * baked meshes' top-row convention). The pole rows' zero-area triangles are left out.
 */
export function uvSphereGeometry(
  radiusM: number,
  segments: number,
  rings: number,
): DecodedMeshGeometry {
  const cols = segments + 1;
  const vertexCount = cols * (rings + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const tangents = new Float32Array(vertexCount * 4);
  const uvs = new Float32Array(vertexCount * 2);

  for (let r = 0; r <= rings; r++) {
    const theta = (Math.PI * r) / rings;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    for (let c = 0; c <= segments; c++) {
      const phi = (2 * Math.PI * c) / segments;
      const v = r * cols + c;
      const nx = sinT * Math.cos(phi);
      const ny = sinT * Math.sin(phi);
      normals.set([nx, ny, cosT], v * 3);
      positions.set([nx * radiusM, ny * radiusM, cosT * radiusM], v * 3);
      // ∂position/∂u: defined at the poles too, where every column shares one point.
      tangents.set([-Math.sin(phi), Math.cos(phi), 0, 1], v * 4);
      uvs.set([c / segments, r / rings], v * 2);
    }
  }

  const indices: number[] = [];
  for (let r = 0; r < rings; r++) {
    for (let c = 0; c < segments; c++) {
      const a = r * cols + c;
      const b = a + cols;
      if (r > 0) indices.push(a, b, a + 1);
      if (r < rings - 1) indices.push(a + 1, b, b + 1);
    }
  }

  return {
    boundingRadiusM: radiusM,
    vertexCount,
    indexCount: indices.length,
    positions,
    normals,
    tangents,
    uvs,
    indices: Uint32Array.from(indices),
  };
}
