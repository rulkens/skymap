// starCatalog/vertexPrint.wesl — the survey stars' print stage for the antique
// look: each leaf of the frame cut as one point in 'antique-print-points'
// (antiqueLook/printPoint.wesl), ranked by apparent magnitude. Bindings as
// vertex.wesl; only u.cam is read.

import package::starCatalog::io::StarUniforms;
import package::starCatalog::leafRecord::leafRecord;
import package::lib::camera::worldToClip;
import package::antiqueLook::printPoint::PrintPointOut;
import package::antiqueLook::printPoint::apparentMagnitude;
import package::antiqueLook::printPoint::printPoint;
import package::antiqueLook::printPoint::printPointNone;

@group(0) @binding(0) var<uniform> u: StarUniforms;

// The cut's indirect args carry the billboard's three vertices per instance;
// the first is the point, the other two draw nothing.
@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
) -> PrintPointOut {
  let rec = leafRecord(ii);
  if (vi != 0u || !rec.live) {
    return printPointNone();
  }
  let mag = apparentMagnitude(rec.absMag, dot(rec.worldRelCam, rec.worldRelCam));
  return printPoint(worldToClip(u.cam, rec.worldRelCam), mag, rec.opacity);
}
