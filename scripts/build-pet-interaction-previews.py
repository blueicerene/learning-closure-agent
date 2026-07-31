#!/usr/bin/env python3

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


PROJECT_DIR = Path(__file__).resolve().parents[1]
ASSETS_DIR = PROJECT_DIR / "desktop-dropper" / "assets"
OUTPUT_DIR = PROJECT_DIR / "artifacts" / "release-gate" / "pet-interaction"
ATLAS_PATH = ASSETS_DIR / "dawang-spritesheet.webp"
WALK_STRIP_PATH = (
    PROJECT_DIR
    / "artifacts"
    / "release-gate"
    / "pet-interaction"
    / "source"
    / "dawang-walk-right-v2.png"
)

CELL_WIDTH = 192
CELL_HEIGHT = 208
FRAME_DURATION_MS = 120


def atlas_row(atlas: Image.Image, row: int, count: int) -> list[Image.Image]:
    return [
        atlas.crop(
            (
                column * CELL_WIDTH,
                row * CELL_HEIGHT,
                (column + 1) * CELL_WIDTH,
                (row + 1) * CELL_HEIGHT,
            )
        )
        for column in range(count)
    ]


def named_frames(prefix: str, count: int = 12) -> list[Image.Image]:
    frames = []
    for index in range(count):
        path = ASSETS_DIR / f"{prefix}-frame-{index}.png"
        with Image.open(path) as opened:
            frames.append(opened.convert("RGBA"))
    return frames


def strip_frames(path: Path, count: int) -> list[Image.Image]:
    with Image.open(path) as opened:
        strip = opened.convert("RGBA")
    frames = []
    for index in range(count):
        left = round(index * strip.width / count)
        right = round((index + 1) * strip.width / count)
        slot = strip.crop((left, 0, right, strip.height))
        bbox = slot.getchannel("A").getbbox()
        if bbox is None:
            raise SystemExit(f"{path} frame {index} is empty")
        subject = slot.crop(bbox)
        subject.thumbnail((182, 198), Image.Resampling.LANCZOS)
        cell = Image.new("RGBA", (CELL_WIDTH, CELL_HEIGHT), (0, 0, 0, 0))
        cell.alpha_composite(
            subject,
            ((CELL_WIDTH - subject.width) // 2, CELL_HEIGHT - subject.height - 4),
        )
        frames.append(cell)
    return frames


def normalized_preview_frames(frames: list[Image.Image]) -> list[Image.Image]:
    output = []
    for frame in frames:
        source = frame.convert("RGBA")
        source.thumbnail((180, 216), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (194, 236), (0, 0, 0, 0))
        x = (canvas.width - source.width) // 2
        y = canvas.height - source.height
        canvas.alpha_composite(source, (x, y))
        output.append(canvas)
    return output


def save_gif(frames: list[Image.Image], path: Path, duration: int = FRAME_DURATION_MS) -> None:
    normalized = normalized_preview_frames(frames)
    normalized[0].save(
        path,
        save_all=True,
        append_images=normalized[1:],
        duration=duration,
        loop=0,
        disposal=2,
        optimize=False,
    )


def alpha_center(image: Image.Image) -> tuple[float, float]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        return (0.0, 0.0)
    return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)


def frame_metrics(frames: list[Image.Image]) -> dict[str, object]:
    centers = [alpha_center(frame) for frame in frames]
    adjacent_differences = []
    for first, second in zip(frames, frames[1:] + frames[:1]):
        difference = ImageChops.difference(first.convert("RGBA"), second.convert("RGBA"))
        adjacent_differences.append(
            sum(1 for alpha in difference.getchannel("A").get_flattened_data() if alpha > 8)
        )
    return {
        "frameCount": len(frames),
        "centerXSpan": round(max(x for x, _ in centers) - min(x for x, _ in centers), 2),
        "centerYSpan": round(max(y for _, y in centers) - min(y for _, y in centers), 2),
        "adjacentChangedAlphaPixels": adjacent_differences,
        "allAdjacentFramesDiffer": all(value > 0 for value in adjacent_differences),
    }


