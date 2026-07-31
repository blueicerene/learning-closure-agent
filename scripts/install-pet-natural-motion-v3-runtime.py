#!/usr/bin/env python3
"""Install the accepted v3 preview frames into the existing macOS pet runtime."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageChops, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PREVIEW_DIR = ROOT / "artifacts" / "release-gate" / "pet-natural-motion-v3"
EVIDENCE_DIR = ROOT / "artifacts" / "release-gate" / "pet-natural-motion-v3-runtime"
BASELINE_DIR = EVIDENCE_DIR / "baseline-before-v3"
ASSET_DIR = ROOT / "desktop-dropper" / "assets"
FRAME_COUNT = 96


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract_sheet(path: Path, frame_size: tuple[int, int]) -> list[Image.Image]:
    sheet = Image.open(path).convert("RGBA")
    width, height = frame_size
    columns = 12
    rows = 8
    expected = (width * columns, height * rows)
    if sheet.size != expected:
        raise ValueError(f"{path} is {sheet.size}, expected {expected}")
    return [
        sheet.crop(
            (
                (index % columns) * width,
                (index // columns) * height,
                (index % columns + 1) * width,
                (index // columns + 1) * height,
            )
        )
        for index in range(FRAME_COUNT)
    ]


def contain(frame: Image.Image, target_size: tuple[int, int]) -> Image.Image:
    resized = ImageOps.contain(frame, target_size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", target_size, (0, 0, 0, 0))
    x = (target_size[0] - resized.width) // 2
    y = (target_size[1] - resized.height) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def backup_current_assets() -> dict[str, object]:
    BASELINE_DIR.mkdir(parents=True, exist_ok=True)
    groups = {
        "reclining": sorted(ASSET_DIR.glob("state-reclining-idle-frame-*.png")),
        "hover": sorted(ASSET_DIR.glob("state-curious-dynamic-frame-*.png")),
    }
    manifest: dict[str, object] = {"groups": {}}
    for label, paths in groups.items():
        target_dir = BASELINE_DIR / label
        target_dir.mkdir(parents=True, exist_ok=True)
        entries = []
        for path in paths:
            target = target_dir / path.name
            if not target.exists():
                shutil.copy2(path, target)
            entries.append(
                {
                    "name": path.name,
                    "sha256": sha256(target),
                    "size": list(Image.open(target).size),
                }
            )
        manifest["groups"][label] = entries
    manifest_path = BASELINE_DIR / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def write_frames(prefix: str, frames: list[Image.Image]) -> list[Path]:
    for stale in ASSET_DIR.glob(f"{prefix}-frame-*.png"):
        stale.unlink()
    outputs = []
    for index, frame in enumerate(frames):
        path = ASSET_DIR / f"{prefix}-frame-{index}.png"
        frame.save(path, optimize=True)
        outputs.append(path)
    return outputs


def adjacent_motion(frames: list[Image.Image]) -> int:
    return sum(
        ImageChops.difference(first, second).getbbox() is not None
        for first, second in zip(frames, frames[1:])
    )


def main() -> None:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    baseline = backup_current_assets()
    reclining_source = extract_sheet(
        PREVIEW_DIR / "reclining-sprite-v3.png",
        (420, 250),
    )
    hover_source = extract_sheet(
        PREVIEW_DIR / "hover-sprite-v3.png",
        (320, 360),
    )
    reclining = [contain(frame, (300, 208)) for frame in reclining_source]
    hover = [contain(frame, (300, 352)) for frame in hover_source]
    reclining_paths = write_frames("state-reclining-idle", reclining)
    hover_paths = write_frames("state-curious-dynamic", hover)

    qa = {
        "ok": True,
        "source": {
            "recliningSpriteSha256": sha256(
                PREVIEW_DIR / "reclining-sprite-v3.png"
            ),
            "hoverSpriteSha256": sha256(PREVIEW_DIR / "hover-sprite-v3.png"),
            "acceptedPreviewContract": "config/delivery/pet-natural-motion-v3.json",
        },
        "baseline": {
            "path": str(BASELINE_DIR.relative_to(ROOT)),
            "recliningFrames": len(baseline["groups"]["reclining"]),
            "hoverFrames": len(baseline["groups"]["hover"]),
        },
        "runtime": {
            "recliningFrames": len(reclining_paths),
            "hoverFrames": len(hover_paths),
            "recliningSize": list(reclining[0].size),
            "hoverSize": list(hover[0].size),
            "transparentCorners": all(
                frame.getpixel((0, 0))[3] == 0
                for frame in reclining + hover
            ),
            "recliningMovingTransitions": adjacent_motion(reclining),
            "hoverMovingTransitions": adjacent_motion(hover),
            "recliningLoopSeamExact": ImageChops.difference(
                reclining[0], reclining[-1]
            ).getbbox()
            is None,
            "hoverLoopSeamExact": ImageChops.difference(
                hover[0], hover[-1]
            ).getbbox()
            is None,
        },
    }
    qa["ok"] = bool(
        qa["runtime"]["recliningFrames"] == FRAME_COUNT
        and qa["runtime"]["hoverFrames"] == FRAME_COUNT
        and qa["runtime"]["transparentCorners"]
        and qa["runtime"]["recliningMovingTransitions"] >= 90
        and qa["runtime"]["hoverMovingTransitions"] >= 90
        and qa["runtime"]["recliningLoopSeamExact"]
        and qa["runtime"]["hoverLoopSeamExact"]
    )
    (EVIDENCE_DIR / "runtime-assets-qa.json").write_text(
        json.dumps(qa, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if not qa["ok"]:
        raise SystemExit("runtime asset QA failed")
    print(json.dumps(qa, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
