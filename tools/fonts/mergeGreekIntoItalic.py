"""Cut the lowercase Greek of Gentium Plus Italic into IM Fell English Italic.

IM Fell has no Greek, and an atlas wrote a star as its Bayer letter (τ Ceti). Gentium
(SIL OFL 1.1, humanist, close in colour to the Fell types) is scaled to the Fell
x-height and added under its own codepoints. The result is a bake input only
(`npm run build-fonts` reads it); only the MSDF atlas ships. The OFL reserved name
"IM FELL" is dropped from the output's name table for that reason.

Run: python3 tools/fonts/mergeGreekIntoItalic.py
"""
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.recordingPen import DecomposingRecordingPen

RAW = "data/raw/fonts/"
GREEK = [chr(c) for c in range(0x3B1, 0x3C9 + 1)]  # alpha .. omega, with final sigma

fell = TTFont(RAW + "IMFellEnglish-Italic.ttf")
gent = TTFont(RAW + "GentiumPlus-Italic.ttf")
scale = fell["OS/2"].sxHeight / gent["OS/2"].sxHeight
assert fell["head"].unitsPerEm == gent["head"].unitsPerEm

gcmap = gent.getBestCmap()
gset = gent.getGlyphSet()
for ch in GREEK:
    src = gcmap[ord(ch)]
    name = "uni%04X" % ord(ch)
    rec = DecomposingRecordingPen(gset)
    gset[src].draw(rec)
    pen = TTGlyphPen(None)
    rec.replay(TransformPen(pen, (scale, 0, 0, scale, 0, 0)))
    fell["glyf"][name] = pen.glyph()
    fell["hmtx"][name] = (round(gent["hmtx"][src][0] * scale), 0)
    for t in fell["cmap"].tables:
        if t.isUnicode():
            t.cmap[ord(ch)] = name
for rec in fell["name"].names:
    if rec.nameID in (1, 4, 6, 16):
        rec.string = rec.toUnicode().replace("IM FELL", "Skymap").replace("IM Fell", "Skymap").replace("IMFell", "Skymap")
fell.save(RAW + "SkymapItalicGreek.ttf")
print("wrote", RAW + "SkymapItalicGreek.ttf")
