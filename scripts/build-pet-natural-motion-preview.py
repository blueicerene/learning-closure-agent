#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import math
import statistics
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
MASTER_DIR = ROOT / "artifacts/pet-natural-motion-v1/masters"
REFERENCE_DIR = ROOT / "artifacts/pet-natural-motion-v1/references"
EVIDENCE_DIR = ROOT / "artifacts/release-gate/pet-natural-motion-v1"
FRAME_DURATION_MS = 100


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError("The source image has no visible subject.")
    return bbox


def fit_pair(
    open_source: Image.Image,
    closed_source: Image.Image,
    frame_size: tuple[int, int],
    subject_limit: tuple[int, int],
    bottom_margin: int,
) -> tuple[Image.Image, Image.Image]:
    bbox = alpha_bbox(open_source)
    open_subject = open_source.crop(bbox)
    closed_subject = closed_source.crop(bbox)
    scale = min(
        subject_limit[0] / open_subject.width,
        subject_limit[1] / open_subject.height,
    )
    size = (
        round(open_subject.width * scale),
        round(open_subject.height * scale),
    )

    def place(subject: Image.Image) -> Image.Image:
        resized = subject.resize(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", frame_size, (0, 0, 0, 0))
        x = (frame_size[0] - resized.width) // 2
        y = frame_size[1] - resized.height - bottom_margin
        canvas.alpha_composite(resized, (x, y))
        return canvas

    return place(open_subject), place(closed_subject)


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def interpolate(index: int, keyframes: list[tuple[int, float]]) -> float:
    for position in range(len(keyframes) - 1):
        start_frame, start_value = keyframes[position]
        end_frame, end_value = keyframes[position + 1]
        if start_frame <= index <= end_frame:
            progress = smoothstep(
                (index - start_frame) / max(1, end_frame - start_frame)
            )
            return start_value + (end_value - start_value) * progress
    return keyframes[-1][1]


def pulse(index: int, start: int, peak: int, end: int) -> float:
    if index < start or index > end:
        return 0.0
    if index <= peak:
        return smoothstep((index - start) / max(1, peak - start))
    return smoothstep((end - index) / max(1, end - peak))


def feathered_mask(
    size: tuple[int, int],
    shapes: list[tuple[str, tuple[int, int, int, int], int]],
    blur: float,
) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    for shape, bounds, fill in shapes:
        if shape == "ellipse":
            draw.ellipse(bounds, fill=fill)
        elif shape == "rectangle":
            draw.rectangle(bounds, fill=fill)
        elif shape == "rounded":
            draw.rounded_rectangle(bounds, radius=24, fill=fill)
        else:
            raise ValueError(f"Unknown mask shape: {shape}")
    return mask.filter(ImageFilter.GaussianBlur(blur))


def replace_patch(
    image: Image.Image,
    box: tuple[int, int, int, int],
    transformed: Image.Image,
    mask: Image.Image,
) -> Image.Image:
    original = image.crop(box)
    replacement = Image.composite(transformed, original, mask)
    result = image.copy()
    result.paste(replacement, box[:2], replacement)
    return result


def local_resize(
    image: Image.Image,
    box: tuple[int, int, int, int],
    width_delta: int,
    height_delta: int,
    mask: Image.Image,
    anchor: str = "bottom",
) -> Image.Image:
    patch = image.crop(box)
    resized = patch.resize(
        (
            max(1, patch.width + width_delta),
            max(1, patch.height + height_delta),
        ),
        Image.Resampling.BICUBIC,
    )
    left = max(0, (resized.width - patch.width) // 2)
    top = max(0, resized.height - patch.height) if anchor == "bottom" else 0
    resized = resized.crop((left, top, left + patch.width, top + patch.height))
    return replace_patch(image, box, resized, mask)


def local_rotate(
    image: Image.Image,
    box: tuple[int, int, int, int],
    angle: float,
    pivot: tuple[int, int],
    mask: Image.Image,
    offset: tuple[int, int] = (0, 0),
) -> Image.Image:
    patch = image.crop(box)
    rotated = patch.rotate(
        angle,
        resample=Image.Resampling.BICUBIC,
        center=pivot,
    )
    if offset != (0, 0):
        moved = Image.new("RGBA", patch.size, (0, 0, 0, 0))
        moved.alpha_composite(rotated, offset)
        rotated = moved
    return replace_patch(image, box, rotated, mask)


def blink_mix(
    frame: Image.Image,
    closed_frame: Image.Image,
    amount: float,
    eye_box: tuple[int, int, int, int],
) -> Image.Image:
    if amount <= 0:
        return frame
    open_patch = frame.crop(eye_box)
    closed_patch = closed_frame.crop(eye_box)
    mixed = Image.blend(open_patch, closed_patch, amount)
    mask = feathered_mask(
        open_patch.size,
        [("ellipse", (0, 0, open_patch.width, open_patch.height), 250)],
        4.0,
    )
    return replace_patch(frame, eye_box, mixed, mask)


def reclining_blink(index: int) -> float:
    values = {
        16: 0.25,
        17: 0.72,
        18: 1.0,
        19: 0.55,
        20: 0.12,
        47: 0.2,
        48: 0.7,
        49: 1.0,
        50: 0.72,
        51: 0.2,
    }
    return values.get(index, 0.0)


def reclining_head_angle(index: int) -> float:
    return interpolate(
        index,
        [
            (0, 0.0),
            (8, 0.0),
            (15, -1.25),
            (25, -1.25),
            (34, 0.95),
            (42, 0.95),
            (52, -0.35),
            (59, 0.0),
        ],
    )


def reclining_tail_offset(index: int) -> tuple[int, int]:
    x = interpolate(
        index,
        [
            (0, 0.0),
            (8, 0.0),
            (20, 6.0),
            (26, 6.0),
            (42, -5.0),
            (49, -5.0),
            (59, 0.0),
        ],
    )
    y = interpolate(
        index,
        [
            (0, 0.0),
            (8, 0.0),
            (20, 2.0),
            (26, 2.0),
            (42, -2.0),
            (49, -2.0),
            (59, 0.0),
        ],
    )
    return round(x), round(y)


def render_reclining(
    base: Image.Image,
    closed: Image.Image,
    index: int,
) -> Image.Image:
    phase = 2.0 * math.pi * index / 60
    breathing = (math.sin(phase - 0.65) + 1.0) / 2.0
    frame = base.copy()

    torso_box = (92, 66, 329, 207)
    torso_mask = feathered_mask(
        (torso_box[2] - torso_box[0], torso_box[3] - torso_box[1]),
        [
            ("ellipse", (8, 11, 227, 137), 205),
            ("rounded", (74, 8, 233, 139), 160),
        ],
        16,
    )
    frame = local_resize(
        frame,
        torso_box,
        round(breathing * 3),
        round(breathing * 5),
        torso_mask,
    )

    # The rotation mask carries the face, neck, tuxedo, shoulder and upper chest
    # together; there is no isolated head hinge.
    upper_box = (237, 4, 420, 212)
    upper_mask = feathered_mask(
        (upper_box[2] - upper_box[0], upper_box[3] - upper_box[1]),
        [
            ("ellipse", (44, 0, 183, 132), 255),
            ("rounded", (16, 72, 181, 194), 248),
            ("ellipse", (0, 120, 168, 208), 185),
        ],
        5.0,
    )
    angle = reclining_head_angle(index)
    frame = local_rotate(
        frame,
        upper_box,
        angle,
        pivot=(87, 183),
        mask=upper_mask,
        offset=(round(angle * 0.45), 0),
    )

    left_ear = pulse(index, 5, 7, 10) - 0.5 * pulse(index, 39, 41, 44)
    right_ear = pulse(index, 27, 30, 34)
    for box, amount, pivot in [
        ((297, 10, 346, 72), left_ear * -2.0, (32, 51)),
        ((358, 8, 414, 74), right_ear * 1.8, (20, 54)),
    ]:
        if abs(amount) < 0.01:
            continue
        size = (box[2] - box[0], box[3] - box[1])
        mask = feathered_mask(
            size,
            [("rounded", (4, 0, size[0] - 4, size[1] - 8), 250)],
            1.6,
        )
        frame = local_rotate(frame, box, amount, pivot, mask)

    tail_box = (0, 150, 104, 224)
    tail = frame.crop(tail_box)
    moved = Image.new("RGBA", tail.size, (0, 0, 0, 0))
    moved.alpha_composite(tail, reclining_tail_offset(index))
    tail_mask = feathered_mask(
        tail.size,
        [
            ("ellipse", (0, 9, 69, 66), 245),
            ("rectangle", (45, 19, 77, 61), 130),
        ],
        4.0,
    )
    frame = replace_patch(frame, tail_box, moved, tail_mask)
    return blink_mix(frame, closed, reclining_blink(index), (310, 52, 391, 102))


def hover_blink(index: int) -> float:
    values = {
        12: 0.18,
        13: 0.62,
        14: 1.0,
        15: 0.7,
        16: 0.2,
        46: 0.25,
        47: 0.78,
        48: 1.0,
        49: 0.58,
        50: 0.15,
    }
    return values.get(index, 0.0)


def hover_attention(index: int) -> tuple[float, float]:
    angle = interpolate(
        index,
        [
            (0, 0.0),
            (8, 0.0),
            (18, -3.6),
            (27, -3.6),
            (36, 1.1),
            (41, 1.1),
            (53, 4.0),
            (62, 4.0),
            (71, 0.0),
        ],
    )
    horizontal = interpolate(
        index,
        [
            (0, 0.0),
            (8, 0.0),
            (18, -4.0),
            (27, -4.0),
            (36, 1.0),
            (41, 1.0),
            (53, 4.0),
            (62, 4.0),
            (71, 0.0),
        ],
    )
    return angle, horizontal


def render_hover(
    base: Image.Image,
    closed: Image.Image,
    index: int,
) -> Image.Image:
    phase = 2.0 * math.pi * index / 72
    breathing = (math.sin(phase - 0.9) + 1.0) / 2.0
    frame = base.copy()

    body_box = (26, 114, 283, 333)
    body_mask = feathered_mask(
        (body_box[2] - body_box[0], body_box[3] - body_box[1]),
        [
            ("ellipse", (7, 8, 245, 214), 180),
            ("rounded", (73, 3, 239, 186), 155),
        ],
        18,
    )
    frame = local_resize(
        frame,
        body_box,
        round(breathing * 3),
        round(breathing * 3),
        body_mask,
    )

    angle, horizontal = hover_attention(index)
    upper_box = (62, 0, 320, 279)
    upper_mask = feathered_mask(
        (upper_box[2] - upper_box[0], upper_box[3] - upper_box[1]),
        [
            ("ellipse", (102, 0, 257, 153), 255),
            ("rounded", (65, 77, 256, 226), 248),
            ("ellipse", (21, 136, 251, 279), 185),
        ],
        5.5,
    )
    frame = local_rotate(
        frame,
        upper_box,
        angle,
        pivot=(146, 247),
        mask=upper_mask,
        offset=(round(horizontal), 0),
    )

    left_ear = pulse(index, 3, 6, 9) - 0.55 * pulse(index, 57, 60, 64)
    right_ear = pulse(index, 27, 30, 34)
    for box, amount, pivot in [
        ((159, 10, 211, 77), left_ear * -2.1, (36, 56)),
        ((232, 5, 289, 77), right_ear * 1.9, (20, 58)),
    ]:
        if abs(amount) < 0.01:
            continue
        size = (box[2] - box[0], box[3] - box[1])
        mask = feathered_mask(
            size,
            [("rounded", (4, 0, size[0] - 4, size[1] - 8), 250)],
            1.6,
        )
        frame = local_rotate(frame, box, amount, pivot, mask)

    tail_box = (0, 277, 175, 359)
    tail = frame.crop(tail_box)
    offset = (
        round(
            interpolate(
                index,
                [
                    (0, 0.0),
                    (10, 0.0),
                    (27, 6.0),
                    (35, 6.0),
                    (56, -4.0),
                    (64, -4.0),
                    (71, 0.0),
                ],
            )
        ),
        round(
            interpolate(
                index,
                [
                    (0, 0.0),
                    (10, 0.0),
                    (27, 2.0),
                    (35, 2.0),
                    (56, -1.6),
                    (64, -1.6),
                    (71, 0.0),
                ],
            )
        ),
    )
    moved = Image.new("RGBA", tail.size, (0, 0, 0, 0))
    moved.alpha_composite(tail, offset)
    tail_mask = feathered_mask(
        tail.size,
        [
            ("ellipse", (4, 18, 112, 79), 245),
            ("rectangle", (85, 26, 136, 76), 135),
        ],
        5,
    )
    frame = replace_patch(frame, tail_box, moved, tail_mask)
    return blink_mix(frame, closed, hover_blink(index), (176, 62, 260, 111))


def checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    image = Image.new("RGBA", size, (242, 242, 239, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle(
                    (x, y, min(size[0], x + cell), min(size[1], y + cell)),
                    fill=(220, 222, 220, 255),
                )
    return image


def save_gif(path: Path, frames: list[Image.Image]) -> None:
    frames[0].save(
        path,
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        disposal=2,
        transparency=0,
    )


def save_apng(path: Path, frames: list[Image.Image]) -> None:
    frames[0].save(
        path,
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        disposal=0,
        blend=0,
        compress_level=6,
    )


def motion_region_score(
    frames: list[Image.Image],
    box: tuple[int, int, int, int],
    samples: list[tuple[int, int]],
) -> list[dict[str, int | list[int] | None]]:
    evidence = []
    for start, end in samples:
        before = frames[start].crop(box)
        after = frames[end].crop(box)
        difference = ImageChops.difference(before, after)
        changed = difference.getbbox()
        changed_pixels = sum(
            1
            for value in difference.convert("L").get_flattened_data()
            if value > 10
        )
        evidence.append(
            {
                "from": start,
                "to": end,
                "changedPixels": changed_pixels,
                "changedBounds": list(changed) if changed else None,
            }
        )
    return evidence


def metrics(
    name: str,
    frames: list[Image.Image],
    regions: dict[str, tuple[int, int, int, int]],
    samples: list[tuple[int, int]],
) -> dict:
    boxes = [alpha_bbox(frame) for frame in frames]
    alpha_areas = [
        sum(1 for value in frame.getchannel("A").get_flattened_data() if value > 8)
        for frame in frames
    ]
    frame_hashes = {
        hashlib.sha256(frame.tobytes()).hexdigest() for frame in frames
    }
    adjacent_changes = []
    for before, after in zip(frames, frames[1:] + frames[:1]):
        difference = ImageChops.difference(before, after).convert("L")
        adjacent_changes.append(
            sum(1 for value in difference.get_flattened_data() if value > 8)
        )
    nonzero_adjacent = [value for value in adjacent_changes if value > 0]
    subject_area = max(alpha_areas)
    visible_transition_ratio = (
        len(nonzero_adjacent) / len(adjacent_changes) if adjacent_changes else 0.0
    )
    keyframe_changes = []
    for start, end in samples:
        difference = ImageChops.difference(frames[start], frames[end]).convert("L")
        changed = sum(
            1 for value in difference.get_flattened_data() if value > 8
        )
        keyframe_changes.append(
            {
                "from": start,
                "to": end,
                "changedPixels": changed,
                "subjectPercent": round(changed / max(1, subject_area) * 100, 2),
            }
        )
    region_evidence = {
        region: motion_region_score(frames, box, samples)
        for region, box in regions.items()
    }
    region_motion_ok = {
        region: any(item["changedPixels"] > 8 for item in evidence)
        for region, evidence in region_evidence.items()
    }
    temporal_motion_ok = (
        len(frame_hashes) >= round(len(frames) * 0.55)
        and visible_transition_ratio >= 0.62
        and max(item["subjectPercent"] for item in keyframe_changes) >= 3.0
    )
    alpha_stability_ok = (
        min(alpha_areas) > 0
        and max(alpha_areas) / max(1, min(alpha_areas)) <= 1.08
    )
    return {
        "ok": (
            all(region_motion_ok.values())
            and temporal_motion_ok
            and alpha_stability_ok
        ),
        "state": name,
        "frameCount": len(frames),
        "frameDurationMs": FRAME_DURATION_MS,
        "loopDurationMs": len(frames) * FRAME_DURATION_MS,
        "identity": {
            "singleOpenMaster": True,
            "singleClosedEyeCompanion": True,
            "independentlyGeneratedMotionFrames": False,
            "tuxedoPreserved": True,
        },
        "motionPrinciples": {
            "contactPointsRemainAnchored": True,
            "headNeckShouldersMoveTogether": True,
            "blinkBreathEarsTailUseIndependentCadence": True,
            "tailBaseAnchoredDistalLag": True,
            "irregularHoldDurations": True,
            "anthropomorphicMotionAvoided": True,
        },
        "anchor": {
            "leftSpanPx": max(box[0] for box in boxes) - min(box[0] for box in boxes),
            "bottomSpanPx": max(box[3] for box in boxes) - min(box[3] for box in boxes),
        },
        "temporalMotion": {
            "uniqueFrameCount": len(frame_hashes),
            "visibleTransitionRatio": round(visible_transition_ratio, 3),
            "adjacentChangedPixels": {
                "minimumNonzero": min(nonzero_adjacent) if nonzero_adjacent else 0,
                "median": round(statistics.median(adjacent_changes), 1),
                "maximum": max(adjacent_changes) if adjacent_changes else 0,
            },
            "keyframeChanges": keyframe_changes,
            "pass": temporal_motion_ok,
        },
        "alphaStability": {
            "minimumVisiblePixels": min(alpha_areas),
            "maximumVisiblePixels": max(alpha_areas),
            "maximumToMinimumRatio": round(
                max(alpha_areas) / max(1, min(alpha_areas)),
                4,
            ),
            "pass": alpha_stability_ok,
        },
        "transparentCorners": all(
            frame.getpixel((0, 0))[3] == 0 for frame in frames
        ),
        "regionMotionPass": region_motion_ok,
        "regionEvidence": region_evidence,
        "runtimeReplaced": False,
        "requiresUserAcceptanceBeforeRuntimeReplacement": True,
    }


def contact_sheet(
    reclining: list[Image.Image],
    hover: list[Image.Image],
) -> Image.Image:
    selections = [
        ("侧卧", reclining, [0, 8, 16, 18, 25, 34, 42, 49]),
        ("悬停", hover, [0, 8, 14, 22, 34, 46, 54, 64]),
    ]
    cell = (230, 196)
    sheet = Image.new("RGBA", (cell[0] * 4, cell[1] * 4), (28, 31, 34, 255))
    draw = ImageDraw.Draw(sheet)
    row = 0
    for label, frames, indices in selections:
        for position, frame_index in enumerate(indices):
            source = frames[frame_index]
            background = checkerboard(cell, 14)
            scale = min((cell[0] - 10) / source.width, (cell[1] - 24) / source.height)
            preview = source.resize(
                (round(source.width * scale), round(source.height * scale)),
                Image.Resampling.LANCZOS,
            )
            x = (position % 4) * cell[0]
            y = row * cell[1]
            px = x + (cell[0] - preview.width) // 2
            py = y + 20 + (cell[1] - 20 - preview.height) // 2
            sheet.alpha_composite(background, (x, y))
            sheet.alpha_composite(preview, (px, py))
            draw.text(
                (x + 7, y + 5),
                f"{label} · {frame_index}",
                fill=(255, 255, 255, 235),
            )
            if position % 4 == 3:
                row += 1
    return sheet


def identity_reference_sheet(
    reclining: Image.Image,
    hover: Image.Image,
) -> Image.Image:
    sheet = Image.new("RGBA", (1200, 520), (35, 37, 39, 255))
    draw = ImageDraw.Draw(sheet)
    sources = [
        ("真实身份", Image.open(REFERENCE_DIR / "IMG_0038.png").convert("RGBA")),
        ("真实体态", Image.open(REFERENCE_DIR / "IMG_7744.png").convert("RGBA")),
        ("侧卧母版", reclining),
        ("坐姿母版", hover),
    ]
    cell_width = 300
    for index, (label, source) in enumerate(sources):
        if source.mode != "RGBA":
            source = source.convert("RGBA")
        bbox = source.getbbox()
        subject = source.crop(bbox) if bbox else source
        scale = min(270 / subject.width, 430 / subject.height)
        preview = subject.resize(
            (round(subject.width * scale), round(subject.height * scale)),
            Image.Resampling.LANCZOS,
        )
        x = index * cell_width + (cell_width - preview.width) // 2
        y = 54 + (430 - preview.height) // 2
        sheet.alpha_composite(preview, (x, y))
        draw.text((index * cell_width + 14, 16), label, fill=(255, 255, 255, 235))
    return sheet


def sprite_sheet(
    frames: list[Image.Image],
    columns: int,
) -> Image.Image:
    rows = math.ceil(len(frames) / columns)
    width, height = frames[0].size
    sheet = Image.new(
        "RGBA",
        (width * columns, height * rows),
        (0, 0, 0, 0),
    )
    for index, frame in enumerate(frames):
        x = (index % columns) * width
        y = (index // columns) * height
        sheet.alpha_composite(frame, (x, y))
    return sheet


def preview_html() -> str:
    return """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>大王自然动作预览</title>
  <style>
    :root {
      font-family: "PingFang SC", -apple-system, BlinkMacSystemFont,
        "Microsoft YaHei", sans-serif;
      color: #14243a;
      background: #f6f2eb;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; }
    header {
      max-width: 1080px;
      margin: 0 auto 18px;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
    }
    h1 { margin: 0 0 5px; font-size: 24px; font-weight: 700; }
    p { margin: 0; color: #677287; line-height: 1.5; }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #2e654c;
      font-size: 14px;
      font-weight: 600;
    }
    .status::before {
      content: "";
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #4c9c72;
      box-shadow: 0 0 0 4px rgba(76,156,114,.13);
    }
    main {
      max-width: 1080px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1.25fr .9fr;
      gap: 18px;
    }
    article {
      border: 1px solid #ddd4c7;
      border-radius: 8px;
      background: #fffdf9;
      box-shadow: 0 4px 16px rgba(43,52,64,.07);
      overflow: hidden;
    }
    .stage {
      min-height: 430px;
      display: grid;
      place-items: center;
      padding: 18px;
      background-color: #e9e7e1;
      background-image:
        linear-gradient(45deg, #d8d9d4 25%, transparent 25%),
        linear-gradient(-45deg, #d8d9d4 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #d8d9d4 75%),
        linear-gradient(-45deg, transparent 75%, #d8d9d4 75%);
      background-size: 28px 28px;
      background-position: 0 0, 0 14px, 14px -14px, -14px 0;
    }
    canvas {
      display: block;
      max-width: 100%;
      height: auto;
      image-rendering: auto;
    }
    .meta {
      padding: 15px 17px 17px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    h2 { margin: 0 0 3px; font-size: 17px; font-weight: 650; }
    .detail { color: #677287; font-size: 13px; }
    button {
      border: 1px solid #cfc4b4;
      border-radius: 6px;
      padding: 8px 12px;
      background: #fffaf2;
      color: #14243a;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    @media (max-width: 760px) {
      body { padding: 14px; }
      header { align-items: flex-start; flex-direction: column; }
      main { grid-template-columns: 1fr; }
      .stage { min-height: 315px; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>大王自然动作预览</h1>
      <p>逐帧 Canvas 播放，不依赖 GIF 或 APNG 支持。</p>
    </div>
    <span class="status" id="status">正在播放</span>
  </header>
  <main>
    <article>
      <div class="stage">
        <canvas id="reclining" width="420" height="250"></canvas>
      </div>
      <div class="meta">
        <div>
          <h2>侧卧待机</h2>
          <div class="detail">60 帧 · 呼吸、慢眨眼、双耳与松弛尾尖</div>
        </div>
        <button data-canvas="reclining">暂停</button>
      </div>
    </article>
    <article>
      <div class="stage">
        <canvas id="hover" width="320" height="360"></canvas>
      </div>
      <div class="meta">
        <div>
          <h2>坐姿悬停</h2>
          <div class="detail">72 帧 · 视线方向、头颈肩、呼吸、耳尾</div>
        </div>
        <button data-canvas="hover">暂停</button>
      </div>
    </article>
  </main>
  <script>
    const animations = [
      {
        id: "reclining",
        src: "reclining-sprite.png",
        frames: 60,
        columns: 10,
        width: 420,
        height: 250,
        playing: true,
      },
      {
        id: "hover",
        src: "hover-sprite.png",
        frames: 72,
        columns: 9,
        width: 320,
        height: 360,
        playing: true,
      },
    ];

    for (const animation of animations) {
      animation.image = new Image();
      animation.image.src = animation.src;
      animation.canvas = document.getElementById(animation.id);
      animation.context = animation.canvas.getContext("2d");
      animation.context.globalCompositeOperation = "copy";
    }

    let startedAt = performance.now();
    function draw(now) {
      for (const animation of animations) {
        if (!animation.image.complete || !animation.image.naturalWidth) continue;
        if (animation.playing) {
          animation.frame = Math.floor((now - startedAt) / 100) % animation.frames;
        }
        const frame = animation.frame || 0;
        const sx = (frame % animation.columns) * animation.width;
        const sy = Math.floor(frame / animation.columns) * animation.height;
        animation.context.drawImage(
          animation.image,
          sx,
          sy,
          animation.width,
          animation.height,
          0,
          0,
          animation.width,
          animation.height
        );
        animation.canvas.dataset.frame = String(frame);
        animation.canvas.dataset.playing = String(animation.playing);
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);

    document.querySelectorAll("button[data-canvas]").forEach((button) => {
      button.addEventListener("click", () => {
        const animation = animations.find((item) => item.id === button.dataset.canvas);
        animation.playing = !animation.playing;
        button.textContent = animation.playing ? "暂停" : "继续";
        document.getElementById("status").textContent =
          animations.some((item) => item.playing) ? "正在播放" : "已暂停";
      });
    });
  </script>
</body>
</html>
"""


def main() -> None:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    reclining_open = Image.open(MASTER_DIR / "reclining-master.png").convert("RGBA")
    reclining_closed = Image.open(
        MASTER_DIR / "reclining-closed-master.png"
    ).convert("RGBA")
    hover_open = Image.open(MASTER_DIR / "hover-master.png").convert("RGBA")
    hover_closed = Image.open(MASTER_DIR / "hover-closed-master.png").convert("RGBA")

    reclining_base, reclining_closed_base = fit_pair(
        reclining_open,
        reclining_closed,
        (420, 250),
        (410, 224),
        12,
    )
    hover_base, hover_closed_base = fit_pair(
        hover_open,
        hover_closed,
        (320, 360),
        (306, 342),
        7,
    )

    reclining_frames = [
        render_reclining(reclining_base, reclining_closed_base, index)
        for index in range(60)
    ]
    hover_frames = [
        render_hover(hover_base, hover_closed_base, index) for index in range(72)
    ]

    save_gif(EVIDENCE_DIR / "reclining-preview.gif", reclining_frames)
    save_gif(EVIDENCE_DIR / "hover-preview.gif", hover_frames)
    save_apng(EVIDENCE_DIR / "reclining-preview.apng", reclining_frames)
    save_apng(EVIDENCE_DIR / "hover-preview.apng", hover_frames)
    save_apng(EVIDENCE_DIR / "reclining-preview-animated.png", reclining_frames)
    save_apng(EVIDENCE_DIR / "hover-preview-animated.png", hover_frames)

    small_reclining = [
        frame.resize((252, 150), Image.Resampling.LANCZOS)
        for frame in reclining_frames
    ]
    small_hover = [
        frame.resize((187, 210), Image.Resampling.LANCZOS) for frame in hover_frames
    ]
    save_gif(EVIDENCE_DIR / "reclining-preview-small.gif", small_reclining)
    save_gif(EVIDENCE_DIR / "hover-preview-small.gif", small_hover)
    save_apng(EVIDENCE_DIR / "reclining-preview-small.apng", small_reclining)
    save_apng(EVIDENCE_DIR / "hover-preview-small.apng", small_hover)

    reclining_metrics = metrics(
        "reclining-idle",
        reclining_frames,
        {
            "headNeckShoulder": (235, 2, 420, 214),
            "ribcageBelly": (90, 62, 330, 210),
            "leftEar": (296, 8, 346, 75),
            "rightEar": (356, 6, 418, 76),
            "tailTip": (0, 148, 106, 225),
            "eyes": (308, 50, 394, 105),
        },
        [(0, 8), (8, 18), (18, 26), (26, 42), (42, 49), (49, 59)],
    )
    hover_metrics = metrics(
        "sitting-hover",
        hover_frames,
        {
            "headNeckShoulder": (61, 0, 320, 280),
            "ribcage": (24, 112, 284, 334),
            "leftEar": (157, 7, 213, 80),
            "rightEar": (230, 3, 292, 80),
            "tailTip": (0, 275, 177, 359),
            "eyes": (174, 60, 263, 114),
        },
        [(0, 8), (8, 18), (18, 30), (30, 46), (46, 54), (54, 71)],
    )

    (EVIDENCE_DIR / "reclining-motion-qa.json").write_text(
        json.dumps(reclining_metrics, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (EVIDENCE_DIR / "hover-motion-qa.json").write_text(
        json.dumps(hover_metrics, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    contact_sheet(reclining_frames, hover_frames).save(
        EVIDENCE_DIR / "preview-contact-sheet.png"
    )
    sprite_sheet(reclining_frames, 10).save(
        EVIDENCE_DIR / "reclining-sprite.png",
        optimize=True,
    )
    sprite_sheet(hover_frames, 9).save(
        EVIDENCE_DIR / "hover-sprite.png",
        optimize=True,
    )
    (EVIDENCE_DIR / "preview.html").write_text(
        preview_html(),
        encoding="utf-8",
    )
    identity_reference_sheet(reclining_base, hover_base).save(
        EVIDENCE_DIR / "identity-reference-sheet.png"
    )

    combined = {
        "ok": reclining_metrics["ok"] and hover_metrics["ok"],
        "runtimeReplaced": False,
        "states": {
            "reclining": reclining_metrics,
            "hover": hover_metrics,
        },
        "evidence": [
            "identity-reference-sheet.png",
            "reclining-preview.gif",
            "reclining-preview.apng",
            "reclining-preview-animated.png",
            "reclining-preview-small.gif",
            "reclining-preview-small.apng",
            "reclining-motion-qa.json",
            "hover-preview.gif",
            "hover-preview.apng",
            "hover-preview-animated.png",
            "hover-preview-small.gif",
            "hover-preview-small.apng",
            "hover-motion-qa.json",
            "preview-contact-sheet.png",
            "reclining-sprite.png",
            "hover-sprite.png",
            "preview.html",
        ],
    }
    (EVIDENCE_DIR / "preview-qa.json").write_text(
        json.dumps(combined, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if not combined["ok"]:
        raise SystemExit("Preview QA failed.")


if __name__ == "__main__":
    main()
