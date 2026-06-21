"""
make_gif.py
Assembles a slideshow-style demo GIF from the captured screenshots.

Usage: python make_gif.py
Requires: pip install Pillow imageio
"""

import os
import sys
from pathlib import Path
from PIL import Image
import imageio.v3 as iio

REPO_ROOT  = Path(__file__).resolve().parent.parent
SS_DIR     = REPO_ROOT / ".github" / "assets" / "screenshots"
OUTPUT     = REPO_ROOT / ".github" / "assets" / "demo.gif"
FRAME_SIZE = (900, 600)   # width × height for all frames

# Ordered frames: (filename, duration_ms, label)
FRAMES = [
    ("onboarding-welcome.png",    2500),
    ("popover-streaming.png",     2000),
    ("popover-done.png",          2000),
    ("popover-modes.png",         1800),
    ("library-grid.png",          2000),
    ("library-search.png",        2000),
    ("synapse-graph.png",         2500),
    ("recall-cards.png",          2000),
]

def load_frame(filename: str) -> Image.Image:
    p = SS_DIR / filename
    if not p.exists():
        print(f"  WARN  Missing: {filename} -- skipping")
        return None
    img = Image.open(p).convert("RGBA")
    # Resize to fixed frame size preserving aspect ratio, pad with black
    img.thumbnail(FRAME_SIZE, Image.LANCZOS)
    canvas = Image.new("RGBA", FRAME_SIZE, (10, 10, 15, 255))  # near-black bg
    x = (FRAME_SIZE[0] - img.width)  // 2
    y = (FRAME_SIZE[1] - img.height) // 2
    canvas.paste(img, (x, y), img if img.mode == "RGBA" else None)
    return canvas.convert("P", palette=Image.ADAPTIVE, colors=256)

def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    frames, durations = [], []
    for filename, duration_ms in FRAMES:
        frame = load_frame(filename)
        if frame is None:
            continue
        frames.append(frame)
        durations.append(duration_ms)

    if not frames:
        print("ERROR  No frames loaded -- make sure screenshots exist.")
        sys.exit(1)

    print(f"\nAssembling {len(frames)}-frame GIF -> {OUTPUT}")
    iio.imwrite(
        str(OUTPUT),
        [frame for frame in frames],
        extension=".gif",
        loop=0,                          # loop forever
        duration=[d / 1000 for d in durations],  # imageio v3 uses seconds
    )

    size_mb = OUTPUT.stat().st_size / 1_048_576
    print(f"OK  demo.gif  ({size_mb:.1f} MB)")
    if size_mb > 5:
        print("WARN  File exceeds 5 MB -- consider dropping a frame or reducing FRAME_SIZE")

if __name__ == "__main__":
    main()
