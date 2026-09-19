/**
 * meshAssetRowFields — the one description of a `MeshAssetRow` column: its
 * name, TS type, docblock and the literal a baked row serializes to.
 * `serializeMeshAssets` emits the `MeshAssetRow` type block AND every row body
 * from this list, so adding a column is one entry here instead of three spots
 * that have to agree byte-for-byte with a generated file under `format:check`.
 */

import type { MeshAssetRow } from '../../src/data/bodies/meshAssets.generated';
import { quote } from '../utils/codegen/quote';

export type MeshAssetRowField = {
  readonly name: keyof MeshAssetRow & string;
  readonly tsType: string;
  /** Marks the field `?` in the generated type; `emit` returning `undefined`
   *  then skips the row line entirely rather than writing a literal `undefined`. */
  readonly optional?: boolean;
  /** Rendered as a docblock above the field, one array entry per line. */
  readonly doc?: readonly string[];
  readonly emit: (row: MeshAssetRow) => string | undefined;
};

export const MESH_ASSET_ROW_FIELDS: readonly MeshAssetRowField[] = [
  { name: 'key', tsType: 'string', emit: (row) => quote(row.key) },
  { name: 'path', tsType: 'string', emit: (row) => quote(row.path) },
  { name: 'boundingRadiusM', tsType: 'number', emit: (row) => String(row.boundingRadiusM) },
  {
    name: 'groundOffsetM',
    tsType: 'number',
    doc: [
      "How far the lowest vertex sits BELOW the origin along the body frame's −Z,",
      'metres, ≥ 0. A surface-locked body is lifted by this so it rests on the',
      "host's sphere; meaningless (but harmless) for a free-flying one.",
    ],
    emit: (row) => String(row.groundOffsetM),
  },
  { name: 'meanAlbedo', tsType: 'Vec3', emit: (row) => `[${row.meanAlbedo.join(', ')}]` },
  { name: 'triangleCount', tsType: 'number', emit: (row) => String(row.triangleCount) },
  {
    name: 'substituted',
    tsType: 'readonly MeshTextureField[]',
    doc: ['Slots `buildMeshes` filled with a 1×1 constant because the source had no map.'],
    emit: (row) => `[${row.substituted.map((field) => quote(field)).join(', ')}]`,
  },
  { name: 'source', tsType: 'string', emit: (row) => quote(row.source) },
  { name: 'licence', tsType: 'string', emit: (row) => quote(row.licence) },
  {
    name: 'attribution',
    tsType: 'string',
    doc: ['author + URL; empty string for CC0'],
    emit: (row) => quote(row.attribution),
  },
  {
    name: 'contactDecal',
    tsType: 'ContactDecal',
    optional: true,
    doc: [
      'The ground-contact box `contactShadow` projects into, body frame,',
      'metres; absent for a floating mesh.',
    ],
    emit: (row) =>
      row.contactDecal === undefined
        ? undefined
        : // Pre-broken the way prettier prints an object too wide for one line.
          `{\n      centre: [${row.contactDecal.centre.join(', ')}],\n` +
          `      halfU: [${row.contactDecal.halfU.join(', ')}],\n` +
          `      halfV: [${row.contactDecal.halfV.join(', ')}],\n    }`,
  },
];
