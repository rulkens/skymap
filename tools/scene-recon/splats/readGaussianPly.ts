/**
 * Decodes Brush's binary-little-endian PLY export into `GaussianSplatRecord`s,
 * undoing Brush's storage conventions: pre-sigmoid opacity, scalar-first
 * quaternions, SH0-encoded colour. Scales stay log, because `splats.bin`
 * stores log too. Quantization is `packSplats`' job, never this reader's.
 *
 * `f_rest` is channel-major (INRIA convention) — all of R's coefficients,
 * then G's, then B's — so a channel's stride is `(deg+1)²−1`, not 3. Only
 * the first three of each channel survive; higher orders are dropped.
 */
import type { Vec4 } from '../../../src/@types/math/Vec4';
import type { GaussianSplatRecord } from '../pack/packSplats';

export type GaussianPly = {
  readonly splats: readonly GaussianSplatRecord[];
  readonly shDegree: 0 | 1;
};

/** SH band-0 basis function, √(1/4π) — the constant every 3DGS codebase hard-codes. */
const SH0 = 0.28209479;
const END_HEADER = /end_header\r?\n/;
const MAX_HEADER_BYTES = 65536;

type PlyHeader = {
  readonly properties: readonly string[];
  readonly vertexCount: number;
  readonly bodyOffset: number;
};

function parseHeader(buffer: ArrayBuffer): PlyHeader {
  // latin1 maps every byte to exactly one character, so a character index
  // into this string is also a byte offset — true of no other encoding here.
  const prefix = new TextDecoder('latin1').decode(
    new Uint8Array(buffer, 0, Math.min(buffer.byteLength, MAX_HEADER_BYTES)),
  );
  const end = END_HEADER.exec(prefix);
  if (!end) {
    throw new Error(`readGaussianPly: no "end_header" in the first ${MAX_HEADER_BYTES} bytes`);
  }

  const properties: string[] = [];
  let vertexCount = -1;
  let inVertexElement = false;
  let littleEndian = false;
  for (const line of prefix.slice(0, end.index).split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'format') {
      if (parts[1] !== 'binary_little_endian') {
        throw new Error(`readGaussianPly: PLY format "${parts[1]}" — need binary_little_endian`);
      }
      littleEndian = true;
    } else if (parts[0] === 'element') {
      inVertexElement = parts[1] === 'vertex';
      if (inVertexElement) vertexCount = Number(parts[2]);
    } else if (parts[0] === 'property' && inVertexElement) {
      if (parts[1] !== 'float' && parts[1] !== 'float32') {
        throw new Error(`readGaussianPly: vertex property "${parts[2]}" is ${parts[1]}, not float`);
      }
      properties.push(parts[2] ?? '');
    }
  }
  if (!littleEndian) {
    throw new Error('readGaussianPly: header has no "format binary_little_endian" line');
  }
  if (!Number.isInteger(vertexCount) || vertexCount < 0) {
    throw new Error('readGaussianPly: header declares no "element vertex <count>"');
  }

  return { properties, vertexCount, bodyOffset: end.index + end[0].length };
}

export function readGaussianPly(buffer: ArrayBuffer): GaussianPly {
  const { properties, vertexCount, bodyOffset } = parseHeader(buffer);

  const indexOf = new Map(properties.map((name, i) => [name, i]));
  const slot = (name: string): number => {
    const i = indexOf.get(name);
    if (i === undefined) throw new Error(`readGaussianPly: PLY has no "${name}" property`);
    return i;
  };

  const stride = properties.length * 4;
  const bodyBytes = vertexCount * stride;
  if (buffer.byteLength < bodyOffset + bodyBytes) {
    throw new Error(
      `readGaussianPly: ${vertexCount} vertices × ${stride} bytes need ` +
        `${bodyOffset + bodyBytes} bytes, buffer has ${buffer.byteLength} — truncated download?`,
    );
  }

  const perChannel = properties.filter((name) => name.startsWith('f_rest_')).length / 3;
  if (!Number.isInteger(perChannel)) {
    throw new Error(`readGaussianPly: f_rest count ${perChannel * 3} is not a multiple of 3`);
  }
  const shDegree: 0 | 1 = perChannel >= 3 ? 1 : 0;
  const fRestSlots =
    shDegree === 1
      ? [0, 1, 2].flatMap((channel) =>
          [0, 1, 2].map((k) => slot(`f_rest_${channel * perChannel + k}`)),
        )
      : null;

  const xyz: [number, number, number] = [slot('x'), slot('y'), slot('z')];
  const scale: [number, number, number] = [slot('scale_0'), slot('scale_1'), slot('scale_2')];
  const opacity = slot('opacity');
  // rot_0 is the scalar; SimilarityTransform.rotation wants [x, y, z, w].
  const rot: [number, number, number, number] = [
    slot('rot_1'),
    slot('rot_2'),
    slot('rot_3'),
    slot('rot_0'),
  ];
  const dc: [number, number, number] = [slot('f_dc_0'), slot('f_dc_1'), slot('f_dc_2')];

  const dv = new DataView(buffer);
  const splats: GaussianSplatRecord[] = [];
  for (let v = 0; v < vertexCount; v++) {
    const base = bodyOffset + v * stride;
    const at = (property: number): number => dv.getFloat32(base + property * 4, true);
    const toRgb = (property: number): number =>
      Math.min(1, Math.max(0, 0.5 + SH0 * at(property))) * 255;

    // Brush stores the optimizer's raw quaternion, which drifts off unit
    // length; packSplats' snorm8 would silently clip anything past ±1.
    const qx = at(rot[0]);
    const qy = at(rot[1]);
    const qz = at(rot[2]);
    const qw = at(rot[3]);
    const qLen = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
    // A degenerate quaternion must not become NaN bytes downstream.
    const rotation: Vec4 = qLen > 0 ? [qx / qLen, qy / qLen, qz / qLen, qw / qLen] : [0, 0, 0, 1];

    splats.push({
      xM: at(xyz[0]),
      yM: at(xyz[1]),
      zM: at(xyz[2]),
      rotation,
      logScale: [at(scale[0]), at(scale[1]), at(scale[2])],
      opacity: 1 / (1 + Math.exp(-at(opacity))),
      dcColor: [toRgb(dc[0]), toRgb(dc[1]), toRgb(dc[2])],
      fRest: fRestSlots ? fRestSlots.map(at) : null,
    });
  }

  return { splats, shDegree };
}
