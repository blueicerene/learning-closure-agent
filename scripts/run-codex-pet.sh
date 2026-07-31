#!/bin/zsh
set -e

PROJECT_DIR="/Users/rene/Documents/学习助手"
SOURCE="$PROJECT_DIR/desktop-dropper/LegalVocabDropper.swift"
REMINDER_SOURCE="$PROJECT_DIR/desktop-dropper/DailyReviewReminder.swift"
INFO_PLIST="$PROJECT_DIR/desktop-dropper/CodexPet-Info.plist"
BUILD_SCRIPT="$PROJECT_DIR/scripts/build-codex-pet-binary.sh"
PET_APP="$PROJECT_DIR/.runtime-bin/Codex Pet 大王.app"
PET_BINARY="$PET_APP/Contents/MacOS/CodexPet"
PET_SPRITESHEET="$PROJECT_DIR/desktop-dropper/assets/dawang-spritesheet.webp"
BUNDLED_SPRITESHEET="$PET_APP/Contents/Resources/assets/dawang-spritesheet.webp"
RECLINING_IDLE_FRAME="$PROJECT_DIR/desktop-dropper/assets/state-reclining-idle-frame-0.png"
BUNDLED_RECLINING_IDLE_FRAME="$PET_APP/Contents/Resources/assets/state-reclining-idle-frame-0.png"
NATURAL_HOVER_FRAME="$PROJECT_DIR/desktop-dropper/assets/state-curious-dynamic-frame-0.png"
BUNDLED_NATURAL_HOVER_FRAME="$PET_APP/Contents/Resources/assets/state-curious-dynamic-frame-0.png"

if [[ ! -x "$PET_BINARY" ||
      "$SOURCE" -nt "$PET_BINARY" ||
      "$REMINDER_SOURCE" -nt "$PET_BINARY" ||
      "$INFO_PLIST" -nt "$PET_APP/Contents/Info.plist" ||
      ! -f "$BUNDLED_SPRITESHEET" ||
      "$PET_SPRITESHEET" -nt "$BUNDLED_SPRITESHEET" ||
      ! -f "$BUNDLED_RECLINING_IDLE_FRAME" ||
      "$RECLINING_IDLE_FRAME" -nt "$BUNDLED_RECLINING_IDLE_FRAME" ||
      ! -f "$BUNDLED_NATURAL_HOVER_FRAME" ||
      "$NATURAL_HOVER_FRAME" -nt "$BUNDLED_NATURAL_HOVER_FRAME" ]]; then
  "$BUILD_SCRIPT" >/dev/null
fi

if [[ "$1" == "--self-test" ]]; then
  exec "$PET_BINARY" "$@"
fi

open "$PET_APP"
