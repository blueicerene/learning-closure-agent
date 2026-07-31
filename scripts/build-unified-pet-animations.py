#!/usr/bin/env python3

import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat


PROJECT_DIR = Path(__file__).resolve().parents[1]
ASSETS_DIR = PROJECT_DIR / "desktop-dropper" / "assets"
QA_DIR = PROJECT_DIR / "desktop-dropper" / "qa" / "animated"
REPORT_PATH = ASSETS_DIR / "unified-pet-animation-qa.json"
CONTACT_SHEET_PATH = ASSETS_DIR / "unified-pet-states-contact.png"
KEY_STATES_GIF_PATH = QA_DIR / "key-states.gif"

FRAME_COUNT = 12
OUTPUT_SIZE = (300, 352)
WORK_SIZE = (600, 704)
CANVAS_PADDING = (40, 12)
MIN_FIRST_FRAME_DIFFERENCE = 8.0
FRAME_DURATION_MS = 110

STATE_PREFIXES = {
    "idle": "state-idle-ball",
    "curious": "state-curious",
    "ready": "state-ready",
    "working": "state-working",
    "success": "state-success",
    "failure": "state-failure",
    "focus": "focus-sit-tail",
}

MASTER_FILES = {
    "idle": "state-idle-master.png",
    "curious": "state-curious-master.png",
    "ready": "state-ready-master.png",
    "working": "state-working-master.png",
    "success": "state-success-master.png",
    "failure": "state-failure-master.png",
    "focus": "focus-sit-master.png",
}

# The masks use source-master coordinates. They deliberately follow joints rather
# than rectangular crops so the torso stays still while the moving limb changes.
RIGS = {
    "idle_paw": {
        "polygon": ((277, 606), (377, 599), (419, 704), (410, 902), (400, 1087), (344, 1122), (288, 1082), (274, 844)),
        "pivot": (351, 706),
    },
    "idle_ball": {"ellipse": (262, 1064, 430, 1244), "pivot": (346, 1154)},
    "ready_paw": {"ellipse": (204, 566, 414, 810), "pivot": (346, 786)},
    "focus_tail": {
        "polygon": ((758, 1160), (802, 1120), (824, 982), (857, 949), (901, 969), (932, 1014), (934, 1095), (900, 1170), (825, 1227), (766, 1218)),
        "pivot": (790, 1185),
    },
    "curious_head": {"ellipse": (242, 126, 840, 680), "pivot": (533, 590)},
    "working_head": {"ellipse": (269, 224, 855, 708), "pivot": (559, 641)},
    "failure_head": {"ellipse": (238, 235, 838, 716), "pivot": (540, 651)},
    "success_left_paw": {"ellipse": (192, 378, 348, 578), "pivot": (309, 551)},
    "success_right_paw": {"ellipse": (665, 378, 824, 578), "pivot": (704, 551)},
}

TRACKED_REGIONS = {
    "idle": {"name": "ball", "box": (38, 270, 118, 350), "minimumSpanPx": 7.0},
    "ready": {"name": "raisedPaw", "box": (25, 115, 132, 255), "minimumSpanPx": 3.0},
    "focus": {"name": "tail", "box": (195, 235, 300, 352), "minimumSpanPx": 4.0},
}


def cycle(amplitude: float, phase: float = 0.0) -> list[float]:
    return [
        amplitude * math.sin((2 * math.pi * index / FRAME_COUNT) + phase)
        for index in range(FRAME_COUNT)
    ]


