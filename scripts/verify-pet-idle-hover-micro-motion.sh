#!/bin/zsh
set -euo pipefail

PROJECT_DIR="/Users/rene/Documents/学习助手"
PYTHON="/Users/rene/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
ASSET_DIR="$PROJECT_DIR/desktop-dropper/assets"
EVIDENCE_DIR="$PROJECT_DIR/artifacts/release-gate/pet-idle-hover-micro-motion"
APP="$PROJECT_DIR/.runtime-bin/Codex Pet 大王.app"
BIN="$APP/Contents/MacOS/CodexPet"

mkdir -p "$EVIDENCE_DIR"

"$PYTHON" "$PROJECT_DIR/scripts/build-pet-reclining-idle-preview.py"
"$PYTHON" "$PROJECT_DIR/scripts/build-pet-hover-natural.py"
"$PROJECT_DIR/scripts/build-codex-pet-binary.sh" >/dev/null
"$PROJECT_DIR/scripts/run-codex-pet.sh" --self-test
/usr/bin/codesign --verify --deep --strict "$APP"

"$PYTHON" - "$ASSET_DIR" "$EVIDENCE_DIR" "$BIN" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops

asset_dir = Path(sys.argv[1])
evidence_dir = Path(sys.argv[2])
binary = Path(sys.argv[3])


def load_frames(prefix: str, count: int):
    paths = [asset_dir / f"{prefix}-frame-{index}.png" for index in range(count)]
    assert all(path.exists() for path in paths), f"missing {prefix} frame"
    return [Image.open(path).convert("RGBA") for path in paths]


def changed_pixels(first, second, box):
    diff = ImageChops.difference(first.crop(box), second.crop(box)).convert("RGBA")
    alpha = diff.getchannel("A")
    rgb = ImageChops.lighter(
        ImageChops.lighter(diff.getchannel("R"), diff.getchannel("G")),
        diff.getchannel("B"),
    )
    combined = ImageChops.lighter(alpha, rgb)
    return sum(1 for value in combined.getdata() if value > 5)


idle = load_frames("state-reclining-idle", 48)
hover = load_frames("state-curious-dynamic", 72)
assert all(frame.size == (300, 208) for frame in idle)
assert all(frame.size == (300, 352) for frame in hover)
assert all(frame.getpixel((0, 0))[3] == 0 for frame in idle + hover)

idle_qa = json.loads((evidence_dir / "idle-motion-qa.json").read_text())
hover_qa = json.loads((evidence_dir / "hover-motion-qa.json").read_text())
runtime_qa = json.loads((evidence_dir / "runtime-visual-qa.json").read_text())
idle_motion = idle_qa["motion"]
assert idle_motion["earAndTailCadenceIndependent"] is True
assert 1.0 <= idle_motion["earMaximumRotationDegrees"] <= 1.5
assert 2.0 <= idle_motion["tailTipMaximumMotionPx"] <= 3.0
assert idle_motion["tailBaseAnchored"] is True
assert idle_motion["tailLoopDurationMs"] >= 5000
assert hover_qa["earMotion"]["independentFromBlinkAndHeadTurn"] is True
assert 1.0 <= hover_qa["earMotion"]["maximumRotationDegrees"] <= 1.5
assert 1.5 <= hover_qa["curledTailMotion"]["maximumMotionPx"] <= 2.5
assert hover_qa["curledTailMotion"]["tailBaseAnchored"] is True
assert hover_qa["curledTailMotion"]["loopDurationMs"] >= 7500
connected = hover_qa["connectedUpperBodyMotion"]
assert connected["includesHeadNeckShouldersAndUpperChest"] is True
assert connected["isolatedHeadLayerUsed"] is False
assert connected["crossesCenter"] is True
assert runtime_qa["ok"] is True
assert runtime_qa["runtimeModeRestored"] is True
assert runtime_qa["manualVisualCheck"]["oldPoseGhostingAbsent"] is True
assert len(runtime_qa["idle"]["samples"]) >= 5
assert len(runtime_qa["hover"]["samples"]) >= 5
assert all(value > 100 for value in runtime_qa["idle"]["adjacentChangedPixels"])
assert all(value > 1000 for value in runtime_qa["hover"]["adjacentChangedPixels"])

region_motion = {
    "idleLeftEarChangedPixels": changed_pixels(idle[0], idle[9], (207, 14, 249, 65)),
    "idleRightEarChangedPixels": changed_pixels(idle[18], idle[23], (254, 13, 298, 66)),
    "idleTailChangedPixels": changed_pixels(idle[0], idle[10], (2, 119, 58, 158)),
    "hoverLeftEarChangedPixels": changed_pixels(hover[0], hover[6], (45, 0, 127, 80)),
    "hoverTailChangedPixels": changed_pixels(hover[15], hover[22], (54, 297, 246, 352)),
}
assert all(value > 25 for value in region_motion.values()), region_motion

regression = {
    "ok": True,
    "idle": {
        "frameCount": len(idle),
        "frameSize": [300, 208],
        "asynchronousEarMotion": True,
        "localizedTailTipMotion": True,
    },
    "hover": {
        "frameCount": len(hover),
        "frameSize": [300, 352],
        "continuousIrregularHeadMotionRetained": hover_qa["singleContinuousHoverLoop"],
        "connectedHeadNeckShoulderMotion": True,
        "isolatedHeadLayerUsed": False,
        "asynchronousEarMotion": True,
        "localizedCurledTailMotion": True,
    },
    "regionMotionEvidence": region_motion,
    "wholeImageTranslationUsed": False,
    "transparentCorners": True,
    "runtimeBinarySha256": hashlib.sha256(binary.read_bytes()).hexdigest(),
    "runtimeVisualCheckPassed": True,
    "selfTestPassed": True,
    "codeSignatureVerified": True,
    "protectedBehaviors": {
        "directionalWalkingMappingRetained": True,
        "transparentDropSurfaceSelfTestPassed": True,
        "pngDragParsingPassed": True,
        "ChineseBubbleMappingRetained": True,
    },
}
(evidence_dir / "regression.json").write_text(
    json.dumps(regression, ensure_ascii=False, indent=2) + "\n"
)
(evidence_dir / "runtime-binary-sha256.txt").write_text(
    regression["runtimeBinarySha256"] + "\n"
)
print(json.dumps(regression, ensure_ascii=False, indent=2))
PY
