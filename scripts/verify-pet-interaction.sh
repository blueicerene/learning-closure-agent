#!/bin/zsh
set -e

PROJECT_DIR="/Users/rene/Documents/学习助手"
PYTHON="/Users/rene/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
APP_PATH="$PROJECT_DIR/.runtime-bin/Codex Pet 大王.app"
ASSETS_DIR="$PROJECT_DIR/desktop-dropper/assets"
EVIDENCE_DIR="$PROJECT_DIR/artifacts/release-gate/pet-interaction"

cd "$PROJECT_DIR"

"$PYTHON" scripts/build-pet-interaction-previews.py >/dev/null

for direction in left right; do
  for index in {0..7}; do
    test -f "$ASSETS_DIR/state-walk-$direction-frame-$index.png"
  done
done

"$PYTHON" - <<'PY'
from pathlib import Path
from PIL import Image

root = Path("/Users/rene/Documents/学习助手")
for direction in ("left", "right"):
    frames = []
    for index in range(8):
        path = root / "desktop-dropper" / "assets" / f"state-walk-{direction}-frame-{index}.png"
        with Image.open(path) as image:
            assert image.size == (192, 208), (path, image.size)
            assert image.mode == "RGBA", (path, image.mode)
            assert image.getchannel("A").getbbox() is not None, path
            frames.append(image.convert("RGBA").copy())
    assert any(frames[index].tobytes() != frames[index + 1].tobytes() for index in range(7))
PY

scripts/build-codex-pet-binary.sh >/dev/null
scripts/run-codex-pet.sh --self-test
codesign --verify --deep --strict "$APP_PATH"

for evidence in \
  hover-sit-preview.gif \
  drag-left-preview.gif \
  drag-right-preview.gif \
  interaction-state-sequence.json \
  regression.json \
  runtime-idle.png \
  runtime-after-drag-left.png \
  runtime-after-drag-right.png; do
  test -s "$EVIDENCE_DIR/$evidence"
done

echo "Pet interaction verification passed."
