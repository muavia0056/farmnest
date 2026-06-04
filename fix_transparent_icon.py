"""
FarmNest Icon Fix v2 - Large leaf, transparent background, fills the circle
Run from: E:\App Project\Farmnest
Command:  python fix_transparent_icon.py
"""

from PIL import Image
import numpy as np
import os

print("FarmNest Icon Fix v2 - Starting...\n")

# Load logo
logo_path = "logo .png"
if not os.path.exists(logo_path):
    logo_path = "logo.png"
if not os.path.exists(logo_path):
    print("ERROR: Could not find 'logo .png' in current directory")
    exit(1)

print(f"Loading: {logo_path}")
img = Image.open(logo_path).convert("RGBA")
data = np.array(img)

r = data[:,:,0].astype(float)
g = data[:,:,1].astype(float)
b = data[:,:,2].astype(float)
a = data[:,:,3]
brightness = (r + g + b) / 3

# --- Step 1: Find the actual leaf bounding box ---
# Leaf pixels are darker greenish (brightness < 200, green dominant)
leaf_mask = (brightness < 200) & (g > r) & (g > b) & (a > 50)
rows = np.any(leaf_mask, axis=1)
cols = np.any(leaf_mask, axis=0)
rmin, rmax = int(np.where(rows)[0][0]), int(np.where(rows)[0][-1])
cmin, cmax = int(np.where(cols)[0][0]), int(np.where(cols)[0][-1])
print(f"Leaf detected at: rows {rmin}-{rmax}, cols {cmin}-{cmax}")

# Add padding around leaf
pad = 8
rmin = max(0, rmin - pad)
rmax = min(img.size[1] - 1, rmax + pad)
cmin = max(0, cmin - pad)
cmax = min(img.size[0] - 1, cmax + pad)

# --- Step 2: Remove light green/white background ---
bg_r, bg_g, bg_b = 232, 246, 233
dist = np.sqrt((r - bg_r)**2 + (g - bg_g)**2 + (b - bg_b)**2)

result = data.copy()
result[dist < 35, 3] = 0
transition = (dist >= 35) & (dist < 55)
result[transition, 3] = (((dist[transition] - 35) / 20) * 255).astype(np.uint8)

leaf_full = Image.fromarray(result, 'RGBA')

# --- Step 3: Crop tightly to the leaf ---
leaf_cropped = leaf_full.crop((cmin, rmin, cmax, rmax))
print(f"Cropped leaf size: {leaf_cropped.size}")

# --- Step 4: Generate all Android icon sizes ---
sizes = {
    "mipmap-mdpi":    48,
    "mipmap-hdpi":    72,
    "mipmap-xhdpi":   96,
    "mipmap-xxhdpi":  144,
    "mipmap-xxxhdpi": 192,
}

base = "android/app/src/main/res"

print("\nGenerating icons...")
for folder, size in sizes.items():
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Fill 88% of the icon square with the leaf
    fill = int(size * 0.88)
    lw, lh = leaf_cropped.size
    scale = fill / max(lw, lh)
    new_w = int(lw * scale)
    new_h = int(lh * scale)

    leaf_resized = leaf_cropped.resize((new_w, new_h), Image.LANCZOS)

    # Center it
    x = (size - new_w) // 2
    y = (size - new_h) // 2
    canvas.paste(leaf_resized, (x, y), leaf_resized)

    out_dir = os.path.join(base, folder)
    canvas.save(os.path.join(out_dir, "ic_launcher.png"))
    canvas.save(os.path.join(out_dir, "ic_launcher_round.png"))
    print(f"  ✅ {folder} ({size}x{size}) — leaf {new_w}x{new_h}")

print("\n✅ Done! All icons updated.")
print("Rebuild your app in Android Studio to see the changes.")
