#!/bin/zsh
set -e

PROJECT_DIR="/Users/rene/Documents/学习助手"
SOURCE="$PROJECT_DIR/desktop-dropper/LegalVocabDropper.swift"
BUILD_SCRIPT="$PROJECT_DIR/scripts/build-codex-pet-binary.sh"
PET_APP="$PROJECT_DIR/.runtime-bin/Codex Pet 大王.app"
PET_BINARY="$PET_APP/Contents/MacOS/CodexPet"
PET_SPRITESHEET="$PROJECT_DIR/desktop-dropper/assets/dawang-spritesheet.webp"
BUNDLED_SPRITESHEET="$PET_APP/Contents/Resources/assets/dawang-spritesheet.webp"

if [[ ! -x "$PET_BINARY" || "$SOURCE" -nt "$PET_BINARY" || ! -f "$BUNDLED_SPRITESHEET" || "$PET_SPRITESHEET" -nt "$BUNDLED_SPRITESHEET" ]]; then
  "$BUILD_SCRIPT" >/dev/null
fi

if [[ "$1" == "--self-test" ]]; then
  exec "$PET_BINARY" "$@"
fi

open "$PET_APP"
