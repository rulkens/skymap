/**
 * Curator app shell.  Plan A leaves this as a minimal placeholder so
 * the dev server boots cleanly; Plan C replaces the body with the real
 * panel layout (GalaxyList + CropCanvas + ParamSliders + PreviewPane +
 * MetadataForm).
 */
// Return type inferred — React 19 dropped the global `JSX` namespace in
// favour of `React.JSX.Element`, and explicit annotation buys nothing
// for a leaf component.
export function App() {
  return (
    <main>
      <h1>Famous Galaxy Curator</h1>
      <p>UI scaffold — see Plan C for the real panels.</p>
    </main>
  );
}
