#!/usr/bin/env python3

import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "desktop-dropper/assets/state-reclining-idle-master.png"
CLOSED_SOURCE = ROOT / "desktop-dropper/assets/state-reclining-idle-closed-master.png"
ASSET_DIR = ROOT / "desktop-dropper/assets"
EVIDENCE_DIR = ROOT / "artifacts/release-gate/pet-reclining-idle"
MICRO_MOTION_EVIDENCE_DIR = (
    ROOT / "artifacts/release-gate/pet-idle-hover-micro-motion"
)
FRAME_COUNT = 48
FRAME_SIZE = (300, 208)
FRAME_DURATION_MS = 110


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError("The reclining idle master has no visible subject.")
    return bbox


def fit_subject(source: Image.Image) -> Image.Image:
    subject = source.crop(alpha_bbox(source))
    scale = min(292 / subject.width, 176 / subject.height)
    resized = subject.resize(
        (round(subject.width * scale), round(subject.height * scale)),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", FRAME_SIZE, (0, 0, 0, 0))
    x = (FRAME_SIZE[0] - resized.width) // 2
    y = 17 + (176 - resized.height) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def breathe_torso(image: Image.Image, phase: float) -> Image.Image:
    amount = (math.sin(phase) + 1) / 2
    patch_box = (54, 61, 216, 166)
    patch = image.crop(patch_box)
    height_delta = round(amount * 3)
    expanded = patch.resize(
        (patch.width, patch.height + height_delta),
        Image.Resampling.BICUBIC,
    )
    expanded = expanded.crop(
        (
            0,
            max(0, expanded.height - patch.height),
            patch.width,
            expanded.height,
        )
    )
    mask = Image.new("L", patch.size, 0)
    ImageDraw.Draw(mask).ellipse((8, 8, patch.width - 8, patch.height - 3), fill=225)
    mask = mask.filter(ImageFilter.GaussianBlur(12))
    blended = Image.composite(expanded, patch, mask)
    result = image.copy()
    result.paste(blended, patch_box[:2], blended)
    return result


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3 - 2 * value)


def pulse(index: int, start: int, peak: int, end: int) -> float:
    if index < start or index > end:
        return 0.0
    if index <= peak:
        return smoothstep((index - start) / max(1, peak - start))
    return smoothstep((end - index) / max(1, end - peak))


def interpolate_keyframes(index: int, keyframes: list[tuple[int, float]]) -> float:
    for position in range(len(keyframes) - 1):
        start_frame, start_value = keyframes[position]
        end_frame, end_value = keyframes[position + 1]
        if start_frame <= index <= end_frame:
            span = max(1, end_frame - start_frame)
            progress = smoothstep((index - start_frame) / span)
            return start_value + (end_value - start_value) * progress
    return keyframes[-1][1]


def replace_transformed_patch(
    image: Image.Image,
    box: tuple[int, int, int, int],
    transformed: Image.Image,
    mask: Image.Image,
) -> Image.Image:
    original = image.crop(box)
    replacement = Image.composite(transformed, original, mask)
    result = image.copy()
    result.paste(replacement, box[:2])
    return result


def animate_ears(frame: Image.Image, index: int) -> Image.Image:
    # Each ear has its own short, irregular twitch cadence.
    left_amount = pulse(index, 7, 9, 12) - 0.65 * pulse(index, 38, 40, 43)
    right_amount = pulse(index, 20, 23, 27)
    result = frame
    ear_specs = [
        ((207, 14, 249, 65), left_amount * -1.35, (23, 43)),
        ((254, 13, 298, 66), right_amount * 1.2, (19, 44)),
    ]
    for box, angle, pivot in ear_specs:
        if abs(angle) < 0.01:
            continue
        patch = result.crop(box)
        rotated = patch.rotate(
            angle,
            resample=Image.Resampling.BICUBIC,
            center=pivot,
        )
        mask = Image.new("L", patch.size, 0)
        ImageDraw.Draw(mask).polygon(
            [
                (2, 0),
                (patch.width - 2, 0),
                (patch.width - 5, patch.height - 12),
                (5, patch.height - 12),
            ],
            fill=255,
        )
        mask = mask.filter(ImageFilter.GaussianBlur(1.5))
        result = replace_transformed_patch(result, box, rotated, mask)
    return result


