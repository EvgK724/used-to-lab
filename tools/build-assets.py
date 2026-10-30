#!/usr/bin/env python3
"""Reproducible Home Screen icons and QR for the public application.
Requires Pillow, qrcode==8.2 and zxing-cpp==2.3.0.
"""
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw
import qrcode
import zxingcpp

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
URL = 'https://evgk724.github.io/used-to-lab/'
ASSETS.mkdir(exist_ok=True)

svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="112" fill="#1a1b1d"/>
<circle cx="256" cy="256" r="138" fill="none" stroke="#323438" stroke-width="24"/>
<path d="M 157 354 A 138 138 0 1 1 381 314" fill="none" stroke="#e58b4b" stroke-width="24" stroke-linecap="round"/>
<path d="M 391 277 L 381 324 L 342 299" fill="none" stroke="#e58b4b" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M256 183 V256 L211 283" fill="none" stroke="#eeeae3" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="256" cy="256" r="12" fill="#eeeae3"/>
</svg>'''
(ASSETS / 'icon.svg').write_text(svg + '\n', encoding='utf-8')

scale = 4
canvas = Image.new('RGB', (512 * scale, 512 * scale), '#1a1b1d')
draw = ImageDraw.Draw(canvas)
def line(points, color, width):
    coords = [(round(x * scale), round(y * scale)) for x, y in points]
    draw.line(coords, fill=color, width=width * scale, joint='curve')
    radius = width * scale / 2
    for x, y in (coords[0], coords[-1]):
        draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=color)
def arc(start, end, color, width):
    pts = [(256 + 138 * math.cos(math.radians(a)), 256 + 138 * math.sin(math.radians(a)))
           for a in range(start, end + 1)]
    line(pts, color, width)
arc(0, 360, '#323438', 24)
arc(135, 385, '#e58b4b', 24)
line([(391,277),(381,324),(342,299)], '#e58b4b', 22)
line([(256,183),(256,256),(211,283)], '#eeeae3', 20)
for size in (180, 192, 512):
    canvas.resize((size, size), Image.Resampling.LANCZOS).save(ASSETS / f'icon-{size}.png', optimize=True)
canvas.resize((512,512), Image.Resampling.LANCZOS).save(ASSETS / 'icon-maskable-512.png', optimize=True)

qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=4)
qr.add_data(URL)
qr.make(fit=True)
qr.make_image(fill_color='#141518', back_color='white').convert('RGB').save(ASSETS / 'qr.png', optimize=True)
result = zxingcpp.read_barcode(Image.open(ASSETS / 'qr.png'))
if not result or result.text != URL:
    raise RuntimeError('Generated QR does not decode to the application URL')
manifest = {
    'id': './', 'name': 'Привычка · Grammar Lab', 'short_name': 'Привычка',
    'description': 'Used to, would, be used to и get used to. Понятная грамматика B1–B2, повторение и голос Ryan.',
    'lang': 'ru', 'start_url': './', 'scope': './', 'display': 'standalone',
    'background_color': '#1a1b1d', 'theme_color': '#1a1b1d',
    'icons': [
        {'src':'assets/icon-192.png','sizes':'192x192','type':'image/png','purpose':'any'},
        {'src':'assets/icon-512.png','sizes':'512x512','type':'image/png','purpose':'any'},
        {'src':'assets/icon-maskable-512.png','sizes':'512x512','type':'image/png','purpose':'maskable'}
    ]
}
(ROOT / 'manifest.webmanifest').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
report = {'qrUrl': result.text, 'qrDecoded': True,
          'icons': {path.name: list(Image.open(path).size) for path in ASSETS.glob('icon-*.png')}}
(ROOT / 'qa').mkdir(exist_ok=True)
(ROOT / 'qa/assets-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
