/**
 * triggerDownload — the one DOM-touching function in the export pipeline:
 * object URL + anchor click + revoke. Isolated so emitTraceSidecar/exportNpy/
 * downloadStem stay unit-testable with no DOM.
 */
export function triggerDownload(filename: string, data: BlobPart, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
