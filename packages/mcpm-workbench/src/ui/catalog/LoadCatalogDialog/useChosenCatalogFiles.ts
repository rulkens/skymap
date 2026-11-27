import { useState } from 'react';
import type { CatalogFiles } from '../../../../@types/catalog/import/CatalogFiles';
import { classifyCatalogFiles } from './utils/classifyCatalogFiles';

/** useChosenCatalogFiles — the files the visitor chose, or why they were refused. */
export function useChosenCatalogFiles() {
  const [files, setFiles] = useState<CatalogFiles | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const refuse = (message: string): void => {
    setFiles(null);
    setRefusal(message);
  };
  const choose = (chosen: readonly File[]): void => {
    const result = classifyCatalogFiles(chosen);
    if (result.kind === 'problem') return refuse(result.message);
    setFiles(result);
    setRefusal(null);
  };

  return { files, refusal, choose, refuse };
}
