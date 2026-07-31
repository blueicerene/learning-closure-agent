#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="/Users/rene/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"

cd "$PROJECT_DIR"

for index in {0..47}; do
  test -f "desktop-dropper/assets/state-reclining-idle-frame-$index.png"
done

test -f "artifacts/release-gate/pet-reclining-idle/reclining-idle-preview.gif"
test -f "artifacts/release-gate/pet-reclining-idle/reclining-idle-preview-small.gif"
test -f "artifacts/release-gate/pet-reclining-idle/reclining-idle-contact-sheet.png"
test -f "artifacts/release-gate/pet-reclining-idle/preview-qa.json"
test -f "artifacts/release-gate/pet-reclining-idle/runtime-idle.png"
test -f "artifacts/release-gate/pet-reclining-idle/runtime-after-drag.png"
test -f "artifacts/release-gate/pet-reclining-idle/regression.json"

PET_APP=".runtime-bin/Codex Pet 大王.app"
PET_BINARY="$PET_APP/Contents/MacOS/CodexPet"
test -x "$PET_BINARY"
test "$(find "$PET_APP/Contents/Resources/assets" -name 'state-reclining-idle-frame-*.png' | wc -l | tr -d ' ')" = "48"
"$PET_BINARY" --self-test
/usr/bin/codesign --verify --deep --strict "$PET_APP"

"$PYTHON" - <<'PY'
import json
from pathlib import Path
from PIL import Image, ImageChops

root = Path.cwd()
frames = [
    Image.open(root / "desktop-dropper/assets" / f"state-reclining-idle-frame-{index}.png").convert("RGBA")
    for index in range(48)
]
assert all(frame.size == (300, 208) for frame in frames)
assert all(frame.getpixel((0, 0))[3] == 0 for frame in frames)
assert any(
    ImageChops.difference(
        frames[index].convert("RGB"),
        frames[index + 1].convert("RGB"),
    ).getbbox()
    for index in range(47)
)

# A real blink must be localized around the eyes, not a whole-frame opacity change.
blink_diff = ImageChops.difference(
    frames[30].convert("RGB"),
    frames[33].convert("RGB"),
)
blink_bbox = blink_diff.getbbox()
assert blink_bbox is not None
assert blink_bbox[0] >= 210 and blink_bbox[2] <= 280
assert blink_bbox[1] >= 40 and blink_bbox[3] <= 90

# Breathing must affect the torso while leaving the head anchor nearly unchanged.
breath_diff = ImageChops.difference(
    frames[0].convert("RGB"),
    frames[12].convert("RGB"),
)
assert breath_diff.getbbox() is not None
head_crop_a = frames[0].crop((218, 20, 292, 110))
head_crop_b = frames[12].crop((218, 20, 292, 110))
head_difference = ImageChops.difference(
    head_crop_a.convert("RGB"),
    head_crop_b.convert("RGB"),
)
assert head_difference.getbbox() is None

qa = json.loads(
    (root / "artifacts/release-gate/pet-reclining-idle/preview-qa.json").read_text()
)
assert qa["ok"] is True
assert qa["frameCount"] == 48
assert qa["runtimeReplaced"] is False

regression = json.loads(
    (root / "artifacts/release-gate/pet-reclining-idle/regression.json").read_text()
)
assert regression["ok"] is True
assert regression["runtime"]["bundledRecliningFrameCount"] == 48
assert regression["checks"]["recliningIdleVisible"]["status"] == "passed"
assert regression["checks"]["hoverAndWindowDrag"]["status"] == "passed"
assert regression["checks"]["imageDrop"]["status"] == "passed_without_live_lookup_submission"
print(json.dumps(qa, ensure_ascii=False, indent=2))
print(json.dumps(regression, ensure_ascii=False, indent=2))
PY
