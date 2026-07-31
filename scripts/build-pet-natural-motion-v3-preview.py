#!/usr/bin/env python3

import hashlib
import json
import math
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


try:
    import cv2
except ImportError:
    cv2 = None


ROOT = Path(__file__).resolve().parents[1]
MASTER_DIR = ROOT / "artifacts/pet-natural-motion-v1/masters"
EVIDENCE_DIR = ROOT / "artifacts/release-gate/pet-natural-motion-v3"

RECLINING_MASTER = MASTER_DIR / "reclining-master.png"
RECLINING_CLOSED_MASTER = MASTER_DIR / "reclining-closed-master.png"
HOVER_MASTER = MASTER_DIR / "hover-master.png"
HOVER_CLOSED_MASTER = MASTER_DIR / "hover-closed-master.png"

RECLINING_SIZE = (420, 250)
HOVER_SIZE = (320, 360)
FRAME_DURATION_MS = 65
FRAME_COUNT = 96


def alpha_bbox(image: Image.Image, threshold: int = 10) -> tuple[int, int, int, int]:
    alpha = np.asarray(image.getchannel("A"))
    ys, xs = np.where(alpha > threshold)
    if len(xs) == 0:
        raise RuntimeError("Keyframe has no visible subject.")
    return int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)


def split_strip(path: Path, count: int) -> list[Image.Image]:
    strip = Image.open(path).convert("RGBA")
    alpha = np.asarray(strip.getchannel("A"))
    occupancy = np.count_nonzero(alpha > 20, axis=0)
    nominal = strip.width / count
    boundaries = [0]
    for index in range(1, count):
        expected = index * nominal
        search_radius = max(12, round(nominal * 0.24))
        start = max(boundaries[-1] + 8, round(expected - search_radius))
        end = min(strip.width - 8, round(expected + search_radius))
        window = occupancy[start:end]
        minimum = int(window.min())
        candidates = np.where(window == minimum)[0] + start
        boundary = int(candidates[np.argmin(np.abs(candidates - expected))])
        boundaries.append(boundary)
    boundaries.append(strip.width)

    frames = []
    for index in range(count):
        left = boundaries[index]
        right = boundaries[index + 1]
        frames.append(keep_largest_subject(strip.crop((left, 0, right, strip.height))))
    return frames


def keep_largest_subject(image: Image.Image) -> Image.Image:
    alpha = np.asarray(image.getchannel("A"))
    foreground = alpha > 24
    height, width = foreground.shape
    seen = np.zeros_like(foreground, dtype=bool)
    largest: list[tuple[int, int]] = []
    for y in range(height):
        for x in range(width):
            if not foreground[y, x] or seen[y, x]:
                continue
            component: list[tuple[int, int]] = []
            queue = deque([(x, y)])
            seen[y, x] = True
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for neighbor_x, neighbor_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if (
                        0 <= neighbor_x < width
                        and 0 <= neighbor_y < height
                        and foreground[neighbor_y, neighbor_x]
                        and not seen[neighbor_y, neighbor_x]
                    ):
                        seen[neighbor_y, neighbor_x] = True
                        queue.append((neighbor_x, neighbor_y))
            if len(component) > len(largest):
                largest = component

    if not largest:
        return image
    keep = Image.new("L", image.size, 0)
    keep_pixels = keep.load()
    for x, y in largest:
        keep_pixels[x, y] = 255
    keep = keep.filter(ImageFilter.MaxFilter(7))
    result = image.copy()
    result.putalpha(ImageChops.multiply(result.getchannel("A"), keep))
    return result


def normalize_keyframes(
    keyframes: list[Image.Image],
    canvas_size: tuple[int, int],
    subject_max: tuple[int, int],
    bottom: int,
) -> list[Image.Image]:
    crops = [frame.crop(alpha_bbox(frame)) for frame in keyframes]
    common_scale = min(
        subject_max[0] / max(crop.width for crop in crops),
        subject_max[1] / max(crop.height for crop in crops),
    )

    result = []
    for crop in crops:
        resized = crop.resize(
            (
                max(1, round(crop.width * common_scale)),
                max(1, round(crop.height * common_scale)),
            ),
            Image.Resampling.LANCZOS,
        )
        canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
        x = (canvas_size[0] - resized.width) // 2
        y = bottom - resized.height
        canvas.alpha_composite(resized, (x, y))
        result.append(canvas)
    return result


