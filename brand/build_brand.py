"""Rebuilds the «مغز دوم من» logo files from their construction.

The mark is the word «من» drawn on a 256 grid from filled primitives (stroke unit 36):
  mim   ring, centre (184,110), radii 58/22, sitting on the line
  line  from (124,150) to (184,150), round ends
  nun   lower half of a band of radius 42 around (82,150), left arm up to y=124
  dot   circle (82,62) r=19, in the signal colour
The pieces are merged with skia-pathops. Its loop-top to line-bottom (116 units) is set equal to
Noto Kufi Arabic's x-height (495/1000) in the lockup, so its stroke matches the type's stem.

    pip install fonttools brotli uharfbuzz skia-pathops
    python brand/build_brand.py frontend/node_modules/@fontsource/noto-kufi-arabic/files/noto-kufi-arabic-arabic-700-normal.woff2 brand/out

PNG icons are rendered from the SVGs written here (any SVG renderer; see README.md).
"""
import io, json, math, sys
from pathlib import Path

import pathops
import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

INK, SIGNAL = '#0F1516', '#087B81'          # light surfaces
INK_DARK, SIGNAL_DARK = '#EEF2F2', '#33C3C3'  # dark surfaces
K = 0.5522847498
W = 36


def circle(cx, cy, r):
    p = pathops.Path()
    p.moveTo(cx + r, cy)
    p.cubicTo(cx + r, cy + K * r, cx + K * r, cy + r, cx, cy + r)
    p.cubicTo(cx - K * r, cy + r, cx - r, cy + K * r, cx - r, cy)
    p.cubicTo(cx - r, cy - K * r, cx - K * r, cy - r, cx, cy - r)
    p.cubicTo(cx + K * r, cy - r, cx + r, cy - K * r, cx + r, cy)
    p.close()
    return p


def union(*paths):
    out = paths[0]
    for p in paths[1:]:
        out = pathops.op(out, p, pathops.PathOp.UNION)
    return out


def capsule(x0, y0, x1, y1, w):
    h = w / 2
    n = math.hypot(x1 - x0, y1 - y0) or 1
    nx, ny = -(y1 - y0) / n * h, (x1 - x0) / n * h
    p = pathops.Path()
    p.moveTo(x0 + nx, y0 + ny); p.lineTo(x1 + nx, y1 + ny); p.lineTo(x1 - nx, y1 - ny); p.lineTo(x0 - nx, y0 - ny); p.close()
    return union(p, circle(x0, y0, h), circle(x1, y1, h))


def arc(p, cx, cy, r, a0, a1, move=False):
    n = max(1, math.ceil(abs(a1 - a0) / 90))
    step = (a1 - a0) / n
    for i in range(n):
        s0, s1 = math.radians(a0 + step * i), math.radians(a0 + step * (i + 1))
        k = 4 / 3 * math.tan((s1 - s0) / 4) * r
        p0 = (cx + r * math.cos(s0), cy + r * math.sin(s0))
        p3 = (cx + r * math.cos(s1), cy + r * math.sin(s1))
        if move and i == 0:
            p.moveTo(*p0)
        p.cubicTo(p0[0] - k * math.sin(s0), p0[1] + k * math.cos(s0), p3[0] + k * math.sin(s1), p3[1] - k * math.cos(s1), *p3)


def band(cx, cy, r, w, a0, a1):
    ro, ri = r + w / 2, r - w / 2
    p = pathops.Path()
    arc(p, cx, cy, ro, a0, a1, move=True)
    p.lineTo(cx + ri * math.cos(math.radians(a1)), cy + ri * math.sin(math.radians(a1)))
    arc(p, cx, cy, ri, a1, a0)
    p.close()
    return p


def mark():
    ring = pathops.op(circle(184, 110, 58), circle(184, 110, 22), pathops.PathOp.DIFFERENCE)
    body = union(ring, capsule(124, 150, 184, 150, W), band(82, 150, 42, W, 0, 180),
                 capsule(40, 124, 40, 150, W), circle(124, 150, W / 2))
    return body, circle(82, 62, 19)


def d(path, dx=0, dy=0, s=1):
    pen = SVGPathPen(None, ntos=lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
    path.draw(TransformPen(pen, (s, 0, 0, s, dx, dy)))
    return pen.getCommands()


def svg(parts, w, h, bg=None, radius=0):
    tile = f'<rect width="{w}" height="{h}" rx="{radius}" fill="{bg}"/>' if bg else ''
    paths = ''.join(f'<path fill="{c}" d="{p}"/>' for c, p in parts)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}" role="img">'
            f'<title>مغز دوم من</title>{tile}{paths}</svg>\n')


