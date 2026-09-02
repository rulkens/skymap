export async function readDroppedPackedCatalog(
  files: readonly File[],
): Promise<{ bin: ArrayBuffer; metadataText: string; sourceName: string } | null> {
  const binFile = files.find((f) => f.name.endsWith('.bin'));
  const metaFile = files.find((f) => f.name.endsWith('.txt'));
  if (!binFile || !metaFile) return null;
  const [bin, metadataText] = await Promise.all([binFile.arrayBuffer(), metaFile.text()]);
  return { bin, metadataText, sourceName: binFile.name };
}
