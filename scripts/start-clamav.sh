#!/bin/sh
# The pinned official /init updates synchronously only when main.cvd is absent.
# Refresh existing (possibly stale) embedded signatures before it starts clamd.
# Keep database validation enabled; a failed update must prevent scanner startup.
set -eu

bootstrap_config="$(mktemp /tmp/cdr-freshclam.XXXXXX)"
trap 'rm -f "$bootstrap_config"' EXIT
trap 'exit 1' HUP INT TERM

# No clamd exists yet. Only suppress its notification for this one-shot update;
# /init will use the original configuration for the continuing updater daemon.
sed '/^[[:space:]]*NotifyClamd[[:space:]]/d' /etc/clamav/freshclam.conf > "$bootstrap_config"
chmod 644 "$bootstrap_config"
freshclam --foreground --stdout --config-file="$bootstrap_config"

rm -f "$bootstrap_config"
trap - EXIT HUP INT TERM
exec /init
