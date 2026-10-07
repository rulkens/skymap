import type { DocsDebugSection } from '../@types/DocsDebugSection';

const PANEL = 'src/components/DebugPanel';

/**
 * The parts of the debug panel, top to bottom, for the table on the Debug page
 * (content/docs/developers/debug.mdx). Each was opened in the running app on
 * 7 October 2026. tests/packages/website/docsProject.test.ts counts the parts
 * the panel's own file mounts and finds each heading in the file named here,
 * so a part added to the panel fails the test until it has a row.
 */
export const DOCS_DEBUG_SECTIONS: readonly DocsDebugSection[] = [
  {
    heading: 'Asset Loading',
    shows:
      'Every file the app can fetch, with its place in the queue, whether it is waiting, on its way, loaded or failed, the seconds it took, and a Reload button. The three numbers in the heading count the files not yet asked for, the loaded and the failed.',
    file: `${PANEL}/AssetLoadingTitle.tsx`,
  },
  {
    heading: 'FPS',
    shows:
      'One line, always on: frames a second, and the milliseconds of script the app runs for each frame. It reads “idle” while nothing moves, because the app then draws no frames.',
    file: `${PANEL}/FrameStatsRow.tsx`,
  },
  {
    heading: 'GPU Timings',
    shows:
      'With the gpuTimings flag: the time the graphics processor takes over each drawing step, averaged over 60 frames, with a small chart of the last frames. Without the flag, one line that says how to turn it on.',
    file: `${PANEL}/GpuTimingsSection.tsx`,
  },
  {
    heading: 'Memory',
    shows:
      'The graphics memory the app has allocated, in megabytes for each owner (a planet’s map, a catalogue’s points, a render target), and the size of the script heap.',
    file: `${PANEL}/MemorySection.tsx`,
  },
  {
    heading: 'Camera',
    shows:
      'Which frame the camera is steered in, its heading, tilt and roll against their targets, and its height over the focus in radii. Sliders set the heights at which it changes frame. Three buttons copy the view: as a link, as JSON, and as a pose for an exhibit.',
    file: `${PANEL}/CameraStateSection.tsx`,
  },
  {
    heading: 'Renderer Toggles',
    shows:
      'A switch for every drawing step of the frame, in drawing order, to take one out of the picture.',
    file: `${PANEL}/RenderTogglesSection.tsx`,
  },
  {
    heading: 'Cosmic web density (tuning)',
    shows:
      'For each density field: intensity, contrast, trim, density, exposure and one of 21 colour palettes.',
    file: 'src/layers/cosmicWebDensity/ui/CosmicWebDensityTuningSection.tsx',
  },
  {
    heading: 'Flow tuning',
    shows: 'The flow ribbons: how many, the length of their trails, speed, and how they are spread.',
    file: 'src/layers/flow/ui/FlowTuningSection.tsx',
  },
  {
    heading: 'Zone of Avoidance tuning',
    shows: 'The strength, falloff, edge and two colours of the band.',
    file: 'src/layers/zoneOfAvoidance/ui/ZoneOfAvoidanceTuningSection.tsx',
  },
  {
    heading: 'Local Bubble tuning',
    shows: 'The intensity of the shell.',
    file: 'src/layers/localBubble/ui/LocalBubbleTuningSectionContainer.tsx',
  },
  {
    heading: 'Sgr A* lens tuning',
    shows:
      'The drawn ring of gas round the black hole (its radii, tilt, flicker and colour) and the size of the sky picture that is bent round it.',
    file: 'src/layers/blackHoles/ui/BlackHoleLensingTuningSection.tsx',
  },
  {
    heading: 'Milky Way tuning',
    shows: 'The size, exposure, softness and number of the points the Milky Way is drawn with.',
    file: 'src/layers/milkyWay/ui/MilkyWayTuningSection.tsx',
  },
  {
    heading: 'Debug Overlays',
    shows:
      'Three pictures laid over the scene: the buffer a click is looked up in, the stand-in shapes of the orbit trails, and the level of detail of each ground tile.',
    file: `${PANEL}/DebugOverlaysSection.tsx`,
  },
  {
    heading: 'Surface Tiles',
    shows:
      'Near Earth or Mars: how many ground tiles are held and at what depth. Ten buttons fly to test sites, from Søndermarken and Everest to the four Mars rover sites, and two switches flatten the terrain or drop the tiles’ skirts.',
    file: `${PANEL}/SurfaceTileAtlasSection.tsx`,
  },
  {
    heading: 'Terrain pick marker',
    shows:
      'The size of the marker drawn where the pointer meets the ground, and the height of the terrain under it.',
    file: `${PANEL}/TerrainPickMarkerTuningSection.tsx`,
  },
  {
    heading: 'Galaxy Provenance',
    shows:
      'How many loaded galaxies have no measured orientation and no measured size, with switches to colour them or to draw only the measured or only the unmeasured ones.',
    file: `${PANEL}/GalaxyProvenanceSection.tsx`,
  },
  {
    heading: 'Clips & Tours',
    shows: 'A button for every clip and every step of the long tour, and for the three tours.',
    file: `${PANEL}/ClipTriggersSection.tsx`,
  },
  {
    heading: 'Clip Path Inspector',
    shows:
      'Draws the path a clip will take as a line in the scene, with sliders for its timing and curve, and plays it.',
    file: `${PANEL}/ClipPathInspectorSection.tsx`,
  },
];
