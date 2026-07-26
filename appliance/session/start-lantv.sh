#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/lantv-runtime-$(id -u)}"

mkdir -p "$XDG_RUNTIME_DIR"
chmod 0700 "$XDG_RUNTIME_DIR"

xset s off || true
xset -dpms || true
xset s noblank || true

openbox --config-file /opt/lantv/appliance/session/openbox.xml &
unclutter --timeout 2 --ignore-scrolling &

exec chromium \
  --kiosk \
  --no-first-run \
  --password-store=basic \
  --disable-session-crashed-bubble \
  --hide-crash-restore-bubble \
  --disable-infobars \
  --autoplay-policy=no-user-gesture-required \
  --class=WatchOSLauncher \
  --app=http://127.0.0.1:8787/tv/
