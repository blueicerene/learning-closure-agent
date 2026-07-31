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

wait_until_up() {
  local url="$1"
  local name="$2"
  local attempts=0

  until is_up "$url"; do
    attempts=$((attempts + 1))
    if (( attempts >= 40 )); then
      echo "[$(/bin/date)] $name did not become ready: $url" >> "$LOG_DIR/launcher.log"
      return 1
    fi
    /bin/sleep 0.25
  done

  echo "[$(/bin/date)] $name ready after $attempts checks" >> "$LOG_DIR/launcher.log"
}

if ! is_up "http://localhost:3333/health"; then
  echo "[$(/bin/date)] Starting backend" >> "$LOG_DIR/launcher.log"
  /usr/bin/nohup /opt/homebrew/bin/npm --prefix "$PROJECT_DIR/server" run dev > "$LOG_DIR/server.log" 2>&1 &
fi

if ! is_up "http://127.0.0.1:5174/"; then
  echo "[$(/bin/date)] Starting web app" >> "$LOG_DIR/launcher.log"
  /usr/bin/nohup /opt/homebrew/bin/npm --prefix "$PROJECT_DIR/web" run dev > "$LOG_DIR/web.log" 2>&1 &
fi

wait_until_up "http://localhost:3333/health" "Backend"
wait_until_up "http://127.0.0.1:5174/" "Web app"

echo "[$(/bin/date)] Starting desktop dropper" >> "$LOG_DIR/launcher.log"
"$PROJECT_DIR/scripts/run-codex-pet.sh" >> "$LOG_DIR/dropper.log" 2>&1