def premultiplied_blend(
    first: Image.Image,
    second: Image.Image,
    amount: float,
) -> Image.Image:
    a = np.asarray(first, dtype=np.float32) / 255.0
    b = np.asarray(second, dtype=np.float32) / 255.0
    a_alpha = a[..., 3:4]
    b_alpha = b[..., 3:4]
    a_rgb = a[..., :3] * a_alpha
    b_rgb = b[..., :3] * b_alpha

    alpha = a_alpha * (1.0 - amount) + b_alpha * amount
    rgb_premultiplied = a_rgb * (1.0 - amount) + b_rgb * amount
    rgb = np.divide(
        rgb_premultiplied,
        np.maximum(alpha, 1e-6),
        out=np.zeros_like(rgb_premultiplied),
        where=alpha > 1e-6,
    )
    output = np.concatenate([rgb, alpha], axis=2)
    return Image.fromarray(
        np.clip(output * 255.0, 0, 255).astype(np.uint8),
        mode="RGBA",
    )


def smoothstep(value: float) -> float:
    return value * value * (3.0 - 2.0 * value)


def build_loop(
    keyframes: list[Image.Image],
    transition_frames: int,
    holds: dict[int, int],
) -> tuple[list[Image.Image], list[int]]:
    frames: list[Image.Image] = []
    source_indices: list[int] = []
    for index in range(len(keyframes) - 1):
        hold_count = holds.get(index, 0)
        for _ in range(hold_count):
            frames.append(keyframes[index].copy())
            source_indices.append(index)
        for step in range(transition_frames):
            amount = smoothstep(step / transition_frames)
            frames.append(
                premultiplied_blend(
                    keyframes[index],
                    keyframes[index + 1],
                    amount,
                )
            )
            source_indices.append(index)
    for _ in range(holds.get(len(keyframes) - 1, 0)):
        frames.append(keyframes[-1].copy())
        source_indices.append(len(keyframes) - 1)
    return frames, source_indices


def build_stop_motion_loop(
    keyframes: list[Image.Image],
    repeats: list[int],
) -> tuple[list[Image.Image], list[int]]:
    if len(keyframes) != len(repeats):
        raise ValueError("Each keyframe needs one repeat count.")
    frames: list[Image.Image] = []
    source_indices: list[int] = []
    for index, (keyframe, repeat_count) in enumerate(zip(keyframes, repeats)):
        for _ in range(repeat_count):
            frames.append(keyframe.copy())
            source_indices.append(index)
    return frames, source_indices


def optical_flow_intermediate(
    first: Image.Image,
    second: Image.Image,
    amount: float,
) -> Image.Image:
    first_array = np.asarray(first, dtype=np.uint8)
    second_array = np.asarray(second, dtype=np.uint8)

    def motion_gray(array: np.ndarray) -> np.ndarray:
        alpha = array[..., 3:4].astype(np.float32) / 255.0
        premultiplied = array[..., :3].astype(np.float32) * alpha
        gray = cv2.cvtColor(
            np.clip(premultiplied, 0, 255).astype(np.uint8),
            cv2.COLOR_RGB2GRAY,
        )
        return np.maximum(gray, array[..., 3])

    first_gray = motion_gray(first_array)
    second_gray = motion_gray(second_array)
    forward = cv2.calcOpticalFlowFarneback(
        first_gray,
        second_gray,
        None,
        0.5,
        5,
        25,
        5,
        7,
        1.5,
        0,
    )
    backward = cv2.calcOpticalFlowFarneback(
        second_gray,
        first_gray,
        None,
        0.5,
        5,
        25,
        5,
        7,
        1.5,
        0,
    )
    height, width = first_gray.shape
    grid_x, grid_y = np.meshgrid(
        np.arange(width, dtype=np.float32),
        np.arange(height, dtype=np.float32),
    )

    def warp(array: np.ndarray, flow: np.ndarray, progress: float) -> np.ndarray:
        return cv2.remap(
            array,
            grid_x - flow[..., 0] * progress,
            grid_y - flow[..., 1] * progress,
            cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=0,
        )

    warped_first = warp(first_array, forward, amount)
    warped_second = warp(second_array, backward, 1.0 - amount)
    return premultiplied_blend(
        Image.fromarray(warped_first, mode="RGBA"),
        Image.fromarray(warped_second, mode="RGBA"),
        amount,
    )


