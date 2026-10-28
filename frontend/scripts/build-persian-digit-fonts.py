"""
Build the small "Persian digits" font files the app layers over Estedad and Noto Kufi Arabic.

Each output font holds only the codepoints 0-9 (U+0030-U+0039), drawn with the font's own
Persian digits (U+06F0-U+06F9), so every number the app prints - counts from the API,
chart axes, dates from third-party widgets - appears in Persian without touching the code
that formats it. OpenType features are kept, so `font-variant-numeric: tabular-nums` still
works on them.

Usage (needs fonttools + brotli):
    python3 frontend/scripts/build-persian-digit-fonts.py
"""

from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "assets" / "fonts"
SOURCES = {
    "estedad": ("@fontsource/estedad/files/estedad-arabic-{w}-normal.woff2", (400, 500, 600, 700)),
    "noto-kufi-arabic": ("@fontsource/noto-kufi-arabic/files/noto-kufi-arabic-arabic-{w}-normal.woff2", (600, 700)),
}
LATIN = [0x30 + i for i in range(10)]
PERSIAN = [0x06F0 + i for i in range(10)]


def build(source: Path, target: Path) -> None:
    font = TTFont(source)
    for table in font["cmap"].tables:
        if not table.isUnicode():
            continue
        for latin, persian in zip(LATIN, PERSIAN):
            if persian in table.cmap:
                table.cmap[latin] = table.cmap[persian]

    options = Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    subsetter = Subsetter(options)
    subsetter.populate(unicodes=LATIN)
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(target)


def copy_latin() -> None:
    """Plain Latin Estedad (real 0-9) for fields that must keep Latin digits: email, URL, password."""
    for weight in (400, 500):
        source = ROOT / "node_modules" / f"@fontsource/estedad/files/estedad-latin-{weight}-normal.woff2"
        target = OUT / f"estedad-latin-{weight}.woff2"
        target.write_bytes(source.read_bytes())
        print(f"{target.relative_to(ROOT)}  {target.stat().st_size} bytes")


def copy_licenses() -> None:
    """Both fonts are under the SIL Open Font License, which travels with modified copies."""
    for name in SOURCES:
        source = ROOT / "node_modules" / f"@fontsource/{name}/LICENSE"
        (OUT / f"OFL-{name}.txt").write_bytes(source.read_bytes())


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    copy_licenses()
    copy_latin()
    for name, (pattern, weights) in SOURCES.items():
        for weight in weights:
            source = ROOT / "node_modules" / pattern.format(w=weight)
            target = OUT / f"{name}-persian-digits-{weight}.woff2"
            build(source, target)
            print(f"{target.relative_to(ROOT)}  {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
