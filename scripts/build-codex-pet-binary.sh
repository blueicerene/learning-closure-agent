#!/bin/zsh
set -e

PROJECT_DIR="/Users/rene/Documents/学习助手"
SOURCE="$PROJECT_DIR/desktop-dropper/LegalVocabDropper.swift"
INFO_PLIST="$PROJECT_DIR/desktop-dropper/CodexPet-Info.plist"
RUNTIME_DIR="$PROJECT_DIR/.runtime-bin"
APP_PATH="$RUNTIME_DIR/Codex Pet 大王.app"
CONTENTS_DIR="$APP_PATH/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
OUTPUT="$MACOS_DIR/CodexPet"
MODULE_CACHE="$RUNTIME_DIR/swift-module-cache"
COMPATIBLE_SDK="/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk"

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR/assets" "$MODULE_CACHE"

if [[ -d "$COMPATIBLE_SDK" ]]; then
  SDK_PATH="$COMPATIBLE_SDK"
else
  SDK_PATH="$(xcrun --show-sdk-path)"
fi

/usr/bin/swiftc \
  -sdk "$SDK_PATH" \
  -module-cache-path "$MODULE_CACHE" \
  "$SOURCE" \
  -o "$OUTPUT"

cp "$INFO_PLIST" "$CONTENTS_DIR/Info.plist"
cp "$PROJECT_DIR/desktop-dropper/assets/dawang-spritesheet.webp" "$RESOURCES_DIR/assets/"
cp "$PROJECT_DIR"/desktop-dropper/assets/action-ball-chase-frame-*.png "$RESOURCES_DIR/assets/"
cp "$PROJECT_DIR"/desktop-dropper/assets/focus-sit-tail-frame-*.png "$RESOURCES_DIR/assets/"
cp "$PROJECT_DIR"/desktop-dropper/assets/state-*-frame-*.png "$RESOURCES_DIR/assets/"
cp "$PROJECT_DIR/desktop-dropper/assets/unified-pet-animation-qa.json" "$RESOURCES_DIR/assets/"
/usr/bin/codesign --force --deep --sign - "$APP_PATH"

echo "$APP_PATH"