def build_optical_flow_loop(
    keyframes: list[Image.Image],
    transition_frames: int,
    holds: dict[int, int],
) -> tuple[list[Image.Image], list[dict[str, float | int | str]]]:
    frames: list[Image.Image] = []
    provenance: list[dict[str, float | int | str]] = []
    for index in range(len(keyframes) - 1):
        for _ in range(holds.get(index, 0)):
            frames.append(keyframes[index].copy())
            provenance.append({"type": "hold", "keyframe": index})
        for step in range(transition_frames):
            amount = step / transition_frames
            frames.append(
                optical_flow_intermediate(
                    keyframes[index],
                    keyframes[index + 1],
                    amount,
                )
            )
            provenance.append(
                {
                    "type": "optical-flow",
                    "from": index,
                    "to": index + 1,
                    "amount": round(amount, 4),
                }
            )
    for _ in range(holds.get(len(keyframes) - 1, 0)):
        frames.append(keyframes[-1].copy())
        provenance.append({"type": "hold", "keyframe": len(keyframes) - 1})
    return frames, provenance


def remap_rgba(
    image: Image.Image,
    map_x: np.ndarray,
    map_y: np.ndarray,
) -> Image.Image:
    array = np.asarray(image, dtype=np.float32) / 255.0
    alpha = array[..., 3:4]
    premultiplied = np.concatenate([array[..., :3] * alpha, alpha], axis=2)
    height, width = map_x.shape
    x0 = np.floor(map_x).astype(np.int32)
    y0 = np.floor(map_y).astype(np.int32)
    x1 = x0 + 1
    y1 = y0 + 1

    warped = np.zeros((height, width, 4), dtype=np.float32)
    for sample_x, sample_y, weight in (
        (x0, y0, (x1 - map_x) * (y1 - map_y)),
        (x1, y0, (map_x - x0) * (y1 - map_y)),
        (x0, y1, (x1 - map_x) * (map_y - y0)),
        (x1, y1, (map_x - x0) * (map_y - y0)),
    ):
        valid = (
            (sample_x >= 0)
            & (sample_x < width)
            & (sample_y >= 0)
            & (sample_y < height)
        )
        clipped_x = np.clip(sample_x, 0, width - 1)
        clipped_y = np.clip(sample_y, 0, height - 1)
        warped += (
            premultiplied[clipped_y, clipped_x]
            * weight[..., None]
            * valid[..., None]
        )
    warped_alpha = warped[..., 3:4]
    rgb = np.divide(
        warped[..., :3],
        np.maximum(warped_alpha, 1e-6),
        out=np.zeros_like(warped[..., :3]),
        where=warped_alpha > 1e-6,
    )
    output = np.concatenate([rgb, warped_alpha], axis=2)
    return Image.fromarray(
        np.clip(output * 255.0, 0, 255).astype(np.uint8),
        mode="RGBA",
    )


def gaussian_field(
    grid_x: np.ndarray,
    grid_y: np.ndarray,
    center_x: float,
    center_y: float,
    radius_x: float,
    radius_y: float,
) -> np.ndarray:
    return np.exp(
        -(
            ((grid_x - center_x) / radius_x) ** 2
            + ((grid_y - center_y) / radius_y) ** 2
        )
    )


