#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="/Users/rene/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
EVIDENCE="$ROOT/artifacts/release-gate/pet-natural-motion-v3"

"$PYTHON" "$ROOT/scripts/build-pet-natural-motion-v3-preview.py"

"$PYTHON" - "$EVIDENCE" <<'PY'
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops

evidence = Path(sys.argv[1])
required = [
    "reclining-preview-v3.gif",
    "reclining-preview-v3.apng",
    "reclining-preview-v3-small.gif",
    "reclining-motion-qa-v3.json",
    "hover-preview-v3.gif",
    "hover-preview-v3.apng",
    "hover-preview-v3-small.gif",
    "hover-motion-qa-v3.json",
    "preview-contact-sheet-v3.png",
    "reclining-sprite-v3.png",
    "hover-sprite-v3.png",
    "preview.html",
    "preview-qa-v3.json",
    "browser-playback-qa-v3.json",
    "browser-playback-desktop-t1.png",
    "browser-playback-desktop-t2.png",
    "browser-playback-narrow-t1.png",
    "browser-playback-narrow-t2.png",
]
missing = [name for name in required if not (evidence / name).exists()]
if missing:
    raise SystemExit(f"Missing v3 preview evidence: {missing}")

qa = json.loads((evidence / "preview-qa-v3.json").read_text(encoding="utf-8"))
if not qa.get("ok") or qa.get("runtimeReplaced"):
    raise SystemExit("Preview QA failed or attempted to replace the runtime pet.")
if qa.get("subjectiveFullLoopAudit", {}).get("status") != "passed_by_codex":
    raise SystemExit("Codex full-loop visual audit has not passed.")

for state in ("reclining", "hover"):
    metrics = qa["animations"][state]
    if metrics["frameCount"] != 96 or metrics["uniqueFrameCount"] < 90:
        raise SystemExit(f"{state}: frame continuity is insufficient")
    if not metrics.get("transparentCorners"):
        raise SystemExit(f"{state}: transparent corners failed")
    if metrics["anchorStability"]["bottomSpanPx"] > 3:
        raise SystemExit(f"{state}: ground contact drift is too high")
    if metrics.get("identityChangingKeyframesUsed"):
        raise SystemExit(f"{state}: identity-changing keyframes are forbidden")
    if metrics.get("interFrameDissolveUsed") or metrics.get("opticalFlowInterpolationUsed"):
        raise SystemExit(f"{state}: cross-image interpolation is forbidden")

reclining = qa["animations"]["reclining"]["motionRegions"]
hover = qa["animations"]["hover"]["motionRegions"]
if reclining["tail"]["meanAdjacentDifference"] <= 1.0:
    raise SystemExit("reclining: relaxed tail motion is not visible")
if reclining["headEarsEyes"]["meanAdjacentDifference"] <= 1.5:
    raise SystemExit("reclining: face/ear motion is not visible")
if hover["headEarsEyes"]["meanAdjacentDifference"] <= 4.0:
    raise SystemExit("hover: attention movement is not visible")
if hover["chestShoulders"]["meanAdjacentDifference"] <= 1.5:
    raise SystemExit("hover: neck/shoulder linkage is not visible")
if hover["contactPaws"]["meanAdjacentDifference"] >= 1.5:
    raise SystemExit("hover: contact paws move too much")

for state in ("reclining", "hover"):
    animation = Image.open(evidence / f"{state}-preview-v3.apng")
    if getattr(animation, "n_frames", 1) != 96:
        raise SystemExit(f"{state}: APNG frame count changed")
    animation.seek(0)
    first = animation.convert("RGBA").copy()
    animation.seek(95)
    last = animation.convert("RGBA").copy()
    if ImageChops.difference(first, last).getbbox():
        raise SystemExit(f"{state}: loop seam is not exact")

browser = json.loads(
    (evidence / "browser-playback-qa-v3.json").read_text(encoding="utf-8")
)
if not browser.get("ok") or browser.get("console", {}).get("errors") != 0:
    raise SystemExit("Real-browser playback QA failed.")
if browser.get("subjectiveAudit", {}).get("status") != "passed_by_codex":
    raise SystemExit("Real-browser subjective audit is missing.")
for viewport in ("desktop", "narrow"):
    result = browser["screenshots"][viewport]
    if result["changedPixels"] < 50000:
        raise SystemExit(f"{viewport}: motion was not visible between captures")
for state in ("reclining", "hover"):
    if not browser["loopSeam"][state]["exactMatch"]:
        raise SystemExit(f"{state}: browser evidence reports a loop seam")

print(json.dumps({
    "ok": True,
    "runtimeReplaced": False,
    "framesPerState": 96,
    "temporaryOpenCVDependency": False,
    "desktopPlayback": True,
    "narrowPlayback": True,
    "subjectiveAudit": "passed_by_codex",
}, ensure_ascii=False, indent=2))
PY

echo "PASS: v3 natural-motion preview passed automated and Codex visual gates; runtime unchanged."