def save_contact_sheet(states: dict[str, list[Image.Image]], path: Path) -> None:
    columns = 4
    cell_width = 194
    cell_height = 236
    label_height = 28
    sheet = Image.new(
        "RGBA",
        (columns * cell_width, len(states) * (cell_height + label_height)),
        (247, 244, 238, 255),
    )
    draw = ImageDraw.Draw(sheet)
    for row, (label, frames) in enumerate(states.items()):
        y = row * (cell_height + label_height)
        draw.text((8, y + 7), label, fill=(20, 34, 52, 255))
        sample_indices = [
            round(index * (len(frames) - 1) / (columns - 1))
            for index in range(columns)
        ]
        for column, frame_index in enumerate(sample_indices):
            preview = normalized_preview_frames([frames[frame_index]])[0]
            sheet.alpha_composite(preview, (column * cell_width, y + label_height))
    sheet.save(path)


def install_runtime_frames(prefix: str, frames: list[Image.Image]) -> list[str]:
    installed = []
    for index, frame in enumerate(frames):
        path = ASSETS_DIR / f"{prefix}-frame-{index}.png"
        frame.save(path, optimize=True)
        installed.append(str(path))
    return installed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--install-assets",
        action="store_true",
        help="Install the accepted walking frames into desktop-dropper/assets.",
    )
    args = parser.parse_args()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with Image.open(ATLAS_PATH) as opened:
        atlas = opened.convert("RGBA")
    expected_size = (CELL_WIDTH * 8, CELL_HEIGHT * 11)
    if atlas.size != expected_size:
        raise SystemExit(f"Expected atlas {expected_size}, got {atlas.size}")

    right_walk = (
        strip_frames(WALK_STRIP_PATH, count=8)
        if WALK_STRIP_PATH.is_file()
        else atlas_row(atlas, row=1, count=8)
    )
    left_walk = [frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for frame in right_walk]
    states = {
        "hover-sit-head-tilt": named_frames("state-curious"),
        "drag-right-walk": right_walk,
        "drag-left-walk": left_walk,
    }
    save_gif(states["hover-sit-head-tilt"], OUTPUT_DIR / "hover-sit-preview.gif", 110)
    save_gif(states["drag-right-walk"], OUTPUT_DIR / "drag-right-preview.gif")
    save_gif(states["drag-left-walk"], OUTPUT_DIR / "drag-left-preview.gif")
    save_contact_sheet(states, OUTPUT_DIR / "preview-contact-sheet.png")

    installed_assets = []
    if args.install_assets:
        installed_assets.extend(install_runtime_frames("state-walk-right", right_walk))
        installed_assets.extend(install_runtime_frames("state-walk-left", left_walk))
    expected_runtime_assets = [
        ASSETS_DIR / f"state-walk-{direction}-frame-{index}.png"
        for direction in ("left", "right")
        for index in range(8)
    ]

    report = {
        "ok": True,
        "sourceAtlas": str(ATLAS_PATH),
        "walkStrip": str(WALK_STRIP_PATH) if WALK_STRIP_PATH.is_file() else None,
        "atlasSize": list(atlas.size),
        "states": {name: frame_metrics(frames) for name, frames in states.items()},
        "assetsInstalled": all(path.is_file() for path in expected_runtime_assets),
        "assetsInstalledThisRun": args.install_assets,
        "installedAssets": installed_assets,
        "runtimeReplaced": False,
        "note": (
            "Accepted animation assets installed; running Codex Pet remains unchanged until build."
            if args.install_assets
            else "Preview checkpoint only. Running Codex Pet remains unchanged pending visual acceptance."
        ),
    }
    (OUTPUT_DIR / "preview-qa.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
