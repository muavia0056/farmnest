"""
Farmnest Icon Installer
Run this script to install the Farmnest leaf logo as the Android app icon.
Usage:  python fix_icons.py
Requires: pip install Pillow
"""
import os, sys, io

try:
    from PIL import Image
    import numpy as np
except ImportError:
    print("Installing required packages...")
    os.system("pip install Pillow numpy")
    from PIL import Image
    import numpy as np

# ── Find the logo ──────────────────────────────────────────────────────────────
BASE = r"E:\App Project\Farmnest"
CANDIDATES = [
    os.path.join(BASE, "logo .png"),   # the file with a space (found in project)
    os.path.join(BASE, "logo.png"),
    os.path.join(BASE, "logo_.png"),
]

logo_path = None
for c in CANDIDATES:
    if os.path.exists(c):
        logo_path = c
        break

if logo_path is None:
    print("ERROR: Could not find logo file. Tried:")
    for c in CANDIDATES:
        print(f"  {c}")
    sys.exit(1)

print(f"Using logo: {logo_path}")

# ── Process image – remove black background ────────────────────────────────────
img = Image.open(logo_path).convert("RGBA")
arr = np.array(img)

r, g, b, a = arr[:,:,0], arr[:,:,1], arr[:,:,2], arr[:,:,3]

# Make black/near-black pixels fully transparent
black_mask = (r < 25) & (g < 25) & (b < 25)
arr[black_mask, 3] = 0

processed = Image.fromarray(arr)

# Crop to content bounding box (removes black empty space around the circle)
bbox = processed.getbbox()
if bbox:
    processed = processed.crop(bbox)

print(f"Logo processed: {processed.size}, mode={processed.mode}")

# ── Generate all Android icon sizes ───────────────────────────────────────────
sizes = {
    "mipmap-mdpi":    48,
    "mipmap-hdpi":    72,
    "mipmap-xhdpi":   96,
    "mipmap-xxhdpi":  144,
    "mipmap-xxxhdpi": 192,
}

res_base = os.path.join(BASE, "android", "app", "src", "main", "res")

for folder, px in sizes.items():
    resized = processed.resize((px, px), Image.LANCZOS)
    for name in ["ic_launcher.png", "ic_launcher_round.png"]:
        dst = os.path.join(res_base, folder, name)
        resized.save(dst, "PNG")
        print(f"  Saved {folder}/{name}  ({px}x{px})")

print("\nAll icons installed successfully!")
print("Now run:  npx react-native run-android")
