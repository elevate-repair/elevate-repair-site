#!/usr/bin/env python3
"""
Export every image the Denver pages use from its untouched original.

    python3 tools/export-denver-images.py           write every export
    python3 tools/export-denver-images.py --check   report missing / wrong-size / metadata-carrying exports, exit 1

Sources of truth: tools/denver-images.json (renders, photos, logos) and tools/denver-areas.json
(service-area card frames). The originals are never changed or deleted.

- renders  -> assets/images/appliances/<appliance>-repair-denver.webp, trimmed to the appliance,
              560px on the long side (the same treatment as the Buffalo card renders)
- photos   -> assets/images/photos/<id>.webp, at most 1200px on the long side, EXIF orientation applied,
              and <id>-tile.webp, the 4:3 gallery tile (800x600, cropped around photos[].crop, default centre)
- logos    -> assets/images/brands/<slug>.webp at the native 172x65, never upscaled
- areas    -> assets/images/areas/<frame>-card.webp (16:10, up to 800x500) and <frame>-card-sm.webp (400x250)

Every export is written without EXIF, XMP or ICC data: several originals carry another company's
EXIF / XMP block with GPS coordinates. Needs Pillow with WebP support.
"""
import io
import json
import os
import sys

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECK = '--check' in sys.argv
RENDER_LONG = 560
PHOTO_LONG = 1200
CARD = (800, 500)
CARD_SM = (400, 250)
TILE = (800, 600)


def load(name):
    with open(os.path.join(ROOT, 'tools', name), encoding='utf-8') as fh:
        return json.load(fh)


def encode(im, quality, lossless=False):
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=quality, method=6, lossless=lossless)  # no exif / icc / xmp passed
    return buf.getvalue()


def rgb(im):
    im = ImageOps.exif_transpose(im)
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        return bg
    return im.convert('RGB')


def trim(im, threshold=244, pad=0.02):
    gray = im.convert('L').point(lambda v: 255 if v < threshold else 0)
    box = gray.getbbox() or (0, 0, im.width, im.height)
    px, py = round(im.width * pad), round(im.height * pad)
    return im.crop((max(0, box[0] - px), max(0, box[1] - py), min(im.width, box[2] + px), min(im.height, box[3] + py)))


def fit_long(im, long_side):
    if max(im.size) <= long_side:
        return im
    s = long_side / max(im.size)
    return im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)


def window(w, h, crop):
    """The largest 16:10 box inside w x h, placed by the focal point crop.x / crop.y."""
    if w / h >= CARD[0] / CARD[1]:
        ch = h
        cw = round(h * CARD[0] / CARD[1])
    else:
        cw = w
        ch = round(w * CARD[1] / CARD[0])
    x = round((w - cw) * float(crop.get('x', 0.5)))
    y = round((h - ch) * float(crop.get('y', 0.5)))
    return x, y, x + cw, y + ch


def jobs():
    """Yield (out_path, builder) for every export."""
    cat = load('denver-images.json')
    for key, r in cat['renders'].items():
        def b(r=r):
            return encode(fit_long(trim(rgb(Image.open(os.path.join(ROOT, r['source'])))), RENDER_LONG), 82)
        yield r['out'], b
    for key, p in cat['photos'].items():
        if p['status'] != 'use':
            continue
        def b(p=p):
            return encode(fit_long(rgb(Image.open(os.path.join(ROOT, p['sources'][0]))), PHOTO_LONG), 78)
        yield p['out'], b

        def tile(p=p):
            im = rgb(Image.open(os.path.join(ROOT, p['sources'][0])))
            crop = p.get('crop', {})
            if im.width / im.height >= 4 / 3:
                h = im.height
                w = round(h * 4 / 3)
            else:
                w = im.width
                h = round(w * 3 / 4)
            x = round((im.width - w) * float(crop.get('x', 0.5)))
            y = round((im.height - h) * float(crop.get('y', 0.5)))
            im = im.crop((x, y, x + w, y + h))
            size = TILE if w >= TILE[0] else (w - w % 4, (w - w % 4) * 3 // 4)
            return encode(im.resize(size, Image.LANCZOS), 76)
        yield p['out'].replace('.webp', '-tile.webp'), tile
    for slug, l in cat['logos'].items():
        if l['status'] != 'use':
            continue
        def b(l=l):
            return encode(rgb(Image.open(os.path.join(ROOT, l['source']))), 92)
        yield l['out'], b
    areas_path = os.path.join(ROOT, 'tools', 'denver-areas.json')
    if os.path.exists(areas_path):
        areas = load('denver-areas.json')
        for fid, f in areas['frames'].items():
            def card(f=f, size=CARD):
                im = rgb(Image.open(os.path.join(ROOT, f['source'])))
                box = window(im.width, im.height, f.get('crop', {}))
                im = im.crop(box)
                target = size if im.width >= size[0] else (im.width - im.width % 2, round((im.width - im.width % 2) * size[1] / size[0]))
                return encode(im.resize(target, Image.LANCZOS), 78)
            yield f'assets/images/areas/{fid}-card.webp', card
            yield f'assets/images/areas/{fid}-card-sm.webp', (lambda f=f: card(f, CARD_SM))


def has_metadata(data):
    if data[:4] != b'RIFF' or data[8:12] != b'WEBP':
        return 'not a WebP file'
    pos = 12
    while pos + 8 <= len(data):
        tag = data[pos:pos + 4]
        size = int.from_bytes(data[pos + 4:pos + 8], 'little')
        if tag in (b'EXIF', b'XMP ', b'ICCP'):
            return f'{tag.decode().strip()} chunk'
        pos += 8 + size + (size & 1)
    return None


def main():
    problems = []
    written = 0
    for out, build in jobs():
        path = os.path.join(ROOT, out)
        if CHECK:
            if not os.path.exists(path):
                problems.append(f'{out}: missing (run python3 tools/export-denver-images.py)')
                continue
            data = open(path, 'rb').read()
            meta = has_metadata(data)
            if meta:
                problems.append(f'{out}: carries {meta}')
            want = Image.open(io.BytesIO(build())).size
            have = Image.open(path).size
            if want != have:
                problems.append(f'{out}: is {have[0]}x{have[1]}, the export gives {want[0]}x{want[1]}')
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        data = build()
        if not os.path.exists(path) or open(path, 'rb').read() != data:
            with open(path, 'wb') as fh:
                fh.write(data)
            written += 1
    if CHECK:
        if problems:
            print('FAIL - image exports:')
            for p in problems:
                print('  ' + p)
            sys.exit(1)
        print('PASS - every Denver image export exists, has the expected size and carries no EXIF / XMP / ICC data.')
    else:
        print(f'export-denver-images: {written} file(s) written.')


if __name__ == '__main__':
    main()
