// stellarStreams/ribbonPick/fragment.wesl — writes the stream's pick word.

import package::stellarStreams::ribbonPick::io::PickOut;

@fragment
fn fs(input: PickOut) -> @location(0) u32 {
  return input.word;
}
