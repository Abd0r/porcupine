#!/usr/bin/env python3
"""Render Porcupine's README workflow GIF with Pillow.

Requires: Python 3 and Pillow. Run from the repository root:
  python3 scripts/generate-porcupine-workflow-gif.py
"""

from __future__ import annotations

import math
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1280, 720
FPS, DURATION_SECONDS = 12, 7
FRAME_COUNT = FPS * DURATION_SECONDS
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "porcupine-workflow.gif"

BG = "#07090C"
PANEL = "#0B1217"
PANEL_ALT = "#0E191F"
TEAL = "#1DE3C1"
TEAL_DIM = "#167E70"
MINT = "#E9FFFA"
MUTED = "#7A9693"
LINE = "#17333A"
GREEN = "#78E08F"
RED = "#FF7B72"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Supplemental/Andale Mono.ttf",
        "/System/Library/Fonts/SFNSMono.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size, index=1 if bold else 0)
        except OSError:
            continue
    return ImageFont.load_default()


FONT_14 = font(14)
FONT_16 = font(16)
FONT_18 = font(18)
FONT_22 = font(22, bold=True)
FONT_30 = font(30, bold=True)
FONT_42 = font(42, bold=True)


def clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def ramp(t: float, start: float, end: float) -> float:
    return clamp((t - start) / (end - start))


def smooth(value: float) -> float:
    value = clamp(value)
    return value * value * (3 - 2 * value)


def fade(t: float, start: float, end: float) -> float:
    return smooth(ramp(t, start, end))


def color(hex_color: str, alpha: float = 1.0) -> tuple[int, int, int, int]:
    value = hex_color.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), round(255 * clamp(alpha)))


def blend(layer: Image.Image, alpha: float) -> Image.Image:
    if alpha >= 0.999:
        return layer
    layer.putalpha(round(255 * clamp(alpha)))
    return layer


def draw_text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, fill: str, fnt=FONT_16, alpha: float = 1.0) -> None:
    draw.text(xy, text, font=fnt, fill=color(fill, alpha))


def rounded(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill: str, outline: str = LINE, width: int = 1, alpha: float = 1.0) -> None:
    draw.rounded_rectangle(box, radius=14, fill=color(fill, alpha), outline=color(outline, alpha), width=width)


def terminal(draw: ImageDraw.ImageDraw, t: float) -> None:
    x0, y0, x1, y1 = 56, 112, 592, 545
    rounded(draw, (x0, y0, x1, y1), PANEL, TEAL_DIM, 2)
    draw.rounded_rectangle((x0, y0, x1, y0 + 42), radius=14, fill=color("#0D1A20"))
    draw.rectangle((x0, y0 + 24, x1, y0 + 42), fill=color("#0D1A20"))
    for index, dot in enumerate((RED, "#F7C948", TEAL)):
        draw.ellipse((x0 + 18 + index * 18, y0 + 15, x0 + 28 + index * 18, y0 + 25), fill=color(dot))
    draw_text(draw, (x0 + 88, y0 + 13), "porcupine · research workspace", MUTED, FONT_14)

    query_progress = fade(t, 0.1, 0.85)
    query = "sparse attention decoder transformer"
    count = round(len(query) * query_progress)
    draw_text(draw, (x0 + 28, y0 + 72), "$ research", TEAL, FONT_16)
    draw_text(draw, (x0 + 28, y0 + 105), "> " + query[:count], MINT, FONT_18)
    if (int(t * 2) % 2 == 0) and query_progress < 1:
        query_width = draw.textlength("> " + query[:count], font=FONT_18)
        draw.rectangle((x0 + 28 + int(query_width), y0 + 107, x0 + 38 + int(query_width), y0 + 127), fill=color(TEAL))

    code_opacity = fade(t, 3.7, 4.4) * (1 - fade(t, 5.85, 6.4))
    if code_opacity:
        draw_text(draw, (x0 + 28, y0 + 140), "attention.py", TEAL, FONT_16, code_opacity)
        lines = [
            ("+ sparse_indices = route(tokens)", GREEN),
            ("+ attention_mask = build_mask(sparse_indices)", GREEN),
            ("  return decoder_layer(hidden, attention_mask)", MINT),
        ]
        for index, (line, line_color) in enumerate(lines):
            draw_text(draw, (x0 + 28, y0 + 178 + index * 31), line, line_color, FONT_14, code_opacity)

    test_opacity = fade(t, 5.1, 5.55) * (1 - fade(t, 6.3, 6.85))
    if test_opacity:
        draw_text(draw, (x0 + 28, y0 + 282), "$ npm test attention", TEAL, FONT_16, test_opacity)
        draw_text(draw, (x0 + 48, y0 + 314), "✓ shape checks passed", GREEN, FONT_14, test_opacity)
        draw_text(draw, (x0 + 48, y0 + 342), "✓ regression checks passed", GREEN, FONT_14, test_opacity)


