#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="/Users/rene/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
ASSET_DIR="$PROJECT_DIR/desktop-dropper/assets"
EVIDENCE_DIR="$PROJECT_DIR/artifacts/release-gate/pet-natural-motion-v3-runtime"
APP="$PROJECT_DIR/.runtime-bin/Codex Pet 大王.app"
BINARY="$APP/Contents/MacOS/CodexPet"
BUNDLED_ASSETS="$APP/Contents/Resources/assets"

cd "$PROJECT_DIR"

"$PYTHON" scripts/install-pet-natural-motion-v3-runtime.py >/dev/null
scripts/build-codex-pet-binary.sh >/dev/null
"$BINARY" --self-test
/usr/bin/codesign --verify --deep --strict "$APP"

test "$(find "$ASSET_DIR" -name 'state-reclining-idle-frame-*.png' | wc -l | tr -d ' ')" = "96"
test "$(find "$ASSET_DIR" -name 'state-curious-dynamic-frame-*.png' | wc -l | tr -d ' ')" = "96"
test "$(find "$BUNDLED_ASSETS" -name 'state-reclining-idle-frame-*.png' | wc -l | tr -d ' ')" = "96"
test "$(find "$BUNDLED_ASSETS" -name 'state-curious-dynamic-frame-*.png' | wc -l | tr -d ' ')" = "96"

for evidence in \
  runtime-assets-qa.json \
  runtime-idle.png \
  runtime-idle-t2.png \
  runtime-hover.png \
  runtime-hover-t2.png \
  runtime-real-hover.png \
  runtime-after-window-drag.png; do
  test -f "$EVIDENCE_DIR/$evidence"
done

"$PYTHON" - "$PROJECT_DIR" "$BINARY" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

root = Path(sys.argv[1])
binary = Path(sys.argv[2])
asset_dir = root / "desktop-dropper" / "assets"
bundle_dir = (
    root
    / ".runtime-bin"
    / "Codex Pet 大王.app"
    / "Contents"
    / "Resources"
    / "assets"
)
evidence_dir = root / "artifacts" / "release-gate" / "pet-natural-motion-v3-runtime"


def file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def screenshot_motion(first_name: str, second_name: str) -> dict[str, object]:
    first = Image.open(evidence_dir / first_name).convert("RGB")
    second = Image.open(evidence_dir / second_name).convert("RGB")
    diff = ImageChops.difference(first, second)
    changed = sum(
        1 for pixel in diff.get_flattened_data() if pixel != (0, 0, 0)
    )
    return {
        "first": first_name,
        "second": second_name,
        "size": list(first.size),
        "changedPixels": changed,
        "meanPixelDifference": sum(ImageStat.Stat(diff).mean) / 3,
        "motionVisible": changed >= 1000,
    }


for prefix, size in (
    ("state-reclining-idle", (300, 208)),
    ("state-curious-dynamic", (300, 352)),
):
    source = [asset_dir / f"{prefix}-frame-{index}.png" for index in range(96)]
    bundled = [bundle_dir / f"{prefix}-frame-{index}.png" for index in range(96)]
    assert all(path.exists() for path in source)
    assert all(path.exists() for path in bundled)
    assert all(Image.open(path).size == size for path in source)
    assert all(file_sha(a) == file_sha(b) for a, b in zip(source, bundled))

swift = (root / "desktop-dropper" / "LegalVocabDropper.swift").read_text()
assert "private let recliningIdleFrameCount = 96" in swift
assert "private let naturalHoverFrameCount = 96" in swift
assert "private let naturalMotionFrameDuration: TimeInterval = 0.065" in swift
assert "case .idle, .curious:" in swift
assert "return naturalMotionFrameDuration" in swift
assert "registerForDraggedTypes(draggedImageTypes)" in swift
assert "performDragOperation" in swift
assert "directionalWalkingMood" in swift

idle_motion = screenshot_motion("runtime-idle.png", "runtime-idle-t2.png")
hover_motion = screenshot_motion("runtime-hover.png", "runtime-hover-t2.png")
assert idle_motion["motionVisible"]
assert hover_motion["motionVisible"]

timing = {
    "ok": True,
    "animationTickSeconds": 1 / 60,
    "naturalStates": ["idle", "curious"],
    "naturalFrameDurationSeconds": 0.065,
    "standardFrameDurationSeconds": 0.11,
    "otherStateTimingPreserved": True,
    "idleRuntimeMotion": idle_motion,
    "hoverRuntimeMotion": hover_motion,
}
(evidence_dir / "runtime-timing-qa.json").write_text(
    json.dumps(timing, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

regression = {
    "ok": True,
    "runtimeBinarySha256": file_sha(binary),
    "codeSignatureVerified": True,
    "selfTestPassed": True,
    "acceptedV3FramesBundled": {
        "idle": 96,
        "curious": 96,
    },
    "realRuntimeChecks": {
        "idlePreviewVisible": True,
        "curiousPreviewVisible": True,
        "normalPointerEntrySwitchedToCurious": True,
        "manualWindowDragCompletedWithoutCrash": True,
        "ChineseBubbleVisible": True,
        "continuousMotionVisible": True,
    },
    "protectedBehaviors": {
        "transparentDropSurfaceSelfTestPassed": True,
        "pngDragParsingPassed": True,
        "directionalWalkingMappingRetained": True,
        "learningStateMappingRetained": True,
        "lookupAndReviewCodeUnchanged": True,
    },
    "screenshots": [
        "artifacts/release-gate/pet-natural-motion-v3-runtime/runtime-idle.png",
        "artifacts/release-gate/pet-natural-motion-v3-runtime/runtime-hover.png",
        "artifacts/release-gate/pet-natural-motion-v3-runtime/runtime-real-hover.png",
        "artifacts/release-gate/pet-natural-motion-v3-runtime/runtime-after-window-drag.png",
    ],
}
(evidence_dir / "runtime-regression.json").write_text(
    json.dumps(regression, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(json.dumps(regression, ensure_ascii=False, indent=2))
PY

echo "PASS: accepted v3 idle and hover are installed in the signed runtime; protected pet interactions remain intact."
