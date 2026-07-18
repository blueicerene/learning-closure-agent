#!/bin/zsh
set -e

APP_PATH="/Users/rene/Desktop/大王查词.app"
PROJECT_DIR="/Users/rene/Documents/学习助手"
ICONSET="/private/tmp/dawang-icon.iconset"
ICON_PNG="$PROJECT_DIR/desktop-dropper/assets/action-stand-tail-frame-0.png"

rm -rf "$APP_PATH" "$ICONSET"
mkdir -p "$ICONSET"

sips -z 16 16 "$ICON_PNG" --out "$ICONSET/icon_16x16.png" >/dev/null
sips -z 32 32 "$ICON_PNG" --out "$ICONSET/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$ICON_PNG" --out "$ICONSET/icon_32x32.png" >/dev/null
sips -z 64 64 "$ICON_PNG" --out "$ICONSET/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$ICON_PNG" --out "$ICONSET/icon_128x128.png" >/dev/null
sips -z 256 256 "$ICON_PNG" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$ICON_PNG" --out "$ICONSET/icon_256x256.png" >/dev/null
sips -z 512 512 "$ICON_PNG" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$ICON_PNG" --out "$ICONSET/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$ICON_PNG" --out "$ICONSET/icon_512x512@2x.png" >/dev/null

osacompile -o "$APP_PATH" -e 'do shell script "mkdir -p /Users/rene/Documents/学习助手/.runtime-logs; nohup /Users/rene/Documents/学习助手/scripts/launch-da-wang.command >/Users/rene/Documents/学习助手/.runtime-logs/app-launch.log 2>&1 &"'
iconutil -c icns "$ICONSET" -o "$APP_PATH/Contents/Resources/applet.icns"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 大王查词" "$APP_PATH/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleName 大王查词" "$APP_PATH/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier local.learning-closure.da-wang-lookup" "$APP_PATH/Contents/Info.plist" 2>/dev/null || true

touch "$APP_PATH"
echo "$APP_PATH"