def porcupine(draw: ImageDraw.ImageDraw, t: float) -> None:
    cx, cy = 490, 475
    pulse = math.sin(t * math.tau / 2.8) * 4
    quills = [(-74, -82), (-43, -109), (-5, -119), (35, -108), (68, -80), (88, -45), (-96, -42)]
    for index, (qx, qy) in enumerate(quills):
        sway = math.sin(t * 2.2 + index * 0.8) * 3
        base_x, base_y = cx + qx * 0.55, cy - 17
        tip_x, tip_y = cx + qx + sway, cy + qy + pulse
        draw.polygon([(base_x - 9, base_y), (base_x + 9, base_y), (tip_x, tip_y)], fill=color(TEAL))
    draw.ellipse((cx - 87, cy - 69, cx + 95, cy + 76), fill=color("#102228"), outline=color(TEAL), width=3)
    draw.ellipse((cx - 137, cy - 31, cx - 48, cy + 45), fill=color("#0D1B20"), outline=color(TEAL), width=3)
    draw.line((cx - 124, cy + 8, cx - 142, cy + 14), fill=color(TEAL), width=3)
    eye_y = cy - 18
    blink = 1 if not 4.0 < (t % 4.2) < 4.1 else 3
    draw.ellipse((cx - 18, eye_y, cx - 18 + 11, eye_y + blink), fill=color(MINT))
    draw.ellipse((cx + 29, eye_y - 4, cx + 29 + 11, eye_y - 4 + blink), fill=color(MINT))
    draw.arc((cx - 10, cy + 3, cx + 44, cy + 38), 15, 165, fill=color(TEAL), width=3)
    draw.line((cx - 21, cy + 73, cx - 31, cy + 92), fill=color(TEAL), width=4)
    draw.line((cx + 51, cy + 73, cx + 61, cy + 92), fill=color(TEAL), width=4)


def research_cards(draw: ImageDraw.ImageDraw, t: float) -> None:
    alpha = fade(t, 0.8, 1.45) * (1 - fade(t, 2.15, 2.6))
    if not alpha:
        return
    cards = [
        (665, 126, "paper", "sparse patterns"),
        (850, 173, "docs", "decoder attention"),
        (735, 285, "notes", "masking constraints"),
    ]
    for index, (x, y, label, detail) in enumerate(cards):
        offset = int((1 - alpha) * 25 + math.sin(t * 2 + index) * 2)
        rounded(draw, (x, y + offset, x + 210, y + 86 + offset), PANEL_ALT, TEAL_DIM, 1, alpha)
        draw_text(draw, (x + 16, y + 16 + offset), label.upper(), TEAL, FONT_14, alpha)
        draw_text(draw, (x + 16, y + 45 + offset), detail, MINT, FONT_14, alpha)
    draw.line((777, 212, 842, 216), fill=color(TEAL, alpha), width=2)
    draw.line((781, 278, 788, 300), fill=color(TEAL, alpha), width=2)
    draw.line((867, 259, 805, 301), fill=color(TEAL, alpha), width=2)


