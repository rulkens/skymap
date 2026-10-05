/**
 * One seed-backed star table: the registry key it reads, the generated module
 * it writes, and that module's exported const — the three facts the generated
 * file's do-not-edit banner has to name.
 */
import type { RawDataKey } from '../../utils/io/rawDataRegistry';

export type StarSeedArtefact = {
  readonly seedKey: RawDataKey;
  readonly generatedPath: string;
  readonly exportName: string;
};