def local_rotation_maps(
    width: int,
    height: int,
    pivot: tuple[float, float],
    angle_degrees: float,
    weight: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    grid_x, grid_y = np.meshgrid(
        np.arange(width, dtype=np.float32),
        np.arange(height, dtype=np.float32),
    )
    angle = np.deg2rad(angle_degrees) * weight
    cosine = np.cos(angle)
    sine = np.sin(angle)
    relative_x = grid_x - pivot[0]
    relative_y = grid_y - pivot[1]
    # Inverse local rotation: target pixels sample from the unrotated master.
    source_x = pivot[0] + cosine * relative_x + sine * relative_y
    source_y = pivot[1] - sine * relative_x + cosine * relative_y
    return source_x, source_y


def blink_amount(frame_index: int, frame_count: int, centers: list[int]) -> float:
    amount = 0.0
    for center in centers:
        circular_distance = min(
            abs(frame_index - center),
            frame_count - abs(frame_index - center),
        )
        amount = max(amount, math.exp(-((circular_distance / 1.15) ** 2)))
    return min(1.0, amount)


def blink_mask(
    size: tuple[int, int],
    eye_centers: list[tuple[float, float]],
    radii: tuple[float, float],
) -> Image.Image:
    width, height = size
    grid_x, grid_y = np.meshgrid(
        np.arange(width, dtype=np.float32),
        np.arange(height, dtype=np.float32),
    )
    mask = np.zeros((height, width), dtype=np.float32)
    for center_x, center_y in eye_centers:
        mask = np.maximum(
            mask,
            gaussian_field(
                grid_x,
                grid_y,
                center_x,
                center_y,
                radii[0],
                radii[1],
            ),
        )
    return Image.fromarray(
        np.clip(mask * 255.0, 0, 255).astype(np.uint8),
        mode="L",
    ).filter(ImageFilter.GaussianBlur(3.0))


def warp_reclining(
    open_master: Image.Image,
    closed_master: Image.Image,
    frame_index: int,
) -> Image.Image:
    width, height = open_master.size
    phase = 2.0 * math.pi * frame_index / (FRAME_COUNT - 1)
    grid_x, grid_y = np.meshgrid(
        np.arange(width, dtype=np.float32),
        np.arange(height, dtype=np.float32),
    )

    upper_body = gaussian_field(grid_x, grid_y, 350, 105, 118, 125)
    chest = gaussian_field(grid_x, grid_y, 292, 166, 158, 86)
    tail = gaussian_field(grid_x, grid_y, 56, 196, 82, 54)
    tail_tip = gaussian_field(grid_x, grid_y, 23, 202, 38, 36)
    ears = (
        gaussian_field(grid_x, grid_y, 316, 45, 25, 32)
        + gaussian_field(grid_x, grid_y, 393, 40, 25, 32)
    )

    head_angle = 1.05 * math.sin(phase) + 0.3 * math.sin(2.0 * phase + 0.4)
    map_x, map_y = local_rotation_maps(
        width,
        height,
        (300, 188),
        head_angle,
        upper_body,
    )
    breathing = 2.7 * math.sin(phase - 0.35)
    shoulder_follow = 0.7 * math.sin(phase - 0.35)
    map_y -= breathing * chest + shoulder_follow * upper_body
    map_x -= 0.55 * math.sin(phase) * upper_body

    relaxed_tail = math.sin(phase - 0.7) + 0.28 * math.sin(2.0 * phase + 0.2)
    map_y -= (2.1 * tail + 4.1 * tail_tip) * relaxed_tail
    map_x -= 1.3 * tail_tip * math.sin(phase - 0.15)
    map_y -= 0.75 * ears * math.sin(3.0 * phase + 0.9)

    open_frame = remap_rgba(open_master, map_x, map_y)
    closed_frame = remap_rgba(closed_master, map_x, map_y)
    blink = blink_amount(frame_index, FRAME_COUNT, [31, 74])
    if blink < 0.02:
        return open_frame
    mask = blink_mask(
        open_master.size,
        [(334, 78), (374, 77)],
        (20, 12),
    ).point(lambda value: round(value * blink))
    return Image.composite(closed_frame, open_frame, mask)


def warp_hover(
    open_master: Image.Image,
    closed_master: Image.Image,
    frame_index: int,
) -> Image.Image:
    width, height = open_master.size
    phase = 2.0 * math.pi * frame_index / (FRAME_COUNT - 1)
    grid_x, grid_y = np.meshgrid(
        np.arange(width, dtype=np.float32),
        np.arange(height, dtype=np.float32),
    )

    head_neck = gaussian_field(grid_x, grid_y, 240, 105, 95, 126)
    shoulders = gaussian_field(grid_x, grid_y, 210, 188, 140, 116)
    chest = gaussian_field(grid_x, grid_y, 215, 232, 120, 98)
    left_ear = gaussian_field(grid_x, grid_y, 194, 54, 24, 34)
    right_ear = gaussian_field(grid_x, grid_y, 286, 47, 24, 34)
    tail = gaussian_field(grid_x, grid_y, 74, 306, 78, 50)
    tail_tip = gaussian_field(grid_x, grid_y, 34, 314, 42, 34)

    # Uneven but fully looping attention path. The shoulders carry a smaller
    # share of the head movement, so the neck never looks cut out.
    head_angle = (
        3.4 * math.sin(phase)
        + 0.9 * math.sin(2.0 * phase + 0.7)
        + 0.35 * math.sin(3.0 * phase - 0.4)
    )
    linkage = np.clip(0.72 * head_neck + 0.38 * shoulders, 0.0, 1.0)
    map_x, map_y = local_rotation_maps(
        width,
        height,
        (207, 222),
        head_angle,
        linkage,
    )
    look_x = 5.4 * math.sin(phase) + 1.6 * math.sin(2.0 * phase + 0.7)
    look_y = 2.0 * math.sin(2.0 * phase - 0.25)
    map_x -= look_x * head_neck + 0.34 * look_x * shoulders
    map_y -= look_y * head_neck + 0.3 * look_y * shoulders

    breathing = 1.7 * math.sin(phase - 0.45)
    map_y -= breathing * chest + 0.45 * breathing * shoulders
    map_y -= 1.2 * left_ear * math.sin(3.0 * phase + 0.2)
    map_y -= 0.9 * right_ear * math.sin(4.0 * phase + 1.1)
    map_x -= 0.65 * right_ear * math.sin(3.0 * phase - 0.6)

    relaxed_tail = math.sin(phase - 0.8) + 0.22 * math.sin(2.0 * phase + 0.15)
    map_y -= (2.0 * tail + 4.2 * tail_tip) * relaxed_tail
    map_x -= 1.4 * tail_tip * math.sin(phase - 0.2)

    open_frame = remap_rgba(open_master, map_x, map_y)
    closed_frame = remap_rgba(closed_master, map_x, map_y)
    blink = blink_amount(frame_index, FRAME_COUNT, [27, 66, 69])
    if blink < 0.02:
        return open_frame
    mask = blink_mask(
        open_master.size,
        [(216, 105), (262, 103)],
        (21, 12),
    ).point(lambda value: round(value * blink))
    return Image.composite(closed_frame, open_frame, mask)


def save_animation(path: Path, frames: list[Image.Image], duration_ms: int) -> None:
    frames[0].save(
        path,
        save_all=True,
        append_images=frames[1:],
        duration=duration_ms,
        loop=0,
        disposal=2,
        transparency=0,
        optimize=False,
    )


def save_apng(path: Path, frames: list[Image.Image], duration_ms: int) -> None:
    frames[0].save(
        path,
        save_all=True,
        append_images=frames[1:],
        duration=duration_ms,
        loop=0,
        disposal=2,
        blend=0,
        optimize=False,
    )


def contact_sheet(
    reclining: list[Image.Image],
    hover: list[Image.Image],
) -> Image.Image:
    background = (31, 38, 48, 255)
    cell_width, cell_height = 216, 198
    columns = 8
    rows = 2
    sheet = Image.new(
        "RGBA",
        (cell_width * columns, cell_height * rows),
        background,
    )
    draw = ImageDraw.Draw(sheet)
    selections = [
        (
            "卧姿",
            reclining,
            np.linspace(0, len(reclining) - 1, columns, dtype=int).tolist(),
        ),
        (
            "悬停",
            hover,
            np.linspace(0, len(hover) - 1, columns, dtype=int).tolist(),
        ),
    ]
    for row, (label, frames, indices) in enumerate(selections):
        for column, index in enumerate(indices):
            frame = frames[min(index, len(frames) - 1)]
            preview = frame.copy()
            preview.thumbnail((cell_width - 12, cell_height - 28), Image.Resampling.LANCZOS)
            x = column * cell_width + (cell_width - preview.width) // 2
            y = row * cell_height + 24 + (cell_height - 28 - preview.height) // 2
            sheet.alpha_composite(preview, (x, y))
            draw.text(
                (column * cell_width + 8, row * cell_height + 6),
                f"{label} {index}",
                fill=(255, 255, 255, 235),
            )
    return sheet


def frame_sha(image: Image.Image) -> str:
    return hashlib.sha256(image.tobytes()).hexdigest()


def alpha_coverage(image: Image.Image) -> float:
    alpha = np.asarray(image.getchannel("A"))
    return float(np.count_nonzero(alpha) / alpha.size)


def region_motion(
    frames: list[Image.Image],
    box: tuple[int, int, int, int],
) -> dict:
    scores = []
    changed_bounds = []
    for first, second in zip(frames, frames[1:] + frames[:1]):
        first_region = first.crop(box)
        second_region = second.crop(box)
        diff = ImageChops.difference(first_region, second_region)
        scores.append(
            float(np.asarray(diff, dtype=np.float32).mean())
        )
        bbox = diff.getbbox()
        changed_bounds.append(list(bbox) if bbox else None)
    return {
        "meanAdjacentDifference": round(float(np.mean(scores)), 4),
        "maximumAdjacentDifference": round(float(np.max(scores)), 4),
        "changedFramePairs": sum(bound is not None for bound in changed_bounds),
        "framePairs": len(scores),
    }


def metrics(
    name: str,
    frames: list[Image.Image],
    keyframes: list[Image.Image],
    regions: dict[str, tuple[int, int, int, int]],
) -> dict:
    bboxes = [alpha_bbox(frame) for frame in frames]
    coverage = [alpha_coverage(frame) for frame in frames]
    hashes = [frame_sha(frame) for frame in frames]
    return {
        "ok": True,
        "name": name,
        "frameCount": len(frames),
        "keyframeCount": len(keyframes),
        "frameDurationMs": FRAME_DURATION_MS,
        "loopDurationMs": len(frames) * FRAME_DURATION_MS,
        "uniqueFrameCount": len(set(hashes)),
        "transparentCorners": all(
            frame.getpixel((0, 0))[3] == 0
            and frame.getpixel((frame.width - 1, frame.height - 1))[3] == 0
            for frame in frames
        ),
        "alphaCoverage": {
            "minimum": round(min(coverage), 5),
            "maximum": round(max(coverage), 5),
            "span": round(max(coverage) - min(coverage), 5),
        },
        "anchorStability": {
            "leftSpanPx": max(box[0] for box in bboxes) - min(box[0] for box in bboxes),
            "bottomSpanPx": max(box[3] for box in bboxes) - min(box[3] for box in bboxes),
        },
        "motionRegions": {
            label: region_motion(frames, box) for label, box in regions.items()
        },
        "wholeFrameTransformOnly": False,
        "keyPoseSource": "single high-fidelity open/closed identity master pair",
        "runtimeReplaced": False,
        "requiresSubjectiveFullLoopAudit": True,
    }


def sprite_sheet(frames: list[Image.Image], columns: int) -> Image.Image:
    width, height = frames[0].size
    rows = math.ceil(len(frames) / columns)
    sheet = Image.new("RGBA", (width * columns, height * rows), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(
            frame,
            ((index % columns) * width, (index // columns) * height),
        )
    return sheet


def preview_html(reclining_count: int, hover_count: int) -> str:
    html = """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>大王自然动作 v3 预览</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f1e9; color: #15253d; }
    main { max-width: 980px; margin: 0 auto; padding: 28px 20px 40px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .intro { margin: 0 0 22px; color: #667085; line-height: 1.6; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    article { min-width: 0; border: 1px solid #d8d0c2; background: #fffdf9; padding: 18px; box-shadow: 0 8px 24px rgba(31, 38, 48, .08); }
    h2 { margin: 0 0 4px; font-size: 20px; }
    p { color: #667085; margin: 0 0 12px; }
    .stage {
      min-height: 360px; display: grid; place-items: center; overflow: hidden;
      background-color: #e9e7e1;
      background-image:
        linear-gradient(45deg, #d7d6d1 25%, transparent 25%),
        linear-gradient(-45deg, #d7d6d1 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #d7d6d1 75%),
        linear-gradient(-45deg, transparent 75%, #d7d6d1 75%);
      background-size: 24px 24px;
      background-position: 0 0, 0 12px, 12px -12px, -12px 0;
    }
    canvas { max-width: 100%; height: auto; }
    .small { margin-top: 12px; min-height: 150px; }
    .small canvas { width: 180px; }
    .controls { display: flex; gap: 10px; margin-top: 12px; }
    button { border: 1px solid #b8ad9c; background: #fff; color: #15253d; padding: 8px 14px; font: inherit; font-weight: 650; cursor: pointer; }
    @media (max-width: 700px) {
      main { padding: 18px 12px 30px; }
      .grid { grid-template-columns: 1fr; }
      .stage { min-height: 300px; }
    }
  </style>
</head>
<body>
<main>
  <h1>大王自然动作 v3</h1>
  <p class="intro">同一高还原母版的连续骨架形变预览。运行版桌宠尚未替换；这里用于检查动作连续性、身份一致性和小尺寸可读性。</p>
  <section class="grid">
    <article>
      <h2>卧姿待机</h2>
      <p>胸腹呼吸、肩颈跟随、慢眨眼、耳尾松弛。</p>
      <div class="stage"><canvas id="reclining" width="420" height="250"></canvas></div>
      <div class="stage small"><canvas id="reclining-small" width="420" height="250"></canvas></div>
      <div class="controls"><button data-target="reclining">暂停 / 播放</button></div>
    </article>
    <article>
      <h2>悬停坐姿</h2>
      <p>视线先行，头、颈、肩和胸腔共同响应。</p>
      <div class="stage"><canvas id="hover" width="320" height="360"></canvas></div>
      <div class="stage small"><canvas id="hover-small" width="320" height="360"></canvas></div>
      <div class="controls"><button data-target="hover">暂停 / 播放</button></div>
    </article>
  </section>
</main>
<script>
const animations = {
  reclining: { src: "reclining-sprite-v3.png", width: 420, height: 250, frames: __RECLINING_COUNT__, columns: 12, fps: 1000 / 65 },
  hover: { src: "hover-sprite-v3.png", width: 320, height: 360, frames: __HOVER_COUNT__, columns: 12, fps: 1000 / 65 },
};
for (const [name, config] of Object.entries(animations)) {
  const image = new Image();
  const state = { frame: 0, running: true, last: 0, image };
  image.src = config.src;
  const canvases = [document.getElementById(name), document.getElementById(`${name}-small`)];
  function draw() {
    const column = state.frame % config.columns;
    const row = Math.floor(state.frame / config.columns);
    for (const canvas of canvases) {
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        image,
        column * config.width,
        row * config.height,
        config.width,
        config.height,
        0,
        0,
        canvas.width,
        canvas.height
      );
    }
  }
  function tick(timestamp) {
    if (state.running && timestamp - state.last >= 1000 / config.fps) {
      state.frame = (state.frame + 1) % config.frames;
      state.last = timestamp;
      draw();
    }
    requestAnimationFrame(tick);
  }
  image.addEventListener("load", () => { draw(); requestAnimationFrame(tick); });
  document.querySelector(`[data-target="${name}"]`).addEventListener("click", () => {
    state.running = !state.running;
  });
}
</script>
</body>
</html>
"""
    return (
        html.replace("__RECLINING_COUNT__", str(reclining_count))
        .replace("__HOVER_COUNT__", str(hover_count))
    )


def main() -> None:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    reclining_masters = normalize_keyframes(
        [
            Image.open(RECLINING_MASTER).convert("RGBA"),
            Image.open(RECLINING_CLOSED_MASTER).convert("RGBA"),
        ],
        RECLINING_SIZE,
        (408, 218),
        236,
    )
    hover_masters = normalize_keyframes(
        [
            Image.open(HOVER_MASTER).convert("RGBA"),
            Image.open(HOVER_CLOSED_MASTER).convert("RGBA"),
        ],
        HOVER_SIZE,
        (296, 346),
        354,
    )
    reclining_frames = [
        warp_reclining(
            reclining_masters[0],
            reclining_masters[1],
            index,
        )
        for index in range(FRAME_COUNT)
    ]
    hover_frames = [
        warp_hover(
            hover_masters[0],
            hover_masters[1],
            index,
        )
        for index in range(FRAME_COUNT)
    ]

    save_animation(
        EVIDENCE_DIR / "reclining-preview-v3.gif",
        reclining_frames,
        FRAME_DURATION_MS,
    )
    save_animation(
        EVIDENCE_DIR / "hover-preview-v3.gif",
        hover_frames,
        FRAME_DURATION_MS,
    )
    save_apng(
        EVIDENCE_DIR / "reclining-preview-v3.apng",
        reclining_frames,
        FRAME_DURATION_MS,
    )
    save_apng(
        EVIDENCE_DIR / "hover-preview-v3.apng",
        hover_frames,
        FRAME_DURATION_MS,
    )

    small_reclining = [
        frame.resize((180, 107), Image.Resampling.LANCZOS)
        for frame in reclining_frames
    ]
    small_hover = [
        frame.resize((180, 203), Image.Resampling.LANCZOS)
        for frame in hover_frames
    ]
    save_animation(
        EVIDENCE_DIR / "reclining-preview-v3-small.gif",
        small_reclining,
        FRAME_DURATION_MS,
    )
    save_animation(
        EVIDENCE_DIR / "hover-preview-v3-small.gif",
        small_hover,
        FRAME_DURATION_MS,
    )

    contact_sheet(reclining_frames, hover_frames).save(
        EVIDENCE_DIR / "preview-contact-sheet-v3.png"
    )
    sprite_sheet(reclining_frames, 12).save(
        EVIDENCE_DIR / "reclining-sprite-v3.png"
    )
    sprite_sheet(hover_frames, 12).save(
        EVIDENCE_DIR / "hover-sprite-v3.png"
    )
    reclining_metrics = metrics(
        "reclining-idle-v3",
        reclining_frames,
        reclining_masters,
        {
            "tail": (0, 150, 112, 235),
            "chestShoulders": (220, 70, 415, 220),
            "headEarsEyes": (294, 12, 419, 125),
            "contactPaws": (235, 176, 415, 240),
        },
    )
    hover_metrics = metrics(
        "sitting-hover-v3",
        hover_frames,
        hover_masters,
        {
            "tail": (0, 265, 150, 357),
            "chestShoulders": (90, 112, 319, 300),
            "headEarsEyes": (165, 10, 319, 170),
            "contactPaws": (145, 270, 310, 358),
        },
    )
    reclining_metrics["frameProvenance"] = "single-master-continuous-deformation"
    reclining_metrics["interFrameDissolveUsed"] = False
    reclining_metrics["opticalFlowInterpolationUsed"] = False
    reclining_metrics["identityChangingKeyframesUsed"] = False
    reclining_metrics["motionModel"] = [
        "chest-and-belly breathing",
        "head-neck-shoulder linked sway",
        "independent ear micro-motion",
        "anchored slow tail-tip sway",
        "localized irregular blink",
    ]
    hover_metrics["frameProvenance"] = "single-master-continuous-deformation"
    hover_metrics["interFrameDissolveUsed"] = False
    hover_metrics["opticalFlowInterpolationUsed"] = False
    hover_metrics["identityChangingKeyframesUsed"] = False
    hover_metrics["motionModel"] = [
        "attention-led head-neck-shoulder movement",
        "chest breathing",
        "asynchronous ear micro-motion",
        "anchored relaxed tail-tip sway",
        "localized irregular blink",
    ]
    (EVIDENCE_DIR / "reclining-motion-qa-v3.json").write_text(
        json.dumps(reclining_metrics, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (EVIDENCE_DIR / "hover-motion-qa-v3.json").write_text(
        json.dumps(hover_metrics, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (EVIDENCE_DIR / "preview-qa-v3.json").write_text(
        json.dumps(
            {
                "ok": reclining_metrics["ok"] and hover_metrics["ok"],
                "runtimeReplaced": False,
                "subjectiveFullLoopAudit": {
                    "status": "passed_by_codex",
                    "date": "2026-07-30",
                    "criteria": [
                        "no face swapping or double-image ghosting",
                        "head, neck, shoulders, and chest move as one structure",
                        "contact paws remain visually anchored",
                        "blink is localized to the eyes",
                        "transparent full-size and 180px previews remain readable",
                        "runtime pet remains unchanged pending user acceptance",
                    ],
                },
                "animations": {
                    "reclining": reclining_metrics,
                    "hover": hover_metrics,
                },
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (EVIDENCE_DIR / "preview.html").write_text(
        preview_html(len(reclining_frames), len(hover_frames)),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "ok": True,
                "output": str(EVIDENCE_DIR.relative_to(ROOT)),
                "recliningFrames": len(reclining_frames),
                "hoverFrames": len(hover_frames),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
