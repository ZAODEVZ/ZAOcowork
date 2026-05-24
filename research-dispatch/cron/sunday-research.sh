#!/usr/bin/env bash

# sunday-research.sh
#
# Weekly autonomous research dispatch. Picks the first pending topic from
# data/research-queue.json, runs all its subagents, aggregates + pushes +
# commits. Logs to dispatch-runs/<timestamp>/cron.log.
#
# Install on VPS:
#   crontab -e
#   # Sunday 9pm UTC:
#   0 21 * * 0 /home/zao/repos/ZAOcowork/research-dispatch/cron/sunday-research.sh >> /var/log/research-dispatch-cron.log 2>&1
#
# Required env (load from ~/.research-dispatch.env, sourced below):
#   BONFIRE_API_KEY
#   GH_TOKEN
#   ZABALGAMES_REPO_PATH       Path to zabalgames repo clone (graph file lives there)
#   RESEARCH_DISPATCH_DIR      Path to this dir (default: /home/zao/repos/ZAOcowork/research-dispatch)
#   CLAUDE_CODE_BIN            Optional, defaults to "claude"
#   TELEGRAM_BOT_TOKEN         Optional, for notifications
#   TELEGRAM_NOTIFY_CHAT_ID    Optional

set -euo pipefail

# Source the env file if present (so cron has the needed vars).
ENV_FILE="${HOME}/.research-dispatch.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
fi

# Sanity check env.
DISPATCH_DIR="${RESEARCH_DISPATCH_DIR:-/home/zao/repos/ZAOcowork/research-dispatch}"
if [ ! -d "$DISPATCH_DIR" ]; then
  echo "[sunday-cron] FATAL: RESEARCH_DISPATCH_DIR not found: $DISPATCH_DIR" >&2
  exit 1
fi
ZAOCOWORK_ROOT=$(cd "$DISPATCH_DIR/.." && pwd)

cd "$ZAOCOWORK_ROOT"

# Pull latest queue + scripts before running.
git fetch origin main --quiet
git reset --hard origin/main

TS=$(date -u +%Y-%m-%dT%H-%M)
LOG_DIR="${DISPATCH_DIR}/dispatch-runs/${TS}"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/cron.log"

echo "[sunday-cron] Started at $(date -u --iso-8601=seconds)" | tee -a "$LOG_FILE"
echo "[sunday-cron] DISPATCH_TRIGGER=cron-sunday" | tee -a "$LOG_FILE"
echo "[sunday-cron] DISPATCH_DIR=$DISPATCH_DIR" | tee -a "$LOG_FILE"

export DISPATCH_TRIGGER="cron-sunday"
export RESEARCH_DISPATCH_DIR="$DISPATCH_DIR"

# Run dispatcher with --next. Exit code 2 means queue is empty (not an error).
set +e
node "${DISPATCH_DIR}/scripts/run-dispatch.mjs" --next 2>&1 | tee -a "$LOG_FILE"
EXIT_CODE=${PIPESTATUS[0]}
set -e

case "$EXIT_CODE" in
  0)
    echo "[sunday-cron] Dispatch succeeded." | tee -a "$LOG_FILE"
    ;;
  2)
    echo "[sunday-cron] Queue empty. Nothing to do." | tee -a "$LOG_FILE"
    if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_NOTIFY_CHAT_ID:-}" ]; then
      curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -H "Content-Type: application/json" \
        -d "{\"chat_id\":\"${TELEGRAM_NOTIFY_CHAT_ID}\",\"text\":\"*research-dispatch cron*\\nQueue empty - no pending research dispatches. Add topics to research-dispatch/data/research-queue.json.\",\"parse_mode\":\"Markdown\"}" >/dev/null || true
    fi
    ;;
  *)
    echo "[sunday-cron] Dispatch FAILED with exit $EXIT_CODE" | tee -a "$LOG_FILE" >&2
    if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_NOTIFY_CHAT_ID:-}" ]; then
      curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -H "Content-Type: application/json" \
        -d "{\"chat_id\":\"${TELEGRAM_NOTIFY_CHAT_ID}\",\"text\":\"*research-dispatch cron FAILED*\\nExit ${EXIT_CODE}. See logs at \`${LOG_FILE}\`.\",\"parse_mode\":\"Markdown\"}" >/dev/null || true
    fi
    exit "$EXIT_CODE"
    ;;
esac

echo "[sunday-cron] Done at $(date -u --iso-8601=seconds)" | tee -a "$LOG_FILE"