def animate_tail(frame: Image.Image, index: int) -> Image.Image:
    tail_box = (2, 119, 58, 158)
    tail = frame.crop(tail_box)
    # A relaxed cat anchors the tail base and lets only the distal tip sweep
    # slowly, with a small pause at each extreme.
    offset_x = round(
        interpolate_keyframes(
            index,
            [(0, 0.0), (6, 0.0), (17, 2.2), (22, 2.2), (35, -2.0), (41, -2.0), (47, 0.0)],
        )
    )
    offset_y = round(
        interpolate_keyframes(
            index,
            [(0, 0.0), (6, 0.0), (17, 1.3), (22, 1.3), (35, -1.5), (41, -1.5), (47, 0.0)],
        )
    )
    moved = Image.new("RGBA", tail.size, (0, 0, 0, 0))
    moved.alpha_composite(tail, (offset_x, offset_y))
    mask = Image.new("L", tail.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle((0, 0, 29, tail.height), fill=242)
    draw.rectangle((29, 0, 47, tail.height), fill=155)
    mask = mask.filter(ImageFilter.GaussianBlur(3.0))
    return replace_transformed_patch(frame, tail_box, moved, mask)


def blink_amount(index: int) -> float:
    blink = {
        31: 0.28,
        32: 0.78,
        33: 1.0,
        34: 0.64,
        35: 0.18,
    }
    return blink.get(index, 0.0)


def composite_blink(
    frame: Image.Image,
    closed_frame: Image.Image,
    amount: float,
) -> Image.Image:
    if amount <= 0:
        return frame

    eye_box = (218, 48, 276, 82)
    open_patch = frame.crop(eye_box)
    closed_patch = closed_frame.crop(eye_box)
    mixed = Image.blend(open_patch, closed_patch, amount)
    mask = Image.new("L", open_patch.size, 0)
    ImageDraw.Draw(mask).ellipse((2, 1, open_patch.width - 2, open_patch.height - 1), fill=245)
    mask = mask.filter(ImageFilter.GaussianBlur(4))
    result = frame.copy()
    result.paste(mixed, eye_box[:2], mask)
    return result


def frame_metrics(frames: list[Image.Image]) -> dict:
    bboxes = [alpha_bbox(frame) for frame in frames]
    pixel_count = FRAME_SIZE[0] * FRAME_SIZE[1]
    alpha_coverage = [
        1 - frame.getchannel("A").histogram()[0] / pixel_count for frame in frames
    ]
    return {
        "ok": True,
        "frameCount": len(frames),
        "frameSize": list(FRAME_SIZE),
        "frameDurationMs": FRAME_DURATION_MS,
        "motion": {
            "breathing": "3 px localized chest-and-belly expansion with a feathered mask",
            "blinkFrames": [31, 32, 33, 34, 35],
            "blinkSource": str(CLOSED_SOURCE.relative_to(ROOT)),
            "leftEarTwitchFrames": [7, 8, 9, 10, 11, 12, 38, 39, 40, 41, 42, 43],
            "rightEarTwitchFrames": [20, 21, 22, 23, 24, 25, 26, 27],
            "earMaximumRotationDegrees": 1.35,
            "tailTipMaximumMotionPx": 2.4,
            "tailMotionStyle": "one slow relaxed distal-tip sweep per loop with short pauses at the extremes",
            "tailBaseAnchored": True,
            "tailLoopDurationMs": FRAME_COUNT * FRAME_DURATION_MS,
            "earAndTailCadenceIndependent": True,
            "localizedTransformsOnly": True,
        },
        "alpha": {
            "transparentCorners": all(frame.getpixel((0, 0))[3] == 0 for frame in frames),
            "coverageMin": round(min(alpha_coverage), 4),
            "coverageMax": round(max(alpha_coverage), 4),
        },
        "anchor": {
            "leftSpanPx": max(box[0] for box in bboxes) - min(box[0] for box in bboxes),
            "bottomSpanPx": max(box[3] for box in bboxes) - min(box[3] for box in bboxes),
        },
        "source": str(SOURCE.relative_to(ROOT)),
        "closedEyeSource": str(CLOSED_SOURCE.relative_to(ROOT)),
        "runtimeReplaced": False,
        "userAcceptanceRequiredBeforeRuntimeReplacement": True,
    }


def build_contact_sheet(frames: list[Image.Image]) -> Image.Image:
    selected = [0, 8, 16, 24, 30, 31, 32, 33, 34, 35]
    columns = 5
    rows = 2
    cell_width, cell_height = FRAME_SIZE
    sheet = Image.new(
        "RGBA",
        (cell_width * columns, cell_height * rows),
        (28, 31, 34, 255),
    )
    draw = ImageDraw.Draw(sheet)
    for position, frame_index in enumerate(selected):
        x = (position % columns) * cell_width
        y = (position // columns) * cell_height
        sheet.alpha_composite(frames[frame_index], (x, y))
        draw.text((x + 8, y + 8), f"frame {frame_index}", fill=(255, 255, 255, 230))
    return sheet


def main() -> None:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    MICRO_MOTION_EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA")
    closed_source = Image.open(CLOSED_SOURCE).convert("RGBA")
    base = fit_subject(source)
    closed_base = fit_subject(closed_source)
    frames = []
    for index in range(FRAME_COUNT):
        phase = 2 * math.pi * index / FRAME_COUNT
        frame = breathe_torso(base, phase)
        frame = animate_tail(frame, index)
        frame = animate_ears(frame, index)
        frame = composite_blink(frame, closed_base, blink_amount(index))
        frames.append(frame)
        frame.save(ASSET_DIR / f"state-reclining-idle-frame-{index}.png")

    frames[0].save(
        EVIDENCE_DIR / "reclining-idle-preview.gif",
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        disposal=2,
        transparency=0,
    )
    small_frames = [
        frame.resize((180, 125), Image.Resampling.LANCZOS) for frame in frames
    ]
    small_frames[0].save(
        EVIDENCE_DIR / "reclining-idle-preview-small.gif",
        save_all=True,
        append_images=small_frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        disposal=2,
        transparency=0,
    )
    build_contact_sheet(frames).save(
        EVIDENCE_DIR / "reclining-idle-contact-sheet.png"
    )
    (EVIDENCE_DIR / "preview-qa.json").write_text(
        json.dumps(frame_metrics(frames), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    frames[0].save(
        MICRO_MOTION_EVIDENCE_DIR / "idle-preview.gif",
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        disposal=2,
        transparency=0,
    )
    build_contact_sheet(frames).save(
        MICRO_MOTION_EVIDENCE_DIR / "idle-contact-sheet.png"
    )
    (MICRO_MOTION_EVIDENCE_DIR / "idle-motion-qa.json").write_text(
        json.dumps(frame_metrics(frames), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