def main(font_file, out):
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    body, dot = mark()
    x0, y0, x1, y1 = union(body, dot).bounds

    def square(ink, sig, size=256, bg=None, scale=0.78, radius=0):
        s = size * scale / (x1 - x0)
        dx = (size - (x1 - x0) * s) / 2 - x0 * s
        dy = (size - (y1 - y0) * s) / 2 - y0 * s - size * 0.01
        return svg([(ink, d(body, dx, dy, s)), (sig, d(dot, dx, dy, s))], size, size, bg, radius)

    files = {
        'mark.svg': square(INK, SIGNAL), 'mark-black.svg': square(INK, INK),
        'mark-white.svg': square('#FFFFFF', '#FFFFFF'), 'mark-reversed.svg': square(INK_DARK, SIGNAL_DARK),
        'app-icon.svg': square('#FFFFFF', SIGNAL_DARK, 1024, INK, 0.6),
        'app-icon-maskable.svg': square('#FFFFFF', SIGNAL_DARK, 1024, INK, 0.5),
        'favicon-tile.svg': square('#FFFFFF', SIGNAL_DARK, 64, INK, 0.8, 14),
    }

    # Lockup: «مغز دوم» in Noto Kufi Arabic Bold, then the mark as the last word
    font = TTFont(font_file); font.flavor = None
    buf = io.BytesIO(); font.save(buf)
    face = hb.Font(hb.Face(buf.getvalue()))
    b = hb.Buffer(); b.add_str('مغز دوم'); b.guess_segment_properties(); hb.shape(face, b, {})
    glyphs, order = font.getGlyphSet(), font.getGlyphOrder()
    words, x = pathops.Path(), 0
    for info, pos in zip(b.glyph_infos, b.glyph_positions):
        glyphs[order[info.codepoint]].draw(TransformPen(words.getPen(), (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset)))
        x += pos.x_advance
    words = pathops.simplify(words)
    k = 495 / 116
    space = font['hmtx']['space'][0]
    t = (k, 0, 0, k, -space - (x1 - x0) * k - x0 * k, -168 * k)
    m_body, m_dot = pathops.Path(), pathops.Path()
    body.draw(TransformPen(m_body.getPen(), t)); dot.draw(TransformPen(m_dot.getPen(), t))
    ink = union(words, m_body)
    lx0, ly0, lx1, ly1 = union(ink, m_dot).bounds
    s, pad, H = 176 / (ly1 - ly0), 40, 256
    w = round((lx1 - lx0) * s + 2 * pad)
    dx, dy = pad - lx0 * s, (H - (ly1 - ly0) * s) / 2 - ly0 * s
    for name, (c_ink, c_sig) in {'lockup.svg': (INK, SIGNAL), 'lockup-black.svg': (INK, INK), 'lockup-reversed.svg': (INK_DARK, SIGNAL_DARK)}.items():
        files[name] = svg([(c_ink, d(ink, dx, dy, s)), (c_sig, d(m_dot, dx, dy, s))], w, H)

    # Browser favicon that follows the system theme
    side = (x1 - x0) + 16
    files['favicon.svg'] = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0 - 8:g} {y0 - ((x1 - x0) - (y1 - y0)) / 2 - 8:g} {side:g} {side:g}">'
        f'<style>.ink{{fill:{INK}}}.sig{{fill:{SIGNAL}}}@media (prefers-color-scheme:dark){{.ink{{fill:{INK_DARK}}}.sig{{fill:{SIGNAL_DARK}}}}}</style>'
        f'<path class="ink" d="{d(body)}"/><circle class="sig" cx="82" cy="62" r="19"/></svg>\n')

    for name, content in files.items():
        (out / name).write_text(content)
    # Path data for frontend/src/components/brand/BrandMark.tsx
    (out / 'mark.json').write_text(json.dumps({'viewBox': f'{x0:g} {y0:g} {x1 - x0:g} {y1 - y0:g}', 'body': d(body), 'dot': [82, 62, 19]}, ensure_ascii=False, indent=1))
    print('\n'.join(sorted(files)))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'brand/out')
