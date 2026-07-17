#!/bin/zsh
set -e

APP_PATH="/Users/rene/Desktop/大王查词.app"
PROJECT_DIR="/Users/rene/Documents/学习助手"
ICONSET="/private/tmp/dawang-icon.iconset"
ICON_PNG="$PROJECT_DIR/desktop-dropper/assets/action-stand-tail-frame-0.png"

rm -rf "$APP_PATH" "$ICONSET"
mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources" "$ICONSET"

cat > "$APP_PATH/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>大王查词</string>
  <key>CFBundleExecutable</key>
  <string>大王查词</string>
  <key>CFBundleIconFile</key>
  <string>dawang.icns</string>
  <key>CFBundleIdentifier</key>
  <string>local.learning-closure.da-wang-lookup</string>
  <key>CFBundleName</key>
  <string>大王查词</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

cat > "$APP_PATH/Contents/MacOS/大王查词" <<'SCRIPT'
#!/bin/zsh
exec "/Users/rene/Documents/学习助手/scripts/launch-da-wang.command"
SCRIPT
chmod +x "$APP_PATH/Contents/MacOS/大王查词"

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
iconutil -c icns "$ICONSET" -o "$APP_PATH/Contents/Resources/dawang.icns"

touch "$APP_PATH"
echo "$APP_PATH"
