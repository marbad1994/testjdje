#!/bin/sh
# Connects adb to every device in SNAPCHAT_DEVICE_POOL before the app starts,
# so the pool is actually reachable the moment the server comes up - no manual
# `adb connect` step for the operator. TCP devices (unlike USB) need this
# explicit connect; it's not automatic just because they're on the network.
set -e
if [ -n "$SNAPCHAT_DEVICE_POOL" ]; then
  echo "$SNAPCHAT_DEVICE_POOL" | tr ',' '\n' | while IFS= read -r serial; do
    serial=$(echo "$serial" | xargs)
    [ -z "$serial" ] && continue
    echo "[entrypoint] connecting to Snapchat device $serial..."
    attempt=0
    until adb connect "$serial" 2>&1 | grep -qE "connected to|already connected"; do
      attempt=$((attempt + 1))
      if [ "$attempt" -ge 10 ]; then
        echo "[entrypoint] WARNING: could not connect to $serial after 10 attempts, continuing without it. The pool will report it as busy/unreachable until it connects."
        break
      fi
      sleep 3
    done
  done
fi
exec "$@"
