#!/bin/bash
# bot-autoredeploy.sh - keeps the VPS Telegram bot in sync with main.
#
# Polls origin/main every run. If new commits touch agent/ since the
# bot's current HEAD, pulls, reinstalls deps if package.json changed,
# and restarts the systemd service. No-op otherwise.
#
# Designed to be triggered by a systemd user timer (see
# ops/zaocoworking-bot-autoredeploy.timer). Idempotent - run as often
# as you like; only acts when there's real work.
#
# Install on a fresh VPS:
#   ssh root@VPS
#   mkdir -p ~/.config/systemd/user
#   cp /root/cowork-zaodevz/ops/zaocoworking-bot-autoredeploy.{service,timer} ~/.config/systemd/user/
#   systemctl --user daemon-reload
#   systemctl --user enable --now zaocoworking-bot-autoredeploy.timer
#
# Audit log goes to ~/zaocoworking-autoredeploy.log so you can tail it
# after a merge to confirm the redeploy fired.

set -euo pipefail

REPO_DIR="/root/cowork-zaodevz"
SERVICE="zaocoworking-bot.service"
LOG_FILE="$HOME/zaocoworking-autoredeploy.log"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "$(ts) $*" >> "$LOG_FILE"; }

cd "$REPO_DIR"

# Capture pre-fetch HEAD so we can diff against origin/main accurately.
BEFORE=$(git rev-parse HEAD)

git fetch --quiet origin main || {
  log "fetch failed"
  exit 0
}

AFTER=$(git rev-parse origin/main)

if [ "$BEFORE" = "$AFTER" ]; then
  exit 0
fi

# Did agent/ or package.json change since our HEAD?
AGENT_CHANGED=$(git diff --name-only "$BEFORE" "$AFTER" -- agent/ | wc -l | tr -d ' ')
if [ "$AGENT_CHANGED" = "0" ]; then
  # Pull anyway so the working tree tracks main (other repo work merges
  # in too) but don't restart the bot since nothing it cares about
  # changed.
  git pull --ff-only --quiet origin main || log "pull failed (no agent change)"
  log "fast-forward $BEFORE..$AFTER (no agent/ changes - no restart)"
  exit 0
fi

# Real change. Pull, optionally reinstall, restart.
log "agent/ changed in $BEFORE..$AFTER ($AGENT_CHANGED files) - redeploying"

PKG_BEFORE=$(git show "$BEFORE:agent/package.json" 2>/dev/null | sha256sum | cut -d' ' -f1 || echo "none")
git pull --ff-only --quiet origin main || {
  log "pull failed"
  exit 1
}
PKG_AFTER=$(sha256sum agent/package.json 2>/dev/null | cut -d' ' -f1 || echo "none")

if [ "$PKG_BEFORE" != "$PKG_AFTER" ]; then
  log "agent/package.json changed - running npm install"
  (cd agent && npm install --silent --no-audit --no-fund) || {
    log "npm install failed"
    exit 1
  }
fi

systemctl --user restart "$SERVICE"
sleep 2
if systemctl --user is-active --quiet "$SERVICE"; then
  log "redeploy ok - bot active"
else
  log "redeploy FAILED - bot not active after restart"
  exit 1
fi
