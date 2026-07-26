#!/usr/bin/env python3
"""
Generate white variants of the about-favicons PNG icons.
Moves existing (black) PNGs to icons/dark/ and creates white copies in icons/light/.
"""

import os
from PIL import Image

ICONS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
DARK_DIR = os.path.join(ICONS_DIR, "dark")    # black icons (existing)
LIGHT_DIR = os.path.join(ICONS_DIR, "light")  # white icons (generated)


def main():
    # Ensure subdirs exist
    os.makedirs(DARK_DIR, exist_ok=True)
    os.makedirs(LIGHT_DIR, exist_ok=True)

    # Move existing PNGs from icons/ root to icons/dark/
    pngs = [f for f in os.listdir(ICONS_DIR) if f.lower().endswith(".png")]
    if not pngs:
        print("[!] No PNG files found in icons/ root. Already moved?")
    else:
        for f in pngs:
            src = os.path.join(ICONS_DIR, f)
            dst = os.path.join(DARK_DIR, f)
            os.rename(src, dst)
            print(f"[MOVE] {f} -> dark/")

    # Generate white variants from dark/ into light/
    dark_pngs = [f for f in os.listdir(DARK_DIR) if f.lower().endswith(".png")]
    for f in dark_pngs:
        src = os.path.join(DARK_DIR, f)
        dst = os.path.join(LIGHT_DIR, f)

        img = Image.open(src).convert("RGBA")
        data = img.getdata()
        new_data = []
        for r, g, b, a in data:
            # Keep alpha (encodes shape + anti-aliasing), force RGB to white
            new_data.append((255, 255, 255, a))
        img.putdata(new_data)
        img.save(dst, "PNG")
        print(f"[GEN]  {f} -> light/ (white variant)")

    print(f"\n[OK] Done! {len(dark_pngs)} icons processed.")


if __name__ == "__main__":
    main()
