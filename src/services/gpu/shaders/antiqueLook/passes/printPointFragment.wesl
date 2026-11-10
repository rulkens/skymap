// antiqueLook/passes/printPointFragment.wesl — the print-point pass's fragment: the
// vertex stage's point (`shared/printPoint.wesl`) written as is, into 'antique-print-points'.

import package::antiqueLook::shared::printPoint::PrintPointOut;

@fragment
fn fs(in: PrintPointOut) -> @location(0) vec4<f32> {
  return in.point;
}
