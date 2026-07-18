#!/bin/zsh
set -e

PROJECT_DIR="/Users/rene/Documents/学习助手"
LOG_DIR="$PROJECT_DIR/.runtime-logs"
PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR"

echo "[$(/bin/date)] Launching Da Wang lookup" >> "$LOG_DIR/launcher.log"

is_up() {
  /usr/bin/curl -fsS --max-time 1 "$1" >/dev/null 2>&1
}

if ! is_up "http://localhost:3333/health"; then
  echo "[$(/bin/date)] Starting backend" >> "$LOG_DIR/launcher.log"
  /usr/bin/nohup /opt/homebrew/bin/npm run dev:server > "$LOG_DIR/server.log" 2>&1 &
fi

if ! is_up "http://127.0.0.1:5174/"; then
  echo "[$(/bin/date)] Starting web app" >> "$LOG_DIR/launcher.log"
  /usr/bin/nohup /opt/homebrew/bin/npm run dev:web > "$LOG_DIR/web.log" 2>&1 &
fi

/bin/sleep 1
echo "[$(/bin/date)] Starting desktop dropper" >> "$LOG_DIR/launcher.log"
/opt/homebrew/bin/npm run dev:dropper >> "$LOG_DIR/dropper.log" 2>&1
