"""
Run this script once from the project root to copy logo.png into
all Android mipmap folders at the correct resolutions for the splash screen.

Usage: python setup_splash_logo.py
"""
import os
import shutil
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    os.system("pip install Pillow")
    from PIL import Image

script_dir = Path(__file__).parent
logo_src = script_dir / "logo.png"

if not logo_src.exists():
    print("ERROR: logo.png not found in project root!")
    exit(1)

img = Image.open(logo_src).convert("RGBA")

# (folder_name, scale_factor, base_size_dp)
densities = [
    ("mipmap-mdpi",    1.0,  120),
    ("mipmap-hdpi",    1.5,  120),
    ("mipmap-xhdpi",   2.0,  120),
    ("mipmap-xxhdpi",  3.0,  120),
    ("mipmap-xxxhdpi", 4.0,  120),
]

res_dir = script_dir / "android" / "app" / "src" / "main" / "res"

for folder, scale, base in densities:
    size = int(base * scale)
    out_dir = res_dir / folder
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "splash_logo.png"
    resized = img.resize((size, size), Image.LANCZOS)
    resized.save(out_path, "PNG")
    print(f"  Saved {folder}/splash_logo.png  ({size}x{size})")

print("\nDone! Now rebuild the app.")
