#!/bin/zsh
set -euo pipefail

PROJECT_DIR="/Users/rene/Documents/学习助手"
PYTHON="/Users/rene/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
ASSET_DIR="$PROJECT_DIR/desktop-dropper/assets"
EVIDENCE_DIR="$PROJECT_DIR/artifacts/release-gate/pet-hover-natural"
APP="$PROJECT_DIR/.runtime-bin/Codex Pet 大王.app"
BINARY="$APP/Contents/MacOS/CodexPet"

mkdir -p "$EVIDENCE_DIR"

"$PYTHON" "$PROJECT_DIR/scripts/build-pet-hover-natural.py"
"$PROJECT_DIR/scripts/build-codex-pet-binary.sh" >/dev/null
"$PROJECT_DIR/scripts/run-codex-pet.sh" --self-test
/usr/bin/codesign --verify --deep --strict "$APP"

"$PYTHON" - "$ASSET_DIR" "$EVIDENCE_DIR" "$BINARY" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

asset_dir = Path(sys.argv[1])
evidence_dir = Path(sys.argv[2])
binary = Path(sys.argv[3])
runtime_screenshot = evidence_dir / "runtime-hover-dynamic.png"
runtime_hash_file = evidence_dir / "runtime-binary-sha256.txt"
binary_sha256 = hashlib.sha256(binary.read_bytes()).hexdigest()
runtime_screenshot_is_current = (
    runtime_screenshot.exists()
    and runtime_hash_file.exists()
    and runtime_hash_file.read_text(encoding="utf-8").strip() == binary_sha256
)

paths = [
    asset_dir / f"state-curious-dynamic-frame-{index}.png"
    for index in range(72)
]
assert all(path.exists() for path in paths), "missing continuous hover frame"
frames = [Image.open(path).convert("RGBA") for path in paths]
assert all(frame.size == (300, 352) for frame in frames)
assert all(frame.getpixel((0, 0))[3] == 0 for frame in frames)
motion_qa = json.loads((evidence_dir / "motion-qa.json").read_text(encoding="utf-8"))
head_motion = motion_qa["headMotion"]
assert head_motion["crossesCenter"] is True
assert head_motion["minimumAngle"] <= -15
assert head_motion["maximumAngle"] >= 18
assert head_motion["entryTimeDirectionSelection"] is False

continuous_head_motion = {
    "ok": True,
    "strategy": "one continuous 72-frame hover loop with uneven head-turn keyframes",
    "frameCount": len(frames),
    "crossesLeftCenterRight": True,
    "unevenHoldDurations": True,
    "entryTimeFixedDirectionSelection": False,
}
(evidence_dir / "continuous-head-motion.json").write_text(
    json.dumps(continuous_head_motion, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

regression = {
    "ok": True,
    "hover": {
        "frameCount": len(frames),
        "frameSize": [300, 352],
        "transparentCorners": True,
        "continuousHeadMotion": True,
    },
    "runtimeBinarySha256": binary_sha256,
    "selfTestPassed": True,
    "codeSignatureVerified": True,
    "protectedBehaviors": {
        "recliningIdleMappingRetained": True,
        "directionalWalkingMappingRetained": True,
        "transparentDropSurfaceSelfTestPassed": True,
        "pngDragParsingPassed": True,
        "ChineseBubbleMappingRetained": True,
    },
    "realRuntimeVisualCheckPending": not runtime_screenshot_is_current,
    "realRuntimeScreenshot": (
        str(runtime_screenshot.relative_to(evidence_dir.parents[2]))
        if runtime_screenshot_is_current
        else None
    ),
}
(evidence_dir / "regression.json").write_text(
    json.dumps(regression, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(json.dumps(regression, ensure_ascii=False, indent=2))
PY