def architecture(draw: ImageDraw.ImageDraw, t: float) -> None:
    alpha = fade(t, 2.15, 2.75) * (1 - fade(t, 3.15, 3.6))
    if not alpha:
        return
    y = 175
    labels = ["tokens", "sparse\nrouting", "decoder\nblock"]
    xs = [665, 832, 999]
    for index, (x, label) in enumerate(zip(xs, labels)):
        rounded(draw, (x, y, x + 120, y + 83), PANEL_ALT, TEAL, 2, alpha)
        for line_index, line in enumerate(label.split("\n")):
            draw_text(draw, (x + 19, y + 25 + line_index * 19), line, MINT, FONT_16, alpha)
        if index < 2:
            draw.line((x + 121, y + 42, x + 153, y + 42), fill=color(TEAL, alpha), width=3)
            draw.polygon([(x + 153, y + 42), (x + 145, y + 37), (x + 145, y + 47)], fill=color(TEAL, alpha))
    draw_text(draw, (665, 303), "map research to the attention path", MUTED, FONT_16, alpha)


def plan(draw: ImageDraw.ImageDraw, t: float) -> None:
    alpha = fade(t, 3.05, 3.7) * (1 - fade(t, 4.3, 4.8))
    if not alpha:
        return
    rounded(draw, (665, 148, 1168, 374), PANEL_ALT, TEAL_DIM, 1, alpha)
    draw_text(draw, (694, 177), "IMPLEMENTATION PLAN", TEAL, FONT_16, alpha)
    steps = ["inspect attention path", "add sparse routing", "run shape and regression checks"]
    for index, step in enumerate(steps):
        progress = fade(t, 3.35 + index * 0.18, 3.55 + index * 0.18)
        y = 220 + index * 43
        draw.ellipse((695, y, 713, y + 18), outline=color(TEAL, alpha), width=2)
        if progress:
            draw.line((699, y + 9, 704, y + 14), fill=color(GREEN, alpha * progress), width=2)
            draw.line((704, y + 14, 710, y + 4), fill=color(GREEN, alpha * progress), width=2)
        draw_text(draw, (730, y - 2), step, MINT, FONT_16, alpha)


def wordmark(draw: ImageDraw.ImageDraw, t: float) -> None:
    alpha = 1 - fade(t, 1.0, 1.5)
    draw_text(draw, (709, 501), "PORCUPINE", MINT, FONT_42, alpha)
    draw_text(draw, (714, 553), "RESEARCH · IMPLEMENT · VERIFY", TEAL, FONT_16, alpha)
    draw.line((713, 578, 1140, 578), fill=color(TEAL, alpha * 0.7), width=2)


def render_frame(frame_index: int) -> Image.Image:
    t = frame_index / FPS
    image = Image.new("RGBA", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)
    draw.line((56, 71, 228, 71), fill=color(LINE), width=2)
    draw.line((1052, 649, 1224, 649), fill=color(LINE), width=2)
    terminal(draw, t)
    porcupine(draw, t)
    research_cards(draw, t)
    architecture(draw, t)
    plan(draw, t)
    wordmark(draw, t)
    return image


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="porcupine-gif-") as tmp_dir:
        frame_dir = Path(tmp_dir)
        frame_pattern = str(frame_dir / "frame-%03d.png")
        for index in range(FRAME_COUNT):
            render_frame(index).convert("RGB").save(frame_dir / f"frame-{index:03d}.png")
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-framerate",
                str(FPS),
                "-start_number",
                "0",
                "-i",
                frame_pattern,
                "-filter_complex",
                "split[s0][s1];[s0]palettegen=max_colors=96:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3",
                "-loop",
                "0",
                str(OUTPUT),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size / 1024:.1f} KiB, {FRAME_COUNT} frames)")


if __name__ == "__main__":
    main()
