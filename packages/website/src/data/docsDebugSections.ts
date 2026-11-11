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
    file: 'src/layers/cosmicWebDensity/densityCubes/ui/CosmicWebDensityTuningSection.tsx',
  },
  {
    heading: 'Flow tuning',
    shows:
      'The flow ribbons: how many, the length of their trails, speed, and how they are spread.',
    file: 'src/layers/flow/streamlines/ui/FlowTuningSection.tsx',
  },
  {
    heading: 'Zone of Avoidance tuning',
    shows: 'The strength, falloff, edge and two colours of the band.',
    file: 'src/layers/zoneOfAvoidance/shell/ui/ZoneOfAvoidanceTuningSection.tsx',
  },
  {
    heading: 'Local Bubble tuning',
    shows: 'The intensity of the shell.',
    file: 'src/layers/localBubble/shell/ui/LocalBubbleTuningSectionContainer.tsx',
  },
  {
    heading: 'Stellar streams tuning',
    shows:
      'Each stream is drawn twice, as sharp streaks and as a wide haze; for each, its brightness, size, stretch along the orbit, smallest size on screen and drift. A button puts both back to their defaults.',
    file: 'src/layers/stellarStreams/streaks/ui/StellarStreamsTuningSectionContainer.tsx',
  },
  {
    heading: 'Sgr A* lens tuning',
    shows:
      'The drawn ring of gas round the black hole (its radii, tilt, flicker and colour) and the size of the sky picture that is bent round it.',
    file: 'src/layers/blackHoles/lensing/ui/BlackHoleLensingTuningSection.tsx',
  },
  {
    heading: 'Milky Way tuning',
    shows:
      'A switch for which Milky Way is drawn (the point sprites, the smooth analytic field, or both added together). For the points: size, exposure, softness and number. For the field: its exposure, a dust switch and how coarse each of its render targets is.',
    file: 'src/layers/milkyWay/tuning/ui/MilkyWayTuningSection.tsx',
  },
  {
    heading: 'Star catalog tuning',
    shows:
      'How far away stars are still drawn one by one (Detail), how wide the glow of a distant region spreads, the exposure at the near, middle and far camera distances, and a cap on how bright a glow may be. A picker sets the size of the pool of star chunks held in memory; a size the device cannot hold is refused and the reason is shown under it.',
    file: 'src/layers/starCatalog/controls/ui/StarCatalogTuningSection.tsx',
  },
  {
    heading: 'Surface Tiles',
    shows:
      'Near Earth or Mars: how many ground tiles are held and at what depth. Ten buttons fly to test sites, from Søndermarken and Everest to the four Mars rover sites, and three switches tint each tile by its level of detail, flatten the terrain or drop the tiles’ skirts.',
    file: 'src/layers/body/surfaceTiles/debug/ui/SurfaceTileAtlasSection.tsx',
  },
  {
    heading: 'Terrain pick marker',
    shows:
      'The size of the marker drawn where the pointer meets the ground, and the height of the terrain under it.',
    file: 'src/layers/body/terrainPick/ui/TerrainPickMarkerTuningSection.tsx',
  },
  {
    heading: 'Earth tuning',
    shows:
      'Three sliders for Earth: how bright its atmosphere is drawn, how much light the night side keeps, and how wide the Sun’s glint on the oceans is.',
    file: 'src/layers/body/earth/ui/EarthTuningSectionContainer.tsx',
  },
  {
    heading: 'Probe spheres',
    shows:
      'The colour, metalness and roughness of the three mirror spheres that show what a model’s reflection is lit by: one in orbit, one in Søndermarken, one in Jezero crater. The spheres are drawn only with layers=probeSpheres in the link.',
    file: 'src/layers/probeSpheres/spheres/ui/ProbeSpheresTuningSectionContainer.tsx',
  },
  {
    heading: 'Antique look',
    shows:
      'Live knobs for the antique atlas look: hatch spacing and angle, how strong the sky wash, ink and lines print, the border wash, the paper tint, the light over the ground relief, which frame the sky rulings follow, and a switch for each row of the plate. Its title reads “(off)” while the look is off, and the knobs then move nothing. A button copies the values to paste in as the new defaults.',
    file: `${PANEL}/AntiqueTuningSection/AntiqueTuningSection.tsx`,
  },
  {
    heading: 'Debug Overlays',
    shows:
      'Two pictures laid over the scene: the buffer a click is looked up in, and the stand-in shapes of the orbit trails.',
    file: `${PANEL}/DebugOverlaysSection.tsx`,
  },
  {
    heading: 'Focus moves',
    shows:
      'The duration of an Eased focus move, and the Geodesic move’s pan-against-zoom balance, speed, shortest and longest duration and arrival ease. A move already in flight keeps the values it started with.',
    file: `${PANEL}/FocusMovesTuningSection/FocusMovesTuningSection.tsx`,
  },
  {
    heading: 'Galaxy Provenance',
    shows:
      'How many loaded galaxies have no measured orientation and no measured size, with switches to colour them or to draw only the measured or only the unmeasured ones.',
    file: 'src/layers/galaxyCatalog/provenance/ui/GalaxyProvenanceSection.tsx',
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
