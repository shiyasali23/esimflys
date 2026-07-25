"""Regenerate the eSIMFlys icon set from brand/logo-source.png.

Run: python3 scripts/generate_icons.py

The supplied RealFaviconGenerator set was unusable at real tab sizes: the mark
filled only 46% of its canvas, off-centre, on transparency. This fits the mark
to each canvas, flattens it onto the brand navy, and emits every size the App
Router picks up by file convention plus the manifest icons.
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "brand" / "logo-source.png"

BACKGROUND = (16, 48, 104, 255)  # #103068 — the navy from the logo itself
PLAIN_FILL = 0.82  # mark occupies 82% of the canvas
MASKABLE_FILL = 0.60  # keeps the mark inside the 80%-diameter safe circle
HEADER_LOGO_HEIGHT = 96  # 3x the 32px header display height, transparent background

APP = ROOT / "src" / "app"
ICONS = ROOT / "public" / "icons"


def load_mark(source):
    image = Image.open(source).convert("RGBA")
    solid = image.getchannel("A").point(lambda p: 255 if p > 128 else 0)
    return image.crop(solid.getbbox())


def render_transparent(mark, height):
    width = round(height * mark.size[0] / mark.size[1])
    return mark.resize((width, height), Image.LANCZOS)


def render(mark, size, fill, mode="RGB"):
    canvas = Image.new("RGBA", (size, size), BACKGROUND)
    width, height = mark.size
    scale = (size * fill) / max(width, height)
    resized = mark.resize(
        (max(1, round(width * scale)), max(1, round(height * scale))),
        Image.LANCZOS,
    )
    canvas.alpha_composite(
        resized,
        ((size - resized.size[0]) // 2, (size - resized.size[1]) // 2),
    )
    return canvas.convert(mode)


def main():
    if not SOURCE.exists():
        raise SystemExit(f"missing source logo: {SOURCE}")

    mark = load_mark(SOURCE)
    ICONS.mkdir(parents=True, exist_ok=True)

    written = []

    def save(image, path, **kwargs):
        image.save(path, **kwargs)
        written.append(path)

    save(
        render(mark, 256, PLAIN_FILL, mode="RGBA"),
        APP / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    save(render(mark, 192, PLAIN_FILL), APP / "icon.png", optimize=True)
    save(render(mark, 180, PLAIN_FILL), APP / "apple-icon.png", optimize=True)
    save(render(mark, 192, PLAIN_FILL), ICONS / "icon-192.png", optimize=True)
    save(render(mark, 512, PLAIN_FILL), ICONS / "icon-512.png", optimize=True)
    save(render(mark, 192, MASKABLE_FILL), ICONS / "maskable-192.png", optimize=True)
    save(render(mark, 512, MASKABLE_FILL), ICONS / "maskable-512.png", optimize=True)
    save(render(mark, 512, PLAIN_FILL), ICONS / "logo-512.png", optimize=True)

    images = ROOT / "public" / "images"
    images.mkdir(parents=True, exist_ok=True)
    save(render_transparent(mark, HEADER_LOGO_HEIGHT), images / "logo-mark.png", optimize=True)

    print(f"source mark {mark.size[0]}x{mark.size[1]} on #{'%02x%02x%02x' % BACKGROUND[:3]}")
    for path in written:
        with Image.open(path) as out:
            kb = path.stat().st_size / 1024
            print(f"  {path.relative_to(ROOT)}  {out.size[0]}x{out.size[1]}  {kb:.1f} KB")


if __name__ == "__main__":
    main()
