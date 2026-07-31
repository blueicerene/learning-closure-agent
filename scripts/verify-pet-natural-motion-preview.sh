#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="/Users/rene/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
EVIDENCE="$ROOT/artifacts/release-gate/pet-natural-motion-v1"

"$PYTHON" "$ROOT/scripts/build-pet-natural-motion-preview.py"

"$PYTHON" - "$EVIDENCE" <<'PY'
import json
import sys
from pathlib import Path

from PIL import Image

evidence = Path(sys.argv[1])
required = [
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
    "preview-qa.json",
    "browser-playback-qa.json",
    "browser-playback-desktop-t1.png",
    "browser-playback-desktop-t2.png",
    "browser-playback-narrow-t1.png",
    "browser-playback-narrow-t2.png",
]

missing = [name for name in required if not (evidence / name).exists()]
if missing:
    raise SystemExit(f"Missing preview evidence: {missing}")

qa = json.loads((evidence / "preview-qa.json").read_text(encoding="utf-8"))
if not qa.get("ok"):
    raise SystemExit("Combined preview QA is not passing.")
if qa.get("runtimeReplaced"):
    raise SystemExit("Preview build must not replace the running pet.")

for state in ("reclining", "hover"):
    metrics = qa["states"][state]
    if not metrics.get("transparentCorners"):
        raise SystemExit(f"{state}: transparent corners failed")
    if not all(metrics.get("regionMotionPass", {}).values()):
        raise SystemExit(f"{state}: one or more required motion regions did not move")
    if not metrics.get("temporalMotion", {}).get("pass"):
        raise SystemExit(f"{state}: temporal motion is not sufficiently visible")
    if not metrics.get("alphaStability", {}).get("pass"):
        raise SystemExit(f"{state}: visible subject area is unstable")
    if metrics["anchor"]["bottomSpanPx"] > 4:
        raise SystemExit(f"{state}: contact anchor drift is too high")

for name in ("reclining-preview.gif", "hover-preview.gif"):
    image = Image.open(evidence / name)
    if getattr(image, "n_frames", 1) < 48:
        raise SystemExit(f"{name}: insufficient animation frames")

for name, minimum in (("reclining-preview.apng", 48), ("hover-preview.apng", 48)):
    image = Image.open(evidence / name)
    if getattr(image, "n_frames", 1) < minimum:
        raise SystemExit(f"{name}: APNG did not preserve enough distinct animation frames")

preview_html = (evidence / "preview.html").read_text(encoding="utf-8")
for marker in ("逐帧 Canvas 播放", "reclining-sprite.png", "hover-sprite.png"):
    if marker not in preview_html:
        raise SystemExit(f"preview.html: missing {marker!r}")

browser_qa = json.loads(
    (evidence / "browser-playback-qa.json").read_text(encoding="utf-8")
)
if not browser_qa.get("ok"):
    raise SystemExit("Real-browser playback QA did not pass.")
if not browser_qa.get("controls", {}).get("pass"):
    raise SystemExit("Real-browser pause/resume QA did not pass.")
if browser_qa.get("console", {}).get("errors") != 0:
    raise SystemExit("Real-browser playback emitted console errors.")

print(json.dumps({
    "ok": True,
    "requiredEvidence": required,
    "runtimeReplaced": False,
    "recliningFrames": qa["states"]["reclining"]["frameCount"],
    "hoverFrames": qa["states"]["hover"]["frameCount"],
}, ensure_ascii=False, indent=2))
PY

echo "PASS: natural-motion preview evidence is complete; runtime was not replaced."
