#!/usr/bin/env python3

import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "desktop-dropper/assets/state-curious-neutral-master.png"
CLOSED_SOURCE = ROOT / "desktop-dropper/assets/state-curious-neutral-closed-master.png"
ASSET_DIR = ROOT / "desktop-dropper/assets"
EVIDENCE_DIR = ROOT / "artifacts/release-gate/pet-hover-natural"
MICRO_MOTION_EVIDENCE_DIR = (
    ROOT / "artifacts/release-gate/pet-idle-hover-micro-motion"
)
FRAME_COUNT = 72
FRAME_SIZE = (300, 352)
FRAME_DURATION_MS = 110
HEAD_BOX = (45, 0, 255, 168)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError("The hover master has no visible subject.")
    return bbox


def fit_subject(source: Image.Image, crop_box: tuple[int, int, int, int]) -> Image.Image:
    subject = source.crop(crop_box)
    scale = min(286 / subject.width, 338 / subject.height)
    resized = subject.resize(
        (round(subject.width * scale), round(subject.height * scale)),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", FRAME_SIZE, (0, 0, 0, 0))
    x = (FRAME_SIZE[0] - resized.width) // 2
    y = FRAME_SIZE[1] - resized.height - 5
    canvas.alpha_composite(resized, (x, y))
    return canvas


def smoothstep(value: float) -> float:
    return value * value * (3 - 2 * value)


def interpolate_keyframes(index: int, keyframes: list[tuple[int, float]]) -> float:
    for position in range(len(keyframes) - 1):
        start_frame, start_value = keyframes[position]
        end_frame, end_value = keyframes[position + 1]
        if start_frame <= index <= end_frame:
            span = max(1, end_frame - start_frame)
            progress = smoothstep((index - start_frame) / span)
            return start_value + (end_value - start_value) * progress
    return keyframes[-1][1]


def head_angle(index: int) -> float:
    # Uneven holds and direction changes keep the loop from reading as a pendulum.
    return interpolate_keyframes(
        index,
        [
            (0, 0.0),
            (7, 0.0),
            (15, -15.0),
            (22, -15.0),
            (30, 5.0),
            (35, 5.0),
            (44, 18.0),
            (52, 18.0),
            (61, -6.0),
            (66, -6.0),
            (71, 0.0),
        ],
    )


def head_horizontal_offset(index: int) -> float:
    return interpolate_keyframes(
        index,
        [
            (0, 0.0),
            (7, 0.0),
            (15, -4.0),
            (22, -4.0),
            (30, 1.5),
            (35, 1.5),
            (44, 4.5),
            (52, 4.5),
            (61, -2.0),
            (66, -2.0),
            (71, 0.0),
        ],
    )


def blink_amount(index: int) -> float:
    blink = {
        11: 0.22,
        12: 0.72,
        13: 1.0,
        14: 0.48,
        39: 0.18,
        40: 0.64,
        41: 1.0,
        42: 0.78,
        43: 0.28,
        64: 0.34,
        65: 1.0,
        66: 0.36,
    }
    return blink.get(index, 0.0)


def pulse(index: int, start: int, peak: int, end: int) -> float:
    if index < start or index > end:
        return 0.0
    if index <= peak:
        return smoothstep((index - start) / max(1, peak - start))
    return smoothstep((end - index) / max(1, end - peak))


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


def animate_head_ears(head: Image.Image, index: int) -> Image.Image:
    # Ear reactions intentionally avoid the blink peaks and differ per side.
    left_amount = pulse(index, 3, 6, 9) - 0.55 * pulse(index, 53, 56, 60)
    right_amount = pulse(index, 25, 28, 32)
    result = head
    ear_specs = [
        ((42, 0, 127, 82), left_amount * -1.3, (58, 69)),
        ((173, 0, 258, 82), right_amount * 1.15, (27, 69)),
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
                (4, 0),
                (patch.width - 4, 0),
                (patch.width - 10, patch.height - 13),
                (10, patch.height - 13),
            ],
            fill=255,
        )
        mask = mask.filter(ImageFilter.GaussianBlur(1.5))
        result = replace_transformed_patch(result, box, rotated, mask)
    return result


