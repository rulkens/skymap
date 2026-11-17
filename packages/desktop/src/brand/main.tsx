/**
 * Entry of the brand page: one installer or icon picture per load, picked by `?asset=` (and an icon's
 * `?drawing=`), drawn with the website's Wordmark and mark and the control window's star field so the
 * art stays one family with them.
 */

import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/jost/wght.css';
import '../../../../src/styles/tokens.css';
import '../control/control.css';
import './brand.css';
import type { MarkDrawing } from '../../../website/src/@types/MarkDrawing';
import type { BrandAsset } from './@types/BrandAsset';
import AppIcon from './components/AppIcon/AppIcon';
import DmgBackground from './components/DmgBackground/DmgBackground';
import InstallerHeader from './components/InstallerHeader/InstallerHeader';
import InstallerSidebar from './components/InstallerSidebar/InstallerSidebar';
import VolumeIcon from './components/VolumeIcon/VolumeIcon';

const params = new URLSearchParams(location.search);
const asset = params.get('asset') as BrandAsset;
const drawing = (params.get('drawing') ?? 'large') as MarkDrawing;
const art: Record<BrandAsset, ReactNode> = {
  'icon-mac': <AppIcon platform="mac" drawing={drawing} />,
  'icon-win': <AppIcon platform="win" drawing={drawing} />,
  'icon-volume': <VolumeIcon drawing={drawing} />,
  dmg: <DmgBackground />,
  'nsis-header': <InstallerHeader />,
  'nsis-sidebar': <InstallerSidebar />,
};
document.documentElement.dataset.asset = asset;
const rootEl = document.getElementById('root');
if (rootEl) createRoot(rootEl).render(art[asset]);