def fit_to_canvas(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Pose master is empty.")
    cropped = image.crop(bbox)
    target = (size[0] - CANVAS_PADDING[0] * 2, size[1] - CANVAS_PADDING[1] * 2)
    cropped.thumbnail(target, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    offset = ((size[0] - cropped.width) // 2, size[1] - CANVAS_PADDING[1] - cropped.height)
    canvas.alpha_composite(cropped, offset)
    return canvas


def make_mask(source: Image.Image, rig: dict[str, object], feather: float = 3.0) -> Image.Image:
    mask = Image.new("L", source.size, 0)
    draw = ImageDraw.Draw(mask)
    if "polygon" in rig:
        draw.polygon(rig["polygon"], fill=255)
    else:
        draw.ellipse(rig["ellipse"], fill=255)
    return mask.filter(ImageFilter.GaussianBlur(feather))


def split_layer(source: Image.Image, rig: dict[str, object], feather: float = 3.0) -> tuple[Image.Image, Image.Image]:
    mask = make_mask(source, rig, feather)
    alpha = source.getchannel("A")
    layer = source.copy()
    layer.putalpha(ImageChops.multiply(alpha, mask))
    body = source.copy()
    body.putalpha(ImageChops.multiply(alpha, ImageChops.invert(mask)))
    return body, layer


def move_layer(
    layer: Image.Image,
    *,
    angle: float = 0.0,
    pivot: tuple[int, int],
    dx: int = 0,
    dy: int = 0,
) -> Image.Image:
    moved = layer.rotate(angle, resample=Image.Resampling.BICUBIC, center=pivot)
    if dx or dy:
        moved = moved.transform(
            moved.size,
            Image.Transform.AFFINE,
            (1, 0, -dx, 0, 1, -dy),
            resample=Image.Resampling.BICUBIC,
        )
    return moved


def rigged_frame(
    source: Image.Image,
    components: list[tuple[dict[str, object], float, int, int]],
) -> Image.Image:
    masks = [make_mask(source, rig) for rig, _, _, _ in components]
    combined_mask = Image.new("L", source.size, 0)
    for mask in masks:
        combined_mask = ImageChops.lighter(combined_mask, mask)
    body = source.copy()
    body.putalpha(ImageChops.multiply(source.getchannel("A"), ImageChops.invert(combined_mask)))
    result = body
    for (rig, angle, dx, dy), mask in zip(components, masks):
        layer = source.copy()
        layer.putalpha(ImageChops.multiply(source.getchannel("A"), mask))
        result = Image.alpha_composite(
            result,
            move_layer(layer, angle=angle, pivot=rig["pivot"], dx=dx, dy=dy),
        )
    return fit_to_canvas(result, WORK_SIZE)


def warped_frame(
    source: Image.Image,
    components: list[tuple[dict[str, object], float, int, int]],
) -> Image.Image:
    result = source
    for rig, angle, dx, dy in components:
        mask = make_mask(source, rig, feather=8.0)
        moved = move_layer(source, angle=angle, pivot=rig["pivot"], dx=dx, dy=dy)
        result = Image.composite(moved, result, mask)
    return fit_to_canvas(result, WORK_SIZE)


def generate_frames(masters: dict[str, Image.Image]) -> tuple[dict[str, list[Image.Image]], dict[str, object]]:
    wave = cycle(1.0)
    frames: dict[str, list[Image.Image]] = {state: [] for state in STATE_PREFIXES}
    tracks: dict[str, object] = {}

    idle_ball_x = [round(value) for value in cycle(28)]
    idle_ball_angles = [round(value, 2) for value in cycle(13)]
    idle_paw_angles = [round(-value * 5.5, 2) for value in wave]
    idle_paw_y = [round(-abs(value) * 7) for value in wave]
    tracks["idle"] = {
        "ballX": idle_ball_x,
        "ballRotationDegrees": idle_ball_angles,
        "pawRotationDegrees": idle_paw_angles,
    }
    for index in range(FRAME_COUNT):
        frames["idle"].append(rigged_frame(masters["idle"], [
            (RIGS["idle_ball"], idle_ball_angles[index], idle_ball_x[index], 0),
            (RIGS["idle_paw"], idle_paw_angles[index], round(idle_ball_x[index] * 0.18), idle_paw_y[index]),
        ]))

    ready_angles = [round(value, 2) for value in cycle(10)]
    ready_y = [round(-3 - abs(value) * 0.35) for value in ready_angles]
    tracks["ready"] = {"pawRotationDegrees": ready_angles}
    for angle, dy in zip(ready_angles, ready_y):
        frames["ready"].append(warped_frame(
            masters["ready"],
            [(RIGS["ready_paw"], angle, 0, dy)],
        ))

    focus_angles = [round(value, 2) for value in cycle(15)]
    tracks["focus"] = {"tailRotationDegrees": focus_angles}
    for angle in focus_angles:
        frames["focus"].append(rigged_frame(
            masters["focus"],
            [(RIGS["focus_tail"], angle, 0, 0)],
        ))

    curious_angles = [round(value, 2) for value in cycle(3.2)]
    tracks["curious"] = {"headRotationDegrees": curious_angles}
    for angle in curious_angles:
        frames["curious"].append(warped_frame(
            masters["curious"],
            [(RIGS["curious_head"], angle, 0, 0)],
        ))

    working_angles = [round(value, 2) for value in cycle(2.8)]
    tracks["working"] = {"headRotationDegrees": working_angles}
    for angle in working_angles:
        frames["working"].append(warped_frame(
            masters["working"],
            [(RIGS["working_head"], angle, 0, round(abs(angle) * 0.7))],
        ))

    success_angles = [round(value, 2) for value in cycle(6)]
    tracks["success"] = {
        "leftPawRotationDegrees": success_angles,
        "rightPawRotationDegrees": [-value for value in success_angles],
    }
    for angle in success_angles:
        frames["success"].append(warped_frame(masters["success"], [
            (RIGS["success_left_paw"], angle, 0, round(-abs(angle) * 0.7)),
            (RIGS["success_right_paw"], -angle, 0, round(-abs(angle) * 0.7)),
        ]))

    failure_angles = [round(value, 2) for value in cycle(2.4)]
    tracks["failure"] = {"headRotationDegrees": failure_angles}
    for angle in failure_angles:
        frames["failure"].append(warped_frame(
            masters["failure"],
            [(RIGS["failure_head"], angle, 0, round(abs(angle) * 0.8))],
        ))

    return frames, tracks


def save_frames(frames: dict[str, list[Image.Image]]) -> dict[str, list[Image.Image]]:
    saved: dict[str, list[Image.Image]] = {}
    for state, state_frames in frames.items():
        prefix = STATE_PREFIXES[state]
        saved[state] = []
        for index, frame in enumerate(state_frames):
            output = ASSETS_DIR / f"{prefix}-frame-{index}.png"
            resized = frame.resize(OUTPUT_SIZE, Image.Resampling.LANCZOS)
            resized.save(output, optimize=True)
            saved[state].append(resized)
            print(output)
    return saved


def alpha_bbox(image: Image.Image, top_only: bool = False) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    if top_only:
        alpha = alpha.crop((0, 0, image.width, 290))
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("Animation frame is empty.")
    return bbox


def mean_absolute_difference(left: Image.Image, right: Image.Image) -> float:
    difference = ImageChops.difference(left, right)
    return round(sum(ImageStat.Stat(difference).mean) / 4, 3)


def write_contact_sheet(frames_by_state: dict[str, list[Image.Image]]) -> None:
    preview_indices = (0, 3, 6, 9)
    cell_width, cell_height = OUTPUT_SIZE
    label_height = 24
    sheet = Image.new(
        "RGBA",
        (4 * cell_width, len(STATE_PREFIXES) * (cell_height + label_height)),
        (28, 32, 35, 255),
    )
    draw = ImageDraw.Draw(sheet)
    for row, state in enumerate(STATE_PREFIXES):
        y = row * (cell_height + label_height)
        draw.text((8, y + 5), state, fill=(248, 248, 248, 255))
        for column, frame_index in enumerate(preview_indices):
            sheet.alpha_composite(frames_by_state[state][frame_index], (column * cell_width, y + label_height))
    sheet.convert("RGB").save(CONTACT_SHEET_PATH, quality=92)


def on_qa_background(frame: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", frame.size, (28, 32, 35, 255))
    canvas.alpha_composite(frame)
    return canvas.convert("RGB")


def write_animated_previews(frames_by_state: dict[str, list[Image.Image]]) -> None:
    QA_DIR.mkdir(parents=True, exist_ok=True)
    for state, frames in frames_by_state.items():
        preview = [on_qa_background(frame) for frame in frames]
        preview[0].save(
            QA_DIR / f"{state}.gif",
            save_all=True,
            append_images=preview[1:],
            duration=FRAME_DURATION_MS,
            loop=0,
            disposal=2,
            optimize=False,
        )

    key_frames = []
    for index in range(FRAME_COUNT):
        canvas = Image.new("RGB", (OUTPUT_SIZE[0] * 3, OUTPUT_SIZE[1] + 28), (28, 32, 35))
        draw = ImageDraw.Draw(canvas)
        for column, state in enumerate(("idle", "ready", "focus")):
            draw.text((column * OUTPUT_SIZE[0] + 10, 8), state, fill=(245, 245, 245))
            canvas.paste(on_qa_background(frames_by_state[state][index]), (column * OUTPUT_SIZE[0], 28))
        key_frames.append(canvas)
    key_frames[0].save(
        KEY_STATES_GIF_PATH,
        save_all=True,
        append_images=key_frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        disposal=2,
        optimize=False,
    )


def weighted_change_centroid(left: Image.Image, right: Image.Image, box: tuple[int, int, int, int]) -> tuple[float, float, float]:
    difference = ImageChops.difference(left.crop(box), right.crop(box)).convert("L")
    values = list(difference.get_flattened_data())
    width, height = difference.size
    total = sum(values)
    if total == 0:
        return (0.0, 0.0, 0.0)
    x = sum((index % width) * value for index, value in enumerate(values)) / total
    y = sum((index // width) * value for index, value in enumerate(values)) / total
    return (round(x + box[0], 2), round(y + box[1], 2), round(total / (width * height), 2))


def validate_track(track: list[float], label: str, minimum_span: float) -> dict[str, object]:
    span = max(track) - min(track)
    deltas = [track[(index + 1) % len(track)] - track[index] for index in range(len(track))]
    direction_changes = sum(
        1 for index in range(len(deltas) - 1)
        if deltas[index] and deltas[index + 1] and (deltas[index] > 0) != (deltas[index + 1] > 0)
    )
    if span < minimum_span:
        raise ValueError(f"{label}: motion span {span:.2f} is too small")
    if direction_changes > 3:
        raise ValueError(f"{label}: motion direction is jittery")
    return {
        "span": round(span, 2),
        "directionChanges": direction_changes,
        "path": track,
    }


def validate_saved_frames(frames_by_state: dict[str, list[Image.Image]], tracks: dict[str, object]) -> dict[str, object]:
    report: dict[str, object] = {
        "ok": True,
        "frameDurationMs": FRAME_DURATION_MS,
        "minimumFirstFrameDifference": MIN_FIRST_FRAME_DIFFERENCE,
        "states": {},
        "firstFrameDifferences": {},
        "keyRegionMotion": {},
    }
    first_frames: dict[str, Image.Image] = {}
    for state, frames in frames_by_state.items():
        if len(frames) != FRAME_COUNT or any(frame.size != OUTPUT_SIZE for frame in frames):
            raise ValueError(f"{state}: inconsistent frame count or dimensions")
        if any(frame.getpixel(corner)[3] != 0 for frame in frames for corner in ((0, 0), (299, 0), (0, 351), (299, 351))):
            raise ValueError(f"{state}: a frame corner is not transparent")

        top_boxes = [alpha_bbox(frame, top_only=True) for frame in frames]
        center_x = [(box[0] + box[2]) / 2 for box in top_boxes]
        center_span = max(center_x) - min(center_x)
        if center_span > 7:
            raise ValueError(f"{state}: body anchor drift is {center_span:.2f}px")
        differences = [
            ImageChops.difference(frames[index], frames[(index + 1) % FRAME_COUNT]).getbbox()
            for index in range(FRAME_COUNT)
        ]
        if sum(diff is not None for diff in differences) < FRAME_COUNT - 1:
            raise ValueError(f"{state}: animation has frozen adjacent frames")

        report["states"][state] = {
            "frameCount": FRAME_COUNT,
            "size": list(OUTPUT_SIZE),
            "topAnchorCenterSpanPx": round(center_span, 2),
            "transparentCorners": True,
            "motionFrames": sum(diff is not None for diff in differences),
            "masterSource": MASTER_FILES[state],
            "rigTrack": tracks[state],
        }
        first_frames[state] = frames[0]

    for state, config in TRACKED_REGIONS.items():
        centroids = [
            weighted_change_centroid(frames_by_state[state][0], frame, config["box"])
            for frame in frames_by_state[state]
        ]
        energies = [point[2] for point in centroids]
        moving = sum(energy > 0.7 for energy in energies[1:])
        if moving < FRAME_COUNT - 3:
            raise ValueError(f"{state}:{config['name']}: too few visibly moving frames")

        if state == "idle":
            trajectory = tracks[state]["ballX"]
        elif state == "ready":
            trajectory = tracks[state]["pawRotationDegrees"]
        else:
            trajectory = tracks[state]["tailRotationDegrees"]
        track_report = validate_track(trajectory, f"{state}:{config['name']}", config["minimumSpanPx"])
        track_report.update({
            "region": list(config["box"]),
            "differenceCentroids": [list(point) for point in centroids],
            "visiblyMovingFrames": moving,
        })
        report["keyRegionMotion"][state] = track_report

    states = list(STATE_PREFIXES)
    for left_index, left_state in enumerate(states):
        for right_state in states[left_index + 1:]:
            difference = mean_absolute_difference(first_frames[left_state], first_frames[right_state])
            key = f"{left_state}:{right_state}"
            report["firstFrameDifferences"][key] = difference
            if difference < MIN_FIRST_FRAME_DIFFERENCE:
                raise ValueError(f"{key}: first-frame difference {difference:.3f} is too small")

    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def main() -> None:
    masters = {
        state: Image.open(ASSETS_DIR / filename).convert("RGBA")
        for state, filename in MASTER_FILES.items()
    }
    frames, tracks = generate_frames(masters)
    saved_frames = save_frames(frames)
    write_contact_sheet(saved_frames)
    write_animated_previews(saved_frames)
    report = validate_saved_frames(saved_frames, tracks)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