def animate_curled_tail(frame: Image.Image, index: int) -> Image.Image:
    box = (54, 297, 246, 352)
    patch = frame.crop(box)
    offset_x = round(
        interpolate_keyframes(
            index,
            [(0, 0.0), (10, 0.0), (28, 2.0), (36, 2.0), (57, -1.7), (64, -1.7), (71, 0.0)],
        )
    )
    offset_y = round(
        interpolate_keyframes(
            index,
            [(0, 0.0), (10, 0.0), (28, 0.8), (36, 0.8), (57, -0.7), (64, -0.7), (71, 0.0)],
        )
    )
    moved = Image.new("RGBA", patch.size, (0, 0, 0, 0))
    moved.alpha_composite(patch, (offset_x, offset_y))
    mask = Image.new("L", patch.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((2, 9, 139, patch.height + 17), fill=225)
    draw.rectangle((10, 24, 112, patch.height), fill=210)
    draw.rectangle((112, 25, 154, patch.height), fill=105)
    mask = mask.filter(ImageFilter.GaussianBlur(5.5))
    return replace_transformed_patch(frame, box, moved, mask)


def breathing_body(body: Image.Image, index: int) -> Image.Image:
    phase = 2 * math.pi * index / FRAME_COUNT
    amount = (math.sin(phase) + 1) / 2
    box = (42, 143, 258, 316)
    patch = body.crop(box)
    width_delta = round(amount * 2)
    height_delta = round(amount * 2)
    expanded = patch.resize(
        (patch.width + width_delta, patch.height + height_delta),
        Image.Resampling.BICUBIC,
    )
    left = max(0, (expanded.width - patch.width) // 2)
    expanded = expanded.crop(
        (left, expanded.height - patch.height, left + patch.width, expanded.height)
    )
    mask = Image.new("L", patch.size, 0)
    ImageDraw.Draw(mask).ellipse((10, 8, patch.width - 10, patch.height - 5), fill=205)
    mask = mask.filter(ImageFilter.GaussianBlur(18))
    result = body.copy()
    result.paste(Image.composite(expanded, patch, mask), box[:2])
    return result


def upper_body_angle(index: int) -> float:
    # Keep the irregular direction changes, but carry them through neck and shoulders.
    return head_angle(index) * 0.55


def animate_connected_upper_body(frame: Image.Image, index: int) -> Image.Image:
    box = (0, 0, FRAME_SIZE[0], 272)
    patch = frame.crop(box)
    angle = upper_body_angle(index)
    rotated = patch.rotate(
        angle,
        resample=Image.Resampling.BICUBIC,
        center=(150, 225),
    )
    offset_x = round(head_horizontal_offset(index) * 0.45)
    moved = Image.new("RGBA", patch.size, (0, 0, 0, 0))
    moved.alpha_composite(rotated, (offset_x, 0))

    # The mask includes the head, neck, shoulders and upper chest. Its lower edge
    # fades into the stable forelegs, preventing a head-on-body hinge.
    mask = Image.new("L", patch.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle((28, 0, 272, 148), fill=255)
    draw.ellipse((18, -24, 282, 229), fill=255)
    draw.rounded_rectangle((42, 78, 258, 230), radius=58, fill=255)
    draw.ellipse((61, 154, 239, 266), fill=205)
    mask = mask.filter(ImageFilter.GaussianBlur(4.5))
    return replace_transformed_patch(frame, box, moved, mask)


def render_frame(
    base: Image.Image,
    closed_base: Image.Image,
    index: int,
) -> Image.Image:
    amount = blink_amount(index)
    frame = Image.blend(base, closed_base, amount) if amount > 0 else base.copy()
    frame = breathing_body(frame, index)
    frame = animate_head_ears(frame, index)
    frame = animate_connected_upper_body(frame, index)
    return animate_curled_tail(frame, index)


def build_contact_sheet(frames: list[Image.Image]) -> Image.Image:
    selected = [0, 7, 13, 18, 25, 33, 41, 48, 57, 64, 68, 71]
    scale = 0.58
    cell = (round(FRAME_SIZE[0] * scale), round(FRAME_SIZE[1] * scale))
    sheet = Image.new("RGBA", (cell[0] * 4, cell[1] * 3), (28, 31, 34, 255))
    draw = ImageDraw.Draw(sheet)
    for position, frame_index in enumerate(selected):
        x = (position % 4) * cell[0]
        y = (position // 4) * cell[1]
        preview = frames[frame_index].resize(cell, Image.Resampling.LANCZOS)
        sheet.alpha_composite(preview, (x, y))
        draw.text(
            (x + 7, y + 7),
            f"{frame_index} · {upper_body_angle(frame_index):.1f}°",
            fill=(255, 255, 255, 235),
        )
    return sheet


def metrics(frames: list[Image.Image]) -> dict:
    sample_indices = [0, 7, 15, 22, 30, 35, 44, 52, 61, 66, 71]
    sampled_angles = [round(upper_body_angle(index), 2) for index in sample_indices]
    adjacent_evidence = []
    for start, end in zip(sample_indices, sample_indices[1:]):
        bbox = ImageChops.difference(frames[start], frames[end]).getbbox()
        adjacent_evidence.append(
            {"from": start, "to": end, "changedBounds": list(bbox) if bbox else None}
        )
    return {
        "ok": True,
        "frameCount": FRAME_COUNT,
        "frameSize": list(FRAME_SIZE),
        "frameDurationMs": FRAME_DURATION_MS,
        "singleContinuousHoverLoop": True,
        "connectedUpperBodyMotion": {
            "sampleFrames": sample_indices,
            "sampleAnglesDegrees": sampled_angles,
            "minimumAngle": min(sampled_angles),
            "maximumAngle": max(sampled_angles),
            "crossesCenter": min(sampled_angles) < 0 < max(sampled_angles),
            "unevenHoldDurations": True,
            "entryTimeDirectionSelection": False,
            "includesHeadNeckShouldersAndUpperChest": True,
            "isolatedHeadLayerUsed": False,
            "featheredIntoStableForelegs": True,
        },
        "blinkFrames": [11, 12, 13, 14, 39, 40, 41, 42, 43, 64, 65, 66],
        "localizedBreathingPx": 2,
        "earMotion": {
            "leftEarTwitchFrames": [3, 4, 5, 6, 7, 8, 9, 53, 54, 55, 56, 57, 58, 59, 60],
            "rightEarTwitchFrames": [25, 26, 27, 28, 29, 30, 31, 32],
            "maximumRotationDegrees": 1.3,
            "independentFromBlinkAndHeadTurn": True,
        },
        "curledTailMotion": {
            "motionFrames": list(range(11, 72)),
            "maximumMotionPx": 2.0,
            "style": "one slow relaxed distal-tip sweep per loop with short pauses at the extremes",
            "tailBaseAnchored": True,
            "loopDurationMs": FRAME_COUNT * FRAME_DURATION_MS,
        },
        "earAndTailCadenceIndependent": True,
        "localizedTransformsOnly": True,
        "wholeImageTranslation": False,
        "transparentCorners": all(frame.getpixel((0, 0))[3] == 0 for frame in frames),
        "adjacentRegionEvidence": adjacent_evidence,
        "source": str(SOURCE.relative_to(ROOT)),
        "closedEyeSource": str(CLOSED_SOURCE.relative_to(ROOT)),
    }


def main() -> None:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    MICRO_MOTION_EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA")
    closed_source = Image.open(CLOSED_SOURCE).convert("RGBA")
    crop_box = alpha_bbox(source)
    base = fit_subject(source, crop_box)
    closed_base = fit_subject(closed_source, crop_box)

    frames = [
        render_frame(base, closed_base, index)
        for index in range(FRAME_COUNT)
    ]
    for index, frame in enumerate(frames):
        frame.save(ASSET_DIR / f"state-curious-dynamic-frame-{index}.png")

    frames[0].save(
        EVIDENCE_DIR / "hover-natural-preview.gif",
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        disposal=2,
        transparency=0,
    )
    small_frames = [
        frame.resize((180, 211), Image.Resampling.LANCZOS) for frame in frames
    ]
    small_frames[0].save(
        EVIDENCE_DIR / "hover-natural-preview-small.gif",
        save_all=True,
        append_images=small_frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        disposal=2,
        transparency=0,
    )
    build_contact_sheet(frames).save(
        EVIDENCE_DIR / "hover-natural-contact-sheet.png"
    )
    (EVIDENCE_DIR / "motion-qa.json").write_text(
        json.dumps(metrics(frames), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    frames[0].save(
        MICRO_MOTION_EVIDENCE_DIR / "hover-preview.gif",
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        disposal=2,
        transparency=0,
    )
    build_contact_sheet(frames).save(
        MICRO_MOTION_EVIDENCE_DIR / "hover-contact-sheet.png"
    )
    (MICRO_MOTION_EVIDENCE_DIR / "hover-motion-qa.json").write_text(
        json.dumps(metrics(frames), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
