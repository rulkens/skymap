/* ScreenDevice — the device one of Home's Screens stands for, showing Saturn: the phone turns with the row, not alone. */
import DeviceFrame from '../../../shared/media/DeviceFrame/DeviceFrame.tsx';
import Disc from '../../../shared/media/Disc/Disc.tsx';
import Phone3D from '../../../shared/media/Phone3D/Phone3D.tsx';

type ScreenDeviceProps = { kind: 'phone' | 'tablet' | 'desktop' | 'dome' };

function ScreenDevice({ kind }: ScreenDeviceProps) {
  if (kind === 'phone') return <Phone3D shot="features-phone" follow={false} />;
  if (kind === 'tablet')
    return (
      <DeviceFrame device="tablet" shot="saturn-portrait" sizes="(max-width: 900px) 30vw, 14rem" />
    );
  if (kind === 'desktop')
    return (
      <DeviceFrame device="desktop" shot="start-saturn" sizes="(max-width: 900px) 50vw, 23rem" />
    );
  return <Disc id="dome-saturn" sizes="(max-width: 900px) 34vw, 23rem" />;
}

export default ScreenDevice;
